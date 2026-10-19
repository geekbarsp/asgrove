import * as THREE from 'three';

// Crosshair raycast against interactable objects, occluded by level geometry.
export class Interaction {
  constructor(camera, level) {
    this.camera = camera;
    this.level = level;
    this.items = [];
    this.ray = new THREE.Raycaster();
    this.ray.far = 3;
    this.current = null;
    this.lastHitDist = 6;
  }

  add(object, def) {
    const item = { object, range: 2.0, ...def };
    object.traverse((o) => { if (o.isMesh || o.isSprite) o.userData.interact = item; });
    this.items.push(item);
    return item;
  }

  update() {
    this.ray.setFromCamera({ x: 0, y: 0 }, this.camera);
    this.ray.far = 2.6;
    const targets = [...this.level.meshes];
    for (const it of this.items) if (it.object.visible !== false) targets.push(it.object);
    const hits = this.ray.intersectObjects(targets, true);
    this.current = null;
    for (const h of hits) {
      if (!h.object.visible) continue;
      const it = h.object.userData.interact;
      if (!it) break; // blocked by level geometry
      if (h.distance > it.range) break;
      const p = it.prompt?.();
      if (!p) continue;
      this.current = { item: it, prompt: p, distance: h.distance };
      break;
    }
    return this.current;
  }

  // distance to whatever the flashlight centre hits (for bounce light)
  probe(origin, dir) {
    this.ray.set(origin, dir);
    this.ray.far = 14;
    const h = this.ray.intersectObjects(this.level.meshes, false)[0];
    this.lastHitDist = h ? h.distance : 14;
    return this.lastHitDist;
  }
}
