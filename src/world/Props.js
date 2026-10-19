import * as THREE from 'three';
import { WALL_T, CELLAR_Y, WALL_H } from './Level.js';

const F = WALL_T / 2 + 0.005; // inner wall face offset
const deg = THREE.MathUtils.degToRad;
const Y0 = 0, YC = CELLAR_Y;

// ---------- procedural helpers ----------
let flameTex = null;
function getFlameTexture() {
  if (flameTex) return flameTex;
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 92, 2, 32, 80, 40);
  grd.addColorStop(0, 'rgba(255,255,235,1)'); grd.addColorStop(0.25, 'rgba(255,214,120,.95)');
  grd.addColorStop(0.55, 'rgba(255,120,30,.45)'); grd.addColorStop(1, 'rgba(255,60,0,0)');
  g.fillStyle = grd;
  g.beginPath(); g.moveTo(32, 6); g.bezierCurveTo(52, 50, 54, 92, 32, 120); g.bezierCurveTo(10, 92, 12, 50, 32, 6); g.fill();
  flameTex = new THREE.CanvasTexture(c); flameTex.colorSpace = THREE.SRGBColorSpace;
  return flameTex;
}
let glowTex = null;
export function getGlowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,220,170,.9)'); grd.addColorStop(0.3, 'rgba(255,170,90,.25)'); grd.addColorStop(1, 'rgba(255,140,60,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c); glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

export function makeFlame(scale = 1) {
  const grp = new THREE.Group();
  const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: getFlameTexture(), color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  flame.scale.set(0.022 * scale, 0.05 * scale, 1);
  flame.position.y = 0.022 * scale;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 }));
  glow.scale.set(0.35 * scale, 0.35 * scale, 1);
  glow.position.y = 0.025 * scale;
  grp.add(flame, glow);
  grp.userData.flame = flame;
  grp.userData.glow = glow;
  return grp;
}

function candleMesh() {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.12, 12), new THREE.MeshStandardMaterial({ color: 0xe8e0c8, roughness: 0.6, emissive: 0x2a1a08, emissiveIntensity: 0.25 }));
  m.position.y = 0.06;
  return m;
}

// Canvas-generated decal planes (blood writing, smears, child's drawing...)
export function canvasPlane(w, h, draw, { px = 512, transparent = true, emissive = 0 } = {}) {
  const c = document.createElement('canvas');
  c.width = px; c.height = Math.round(px * (h / w));
  draw(c.getContext('2d'), c.width, c.height);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent, roughness: 0.55, metalness: 0, depthWrite: !transparent, polygonOffset: true, polygonOffsetFactor: -2 });
  if (emissive) { mat.emissive = new THREE.Color(0xffffff); mat.emissiveMap = tex; mat.emissiveIntensity = emissive; }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.userData.canvas = c;
  return mesh;
}

function bloodWriting(text, { size = 120, color = '#5a0505' } = {}) {
  return (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.font = `${size}px "Homemade Apple", cursive`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = color;
    g.shadowColor = 'rgba(40,0,0,.6)'; g.shadowBlur = 6;
    const lines = text.split('\n');
    lines.forEach((l, i) => g.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * size * 1.25));
    // drips
    g.shadowBlur = 0;
    for (let i = 0; i < 26; i++) {
      const x = w * 0.12 + Math.random() * w * 0.76, y = h * 0.35 + Math.random() * h * 0.3, len = 20 + Math.random() * 120;
      const grd = g.createLinearGradient(0, y, 0, y + len); grd.addColorStop(0, color); grd.addColorStop(1, 'rgba(60,0,0,0)');
      g.fillStyle = grd; g.fillRect(x, y, 2 + Math.random() * 3, len);
    }
  };
}

function bloodSmear(g, w, h) {
  g.clearRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) {
    const x = w / 2 + (Math.random() - 0.5) * w * 0.6, y = h / 2 + (Math.random() - 0.5) * h * 0.6, r = 8 + Math.random() * 60;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(${60 + Math.random() * 30},0,0,${0.5 + Math.random() * 0.4})`); grd.addColorStop(1, 'rgba(40,0,0,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // drag marks
  g.strokeStyle = 'rgba(55,0,0,.55)';
  for (let i = 0; i < 5; i++) { g.lineWidth = 6 + Math.random() * 8; g.beginPath(); g.moveTo(w / 2 + (i - 2) * 14, h / 2); g.bezierCurveTo(w * 0.55, h * 0.7, w * 0.4, h * 0.85, w / 2 + (i - 2) * 20, h); g.stroke(); }
}

// ---------- placement ----------
export class Props {
  constructor(level, assets, scene, quality) {
    this.level = level; this.assets = assets; this.scene = scene; this.q = quality;
    this.lights = [];       // { light, base, kind, flame?, power? }
    this.hideSpots = [];    // { object, pos, yaw, exitPos }
    this.named = {};        // special objects for story
    this.rats = [];
    this.rockers = [];
    this.statics = [];      // placed objects whose matrices get frozen after populate()
    this.pool = [];         // the few real PointLights shared by all light sources
    this._cam = new THREE.Vector3();
  }

  bbox(id) {
    const m = this.assets.model(id);
    return new THREE.Box3().setFromObject(m);
  }

  // Place a model. side: 'N'|'S'|'E'|'W' puts its back against that wall coordinate `wall`.
  place(id, { x = 0, z = 0, y = 0, rot = 0, side = null, wall = 0, collide = true, los = false, fitH = 0, scale = 1, shrink = 0.06, name = null, cast = true, dynamic = false } = {}) {
    const obj = this.assets.model(id);
    let s = scale;
    const b0 = new THREE.Box3().setFromObject(obj);
    if (fitH) s = fitH / (b0.max.y - b0.min.y);
    obj.scale.setScalar(s);
    const back = -b0.min.z * s; // distance from origin to back face
    if (side === 'N') { rot = 0; z = wall + F + back; }
    if (side === 'S') { rot = 180; z = wall - F - back; }
    if (side === 'W') { rot = 90; x = wall + F + back; }
    if (side === 'E') { rot = -90; x = wall - F - back; }
    obj.position.set(x, y, z);
    obj.rotation.y = deg(rot);
    // small props don't need to cast flashlight shadows (saves shadow-pass draw calls)
    const size = b0.getSize(new THREE.Vector3()).multiplyScalar(s);
    if (!cast || Math.max(size.x, size.y, size.z) < 0.55) obj.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    this.scene.add(obj);
    obj.updateMatrixWorld(true);
    if (!dynamic) this.statics.push(obj);
    if (collide) {
      const b = new THREE.Box3().setFromObject(obj);
      this.level.addCollider({ minX: b.min.x + shrink, maxX: b.max.x - shrink, minZ: b.min.z + shrink, maxZ: b.max.z - shrink, prop: id }, { los });
    }
    if (name) this.named[name] = obj;
    return obj;
  }

  // A light *source*. Real PointLights come from a small pool assigned each frame to the most relevant sources.
  addLight({ x, y, z, color = 0xffa955, intensity = 1.2, distance = 6, kind = 'candle', power = false, flame = null }) {
    const rec = { src: true, pos: new THREE.Vector3(x, y, z), color: new THREE.Color(color), distance, base: intensity, value: 0, kind, power, flame, seed: Math.random() * 100, on: !power };
    this.lights.push(rec);
    return rec;
  }

  _buildPool() {
    for (let i = 0; i < this.q.lights; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 1, 2);
      l.userData.src = null;
      this.scene.add(l);
      this.pool.push(l);
    }
  }

  _freezeStatics() {
    for (const obj of this.statics) {
      obj.traverse((o) => { o.updateMatrix(); o.matrixAutoUpdate = false; });
      obj.updateMatrixWorld(true);
    }
  }

  // Assign pooled lights to the light sources that matter most to the camera right now.
  _assignPool(camPos) {
    const cands = [];
    for (const L of this.lights) {
      if (!L.src || L.value < 0.01) continue;
      const d = L.pos.distanceTo(camPos);
      if (d > L.distance + 7) continue;
      L.score = L.value * L.distance / (1 + Math.max(0, d - L.distance * 0.35) ** 2);
      cands.push(L);
    }
    cands.sort((a, b) => b.score - a.score);
    const chosen = new Set(cands.slice(0, this.pool.length));
    // keep stable slots for sources that stay chosen, refill the rest
    const free = [];
    for (const l of this.pool) { if (l.userData.src && chosen.has(l.userData.src)) chosen.delete(l.userData.src); else free.push(l); }
    for (const l of free) { const s = chosen.values().next().value; if (s) chosen.delete(s); l.userData.src = s || null; }
    for (const l of this.pool) {
      const s = l.userData.src;
      if (!s) { l.intensity = 0; continue; }
      l.position.copy(s.pos); l.color.copy(s.color); l.distance = s.distance; l.intensity = s.value;
    }
  }

  candle(x, y, z, { light = true, intensity = 0.9, distance = 5, holder = true } = {}) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    if (holder) { const h = this.assets.model('wooden_candlestick'); g.add(h); }
    const c = candleMesh(); c.position.y += holder ? 0.2 : 0; g.add(c);
    const fl = makeFlame(1); fl.position.y = (holder ? 0.2 : 0) + 0.125; g.add(fl);
    this.scene.add(g);
    if (light) this.addLight({ x, y: y + 0.45, z, intensity, distance, flame: fl });
    else this.lights.push({ light: null, flame: fl, kind: 'candle', seed: Math.random() * 100, on: true });
    return g;
  }

  window({ x, z, y = 1.5, side, w = 0.95, h = 1.25, light = true }) {
    // boarded window with cold moonlight bleeding between planks
    const grp = new THREE.Group();
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.32, 0.42, 0.62) }));
    grp.add(glass);
    const frameMat = this.assets.material('dark_wood');
    const fb = (bw, bh, px, py) => { const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.08), frameMat); m.position.set(px, py, 0.02); grp.add(m); };
    fb(w + 0.16, 0.08, 0, h / 2 + 0.04); fb(w + 0.16, 0.1, 0, -h / 2 - 0.05); fb(0.08, h, -w / 2 - 0.04, 0); fb(0.08, h, w / 2 + 0.04, 0); fb(0.04, h, 0, 0); fb(w, 0.04, 0, 0.1);
    const plankMat = this.assets.material('wood_peeling_paint_weathered', { normal: 1.6 });
    const planks = [[0.12, -0.42, 0.07], [-0.08, -0.05, -0.1], [0.05, 0.3, 0.12], [0.0, 0.5, -0.06]];
    planks.forEach(([r, py, px]) => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(w + 0.35, 0.17, 0.035), plankMat);
      p.position.set(px, py, 0.08); p.rotation.z = r; p.castShadow = true; grp.add(p);
    });
    const yaw = { N: 0, S: Math.PI, W: Math.PI / 2, E: -Math.PI / 2 }[side];
    grp.rotation.y = yaw;
    grp.position.set(x, y, z);
    this.scene.add(grp);
    if (light && this.q.extraLights) {
      const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      this.addLight({ x: x + fwd.x * 0.7, y, z: z + fwd.z * 0.7, color: 0x8fa6d8, intensity: 1.0, distance: 6.5, kind: 'moon' });
    }
    return grp;
  }

  table(x, z, w, d, h, { y = 0, rot = 0, top = 'dark_wood', legs = 'dark_wood' } = {}) {
    const g = new THREE.Group();
    const topM = this.assets.material(top), legM = this.assets.material(legs);
    const t = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), topM); t.position.y = h - 0.025; g.add(t);
    const apron = new THREE.Mesh(new THREE.BoxGeometry(w - 0.12, 0.1, d - 0.12), legM); apron.position.y = h - 0.1; g.add(apron);
    const legG = new THREE.CylinderGeometry(0.03, 0.022, h - 0.05, 10);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const l = new THREE.Mesh(legG, legM); l.position.set(sx * (w / 2 - 0.08), (h - 0.05) / 2, sz * (d / 2 - 0.08)); g.add(l); }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
    g.position.set(x, y, z); g.rotation.y = deg(rot);
    this.scene.add(g);
    const hw = (rot % 180 === 0 ? w : d) / 2, hd = (rot % 180 === 0 ? d : w) / 2;
    this.level.addCollider({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd });
    return g;
  }

  counter(x0, x1, zFace, { y = 0, depth = 0.62 } = {}) {
    const g = new THREE.Group();
    const w = x1 - x0;
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.86, depth - 0.04), this.assets.material('wooden_panels'));
    base.position.set(0, 0.43, 0.02); g.add(base);
    const top = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.05, depth), this.assets.material('damaged_concrete_floor'));
    top.position.set(0, 0.885, 0); g.add(top);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
    g.position.set((x0 + x1) / 2, y, zFace - depth / 2);
    this.scene.add(g);
    this.level.addCollider({ minX: x0, maxX: x1, minZ: zFace - depth, maxZ: zFace });
    return g;
  }

  hanging(id, x, y, z, rot, opts = {}) { return this.place(id, { x, y, z, rot, collide: false, ...opts }); }

  decal(mesh, x, y, z, { rotY = 0, rotX = 0 } = {}) {
    mesh.position.set(x, y, z); mesh.rotation.set(rotX, rotY, 0, 'YXZ');
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  hideSpot(obj, { exit = 0.6, eye = 1.5 } = {}) {
    const yaw = obj.rotation.y;
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const b = new THREE.Box3().setFromObject(obj);
    const c = b.getCenter(new THREE.Vector3());
    const halfDepth = Math.abs(fwd.x) > 0.5 ? (b.max.x - b.min.x) / 2 : (b.max.z - b.min.z) / 2;
    // eye sits just in front of the doors; the slat overlay sells being inside
    const pos = c.clone().addScaledVector(fwd, halfDepth + 0.04); pos.y = obj.position.y + eye;
    const exitPos = c.clone().addScaledVector(fwd, exit + halfDepth); exitPos.y = obj.position.y;
    const spot = { object: obj, pos, yaw, exitPos, fwd };
    obj.userData.hideSpot = spot;
    this.hideSpots.push(spot);
    return spot;
  }

  // ---------- the house ----------
  populate() {
    const P = this.place.bind(this);
    const N = this.named;

    // ===== Master bedroom (x 0-10.5, z 0-6) =====
    P('GothicBed_01', { x: 3.0, side: 'N', wall: 0, los: false });
    N.nightstand = P('ClassicNightstand_01', { x: 4.45, side: 'N', wall: 0 });
    N.desk = P('WoodenTable_03', { z: 4.1, side: 'W', wall: 0 });
    this.candle(0.42, 0.83, 3.65, { intensity: 1.1, distance: 5.5 });
    P('WoodenChair_01', { x: 1.15, z: 4.1, rot: -90, fitH: 0.98 });
    N.bedWardrobe = P('GothicCabinet_01', { z: 2.3, side: 'E', wall: 10.5, los: true });
    this.hideSpot(N.bedWardrobe);
    P('ArmChair_01', { x: 9.2, z: 4.9, rot: -140 });
    this.hanging('fancy_picture_frame_01', 2.4, 1.75, 6 - F, 180);
    this.hanging('hanging_picture_frame_02', 7.6, 1.8, F, 0);
    this.window({ x: F + 0.01, z: 1.7, side: 'W' });
    P('cardboard_box_01', { x: 9.6, z: 0.6, rot: 12 });

    // ===== Nursery (x 10.5-18, z 0-6) =====
    N.crib = P('old_bed_frame', { x: 12.0, side: 'N', wall: 0, fitH: 1.2 });
    N.nurseryMirror = this.hanging('ornate_mirror_01', 12.0, 2.05, F, 0);
    const rocker = P('Rockingchair_01', { x: 16.6, z: 1.5, rot: -130, dynamic: true });
    this.rockers.push({ obj: rocker, amp: 0, phase: 0 });
    N.rocker = rocker;
    P('spinning_wheel_01', { x: 16.8, z: 4.7, rot: -100 });
    P('wooden_crate_01', { x: 11.3, z: 5.3, rot: 90 });
    P('cardboard_box_01', { x: 14.0, z: 0.5, rot: -8 });

    // ===== Bathroom (x 18-24, z 0-6) =====
    P('drawer_cabinet', { z: 1.6, side: 'E', wall: 24, los: true });
    this.hanging('ornate_mirror_01', 21.0, 1.85, F, 0);
    P('medical_box', { x: 19.2, z: 0.9, rot: 25, collide: false });
    N.bathChair = P('dining_chair_02', { x: 19.3, z: 4.6, rot: 120 });
    this.decal(canvasPlane(2.2, 1.0, bloodWriting('SHE SEES IT\nIN THE MIRROR', { size: 90 }), { px: 1024 }), 21.0, 1.55, 6 - F - 0.004, { rotY: Math.PI });
    this.decal(canvasPlane(1.6, 1.6, bloodSmear), 21.5, 0.006, 3.8, { rotX: -Math.PI / 2 });

    // ===== Guest room (x 24-33, z 0-6) =====
    P('old_bed_frame', { x: 30.6, side: 'N', wall: 0 });
    P('GothicCommode_01', { z: 4.3, side: 'E', wall: 33 });
    N.suitcase = P('vintage_suitcase', { x: 27.8, z: 0.9, rot: 0 });
    N.guestWardrobe = P('vintage_cabinet_01', { z: 2.6, side: 'W', wall: 24, los: true });
    this.hideSpot(N.guestWardrobe);
    P('dining_chair_02', { x: 31.6, z: 2.0, rot: -70 });

    // ===== Hallway (z 6-7.5) =====
    [[8.2, 'hanging_picture_frame_02'], [11.6, 'fancy_picture_frame_01'], [23.2, 'hanging_picture_frame_02'], [26.4, 'fancy_picture_frame_01']]
      .forEach(([x, id]) => this.hanging(id, x, 1.7, 6 + F, 0));
    [[3.0, 'fancy_picture_frame_01'], [14.6, 'hanging_picture_frame_02'], [25.8, 'fancy_picture_frame_01']]
      .forEach(([x, id]) => this.hanging(id, x, 1.7, 7.5 - F, 180));
    if (this.q.extraLights) this.candle(9.6, 0, 6.35, { intensity: 0.8, distance: 4.5 });
    else this.candle(9.6, 0, 6.35, { light: false });
    this.decal(canvasPlane(1.4, 1.4, bloodSmear), 24.0, 0.006, 6.8, { rotX: -Math.PI / 2 });
    this.hanging('hanging_picture_frame_02', 1.5 - F, 1.7, 14.6, -90);
    this.hanging('fancy_picture_frame_01', 31.5 + F, 1.7, 9.4, 90);

    // ===== Study (x 1.5-10.5, z 7.5-16.5) =====
    N.clock = P('vintage_grandfather_clock_01', { x: 6.2, side: 'N', wall: 7.5, los: true, dynamic: true });
    P('wooden_bookshelf_worn', { x: 3.25, side: 'S', wall: 16.5, los: true });
    P('wooden_bookshelf_worn', { x: 4.65, side: 'S', wall: 16.5, los: true });
    N.studyDesk = P('WoodenTable_03', { x: 6.0, z: 11.9, rot: 0 });
    P('WoodenChair_01', { x: 6.0, z: 12.75, rot: 180, fitH: 0.98 });
    P('vintage_oil_lamp', { x: 5.45, y: 0.83, z: 11.85, collide: false });
    this.addLight({ x: 5.45, y: 1.35, z: 11.85, intensity: 1.4, distance: 6.5, color: 0xffb060, kind: 'lamp' });
    N.studyWardrobe = P('GothicCabinet_01', { z: 14.85, side: 'W', wall: 1.5, los: true });
    this.hideSpot(N.studyWardrobe);
    P('ArmChair_01', { x: 9.4, z: 8.7, rot: -135 });
    this.hanging('fancy_picture_frame_01', 3.6, 1.75, 7.5 + F, 0);
    this.decal(canvasPlane(1.6, 0.6, bloodWriting('IT HEARS YOU RUN', { size: 70 }), { px: 1024 }), 10.5 - F - 0.004, 1.9, 9.6, { rotY: -Math.PI / 2 });

    // ===== Parlour (x 10.5-22.5, z 7.5-16.5) =====
    N.tvTable = P('WoodenTable_01', { x: 18.6, side: 'S', wall: 16.5 });
    N.tv = P('Television_01', { x: 18.6, y: 0.55, z: 16.5 - F - 0.3, rot: 180, collide: false });
    P('Sofa_01', { x: 18.6, z: 12.6, rot: 0 });
    P('ArmChair_01', { x: 15.6, z: 14.0, rot: 60 });
    P('Chandelier_01', { x: 16.5, y: WALL_H, z: 12.0, collide: false, cast: false });
    N.parlourCabinet = P('vintage_cabinet_01', { x: 13.2, side: 'N', wall: 7.5, los: true });
    this.hanging('hanging_picture_frame_02', 10.5 + F, 1.7, 9.5, 90);
    this.addLight({ x: 16.5, y: 2.2, z: 12.0, intensity: 2.2, distance: 9, color: 0xffc27a, kind: 'bulb', power: true });

    // ===== Dining (x 22.5-31.5, z 7.5-16.5) =====
    this.table(27.0, 12.0, 2.7, 1.05, 0.78);
    [[26.0, 11.1, 0], [27.0, 11.1, 0], [28.0, 11.1, 0], [26.0, 12.9, 180], [28.0, 12.9, 180]].forEach(([x, z, r]) => P('dining_chair_02', { x, z, rot: r, collide: false }));
    const fallen = P('dining_chair_02', { x: 27.4, z: 13.6, rot: 200, collide: false });
    fallen.rotation.x = -Math.PI / 2; fallen.position.y = 0.21;
    P('brass_candleholders', { x: 27.0, y: 0.78, z: 12.0, collide: false });
    this.addLight({ x: 27.0, y: 1.5, z: 12.0, intensity: 1.5, distance: 7, color: 0xffa04a });
    [[26.62, 1.5], [27.0, 1.62], [27.38, 1.5]].forEach(([x, y]) => { const f = makeFlame(1); f.position.set(x, y - 0.06, 12.0); this.scene.add(f); this.lights.push({ light: null, flame: f, seed: Math.random() * 9, on: true }); });
    N.diningCabinet = P('vintage_cabinet_01', { x: 27.0, side: 'N', wall: 7.5, los: true });
    P('Chandelier_01', { x: 27.0, y: WALL_H, z: 12.0, collide: false, cast: false });
    this.hanging('fancy_picture_frame_01', 31.5 - F, 1.7, 9.5, -90);

    // ===== Foyer (x 0-15, z 16.5-25.5) =====
    P('gothic_statue', { x: 2.6, z: 23.0, rot: 40, los: true });
    P('wheelchair_01', { x: 11.6, z: 23.4, rot: -150 });
    N.foyerCommode = P('GothicCommode_01', { z: 19.6, side: 'W', wall: 0 });
    this.candle(0.35, 1.21, 19.2, { intensity: 1.0, distance: 6 });
    this.candle(0.35, 1.21, 20.0, { light: false });
    this.hanging('ornate_mirror_01', F, 2.0, 19.6, 90);
    P('vintage_suitcase', { x: 9.2, z: 25.5 - F - 0.14, rot: 180 });
    P('cardboard_box_01', { x: 4.4, z: 24.9, rot: 30 });
    P('Chandelier_01', { x: 7.5, y: WALL_H, z: 21.0, collide: false, cast: false });
    this.window({ x: 11.2, z: 25.5 - F - 0.01, side: 'S' });
    this.decal(canvasPlane(2.4, 0.9, bloodWriting("DON'T LET IT OUT", { size: 100 }), { px: 1024 }), 3.6, 2.1, 25.5 - F - 0.004, { rotY: Math.PI });

    // ===== Kitchen (x 15-27, z 16.5-24) =====
    this.table(19.4, 20.1, 1.9, 0.95, 0.78);
    [[18.8, 19.3, 0], [20.0, 19.3, 0], [19.4, 20.95, 180]].forEach(([x, z, r]) => P('dining_chair_02', { x, z, rot: r, collide: false }));
    N.kitchenDrawers = P('drawer_cabinet', { x: 17.0, side: 'N', wall: 16.5, los: true });
    N.kitchenCabinet = P('vintage_cabinet_01', { x: 20.6, side: 'N', wall: 16.5, los: true });
    this.hideSpot(N.kitchenCabinet);
    this.counter(15.4, 20.6, 24 - F);
    P('wine_barrel_01', { x: 26.3, z: 17.3 });
    P('wooden_crate_01', { x: 26.3, z: 23.4, rot: 90 });
    P('cardboard_box_01', { x: 16.2, y: 0.91, z: 23.6, rot: 15, collide: false });
    this.hanging('pull_chain_light_socket', 19.4, WALL_H, 20.1, 0, { cast: false });
    this.addLight({ x: 19.4, y: 2.68, z: 20.1, intensity: 2.0, distance: 8, color: 0xffd9a0, kind: 'bulb', power: true });
    this.decal(canvasPlane(1.2, 1.2, bloodSmear), 22.6, 0.006, 22.8, { rotX: -Math.PI / 2 });

    // ===== Laundry (x 27-33, z 16.5-24) =====
    P('steel_frame_shelves_01', { z: 18.8, side: 'E', wall: 33, fitH: 1.9, los: true });
    P('cardboard_box_01', { x: 32.4, y: 0.98, z: 18.7, rot: 90, collide: false });
    P('wooden_crate_01', { x: 28.0, z: 23.4, rot: 10 });
    P('wooden_crate_01', { x: 28.0, y: 0.35, z: 23.4, rot: -5, collide: false });
    P('cardboard_box_01', { x: 30.5, z: 23.5, rot: 40 });
    N.laundryShelf = P('steel_frame_shelves_01', { z: 21.4, side: 'E', wall: 33, fitH: 1.9, los: true });

    // ===== Cellar stairs =====
    this.hanging('pull_chain_light_socket', 21.75, WALL_H, 24.6, 0, { cast: false });

    // ===== Cellar (x 9-25.5, z 30-42, y -3) =====
    N.fuseBox = P('power_box_01', { x: 16.0, y: YC + 1.45, side: 'N', wall: 30, collide: false, dynamic: true });
    P('steel_frame_shelves_01', { y: YC, z: 32.8, side: 'W', wall: 9, fitH: 1.9, los: true });
    P('steel_frame_shelves_01', { y: YC, z: 34.1, side: 'W', wall: 9, fitH: 1.9, los: true });
    P('cardboard_box_01', { x: 9.5, y: YC + 0.98, z: 32.7, rot: 90, collide: false });
    P('wooden_crate_01', { x: 9.6, y: YC + 0.1, z: 34.0, rot: 90, collide: false });
    [[10.4, 40.6], [11.3, 41.3], [10.4, 39.7]].forEach(([x, z]) => P('wine_barrel_01', { x, y: YC, z }));
    P('old_bed_frame', { x: 12.3, y: YC, z: 37.6, rot: 90 });
    this.decal(canvasPlane(1.8, 1.8, bloodSmear), 12.3, YC + 0.006, 37.6, { rotX: -Math.PI / 2 });
    P('wooden_crate_01', { x: 22.0, y: YC, z: 41.4, rot: 0 });
    P('wooden_crate_01', { x: 22.0, y: YC + 0.35, z: 41.4, rot: 8, collide: false });
    P('cardboard_box_01', { x: 23.4, y: YC, z: 41.5, rot: -20 });
    N.cellarCabinet = P('vintage_cabinet_01', { x: 17.0, y: YC, side: 'S', wall: 42, los: true });
    this.hideSpot(N.cellarCabinet);
    P('wheelchair_01', { x: 23.6, y: YC, z: 31.4, rot: 200 });
    this.hanging('pull_chain_light_socket', 14.0, YC + WALL_H - 0.22, 33.5, 0, { cast: false });
    this.hanging('pull_chain_light_socket', 19.0, YC + WALL_H - 0.22, 39.0, 0, { cast: false });
    this.addLight({ x: 14.0, y: YC + 2.45, z: 33.5, intensity: 2.2, distance: 9, color: 0xffcf90, kind: 'bulb', power: true });
    this.addLight({ x: 19.0, y: YC + 2.45, z: 39.0, intensity: 1.8, distance: 8, color: 0xffcf90, kind: 'bulb', power: true });
    this.decal(canvasPlane(2.6, 1.0, bloodWriting('WE KEPT IT DOWN HERE', { size: 80 }), { px: 1024 }), 9 + F + 0.004, YC + 1.8, 37.8, { rotY: Math.PI / 2 });
    for (let i = 0; i < 2; i++) {
      const rat = this.place('street_rat', { x: 12 + i * 8, y: YC, z: 36 + i * 3, collide: false, scale: 1.6, dynamic: true });
      this.rats.push({ obj: rat, target: rat.position.clone(), wait: Math.random() * 3, area: [9.6, 24.8, 30.6, 41.4] });
    }

    // ===== Workshop (x 25.5-33, z 30-36) =====
    N.workbench = P('WoodenTable_03', { y: YC, z: 33.2, side: 'E', wall: 33 });
    P('steel_frame_shelves_01', { x: 29.0, y: YC, side: 'N', wall: 30, fitH: 1.9, los: true });
    P('wooden_crate_01', { x: 26.4, y: YC, z: 35.4, rot: 80 });
    P('cardboard_box_01', { x: 28.4, y: YC, z: 35.5, rot: 10 });
    P('old_gas_mask', { x: 30.6, y: YC + 1.9, z: 36 - F - 0.08, rot: 180, collide: false });

    // ===== Boiler room (x 25.5-33, z 36-42) =====
    this.boiler(31.2, 40.2);
    [[26.4, 36.9], [27.3, 36.9], [26.4, 41.2]].forEach(([x, z]) => P('wine_barrel_01', { x, y: YC, z }));
    P('medical_box', { x: 29.0, y: YC, z: 41.4, rot: 10, collide: false });
    const rat = this.place('street_rat', { x: 28, y: YC, z: 39, collide: false, scale: 1.6, dynamic: true });
    this.rats.push({ obj: rat, target: rat.position.clone(), wait: 1, area: [25.8, 29.5, 37.6, 41.6] });

    // TV screen (canvas, updated by story when powered)
    const scr = canvasPlane(0.38, 0.27, (g, w, h) => { g.fillStyle = '#050607'; g.fillRect(0, 0, w, h); }, { px: 256, transparent: false, emissive: 1 });
    scr.material.roughness = 0.15; scr.material.color.set(0x111111); scr.material.emissiveIntensity = 0;
    N.tvScreen = scr;
    this.decal(scr, 18.64, 0.55 + 0.255, 16.5 - F - 0.3 - 0.215, { rotY: Math.PI });
    N.tvLight = this.addLight({ x: 18.6, y: 0.9, z: 15.2, intensity: 0.9, distance: 5, color: 0x9fb8ff, kind: 'tv', power: true });
    this._buildPool();
    this._freezeStatics();
  }

  boiler(x, z) {
    const g = new THREE.Group();
    const metal = this.assets.material('rusty_metal_02', { metal: 1, env: 0.6 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 2.1, 28), metal); body.position.y = 1.15; g.add(body);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.72, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), metal); cap.position.y = 2.2; g.add(cap);
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 1.7), this.assets.material('dark_brick_wall')); base.position.y = 0.06; g.add(base);
    const pipeG = new THREE.CylinderGeometry(0.07, 0.07, 1.2, 12);
    [[0.3, 0.2], [-0.25, -0.3]].forEach(([px, pz]) => { const p = new THREE.Mesh(pipeG, metal); p.position.set(px, 2.7, pz); g.add(p); });
    const horiz = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.5, 12), metal); horiz.rotation.z = Math.PI / 2; horiz.position.set(-2.0, 2.6, 0.2); g.add(horiz);
    // firebox door with glowing slit
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.06), metal); door.position.set(0, 0.55, -0.72); g.add(door);
    const slit = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.04), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.1, 0.2) }));
    slit.position.set(0, 0.48, -0.755); slit.rotation.y = Math.PI; g.add(slit);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
    g.position.set(x, YC, z);
    this.scene.add(g);
    this.level.addCollider({ minX: x - 0.8, maxX: x + 0.8, minZ: z - 0.8, maxZ: z + 0.8 }, { los: true });
    this.addLight({ x, y: YC + 0.5, z: z - 1.1, intensity: 1.6, distance: 6, color: 0xff5a1a, kind: 'fire' });
  }

  // ---------- animation ----------
  update(dt, t, power, camPos) {
    for (const L of this.lights) {
      let k = 1;
      if (L.kind === 'candle' || L.kind === 'fire' || L.kind === 'lamp' || (!L.kind && L.flame)) {
        const n = Math.sin(t * 9.1 + L.seed) * 0.5 + Math.sin(t * 23.7 + L.seed * 3) * 0.3 + Math.sin(t * 3.3 + L.seed) * 0.4;
        k = 0.82 + n * 0.12 + (Math.random() < 0.01 ? -0.25 : 0);
        if (L.kind === 'lamp') k = 0.92 + n * 0.05;
        if (L.flame) {
          L.flame.userData.flame.scale.y = 0.05 * (0.9 + n * 0.12);
          L.flame.userData.flame.position.x = Math.sin(t * 7 + L.seed) * 0.002;
          L.flame.userData.glow.material.opacity = 0.45 * k;
        }
      } else if (L.kind === 'bulb') {
        if (!power) k = 0;
        else {
          L.flick = (L.flick ?? 0) - dt;
          if (L.flick < 0) { L.flick = 0.05 + Math.random() * (Math.random() < 0.1 ? 0.08 : 3); L.cur = Math.random() < 0.12 ? 0.15 + Math.random() * 0.4 : 1; }
          k = L.cur ?? 1;
        }
      } else if (L.kind === 'tv') {
        k = power ? 0.6 + Math.random() * 0.4 : 0;
      } else if (L.kind === 'moon') k = 1;
      if (L.src) L.value = L.base * k * (L.dim ?? 1);
    }
    if (camPos) this._assignPool(camPos);
    for (const r of this.rockers) {
      r.amp = Math.max(0, r.amp - dt * 0.05);
      r.phase += dt * 2.4;
      r.obj.rotation.x = Math.sin(r.phase) * 0.09 * r.amp;
    }
    for (const r of this.rats) {
      const o = r.obj;
      if (r.wait > 0) { r.wait -= dt; continue; }
      const d = new THREE.Vector3().subVectors(r.target, o.position); d.y = 0;
      if (d.length() < 0.05) {
        const [x0, x1, z0, z1] = r.area;
        r.target.set(x0 + Math.random() * (x1 - x0), o.position.y, z0 + Math.random() * (z1 - z0));
        r.wait = Math.random() < 0.5 ? Math.random() * 4 : 0.2;
        continue;
      }
      d.normalize();
      o.position.addScaledVector(d, Math.min(1.8 * dt, o.position.distanceTo(r.target)));
      o.rotation.y = Math.atan2(d.x, d.z);
      o.position.y = this.level.heightAt(o.position.x, o.position.z) + Math.abs(Math.sin(t * 40)) * 0.006;
    }
  }
}
