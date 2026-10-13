// Bundles the game into a single HTML page (used for the claude.ai artifact).
// Usage: node tools/build-artifact.mjs [out.html]
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || path.join(root, 'dist', 'lindenau.html');
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

const js = execFileSync('npx', ['-y', 'esbuild@0.24.0', path.join(root, 'js/main.js'), '--bundle', '--format=esm', '--minify', '--external:three', '--target=es2020'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .replace(/from\s*"three"/g, `from"${THREE_URL}"`)
  .replace(/import\s*\*\s*as\s*(\w+)\s*from\s*"three"/g, `import*as $1 from"${THREE_URL}"`);
const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const body = html.slice(html.indexOf('<!--APP-->') + 10, html.indexOf('<!--/APP-->'));
const page = `<title>Lindenau</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600&family=Figtree:wght@400;600;700&display=swap">
<style>
${css}
</style>
${body}
<script type="module">
${js}
</script>
`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, page);
console.log(`wrote ${out} (${(page.length / 1024).toFixed(0)} KB)`);
