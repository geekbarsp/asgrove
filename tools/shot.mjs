// Headless screenshot/test harness (needs `npm run dev` running and Chrome installed).
// Usage: node tools/shot.mjs <outPrefix> "debug&nolock&flags=flashlight" '[{"name":"view","js":"game.player.spawn(5,3,0)","wait":1500}]'
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const [, , out, query = 'debug&nolock', shotsArg = '[]'] = process.argv;
const shots = JSON.parse(fs.existsSync(shotsArg) ? fs.readFileSync(shotsArg, 'utf8') : shotsArg);
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required', '--window-size=1280,720'],
  defaultViewport: { width: 1280, height: 720 },
});
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('response', (r) => { if (r.status() >= 400) logs.push('HTTP ' + r.status() + ' ' + r.url()); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
const t0 = Date.now();
await page.goto(`http://localhost:5173/?${query}`, { waitUntil: 'domcontentloaded' });
try {
  await page.waitForFunction(() => window.game && (window.game.state === 'playing' || window.game.state === 'menu'), { timeout: 120000 });
} catch (e) { logs.push('TIMEOUT waiting for game: ' + e.message); }
logs.push(`loaded in ${Date.now() - t0}ms`);
await new Promise((r) => setTimeout(r, 2500));
if (!shots.length) shots.push({ name: 'view' });
for (const s of shots) {
  if (s.js) { try { const r = await page.evaluate(s.js); if (r !== undefined) logs.push(`${s.name}: ${JSON.stringify(r)}`); } catch (e) { logs.push(`${s.name} eval error: ${e.message}`); } }
  await new Promise((r) => setTimeout(r, s.wait ?? 1500));
  await page.screenshot({ path: `${out}_${s.name}.png` });
}
const perf = await page.evaluate(() => { const r = window.game?.renderer?.renderer; return r ? { calls: r.info.render.calls, tris: r.info.render.triangles, geos: r.info.memory.geometries, tex: r.info.memory.textures, progs: r.info.programs?.length } : null; }).catch(() => null);
logs.push('perf ' + JSON.stringify(perf));
const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t < 2000) requestAnimationFrame(f); else res(n / 2); }; requestAnimationFrame(f); })).catch(() => 0);
logs.push('fps ' + fps);
console.log(logs.join('\n'));
await browser.close();
