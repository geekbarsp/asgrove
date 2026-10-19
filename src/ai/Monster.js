import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { NavGrid } from './NavGrid.js';

const PHASES = {
  1: { walk: 1.15, run: 3.75, sight: 20, hear: 1.0 },
  2: { walk: 1.35, run: 4.0, sight: 22, hear: 1.15 },
  3: { walk: 1.7, run: 4.3, sight: 26, hear: 1.4 },
};
const RADIUS = 0.3;

export class Monster {
  constructor(scene, assets, level, audio) {
    this.scene = scene; this.level = level; this.audio = audio;
    this.nav = new NavGrid(level);
    this.active = false;
    this.phase = 1;
    this.state = 'idle';
    this.pos = new THREE.Vector3();
    this.heading = 0;
    this.path = null;
    this.pathIdx = 0;
    this.repath = 0;
    this.alert = 0;
    this.lostTimer = 0;
    this.stateTime = 0;
    this.lastSeen = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.speed = 0;
    this.canSee = false;
    this.sawHide = false;
    this.player = null;
    this.onKill = null;
    this.onSpot = null;
    this.twitch = 0;
    this.stepPhase = 0;
    this.lastStep = 0;
    this.huntTimer = 0;

    this._buildModel(assets);
  }

  _buildModel(assets) {
    const { bot, head, headCol, headNor } = assets.creature;
    this.root = new THREE.Group();
    const body = SkeletonUtils.clone(bot.scene);
    body.scale.set(1.12, 1.24, 1.12);
    this.body = body;

    const skin = new THREE.MeshPhysicalMaterial({
      color: 0x8a7f78, roughness: 0.6, metalness: 0, sheen: 0.35, sheenColor: new THREE.Color(0x5b2b25), sheenRoughness: 0.6,
      clearcoat: 0.12, clearcoatRoughness: 0.5,
    });
    const plaster = assets.textureSet('worn_plaster_wall');
    const grime = plaster.map.clone(); grime.repeat.set(2, 2); grime.needsUpdate = true;
    skin.map = grime;
    const nmap = plaster.normalMap.clone(); nmap.repeat.set(3, 3); nmap.needsUpdate = true;
    skin.normalMap = nmap; skin.normalScale.set(1.6, 1.6);
    const rough = plaster.arm.clone(); rough.repeat.set(3, 3); rough.needsUpdate = true;
    skin.roughnessMap = rough;
    const joints = new THREE.MeshStandardMaterial({ color: 0x2a1f1c, roughness: 0.75 });
    body.traverse((o) => {
      if (o.isSkinnedMesh) {
        o.material = o.name.includes('Joints') ? joints : skin;
        o.castShadow = true; o.receiveShadow = true;
        o.frustumCulled = false;
      }
    });
    this.root.add(body);

    this.bones = {};
    body.traverse((o) => { if (o.isBone) this.bones[o.name.replace('mixamorig', '').replace(':', '')] = o; });

    // Real scanned face (a bust: cut away below the neck in-shader), bloodless, with hollow black eye sockets.
    // Scan-space landmarks: chin y≈-0.7, eyes y≈1.72 x≈±0.68, crown y≈3.97, shoulders below y≈-1.6.
    const headMesh = head.getObjectByProperty('isMesh', true).clone();
    const hm = new THREE.MeshStandardMaterial({ map: headCol, normalMap: headNor, roughness: 0.6, color: 0xb8aea6, side: THREE.DoubleSide });
    hm.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          if (vObj.y < -1.45) discard;`)
        .replace('#include <map_fragment>', `#include <map_fragment>
          float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          diffuseColor.rgb = mix(vec3(lum) * vec3(1.0, 0.95, 0.92), diffuseColor.rgb, 0.22) * 0.85;
          // hollow eyes + bruised sockets
          vec2 e1 = (vObj.xy - vec2(0.68, 1.72)) / vec2(0.5, 0.36);
          vec2 e2 = (vObj.xy - vec2(-0.68, 1.72)) / vec2(0.5, 0.36);
          float eye = max(1.0 - smoothstep(0.55, 1.0, length(e1)), 1.0 - smoothstep(0.55, 1.0, length(e2))) * step(1.2, vObj.z);
          float bruise = max(1.0 - smoothstep(0.6, 1.9, length(e1)), 1.0 - smoothstep(0.6, 1.9, length(e2)));
          diffuseColor.rgb *= mix(1.0, 0.45, bruise);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.004, 0.002, 0.002), eye);
          // mouth darkened, lips grey
          vec2 mo = (vObj.xy - vec2(0.0, 0.1)) / vec2(0.7, 0.16);
          diffuseColor.rgb *= mix(1.0, 0.35, (1.0 - smoothstep(0.4, 1.0, length(mo))) * step(1.6, vObj.z));
          // neck stump fades into the creature's dark neck
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03, 0.022, 0.02), 1.0 - smoothstep(-1.4, -0.75, vObj.y));`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          vec2 r1 = (vObj.xy - vec2(0.68, 1.72)) / vec2(0.5, 0.36);
          vec2 r2 = (vObj.xy - vec2(-0.68, 1.72)) / vec2(0.5, 0.36);
          roughnessFactor = mix(roughnessFactor, 0.12, max(1.0 - smoothstep(0.5, 0.9, length(r1)), 1.0 - smoothstep(0.5, 0.9, length(r2))));`);
    };
    headMesh.material = hm;
    headMesh.castShadow = true;
    const hs = 0.25 / 4.7; // chin-to-crown ≈ 25cm
    this.headPivot = new THREE.Group();
    headMesh.scale.setScalar(hs);
    headMesh.position.set(0, 1.45 * hs - 0.02, 0.3 * hs);
    this.headPivot.add(headMesh);
    this.headMesh = headMesh;
    this.root.add(this.headPivot);

    // animation
    this.mixer = new THREE.AnimationMixer(body);
    this.actions = {};
    for (const clip of assets.creature.bot.animations) {
      if (!['idle', 'walk', 'run'].includes(clip.name)) continue;
      // strip root motion on hips position x/z so the AI controls locomotion
      clip.tracks = clip.tracks.filter((t) => !t.name.endsWith('.scale'));
      const a = this.mixer.clipAction(clip);
      a.play(); a.setEffectiveWeight(0);
      this.actions[clip.name] = a;
    }
    this.actions.idle.setEffectiveWeight(1);
    this.weights = { idle: 1, walk: 0, run: 0 };

    this.root.visible = false;
    this.scene.add(this.root);

    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
  }

  spawn(pos, phase = 1) {
    this.nav.bake();
    this.active = true;
    this.phase = phase;
    this.pos.copy(pos);
    this.pos.y = this.level.heightAt(pos.x, pos.z);
    this.root.visible = true;
    this.setState('patrol');
    this.alert = 0;
    if (!this.growl) this.growl = this.audio.loop('growl', this.pos, 0.6);
  }

  despawn() {
    this.active = false;
    this.root.visible = false;
    this.growl?.stop(); this.growl = null;
    this.state = 'idle';
  }

  // Static apparition (scripted scares), no AI
  showAt(pos, yaw) {
    this.root.visible = true;
    this.pos.copy(pos);
    this.heading = yaw;
    this._pose(0.016, 0);
  }

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.stateTime = 0;
    this.path = null;
    this.repath = 0;
  }

  setPhase(p) { this.phase = p; }

  hearNoise(p, radius) {
    if (!this.active || this.state === 'chase' || this.state === 'kill') return;
    const d = p.distanceTo(this.pos);
    const occluded = this.level.segmentBlocked(this.pos.x, this.pos.z, p.x, p.z, { furniture: false });
    const reach = radius * PHASES[this.phase].hear * (occluded ? 0.6 : 1);
    if (d < reach) {
      this.target.copy(p);
      this.setState('investigate');
      this.path = null;
    }
  }

  _goTo(target, dt, speed) {
    this.repath -= dt;
    if (!this.path || this.repath <= 0) {
      this.path = this.nav.find(this.pos, target);
      this.pathIdx = 0;
      this.repath = this.state === 'chase' ? 0.35 : 2.5;
      if (!this.path) return true;
    }
    const wp = this.path[this.pathIdx];
    if (!wp) return true;
    const d = new THREE.Vector3(wp.x - this.pos.x, 0, wp.z - this.pos.z);
    const dist = d.length();
    if (dist < 0.35) {
      this.pathIdx++;
      return this.pathIdx >= this.path.length;
    }
    d.divideScalar(dist);
    // open doors in the way
    for (const door of this.level.doors) {
      if (!door.blocking || door.locked) continue;
      const dd = door.center.distanceTo(new THREE.Vector3(this.pos.x, door.center.y, this.pos.z));
      if (dd < 1.25) {
        const toDoor = new THREE.Vector3(door.center.x - this.pos.x, 0, door.center.z - this.pos.z).normalize();
        if (toDoor.dot(d) > 0.3) door.open(this.pos, { fast: this.state === 'chase' || this.phase === 3 || Math.random() < 0.3, byMonster: true });
      }
    }
    const want = Math.atan2(d.x, d.z);
    let dh = want - this.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    this.heading += dh * Math.min(1, dt * (this.state === 'chase' ? 9 : 4));
    const turnSlow = Math.max(0.25, 1 - Math.abs(dh) / 1.6);
    this.speed += (speed * turnSlow - this.speed) * Math.min(1, dt * 4);
    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt;
    this._collide();
    return false;
  }

  _collide() {
    for (const b of this.level.nearbyColliders(this.pos.x, this.pos.z, 1.2)) {
      if (b.door) continue;
      const cx = THREE.MathUtils.clamp(this.pos.x, b.minX, b.maxX), cz = THREE.MathUtils.clamp(this.pos.z, b.minZ, b.maxZ);
      const dx = this.pos.x - cx, dz = this.pos.z - cz, d2 = dx * dx + dz * dz;
      if (d2 < RADIUS * RADIUS && d2 > 1e-8) { const d = Math.sqrt(d2); this.pos.x += dx / d * (RADIUS - d); this.pos.z += dz / d * (RADIUS - d); }
    }
  }

  _perceive(dt, player, flashlight) {
    const eye = this.pos.clone(); eye.y += 2.0;
    const pp = player.camera.position;
    const to = new THREE.Vector3().subVectors(pp, eye);
    const dist = to.length();
    const flat = new THREE.Vector2(to.x, to.z).normalize();
    const facing = new THREE.Vector2(Math.sin(this.heading), Math.cos(this.heading));
    const ang = Math.acos(THREE.MathUtils.clamp(flat.dot(facing), -1, 1));
    const P = PHASES[this.phase];
    const lit = flashlight.on && flashlight.cur > 0.3;
    let range = lit ? P.sight : P.sight * 0.45;
    if (player.crouching) range *= 0.7;
    // light shining toward the monster is very noticeable
    const beamAtMe = lit && flashlight.dir.dot(to.clone().normalize().negate()) > 0.9;
    if (beamAtMe) range *= 1.3;
    const fov = this.state === 'chase' ? 2.2 : 1.15;
    let see = false;
    if (!player.hidden && dist < range && (ang < fov || dist < 2.2)) {
      see = !this.level.segmentBlocked(eye.x, eye.z, pp.x, pp.z, { furniture: true });
      if (Math.abs(player.pos.y - this.pos.y) > 1.8) see = see && dist < 6; // different floors (stairs)
    }
    // light leaking out of a wardrobe gives the hiding place away
    if (player.hidden && lit && dist < 9 && (ang < fov || dist < 3)) {
      const hp = player.hidden.exitPos;
      if (!this.level.segmentBlocked(eye.x, eye.z, hp.x, hp.z, { furniture: false })) {
        this.alert = Math.min(1.2, this.alert + dt * 1.5);
        if (this.alert >= 1) this.sawHide = true;
      }
    }
    this.canSee = see;
    if (see) {
      const gain = (1.4 + (1 - dist / range) * 4) * (beamAtMe ? 1.6 : 1) * (player.speed > 3 ? 1.4 : 1);
      this.alert = Math.min(1.2, this.alert + gain * dt);
      this.lastSeen.copy(player.pos);
    } else this.alert = Math.max(0, this.alert - dt * 0.15);
    return { dist, see };
  }

  update(dt, t, player, flashlight) {
    if (!this.active) return;
    this.stateTime += dt;
    const P = PHASES[this.phase];
    const { dist, see } = this._perceive(dt, player, flashlight);

    // transitions into chase
    if (this.state !== 'chase' && this.state !== 'kill' && this.alert >= 1) {
      this.setState('chase');
      this.audio.screech({ pos: this.pos.clone().setY(this.pos.y + 2), volume: 0.9 });
      this.onSpot?.();
    }

    let moveSpeed = 0;
    switch (this.state) {
      case 'patrol': {
        if (!this.patrolTarget || this.stateTime > 40) this._pickPatrol(player);
        if (this.waitT > 0) { this.waitT -= dt; break; }
        if (this.alert > 0.35 && see) { this.target.copy(player.pos); this.setState('investigate'); break; }
        if (this._goTo(this.patrolTarget, dt, P.walk)) { this.waitT = 2 + Math.random() * 4; this.patrolTarget = null; this.stateTime = 0; }
        moveSpeed = P.walk;
        break;
      }
      case 'investigate': {
        if (see && this.alert > 0.35) this.target.copy(player.pos);
        const done = this._goTo(this.target, dt, P.walk * 1.5);
        moveSpeed = P.walk * 1.5;
        if (done || this.stateTime > 25) { this.setState('search'); this.searchLeft = 4 + Math.random() * 3; this.searchPts = 3; }
        break;
      }
      case 'search': {
        // look around, then check a few nearby spots
        if (this.searchLeft > 0) { this.searchLeft -= dt; this.heading += Math.sin(t * 1.3) * dt * 1.2; this.speed *= 0.9; break; }
        if (!this.searchTarget) {
          const near = this.nav.reachable(this.pos).filter(([x, y]) => { const c = this.level.cellCenter(x, y); return c.distanceTo(this.pos) < 7; });
          const pick = near[Math.floor(Math.random() * near.length)];
          this.searchTarget = pick ? this.level.cellCenter(pick[0], pick[1]) : this.pos.clone();
          this.path = null;
        }
        moveSpeed = P.walk * 1.2;
        if (this._goTo(this.searchTarget, dt, moveSpeed)) {
          this.searchTarget = null; this.searchLeft = 2 + Math.random() * 2;
          if (--this.searchPts <= 0) this.setState('patrol');
        }
        break;
      }
      case 'chase': {
        if (player.hidden) {
          if (this.sawHide) { this.target.copy(player.hidden.exitPos); }
          else { this.lostTimer += dt * 2; }
        } else if (see) { this.lostTimer = 0; this.target.copy(player.pos); }
        else this.lostTimer += dt;
        if (this.lostTimer > 4.5) {
          this.target.copy(this.lastSeen);
          this.setState('investigate');
          this.alert = 0.5;
          break;
        }
        const tgt = see || this.sawHide ? this.target : this.lastSeen;
        this._goTo(tgt, dt, P.run);
        moveSpeed = P.run;
        const reach = player.hidden && this.sawHide ? player.hidden.exitPos.distanceTo(new THREE.Vector3(this.pos.x, player.hidden.exitPos.y, this.pos.z)) < 0.9 : dist < 1.35 && !player.hidden;
        if (reach) { this.setState('kill'); this.onKill?.(); }
        break;
      }
      case 'kill': moveSpeed = 0; this.speed = 0; break;
      case 'hunt': break;
    }

    // phase 3: it always drifts toward the player's rough position
    if (this.phase === 3 && (this.state === 'patrol' || this.state === 'search')) {
      this.huntTimer -= dt;
      if (this.huntTimer <= 0) {
        this.huntTimer = 9;
        this.target.copy(player.pos).add(new THREE.Vector3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6));
        this.setState('investigate');
      }
    }

    if (moveSpeed === 0) this.speed *= Math.max(0, 1 - dt * 6);
    this.pos.y += (this.level.heightAt(this.pos.x, this.pos.z) - this.pos.y) * Math.min(1, dt * 10);
    this._pose(dt, t);
    this._sound(dt, player);
  }

  _pickPatrol(player) {
    const cells = this.nav.reachable(this.pos);
    if (!cells.length) { this.patrolTarget = this.pos.clone(); return; }
    // director bias: half of the time, patrol somewhere near the player
    let pool = cells;
    if (Math.random() < (this.phase >= 2 ? 0.6 : 0.45)) {
      const near = cells.filter(([x, y]) => this.level.cellCenter(x, y).distanceTo(player.pos) < 13);
      if (near.length) pool = near;
    }
    const [x, y] = pool[Math.floor(Math.random() * pool.length)];
    this.patrolTarget = this.level.cellCenter(x, y);
    this.path = null;
    this.waitT = 0;
  }

  _pose(dt, t) {
    // blend locomotion animations by speed
    const s = this.speed;
    const want = s < 0.15 ? 'idle' : s < 2.4 ? 'walk' : 'run';
    for (const k of ['idle', 'walk', 'run']) {
      this.weights[k] += ((k === want ? 1 : 0) - this.weights[k]) * Math.min(1, dt * 6);
      this.actions[k].setEffectiveWeight(this.weights[k]);
    }
    this.actions.walk.timeScale = Math.max(0.4, s / 1.55);
    this.actions.run.timeScale = Math.max(0.6, s / 4.6);
    this.actions.idle.timeScale = 0.6;
    this.mixer.update(dt);

    // keep hips in place (AI drives position)
    const hips = this.bones.Hips;
    if (hips) { hips.position.x = 0; hips.position.z = 0; }

    // procedural wrongness: elongated limbs, hunched spine, tilted twitching head
    const B = this.bones;
    const q = this._q, e = this._e;
    const rot = (b, x, y, z) => { if (!b) return; e.set(x, y, z); q.setFromEuler(e); b.quaternion.multiply(q); };
    for (const n of ['LeftForeArm', 'RightForeArm']) B[n]?.scale.set(0.9, 1.32, 0.9);
    for (const n of ['LeftArm', 'RightArm']) B[n]?.scale.set(0.88, 1.18, 0.88);
    for (const n of ['LeftHand', 'RightHand']) B[n]?.scale.set(1, 1.25, 1);
    B.Neck?.scale.set(0.8, 1.6, 0.8);
    B.Spine1?.scale.set(0.86, 1.05, 0.86);
    rot(B.Spine2, 0.28 + (this.state === 'chase' ? 0.2 : 0), 0, 0);
    rot(B.Neck, -0.15, 0, 0);
    this.twitch -= dt;
    if (this.twitch < -Math.random() * 3) this.twitch = 0.12;
    const tw = this.twitch > 0 ? 1 : 0;
    this.headTilt = 0.42 + Math.sin(t * 0.7) * 0.06;
    if (B.Head) {
      B.Head.scale.setScalar(0.001);
    }
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.heading;
    this.root.updateMatrixWorld(true);

    // attach scanned head to the neck/head bone
    if (B.Head) {
      B.Head.getWorldPosition(this.headPivot.position);
      this.root.worldToLocal(this.headPivot.position);
      B.Neck.getWorldQuaternion(this.headPivot.quaternion);
      const inv = this.root.getWorldQuaternion(new THREE.Quaternion()).invert();
      this.headPivot.quaternion.premultiply(inv);
      e.set(-0.1 + tw * (Math.random() - 0.5) * 0.8, tw * (Math.random() - 0.5) * 0.9, this.headTilt + tw * (Math.random() - 0.5) * 0.7);
      q.setFromEuler(e);
      this.headPivot.quaternion.multiply(q);
      this.headPivot.position.y -= 0.02;
    }
  }

  _sound(dt, player) {
    if (!this.growl) return;
    const headPos = this.pos.clone(); headPos.y += 2.0;
    this.growl.setPos(headPos);
    const occl = this.level.segmentBlocked(this.pos.x, this.pos.z, player.pos.x, player.pos.z, { furniture: false });
    this.growl.setOcclusion(occl);
    this.growl.setVolume(this.state === 'chase' ? 1.0 : 0.55);
    this.growl.setPitch(this.state === 'chase' ? 1.35 : 1);
    // footfalls
    if (this.speed > 0.3) {
      this.stepPhase += dt * this.speed * (this.speed > 2.4 ? 0.55 : 0.75);
      if (this.stepPhase > 1) {
        this.stepPhase = 0;
        const surf = this.level.regionInfo(this.pos.x, this.pos.z)?.step || 'wood';
        this.audio.footstep(surf, { pos: this.pos.clone(), volume: this.speed > 2.4 ? 1.6 : 1.0, rate: 0.72, occluded: occl });
        if (this.speed > 2.4) this.audio.play('impactWood_heavy_001', { pos: this.pos.clone(), volume: 0.35, rate: 0.6 });
      }
    }
  }
}
