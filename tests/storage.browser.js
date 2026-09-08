// Real Chromium regressions for browser-owned Web Locks, shared storage, and retries.
// Invoked by browser.test.js; all records below are synthetic.
module.exports = async function storageBrowser({ browser, origin, T, errors, baseStore }) {
  async function context(store = baseStore()) {
    const ctx = await browser.newContext({ viewport: { width: 414, height: 900 } });
    await ctx.addInitScript(s => {
      if (!localStorage.getItem('rft-test-seeded')) {
        localStorage.setItem('rft-v12', JSON.stringify(s));
        localStorage.setItem('rft-test-seeded', '1');
      }
    }, store);
    ctx.on('page', page => {
      page.on('pageerror', e => errors.push('STORAGE PAGEERROR ' + e.message));
      page.on('dialog', dialog => dialog.accept());
    });
    return ctx;
  }
  async function tab(ctx, writer) {
    const page = await ctx.newPage();
    await page.goto(origin + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => WRITER_READY);
    if (writer) await page.waitForFunction(() => canWriteStore());
    return page;
  }
  async function handover(page) {
    await page.getByRole('button', { name: 'Use this tab', exact: true }).click();
    await page.waitForFunction(() => canWriteStore());
  }

  // A stale view must never reintroduce a deletion or a deliberately cleared flag.
  {
    const s = baseStore();
    s.bodyLog = [{ date: '2020-01-02', weight: 80 }];
    s.cardioLog = [{ id: 'cardio-delete', date: '2020-01-02', type: 'Walking', duration: 20, intensity: 'easy', notes: '' }];
    s.sessions[0].noProg = true;
    const ctx = await context(s);
    try {
      const a = await tab(ctx, true), b = await tab(ctx, false);
      T('second tab is a reader while first owns the browser lock', await b.evaluate(() => !canWriteStore()));
      T('reader can export saved data', await b.getByRole('button', { name: 'Export saved data', exact: true }).isVisible());
      const rejected = await b.evaluate(() => {
        const before = JSON.stringify(D);
        D.nextDay = D.nextDay === 'A' ? 'C' : 'A';
        return !save() && JSON.stringify(D) === before;
      });
      T('save boundary rejects reader writes and restores committed view', rejected);
      await a.evaluate(() => go('body'));
      await a.locator('#bm_weight').fill('81');
      await b.getByRole('button', { name: 'Use this tab', exact: true }).click();
      await b.getByText(/other tab has an unfinished workout/).waitFor();
      T('open entry form blocks handover and keeps its typed value',
        await a.evaluate(() => canWriteStore() && document.getElementById('bm_weight').value === '81'));
      await a.evaluate(() => go('home'));
      await a.evaluate(() => {
        delBod('2020-01-02'); delCardio('cardio-delete'); toggleNoProg(D.sessions[0].id);
      });
      await handover(b);
      T('handover releases old owner', await a.evaluate(() => !canWriteStore()));
      T('new owner reloads deletions and cleared progression flag', await b.evaluate(() =>
        D.bodyLog.length === 0 && D.cardioLog.length === 0 && !D.sessions[0].noProg));
      await b.evaluate(() => { D.theme = 'dark'; save(); });
      await handover(a);
      T('subsequent unrelated write cannot resurrect removed rows or flags', await a.evaluate(() =>
        D.theme === 'dark' && !D.bodyLog.length && !D.cardioLog.length && !D.sessions[0].noProg));
      await a.evaluate(() => resetAll());
      await handover(b);
      await b.evaluate(() => { D.theme = 'light'; save(); });
      T('reset remains empty after an old tab becomes writer', await b.evaluate(() =>
        !D.sessions.length && !JSON.parse(localStorage.getItem('rft-v12')).sessions.length));
    } finally { await ctx.close(); }
  }

  // An active draft blocks handover; closing its owner releases the browser lock.
  {
    const ctx = await context();
    try {
      const a = await tab(ctx, true), b = await tab(ctx, false);
      const id = await a.evaluate(() => {
        beginW('A'); const first = dayExs(ADAY)[0].id;
        LOG[first].reps[0] = 5; LOG[first].setDone[0] = true; saveAW();
        return JSON.parse(localStorage.getItem('rft-active')).id;
      });
      await b.getByRole('button', { name: 'Use this tab', exact: true }).click();
      await b.getByText(/other tab has an unfinished workout/).waitFor();
      T('active workout refuses handover without losing ownership', await a.evaluate(() => canWriteStore()));
      await a.close();
      await handover(b);
      const resumed = await b.evaluate(() => {
        resumeW(); saveAW();
        const draft = JSON.parse(localStorage.getItem('rft-active'));
        return { id: draft.id, hasWork: Object.values(LOG).some(l => l.reps.some((r, i) => r > 0 && l.setDone[i])) };
      });
      T('new owner can resume the same draft after owner closes', resumed.id === id && resumed.hasWork);
    } finally { await ctx.close(); }
  }

  // A failed main-key write is visible, leaves history unchanged, and commits once on retry.
  {
    const ctx = await context();
    try {
      const page = await tab(ctx, true);
      const before = await page.evaluate(() => {
        beginW('A');
        for (const l of Object.values(LOG)) { l.reps = l.reps.map(() => 0); l.setDone = l.setDone.map(() => false); }
        const l = LOG[dayExs(ADAY)[0].id]; l.reps[0] = 5; l.setDone[0] = true;
        WU_CHECKS = [true, true, false]; saveAW(); finishW();
        const raw = localStorage.getItem('rft-v12');
        window.testRealSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (key === 'rft-v12') throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
          return window.testRealSetItem.call(this, key, value);
        };
        return raw;
      });
      await page.getByRole('button', { name: 'Save ✓', exact: true }).click();
      await page.getByRole('button', { name: 'Retry save', exact: true }).waitFor();
      T('pending summary locks editing until retry or discard', await page.locator('#app').evaluate(el => el.inert));
      T('persistent save status leaves the header accessible', await page.evaluate(() =>
        document.querySelector('.hdr').getBoundingClientRect().top >= document.getElementById('save-status').getBoundingClientRect().bottom - 1));
      T('failed summary save keeps committed history intact', await page.evaluate(raw =>
        localStorage.getItem('rft-v12') === raw && !!window._S && !!localStorage.getItem('rft-active'), before));
      const pendingId = await page.evaluate(() => PENDING_SAVE.sessions.at(-1).id);
      await page.evaluate(() => { Storage.prototype.setItem = window.testRealSetItem; });
      await page.getByRole('button', { name: 'Retry save', exact: true }).click();
      T('retry adds exactly one workout with its stable identity', await page.evaluate(({ raw, id }) => {
        const old = JSON.parse(raw), saved = JSON.parse(localStorage.getItem('rft-v12'));
        return saved.sessions.length === old.sessions.length + 1 && saved.sessions.filter(s => s.id === id).length === 1 && !window._S;
      }, { raw: before, id: pendingId }));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => canWriteStore());
      T('successful retry survives reload without a duplicate resume', await page.evaluate(id =>
        D.sessions.filter(s => s.id === id).length === 1 && !checkResume(), pendingId));
    } finally { await ctx.close(); }
  }
};
