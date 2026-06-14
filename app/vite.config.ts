import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// Relative base so the built app works whether it's served from a domain root
// or a GitHub Pages project subpath (e.g. /tracker/) — matching the legacy
// app's `start_url: "."` convention.
// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [svelte()],
})
