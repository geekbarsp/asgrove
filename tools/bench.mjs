// Uncapped FPS benchmark at several spots in the house.
// Usage: node tools/bench.mjs [query] (dev server must be running)
import puppeteer from 'puppeteer-core';

const query = process.argv[2] || 'debug&nolock&flags=flashlight,power,cellar';
const origin = process.argv[3] || 'http://localhost:5173';
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit', '--window-size=1920,1080'],
  defaultViewport: { width: 1920, height: 1080 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const t0 = Date.now();
await page.goto(`${origin}/?${query}`);
await page.waitForFunction(() => window.game?.state === 'playing', { timeout: 180000 });
console.log('load ms', Date.now() - t0, await page.evaluate(() => { const r = window.game.renderer; const gl = r.renderer.getContext(); const e = gl.getExtension('WEBGL_debug_renderer_info'); return { quality: window.game.settings.quality, scale: r.scale, dpr: devicePixelRatio, gpu: e && gl.getParameter(e.UNMASKED_RENDERER_WEBGL) }; }));
const spots = [['bedroom', 7.5, 3.2, 1.9], ['hallway', 1.2, 6.75, -1.57], ['parlour', 14.2, 9.2, -2.5], ['dining', 24, 9, -2.2], ['cellar', 21.5, 31, 2.35]];
for (const [name, x, z, yaw] of spots) {
  const r = await page.evaluate(async (x, z, yaw) => {
    const g = window.game; g.player.spawn(x, z, yaw);
    const ri = g.renderer.renderer.info; ri.autoReset = false;
    await new Promise((r) => setTimeout(r, 1200));
    ri.reset();
    let n = 0, cpu = 0; const t = performance.now();
    await new Promise((res) => { const f = () => { n++; if (performance.now() - t < 3000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    const calls = Math.round(ri.render.calls / n), tris = Math.round(ri.render.triangles / n);
    ri.autoReset = true;
    return { fps: Math.round(n / ((performance.now() - t) / 1000)), calls, tris, progs: ri.programs.length };
  }, x, z, yaw);
  console.log(name.padEnd(8), JSON.stringify(r));
}
await browser.close();
