import * as THREE from 'three';
import { TEX_SIZE } from './Assets.js';
import { Door, DOOR_W, DOOR_H } from './Door.js';

export const CELL = 1.5;
export const WALL_H = 2.9;
export const WALL_T = 0.14;
export const CELLAR_Y = -3.0;
const ARCH_W = 1.3, ARCH_H = 2.45;

// Region palette: materials + footstep surface.
export const REGIONS = {
  b: { name: 'Master Bedroom', wall: 'decrepit_wallpaper', floor: 'old_wood_floor', ceil: 'ceiling_interior', step: 'wood' },
  n: { name: 'Nursery', wall: 'peeling_painted_wall', floor: 'old_wood_floor', ceil: 'ceiling_interior', step: 'wood' },
  t: { name: 'Bathroom', wall: 'dirty_tiles', floor: 'dirty_tiles', ceil: 'ceiling_interior', step: 'tile' },
  g: { name: 'Guest Room', wall: 'worn_plaster_wall', floor: 'dirty_carpet', ceil: 'ceiling_interior', step: 'carpet' },
  h: { name: 'Hallway', wall: 'decrepit_wallpaper', floor: 'old_wood_floor', ceil: 'ceiling_interior', step: 'wood' },
  s: { name: 'Study', wall: 'wooden_panels', floor: 'dirty_carpet', ceil: 'ceiling_interior', step: 'carpet' },
  l: { name: 'Parlour', wall: 'decrepit_wallpaper', floor: 'old_wood_floor', ceil: 'ceiling_interior', step: 'wood' },
  d: { name: 'Dining Room', wall: 'peeling_painted_wall', floor: 'old_wood_floor', ceil: 'ceiling_interior', step: 'wood' },
  f: { name: 'Foyer', wall: 'wooden_panels', floor: 'old_wood_floor', ceil: 'ceiling_interior', step: 'wood' },
  k: { name: 'Kitchen', wall: 'worn_plaster_wall', floor: 'dirty_tiles', ceil: 'ceiling_interior', step: 'tile' },
  u: { name: 'Laundry', wall: 'peeling_painted_wall', floor: 'damaged_concrete_floor', ceil: 'ceiling_interior', step: 'concrete' },
  x: { name: 'Cellar Stairs', wall: 'worn_plaster_wall', floor: 'dark_wood', ceil: 'wood_peeling_paint_weathered', step: 'wood', stairs: true },
  c: { name: 'Cellar', wall: 'dark_brick_wall', floor: 'damaged_concrete_floor', ceil: 'wood_peeling_paint_weathered', step: 'concrete', cellar: true },
  w: { name: 'Workshop', wall: 'dark_brick_wall', floor: 'damaged_concrete_floor', ceil: 'wood_peeling_paint_weathered', step: 'concrete', cellar: true },
  r: { name: 'Boiler Room', wall: 'dark_brick_wall', floor: 'damaged_concrete_floor', ceil: 'wood_peeling_paint_weathered', step: 'concrete', cellar: true },
};

export const GW = 22, GH = 28;
const STAIR_Z0 = 16 * CELL, STAIR_Z1 = 20 * CELL;

function buildGrid() {
  const g = Array.from({ length: GH }, () => Array(GW).fill('.'));
  const rect = (ch, x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y][x] = ch; };
  rect('b', 0, 0, 6, 3); rect('n', 7, 0, 11, 3); rect('t', 12, 0, 15, 3); rect('g', 16, 0, 21, 3);
  rect('h', 0, 4, 21, 4); rect('h', 0, 5, 0, 10); rect('h', 21, 5, 21, 10);
  rect('s', 1, 5, 6, 10); rect('l', 7, 5, 14, 10); rect('d', 15, 5, 20, 10);
  rect('f', 0, 11, 9, 16); rect('k', 10, 11, 17, 15); rect('u', 18, 11, 21, 15);
  rect('x', 14, 16, 14, 19);
  rect('c', 6, 20, 16, 27); rect('w', 17, 20, 21, 23); rect('r', 17, 24, 21, 27);
  return g;
}

// Openings between cells: [ax, ay, bx, by, type, opts]
const OPENINGS = [
  [3, 3, 3, 4, 'door', { id: 'bedroom', hinge: 0 }],
  [9, 3, 9, 4, 'door', { id: 'nursery', hinge: 1 }],
  [13, 3, 13, 4, 'door', { id: 'bathroom', hinge: 0 }],
  [19, 3, 19, 4, 'door', { id: 'guest', hinge: 1 }],
  [11, 4, 11, 5, 'door', { id: 'parlour_n', hinge: 0 }],
  [0, 7, 1, 7, 'door', { id: 'study_w', hinge: 0 }],
  [6, 8, 7, 8, 'door', { id: 'study_e', hinge: 1 }],
  [14, 7, 15, 7, 'door', { id: 'dining_w', hinge: 0 }],
  [20, 8, 21, 8, 'door', { id: 'dining_e', hinge: 1 }],
  [0, 10, 0, 11, 'door', { id: 'foyer_w', hinge: 0 }],
  [8, 10, 8, 11, 'arch', {}],
  [16, 10, 16, 11, 'door', { id: 'kitchen_n', hinge: 1 }],
  [21, 10, 21, 11, 'door', { id: 'laundry_n', hinge: 0 }],
  [17, 13, 18, 13, 'door', { id: 'laundry_w', hinge: 1 }],
  [9, 13, 10, 13, 'arch', {}],
  [14, 15, 14, 16, 'door', { id: 'cellar', hinge: 0, locked: 'cellar_key' }],
  [4, 16, 4, 17, 'door', { id: 'front', hinge: 0, locked: 'chain', kind: 'front' }],
  [14, 19, 14, 20, 'arch', {}],
  [16, 22, 17, 22, 'door', { id: 'gate', hinge: 0, locked: 'combo', kind: 'gate', swing: 1 }],
  [16, 25, 17, 25, 'arch', {}],
];

class Batch {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.idx = []; }
  quad(p, n, uvs) {
    const b = this.pos.length / 3;
    for (let i = 0; i < 4; i++) { this.pos.push(p[i].x, p[i].y, p[i].z); this.nor.push(n.x, n.y, n.z); this.uv.push(uvs[i][0], uvs[i][1]); }
    const e1 = new THREE.Vector3().subVectors(p[1], p[0]);
    const e2 = new THREE.Vector3().subVectors(p[2], p[0]);
    const cn = e1.cross(e2);
    if (cn.dot(n) >= 0) this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    else this.idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  }
  // Axis-aligned box with world-projected UVs
  box(min, max, size) {
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const faces = [
      [V(1, 0, 0), [V(max.x, min.y, max.z), V(max.x, min.y, min.z), V(max.x, max.y, min.z), V(max.x, max.y, max.z)]],
      [V(-1, 0, 0), [V(min.x, min.y, min.z), V(min.x, min.y, max.z), V(min.x, max.y, max.z), V(min.x, max.y, min.z)]],
      [V(0, 1, 0), [V(min.x, max.y, max.z), V(max.x, max.y, max.z), V(max.x, max.y, min.z), V(min.x, max.y, min.z)]],
      [V(0, -1, 0), [V(min.x, min.y, min.z), V(max.x, min.y, min.z), V(max.x, min.y, max.z), V(min.x, min.y, max.z)]],
      [V(0, 0, 1), [V(min.x, min.y, max.z), V(max.x, min.y, max.z), V(max.x, max.y, max.z), V(min.x, max.y, max.z)]],
      [V(0, 0, -1), [V(max.x, min.y, min.z), V(min.x, min.y, min.z), V(min.x, max.y, min.z), V(max.x, max.y, min.z)]],
    ];
    for (const [n, pts] of faces) {
      const uvs = pts.map((p) => {
        if (Math.abs(n.x) > 0.5) return [p.z / size, p.y / size];
        if (Math.abs(n.y) > 0.5) return [p.x / size, p.z / size];
        return [p.x / size, p.y / size];
      });
      this.quad(pts, n, uvs);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

export class Level {
  constructor(scene, assets, audio) {
    this.scene = scene;
    this.assets = assets;
    this.audio = audio;
    this.CELL = CELL;
    this.grid = buildGrid();
    this.colliders = [];       // static AABBs (walls, furniture)
    this.losBlockers = [];     // AABBs that block sight (walls + tall furniture)
    this.doors = [];
    this.openings = new Map(); // edgeKey -> { type, door }
    this.meshes = [];          // level meshes (for interaction raycast occlusion)
    this.batches = new Map();
    this.onNoise = null;
  }

  // ---------- queries ----------
  region(cx, cy) { return cy >= 0 && cy < GH && cx >= 0 && cx < GW ? this.grid[cy][cx] : '.'; }
  regionAt(x, z) { return this.region(Math.floor(x / CELL), Math.floor(z / CELL)); }
  regionInfo(x, z) { return REGIONS[this.regionAt(x, z)]; }
  regionHeight(r, x, z) {
    if (r === 'x') return THREE.MathUtils.clamp(CELLAR_Y * (z - STAIR_Z0) / (STAIR_Z1 - STAIR_Z0), CELLAR_Y, 0);
    if (REGIONS[r]?.cellar) return CELLAR_Y;
    return 0;
  }
  heightAt(x, z) { return this.regionHeight(this.regionAt(x, z), x, z); }
  cellCenter(cx, cy) { return new THREE.Vector3((cx + 0.5) * CELL, this.regionHeight(this.region(cx, cy), (cx + 0.5) * CELL, (cy + 0.5) * CELL), (cy + 0.5) * CELL); }

  static edgeKey(ax, ay, bx, by) {
    if (ay === by) return `V${Math.max(ax, bx)},${ay}`;
    return `H${ax},${Math.max(ay, by)}`;
  }

  // Can an agent move between adjacent cells?
  passable(ax, ay, bx, by, { monster = false } = {}) {
    const ra = this.region(ax, ay), rb = this.region(bx, by);
    if (ra === '.' || rb === '.') return false;
    if (ra === rb) return true;
    const op = this.openings.get(Level.edgeKey(ax, ay, bx, by));
    if (!op) return false;
    if (op.type === 'arch') return true;
    if (op.door.locked) return false;
    return monster ? true : !op.door.blocking;
  }

  // 2D segment test against walls and closed doors (and optionally tall furniture).
  segmentBlocked(x0, z0, x1, z1, { furniture = true, ignoreDoors = false } = {}) {
    const dx = x1 - x0, dz = z1 - z0;
    const test = (b) => {
      let tmin = 0, tmax = 1;
      if (Math.abs(dx) < 1e-9) { if (x0 < b.minX || x0 > b.maxX) return false; }
      else {
        let t1 = (b.minX - x0) / dx, t2 = (b.maxX - x0) / dx;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        if (tmin > tmax) return false;
      }
      if (Math.abs(dz) < 1e-9) { if (z0 < b.minZ || z0 > b.maxZ) return false; }
      else {
        let t1 = (b.minZ - z0) / dz, t2 = (b.maxZ - z0) / dz;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        if (tmin > tmax) return false;
      }
      return true;
    };
    for (const b of this.wallBoxes) if (test(b)) return true;
    if (furniture) for (const b of this.losBlockers) if (test(b)) return true;
    if (!ignoreDoors) for (const d of this.doors) if (d.blocking && test(d.closedBox)) return true;
    return false;
  }

  // All collision boxes near a point (walls, furniture, closed doors)
  nearbyColliders(x, z, r = 2) {
    const out = [];
    const cx = Math.floor(x / CELL), cy = Math.floor(z / CELL);
    const rad = Math.ceil(r / CELL);
    const seen = new Set();
    for (let y = cy - rad; y <= cy + rad; y++) for (let xx = cx - rad; xx <= cx + rad; xx++) {
      const list = this.spatial.get(xx + ',' + y);
      if (list) for (const b of list) if (!seen.has(b)) { seen.add(b); out.push(b); }
    }
    for (const d of this.doors) if (d.blocking && Math.abs(d.center.x - x) < r + 1 && Math.abs(d.center.z - z) < r + 1) out.push(d.closedBox);
    return out;
  }

  addCollider(box, { los = false } = {}) {
    this.colliders.push(box);
    if (los) this.losBlockers.push(box);
    if (this.spatial) this._index(box);
  }
  _index(b) {
    for (let y = Math.floor(b.minZ / CELL); y <= Math.floor(b.maxZ / CELL); y++)
      for (let x = Math.floor(b.minX / CELL); x <= Math.floor(b.maxX / CELL); x++) {
        const k = x + ',' + y;
        if (!this.spatial.has(k)) this.spatial.set(k, []);
        this.spatial.get(k).push(b);
      }
  }

  batch(matId) {
    if (!this.batches.has(matId)) this.batches.set(matId, new Batch());
    return this.batches.get(matId);
  }

  // ---------- build ----------
  build() {
    this.wallBoxes = [];
    this.spatial = new Map();
    for (const [ax, ay, bx, by, type, opts] of OPENINGS) {
      const key = Level.edgeKey(ax, ay, bx, by);
      this.openings.set(key, { type, opts, ax, ay, bx, by });
    }

    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    // Floors and ceilings
    for (let cy = 0; cy < GH; cy++) for (let cx = 0; cx < GW; cx++) {
      const r = this.grid[cy][cx];
      if (r === '.') continue;
      const R = REGIONS[r];
      const x0 = cx * CELL, x1 = x0 + CELL, z0 = cy * CELL, z1 = z0 + CELL;
      const h = (x, z) => this.regionHeight(r, x, z);
      const fs = TEX_SIZE[R.floor], cs = TEX_SIZE[R.ceil];
      if (!R.stairs) {
        const pts = [V(x0, h(x0, z0), z0), V(x0, h(x0, z1), z1), V(x1, h(x1, z1), z1), V(x1, h(x1, z0), z0)];
        this.batch(R.floor).quad(pts, V(0, 1, 0), pts.map((p) => [p.x / fs, p.z / fs]));
      }
      const cpts = [V(x0, h(x0, z0) + WALL_H, z0), V(x1, h(x1, z0) + WALL_H, z0), V(x1, h(x1, z1) + WALL_H, z1), V(x0, h(x0, z1) + WALL_H, z1)];
      const cn = R.stairs ? V(0, -1, 0) : V(0, -1, 0);
      this.batch(R.ceil).quad(cpts, cn, cpts.map((p) => [p.x / cs, p.z / cs]));
    }

    // Stair treads
    {
      const steps = 12, x0 = 14 * CELL, x1 = x0 + CELL;
      const tread = (STAIR_Z1 - STAIR_Z0) / steps;
      for (let i = 0; i < steps; i++) {
        const za = STAIR_Z0 + i * tread, zb = za + tread;
        const top = this.regionHeight('x', 0, (za + zb) / 2) + 0.02;
        this.batch('dark_wood').box(V(x0, top - 0.32, za), V(x1, top, zb + 0.02), 1.2);
        // nosing
        this.batch('dark_wood').box(V(x0 + WALL_T / 2, top - 0.04, za - 0.03), V(x1 - WALL_T / 2, top + 0.005, za + 0.03), 1.2);
      }
    }

    // Walls on every edge between differing regions
    for (let cy = 0; cy <= GH; cy++) for (let cx = 0; cx <= GW; cx++) {
      // vertical edge at x = cx*CELL between (cx-1,cy) and (cx,cy)
      if (cy < GH) this._edge(cx - 1, cy, cx, cy);
      if (cx < GW) this._edge(cx, cy - 1, cx, cy);
    }

    // Cellar ceiling joists
    for (let cy = 20; cy < 28; cy++) for (let cx = 6; cx < 22; cx++) {
      const r = this.region(cx, cy);
      if (!REGIONS[r]?.cellar) continue;
      const x0 = cx * CELL, z = cy * CELL + CELL / 2;
      this.batch('dark_wood').box(V(x0, CELLAR_Y + WALL_H - 0.22, z - 0.08), V(x0 + CELL, CELLAR_Y + WALL_H, z + 0.08), 1.5);
    }

    // Cellar brick pillars
    for (const [px, pz] of [[13.5, 35.2], [19.5, 37.8]]) {
      const b = { minX: px - 0.3, maxX: px + 0.3, minZ: pz - 0.3, maxZ: pz + 0.3 };
      this.batch('dark_brick_wall').box(V(b.minX, CELLAR_Y, b.minZ), V(b.maxX, CELLAR_Y + WALL_H, b.maxZ), TEX_SIZE.dark_brick_wall);
      this.addCollider(b, { los: true });
    }

    // Materialise batches
    for (const [matId, b] of this.batches) {
      if (!b.pos.length) continue;
      const mesh = new THREE.Mesh(b.geometry(), this.assets.material(matId, matId === 'dirty_tiles' ? { normal: 0.8 } : {}));
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      mesh.name = 'level_' + matId;
      this.scene.add(mesh);
      this.meshes.push(mesh);
    }
    for (const b of this.wallBoxes) this._index(b);
    for (const b of this.colliders) this._index(b);
  }

  _edge(ax, ay, bx, by) {
    const ra = this.region(ax, ay), rb = this.region(bx, by);
    if (ra === rb) return;
    const vertical = ay === by;       // edge runs along Z
    const line = vertical ? bx * CELL : by * CELL;
    const s0 = vertical ? ay * CELL : ax * CELL;
    const s1 = s0 + CELL;
    const key = Level.edgeKey(ax, ay, bx, by);
    const op = this.openings.get(key);
    const ow = op ? (op.type === 'arch' ? ARCH_W : DOOR_W) : 0;
    const oh = op ? (op.type === 'arch' ? ARCH_H : DOOR_H) : 0;
    const sa = s0 + (CELL - ow) / 2, sb = s0 + (CELL + ow) / 2;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const P = (s, off, y) => (vertical ? V(line + off, y, s) : V(s, y, line + off));

    // Faces for each side that is a room
    const sides = [];
    if (ra !== '.') sides.push({ r: ra, off: -WALL_T / 2, n: vertical ? V(-1, 0, 0) : V(0, 0, -1) });
    if (rb !== '.') sides.push({ r: rb, off: WALL_T / 2, n: vertical ? V(1, 0, 0) : V(0, 0, 1) });

    for (const side of sides) {
      const R = REGIONS[side.r];
      const size = TEX_SIZE[R.wall];
      const batch = this.batch(R.wall);
      const right = new THREE.Vector3().crossVectors(side.n.clone().negate(), V(0, 1, 0));
      const hAt = (s) => {
        const p = P(s, side.off * 1.01, 0);
        return this.regionHeight(side.r, p.x, p.z);
      };
      // stair walls extend below the ramp so tread gaps never reveal the void
      const piece = (sA, sB, lo, hi) => {
        const ya = hAt(sA), yb = hAt(sB);
        const sink = R.stairs && lo === 0 ? 0.4 : 0;
        const pts = [P(sA, side.off, ya + lo - sink), P(sB, side.off, yb + lo - sink), P(sB, side.off, yb + hi), P(sA, side.off, ya + hi)];
        batch.quad(pts, side.n, pts.map((p) => [p.dot(right) / size, p.y / size]));
      };
      if (!op) piece(s0, s1, 0, WALL_H);
      else {
        piece(s0, sa, 0, WALL_H);
        piece(sb, s1, 0, WALL_H);
        piece(sa, sb, oh, WALL_H);
      }
      // baseboard + door casing (dark wood trim)
      if (!R.stairs) {
        const trim = this.batch('dark_wood');
        const bh = R.cellar ? 0 : 0.16;
        const y0 = this.regionHeight(side.r, P(s0, side.off * 1.01, 0).x, P(s0, side.off * 1.01, 0).z);
        const segs = op ? [[s0, sa], [sb, s1]] : [[s0, s1]];
        if (bh) for (const [u0, u1] of segs) {
          const a = P(u0, side.off, y0), b = P(u1, side.off + Math.sign(side.off) * 0.022, y0 + bh);
          trim.box(V(Math.min(a.x, b.x), y0, Math.min(a.z, b.z)), V(Math.max(a.x, b.x), y0 + bh, Math.max(a.z, b.z)), 1.2);
        }
        if (op) {
          const d = Math.sign(side.off) * 0.025, cw = 0.075;
          const box = (u0, u1, yy0, yy1) => {
            const a = P(u0, side.off, yy0), b = P(u1, side.off + d, yy1);
            trim.box(V(Math.min(a.x, b.x), yy0, Math.min(a.z, b.z)), V(Math.max(a.x, b.x), yy1, Math.max(a.z, b.z)), 1.2);
          };
          box(sa - cw, sa, y0, y0 + oh + cw);
          box(sb, sb + cw, y0, y0 + oh + cw);
          box(sa - cw, sb + cw, y0 + oh, y0 + oh + cw);
        }
      }
    }

    // Opening jambs (inside the wall thickness)
    if (op) {
      const trim = this.batch('dark_wood');
      const yA = ra !== '.' ? this.regionHeight(ra, P(sa, -0.01, 0).x, P(sa, -0.01, 0).z) : this.regionHeight(rb, P(sa, 0.01, 0).x, P(sa, 0.01, 0).z);
      const jamb = (s0j, s1j, yy0, yy1) => {
        const a = P(s0j, -WALL_T / 2, yy0), b = P(s1j, WALL_T / 2, yy1);
        trim.box(V(Math.min(a.x, b.x), yy0, Math.min(a.z, b.z)), V(Math.max(a.x, b.x), yy1, Math.max(a.z, b.z)), 1.2);
      };
      jamb(sa - 0.02, sa, yA, yA + oh);
      jamb(sb, sb + 0.02, yA, yA + oh);
      jamb(sa, sb, yA + oh, yA + oh + 0.02);
      // threshold
      jamb(sa, sb, yA, yA + 0.012);
      if (op.type === 'door') {
        // doors swing into rooms, never into corridors or the stairwell
        const narrow = (r) => r === 'h' || r === 'x' || r === '.';
        const swingInto = narrow(ra) && !narrow(rb) ? 1 : narrow(rb) && !narrow(ra) ? -1 : (op.opts.swing ?? 0);
        const door = new Door(this, { axis: vertical ? 'V' : 'H', line, s0 }, { ...op.opts, floorY: yA, swingInto });
        op.door = door;
        this.doors.push(door);
      }
    }

    // Collision boxes for the wall (excluding the opening)
    const mk = (u0, u1) => {
      if (u1 - u0 < 1e-3) return;
      const e = WALL_T / 2;
      this.wallBoxes.push(vertical
        ? { minX: line - e, maxX: line + e, minZ: u0, maxZ: u1 }
        : { minX: u0, maxX: u1, minZ: line - e, maxZ: line + e });
    };
    if (!op) mk(s0 - WALL_T / 2, s1 + WALL_T / 2);
    else { mk(s0 - WALL_T / 2, sa); mk(sb, s1 + WALL_T / 2); }
  }

  doorById(id) { return this.doors.find((d) => d.id === id); }

  update(dt) { for (const d of this.doors) d.update(dt); }
}
