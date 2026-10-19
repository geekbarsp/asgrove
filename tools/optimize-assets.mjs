// Builds web-ready assets from the full-quality sources in assets-src/:
//  - models: weld, simplify to a triangle budget, merge draw calls, WebP textures, meshopt-compressed .glb
//  - textures: JPG -> WebP
// Usage: node tools/optimize-assets.mjs
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression, EXTTextureWebP } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, join, reorder, quantize } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const SRC = 'assets-src';
const OUT = 'public/assets';

// Triangle budgets (models not listed get DEFAULT_BUDGET)
const BUDGET = {
  wooden_candlestick: 1200, street_rat: 1200, dining_chair_02: 2500, cardboard_box_01: 1200, pull_chain_light_socket: 900,
  vintage_flashlight: 2000, old_gas_mask: 2500, brass_candleholders: 4000, ornate_mirror_01: 2500, wooden_crate_01: 2500,
  vintage_oil_lamp: 3000, power_box_01: 4000, WoodenChair_01: 3500, wine_barrel_01: 3500, Chandelier_01: 5000,
  vintage_cabinet_01: 8000, GothicBed_01: 9000, GothicCabinet_01: 8000, gothic_statue: 8000, spinning_wheel_01: 5000,
  old_bed_frame: 6000, wheelchair_01: 6000, drawer_cabinet: 5000, vintage_suitcase: 4500, Rockingchair_01: 6000,
};
const DEFAULT_BUDGET = 6000;
// Small props get 512px textures
const SMALL = new Set(['wooden_candlestick', 'street_rat', 'old_gas_mask', 'vintage_flashlight', 'bolt_cutters_01', 'medical_box',
  'pull_chain_light_socket', 'vintage_oil_lamp', 'fancy_picture_frame_01', 'hanging_picture_frame_02', 'cardboard_box_01',
  'brass_candleholders', 'ornate_mirror_01', 'power_box_01', 'wooden_crate_01', 'Television_01', 'ClassicNightstand_01']);
// Models whose node names are referenced by the game (animated parts) must not be merged
const KEEP_NAMED = new Set(['vintage_grandfather_clock_01', 'power_box_01']);

await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

// Re-encode every embedded texture as WebP (forcing 8-bit sRGB so odd source JPEGs don't trip libvips)
async function webpTextures(doc, size) {
  for (const t of doc.getRoot().listTextures()) {
    const img = t.getImage();
    if (!img) continue;
    let pipe = sharp(Buffer.from(img)).toColourspace('srgb').resize(size, size, { fit: 'inside', withoutEnlargement: true });
    const isNormal = /nor/i.test(t.getName() + t.getURI());
    try {
      const out = await pipe.webp({ quality: isNormal ? 90 : 82 }).toBuffer();
      t.setImage(new Uint8Array(out)).setMimeType('image/webp').setURI(t.getURI().replace(/\.(jpe?g|png)$/i, '.webp'));
    } catch (e) {
      const out = await sharp(Buffer.from(img)).resize(size, size, { fit: 'inside' }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
      t.setImage(new Uint8Array(out)).setMimeType('image/jpeg');
      console.warn('  (kept jpeg for', t.getURI(), e.message, ')');
    }
  }
  doc.createExtension(EXTTextureWebP).setRequired(true);
}

function triCount(doc) {
  let t = 0;
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) {
    const idx = p.getIndices();
    t += (idx ? idx.getCount() : p.getAttribute('POSITION').getCount()) / 3;
  }
  return t;
}

const dirSize = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((s, e) => s + (e.isDirectory() ? dirSize(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);

fs.mkdirSync(path.join(OUT, 'models'), { recursive: true });
let before = 0, after = 0, trisBefore = 0, trisAfter = 0;
for (const id of fs.readdirSync(path.join(SRC, 'models'))) {
  const dir = path.join(SRC, 'models', id);
  const src = fs.readdirSync(dir).find((f) => f.endsWith('.gltf') || f.endsWith('.glb'));
  if (!src) continue;
  const out = path.join(OUT, 'models', id.replace(/\.glb$/, '') + '.glb');
  if (id === 'creature') {
    // rig + face scan: keep geometry, just copy (face textures converted below)
    fs.mkdirSync(path.join(OUT, 'models', 'creature'), { recursive: true });
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.jpg')) await sharp(path.join(dir, f)).resize(1024, 1024, { fit: 'inside' }).webp({ quality: 85 }).toFile(path.join(OUT, 'models', 'creature', f.replace('.jpg', '.webp')));
      else fs.copyFileSync(path.join(dir, f), path.join(OUT, 'models', 'creature', f));
    }
    before += dirSize(dir); after += dirSize(path.join(OUT, 'models', 'creature'));
    continue;
  }
  const doc = await io.read(path.join(dir, src));
  const t0 = triCount(doc);
  const budget = BUDGET[id] ?? DEFAULT_BUDGET;
  const ratio = Math.min(1, budget / t0);
  const tex = SMALL.has(id) ? 512 : 1024;
  await doc.transform(
    dedup(),
    weld(),
    ...(ratio < 1 ? [simplify({ simplifier: MeshoptSimplifier, ratio, error: SMALL.has(id) ? 0.02 : 0.008 })] : []),
    join({ keepNamed: KEEP_NAMED.has(id) }),
    prune(),
    reorder({ encoder: MeshoptEncoder }),
    quantize(),
  );
  await webpTextures(doc, tex);
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  await io.write(out, doc);
  const t1 = triCount(doc);
  before += dirSize(dir); after += fs.statSync(out).size; trisBefore += t0; trisAfter += t1;
  console.log(`${id.padEnd(30)} ${String(Math.round(t0)).padStart(7)} -> ${String(Math.round(t1)).padStart(6)} tris  ${(dirSize(dir) / 1e6).toFixed(1)}MB -> ${(fs.statSync(out).size / 1e6).toFixed(2)}MB`);
}

// Surface textures
const BIG_TEX = new Set(['decrepit_wallpaper', 'old_wood_floor']);
for (const id of fs.readdirSync(path.join(SRC, 'textures'))) {
  const dir = path.join(SRC, 'textures', id), od = path.join(OUT, 'textures', id);
  fs.mkdirSync(od, { recursive: true });
  for (const f of fs.readdirSync(dir)) {
    const size = BIG_TEX.has(id) ? 2048 : 1024;
    await sharp(path.join(dir, f)).resize(size, size, { fit: 'inside' }).webp({ quality: f.startsWith('nor') ? 90 : 82 }).toFile(path.join(od, f.replace('.jpg', '.webp')));
  }
  before += dirSize(dir); after += dirSize(od);
}
console.log(`\ntriangles ${Math.round(trisBefore).toLocaleString()} -> ${Math.round(trisAfter).toLocaleString()}`);
console.log(`size ${(before / 1e6).toFixed(1)}MB -> ${(after / 1e6).toFixed(1)}MB`);
