import * as THREE from 'three';
import { GW, GH, CELL } from '../world/Level.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export class NavGrid {
  constructor(level) {
    this.level = level;
    this.blocked = new Uint8Array(GW * GH);
  }

  // Cells whose centre is covered by furniture are avoided (but still traversable at high cost).
  bake() {
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      const cx = (x + 0.5) * CELL, cz = (y + 0.5) * CELL;
      let b = 0;
      for (const c of this.level.colliders) if (cx > c.minX - 0.2 && cx < c.maxX + 0.2 && cz > c.minZ - 0.2 && cz < c.maxZ + 0.2) { b = 1; break; }
      this.blocked[y * GW + x] = b;
    }
  }

  cellOf(p) { return [THREE.MathUtils.clamp(Math.floor(p.x / CELL), 0, GW - 1), THREE.MathUtils.clamp(Math.floor(p.z / CELL), 0, GH - 1)]; }

  reachable(from) {
    const [sx, sy] = this.cellOf(from);
    const seen = new Set([sy * GW + sx]);
    const q = [[sx, sy]];
    while (q.length) {
      const [x, y] = q.shift();
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy, k = ny * GW + nx;
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH || seen.has(k)) continue;
        if (!this.level.passable(x, y, nx, ny, { monster: true })) continue;
        seen.add(k); q.push([nx, ny]);
      }
    }
    return [...seen].filter((k) => !this.blocked[k]).map((k) => [k % GW, Math.floor(k / GW)]);
  }

  // A* returning world-space waypoints (smoothed)
  find(from, to) {
    const [sx, sy] = this.cellOf(from);
    const [tx, ty] = this.cellOf(to);
    const start = sy * GW + sx, goal = ty * GW + tx;
    const g = new Map([[start, 0]]);
    const came = new Map();
    const open = [[Math.abs(tx - sx) + Math.abs(ty - sy), start]];
    const closed = new Set();
    let found = start === goal;
    while (open.length && !found) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
      const [, cur] = open.splice(bi, 1)[0];
      if (cur === goal) { found = true; break; }
      if (closed.has(cur)) continue;
      closed.add(cur);
      const x = cur % GW, y = Math.floor(cur / GW);
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        if (!this.level.passable(x, y, nx, ny, { monster: true })) continue;
        const nk = ny * GW + nx;
        const cost = g.get(cur) + 1 + (this.blocked[nk] && nk !== goal ? 6 : 0);
        if (cost < (g.get(nk) ?? Infinity)) {
          g.set(nk, cost); came.set(nk, cur);
          open.push([cost + Math.abs(tx - nx) + Math.abs(ty - ny), nk]);
        }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let k = goal; k !== undefined; k = came.get(k)) { cells.push(k); if (k === start) break; }
    cells.reverse();
    // waypoints: cell centres, plus door/opening midpoints between region changes
    const pts = [];
    for (let i = 0; i < cells.length; i++) {
      const k = cells[i], x = k % GW, y = Math.floor(k / GW);
      if (i > 0) {
        const pk = cells[i - 1], px = pk % GW, py = Math.floor(pk / GW);
        if (this.level.region(px, py) !== this.level.region(x, y)) {
          // opening midpoint
          const mx = ((px + x) / 2 + 0.5) * CELL, mz = ((py + y) / 2 + 0.5) * CELL;
          pts.push(new THREE.Vector3(mx, 0, mz).setY(this.level.heightAt(mx, mz)));
          pts[pts.length - 1].isPortal = true;
        }
      }
      pts.push(this.level.cellCenter(x, y));
    }
    pts.push(to.clone());
    return this.smooth(from, pts);
  }

  clear(a, b) {
    const d = new THREE.Vector2(b.x - a.x, b.z - a.z);
    const len = d.length();
    if (len < 1e-3) return true;
    const n = new THREE.Vector2(-d.y / len, d.x / len).multiplyScalar(0.33);
    for (const s of [-1, 0, 1]) {
      if (this.level.segmentBlocked(a.x + n.x * s, a.z + n.y * s, b.x + n.x * s, b.z + n.y * s, { furniture: true, ignoreDoors: true })) return false;
    }
    return true;
  }

  smooth(from, pts) {
    const out = [];
    let anchor = from;
    let i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      // furthest visible point (never skip portals - doors must be walked through)
      let next = i;
      for (j = i; j < pts.length; j++) {
        if (!this.clear(anchor, pts[j])) break;
        next = j;
        if (pts[j].isPortal && j > i) break;
      }
      out.push(pts[next]);
      anchor = pts[next];
      i = next + 1;
    }
    return out;
  }
}
