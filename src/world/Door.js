import * as THREE from 'three';

export const DOOR_W = 1.0;
export const DOOR_H = 2.12;

const brass = new THREE.MeshStandardMaterial({ color: 0x9a7b4f, metalness: 1, roughness: 0.38 });
const iron = new THREE.MeshStandardMaterial({ color: 0x2b2622, metalness: 0.9, roughness: 0.62 });

// A hinged door on a grid edge. Edge: { axis:'H'|'V', line, s0 } where the opening is centred in [s0, s0+CELL].
export class Door {
  constructor(level, edge, opts) {
    this.level = level;
    this.edge = edge;
    this.kind = opts.kind || 'door';     // door | gate | front
    this.id = opts.id;
    this.locked = opts.locked || null;   // null | 'cellar_key' | 'combo' | 'chain'
    this.angle = 0;
    this.target = 0;
    this.speed = 2.2;
    this.sign = 1;
    this.hinge = opts.hinge ?? 0;        // 0 = hinge at low-s end, 1 = high-s end
    this.slamTimer = 0;
    this.swingInto = opts.swingInto || 0; // +1: swings to the positive-coordinate side

    const cell = level.CELL;
    const sMid = edge.s0 + cell / 2;
    this.sHinge = this.hinge === 0 ? sMid - DOOR_W / 2 : sMid + DOOR_W / 2;
    this.floorY = opts.floorY ?? 0;

    this.pivot = new THREE.Group();
    if (edge.axis === 'H') this.pivot.position.set(this.sHinge, this.floorY, edge.line);
    else this.pivot.position.set(edge.line, this.floorY, this.sHinge);
    // local +X runs from hinge towards latch
    const dirSign = this.hinge === 0 ? 1 : -1;
    this.base = edge.axis === 'H' ? (dirSign > 0 ? 0 : Math.PI) : (dirSign > 0 ? -Math.PI / 2 : Math.PI / 2);
    this.pivot.rotation.y = this.base;

    this.panel = this._buildPanel(level.assets);
    this.pivot.add(this.panel);
    this.panel.traverse((o) => { if (o.isMesh) { o.userData.door = this; o.castShadow = true; o.receiveShadow = true; } });
    level.scene.add(this.pivot);

    // Centre point (for AI / audio)
    this.center = edge.axis === 'H' ? new THREE.Vector3(sMid, this.floorY + 1.1, edge.line) : new THREE.Vector3(edge.line, this.floorY + 1.1, sMid);
    const half = 0.05;
    this.closedBox = edge.axis === 'H'
      ? { minX: sMid - DOOR_W / 2, maxX: sMid + DOOR_W / 2, minZ: edge.line - half, maxZ: edge.line + half, door: this }
      : { minX: edge.line - half, maxX: edge.line + half, minZ: sMid - DOOR_W / 2, maxZ: sMid + DOOR_W / 2, door: this };
  }

  _buildPanel(assets) {
    const g = new THREE.Group();
    const w = DOOR_W - 0.02, h = DOOR_H - 0.01;
    if (this.kind === 'gate') {
      const mat = assets.material('rusty_metal_02', { metal: 1, env: 0.8 });
      const bar = new THREE.CylinderGeometry(0.014, 0.014, h, 8);
      for (let i = 0; i < 9; i++) {
        const m = new THREE.Mesh(bar, mat);
        m.position.set(0.05 + (i * (w - 0.1)) / 8, h / 2, 0);
        g.add(m);
      }
      const rail = new THREE.BoxGeometry(w, 0.05, 0.035);
      [0.08, h * 0.5, h - 0.06].forEach((y) => { const m = new THREE.Mesh(rail, mat); m.position.set(w / 2, y, 0); g.add(m); });
      const side = new THREE.BoxGeometry(0.05, h, 0.04);
      [0.025, w - 0.025].forEach((x) => { const m = new THREE.Mesh(side, mat); m.position.set(x, h / 2, 0); g.add(m); });
      return g;
    }
    const mat = assets.material('dark_wood', { normal: 1.4 });
    const panelGeo = new THREE.BoxGeometry(w, h, 0.05);
    // world-scale UVs for the box (u along width, v along height)
    const uv = panelGeo.attributes.uv;
    const pos = panelGeo.attributes.position;
    for (let i = 0; i < uv.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const nAxis = Math.abs(panelGeo.attributes.normal.getZ(i)) > 0.5 ? 'z' : Math.abs(panelGeo.attributes.normal.getX(i)) > 0.5 ? 'x' : 'y';
      if (nAxis === 'z') uv.setXY(i, (x + 3.1) / 2, y / 2 + 0.3);
      else if (nAxis === 'x') uv.setXY(i, z / 2, y / 2);
      else uv.setXY(i, x / 2, z / 2);
    }
    const panel = new THREE.Mesh(panelGeo, mat);
    panel.position.set(w / 2, h / 2, 0);
    g.add(panel);
    // raised moulding panels
    const moul = new THREE.BoxGeometry(w * 0.34, h * 0.36, 0.014);
    for (const sx of [0.27, 0.73]) for (const sy of [0.28, 0.72]) for (const sz of [1, -1]) {
      const m = new THREE.Mesh(moul, mat);
      m.position.set(w * sx, h * sy, sz * 0.03);
      g.add(m);
    }
    // knobs + escutcheons
    const knob = new THREE.SphereGeometry(0.032, 16, 12);
    const plate = new THREE.BoxGeometry(0.05, 0.16, 0.008);
    for (const sz of [1, -1]) {
      const k = new THREE.Mesh(knob, brass); k.position.set(w - 0.08, 1.0, sz * 0.075); g.add(k);
      const p = new THREE.Mesh(plate, brass); p.position.set(w - 0.08, 0.98, sz * 0.03); g.add(p);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.05), brass); neck.rotation.x = Math.PI / 2; neck.position.set(w - 0.08, 1.0, sz * 0.05); g.add(neck);
    }
    // hinges
    const hingeG = new THREE.BoxGeometry(0.03, 0.11, 0.06);
    [0.25, h - 0.25].forEach((y) => { const m = new THREE.Mesh(hingeG, iron); m.position.set(0.0, y, 0); g.add(m); });

    if (this.kind === 'front') this._buildChain(g, w);
    return g;
  }

  _buildChain(g, w) {
    this.chain = new THREE.Group();
    const link = new THREE.TorusGeometry(0.035, 0.009, 8, 16);
    const chainMat = new THREE.MeshStandardMaterial({ color: 0x5a544c, metalness: 1, roughness: 0.45 });
    // diagonal X of chain across the door face (player side is -Z local)
    const runs = [[[0.08, 0.6], [w - 0.06, 1.55]], [[0.08, 1.55], [w - 0.06, 0.6]]];
    for (const [a, b] of runs) {
      const n = 22;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * 0.06;
        const m = new THREE.Mesh(link, chainMat);
        m.position.set(x, y, -0.07);
        m.rotation.z = Math.atan2(b[1] - a[1], b[0] - a[0]);
        m.rotation.x = i % 2 ? Math.PI / 2 : 0;
        this.chain.add(m);
      }
    }
    // padlock
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.035), brass);
    lock.position.set(w / 2 + 0.02, 1.0, -0.1);
    const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.008, 8, 16, Math.PI), chainMat);
    shackle.position.set(w / 2 + 0.02, 1.05, -0.1);
    this.chain.add(lock, shackle);
    // wall staples
    g.add(this.chain);
  }

  get isOpen() { return Math.abs(this.angle) > 0.35; }
  get blocking() { return Math.abs(this.angle) < 0.5; }

  // which side of the edge is a world point on (+1 positive coordinate side)
  sideOf(p) { return this.edge.axis === 'H' ? Math.sign(p.z - this.edge.line) || 1 : Math.sign(p.x - this.edge.line) || 1; }

  open(from, { fast = false, byMonster = false } = {}) {
    // positive rotation swings into the -Z (H) / +X (V) side; mirror for a hinge on the far end
    const side = this.swingInto ? -this.swingInto : this.sideOf(from);
    let s;
    if (this.edge.axis === 'H') s = side > 0 ? 1 : -1; else s = side < 0 ? 1 : -1;
    if (this.hinge === 1) s = -s;
    this.sign = s;
    this.target = 1.75;
    this.speed = fast ? 9 : 2.0;
    const a = this.level.audio;
    if (a) {
      if (fast) { a.play('impactWood_heavy_00' + Math.floor(Math.random() * 3), { pos: this.center, volume: 1.3, rate: 0.75 }); a.play('doorOpen_2', { pos: this.center, volume: 0.9, rate: 0.7 }); }
      else if (this.kind === 'gate') { a.play('metalLatch', { pos: this.center, volume: 0.8 }); a.creak({ pos: this.center, volume: 0.35, dur: 1.6, base: 140 }); }
      else { a.play(Math.random() < 0.5 ? 'doorOpen_1' : 'doorOpen_2', { pos: this.center, volume: 0.8 }); if (Math.random() < 0.6) a.creak({ pos: this.center, volume: 0.28, dur: 1.4 }); }
    }
    if (!byMonster) this.level.onNoise?.(this.center, fast ? 14 : 6);
  }

  close({ slam = false } = {}) {
    this.target = 0;
    this.speed = slam ? 10 : 2.4;
    this._closing = slam ? 'slam' : 'soft';
  }

  toggle(from) { if (this.target > 0.1) this.close(); else this.open(from); }

  update(dt) {
    const tgt = this.target * this.sign;
    const prev = this.angle;
    const d = tgt - this.angle;
    const step = this.speed * dt;
    this.angle += Math.abs(d) < step ? d : Math.sign(d) * step;
    this.pivot.rotation.y = this.base + this.angle;
    if (this._closing && Math.abs(this.angle) < 0.01 && Math.abs(prev) >= 0.01) {
      const a = this.level.audio;
      if (a) a.play(this._closing === 'slam' ? 'doorClose_4' : 'doorClose_1', { pos: this.center, volume: this._closing === 'slam' ? 1.4 : 0.6 });
      if (this._closing === 'slam') this.level.onNoise?.(this.center, 10);
      this._closing = null;
    }
  }

  // Locked rattle
  rattle() {
    const a = this.level.audio;
    if (!a) return;
    if (this.kind === 'front') { a.play('metalLatch', { pos: this.center, volume: 0.9 }); a.play('impactMetal_light_001', { pos: this.center, volume: 0.6, delay: 0.12 }); }
    else if (this.kind === 'gate') a.play('impactMetal_heavy_000', { pos: this.center, volume: 0.6, rate: 1.3 });
    else { a.play('doorClose_3', { pos: this.center, volume: 0.5, rate: 1.3 }); a.play('metalClick', { pos: this.center, volume: 0.6, delay: 0.1 }); }
  }
}
