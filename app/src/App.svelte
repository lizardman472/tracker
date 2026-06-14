<script lang="ts">
  // Migration shell. This is the new Vite + TypeScript + Svelte foundation that
  // the legacy single-file app (../../index.html) will be ported into,
  // incrementally. Until then the legacy app remains the shipped experience.
  const buildTarget = import.meta.env.PROD ? 'production build' : 'dev server'

  const next: { label: string; done: boolean }[] = [
    { label: 'Vite + TypeScript + Svelte scaffold', done: true },
    { label: 'Extract pure logic into typed, tested modules', done: false },
    { label: 'Separate data model: config / program / log', done: false },
    { label: 'Port UI to Svelte, screen by screen', done: false },
    { label: 'Setup wizard + general-audience copy', done: false },
  ]
</script>

<main>
  <p class="eyebrow">Tracker · {buildTarget}</p>
  <h1>New app foundation is live</h1>
  <p class="lede">
    This is the TypeScript + Svelte project that the existing tracker will be
    migrated into. The legacy app still runs and ships unchanged while the port
    happens piece by piece.
  </p>

  <ol class="steps">
    {#each next as step}
      <li class:done={step.done}>
        <span class="marker">{step.done ? '✓' : ''}</span>
        {step.label}
      </li>
    {/each}
  </ol>
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .eyebrow {
    margin: 0;
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent);
  }
  h1 {
    margin: 0;
    font-size: 24px;
    line-height: 1.2;
  }
  .lede {
    margin: 0;
    color: var(--muted);
  }
  .steps {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .steps li {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    color: var(--muted);
  }
  .steps li.done {
    color: var(--text);
    border-color: var(--accent);
  }
  .marker {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    flex: none;
    border-radius: 50%;
    border: 1px solid var(--border);
    font-size: 12px;
    color: var(--accent);
  }
  .steps li.done .marker {
    border-color: var(--accent);
  }
</style>
