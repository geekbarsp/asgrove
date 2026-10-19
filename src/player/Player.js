import * as THREE from 'three';

const RADIUS = 0.32;
const EYE = 1.62, EYE_CROUCH = 1.0;
const WALK = 1.9, SPRINT = 4.5, CROUCH = 1.0;

export class Player {
  constructor(camera, level, input, audio) {
    this.camera = camera;
    this.level = level;
    this.input = input;
    this.audio = audio;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.roll = 0;
    this.eye = EYE;
    this.crouching = false;
    this.sprinting = false;
    this.stamina = 1;
    this.exhausted = false;
    this.bob = 0;
    this.bobAmt = 0;
    this.lastStepSign = 1;
    this.frozen = false;     // cutscenes / UI
    this.hidden = null;      // hide spot
    this.hideLook = { yaw: 0, pitch: 0 };
    this.onNoise = null;
    this.shake = 0;
    this.lookTarget = null;  // forced look (scares)
    this.fovKick = 0;
    this.movedRecently = 0;
    this.camOffset = new THREE.Vector3();
  }

  spawn(x, z, yaw = 0) {
    this.pos.set(x, this.level.heightAt(x, z), z);
    this.yaw = yaw; this.pitch = 0;
    this.vel.set(0, 0, 0);
    this.hidden = null;
    this.stamina = 1;
    this.crouching = false;
    this.updateCamera(0);
  }

  get speed() { return Math.hypot(this.vel.x, this.vel.z); }
  get surface() { return this.level.regionInfo(this.pos.x, this.pos.z)?.step || 'wood'; }

  forward() { return new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)); }

  enterHide(spot) {
    this.hidden = spot;
    this.hideLook.yaw = 0; this.hideLook.pitch = 0;
    this.vel.set(0, 0, 0);
    this.audio.play('cloth1', { volume: 0.6 });
    this.audio.play('doorClose_1', { volume: 0.5, rate: 1.3 });
  }
  exitHide() {
    const s = this.hidden;
    this.hidden = null;
    this.pos.set(s.exitPos.x, this.level.heightAt(s.exitPos.x, s.exitPos.z), s.exitPos.z);
    this.yaw = Math.atan2(-s.fwd.x, -s.fwd.z);
    this.pitch = 0;
    this.audio.play('doorOpen_1', { volume: 0.55, rate: 1.2 });
  }

  update(dt) {
    const inp = this.input;
    const { dx, dy } = this.frozen ? { dx: 0, dy: 0 } : inp.consumeMouse();

    if (this.hidden) {
      // limited look through the wardrobe slats
      this.hideLook.yaw = THREE.MathUtils.clamp(this.hideLook.yaw - dx, -0.6, 0.6);
      this.hideLook.pitch = THREE.MathUtils.clamp(this.hideLook.pitch - dy, -0.4, 0.3);
      const baseYaw = Math.atan2(this.hidden.fwd.x, this.hidden.fwd.z) + Math.PI;
      this.yaw = baseYaw + this.hideLook.yaw;
      this.pitch = this.hideLook.pitch;
      this.sprinting = false;
      this.stamina = Math.min(1, this.stamina + dt * 0.3);
      this.updateCamera(dt);
      return;
    }

    if (!this.frozen) {
      this.yaw -= dx;
      this.pitch = THREE.MathUtils.clamp(this.pitch - dy, -1.45, 1.45);
    }
    if (this.lookTarget) {
      // ease the view toward a target (scripted scares)
      const d = new THREE.Vector3().subVectors(this.lookTarget, this.camera.position);
      const ty = Math.atan2(-d.x, -d.z), tp = Math.atan2(d.y, Math.hypot(d.x, d.z));
      let dyaw = ty - this.yaw; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
      this.yaw += dyaw * Math.min(1, dt * 7);
      this.pitch += (tp - this.pitch) * Math.min(1, dt * 7);
    }

    // input direction
    let mx = 0, mz = 0;
    if (!this.frozen) {
      if (inp.down('KeyW') || inp.down('ArrowUp')) mz -= 1;
      if (inp.down('KeyS') || inp.down('ArrowDown')) mz += 1;
      if (inp.down('KeyA') || inp.down('ArrowLeft')) mx -= 1;
      if (inp.down('KeyD') || inp.down('ArrowRight')) mx += 1;
      if (inp.hit('KeyC') || inp.hit('ControlLeft')) this.crouching = !this.crouching;
    }
    const moving = mx !== 0 || mz !== 0;
    const wantSprint = !this.frozen && inp.down('ShiftLeft') && moving && mz < 0 && !this.exhausted;
    if (wantSprint && this.crouching) this.crouching = false;
    this.sprinting = wantSprint && this.stamina > 0;

    if (this.sprinting) { this.stamina -= dt / 6.5; if (this.stamina <= 0) { this.stamina = 0; this.exhausted = true; } }
    else { this.stamina = Math.min(1, this.stamina + dt * (moving ? 0.13 : 0.22)); if (this.exhausted && this.stamina > 0.35) this.exhausted = false; }

    const speed = this.crouching ? CROUCH : this.sprinting ? SPRINT : WALK;
    const len = Math.hypot(mx, mz) || 1;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wx = (mx * cos + mz * sin) / len * speed;
    const wz = (-mx * sin + mz * cos) / len * speed;
    const acc = moving ? 10 : 12;
    this.vel.x += (wx * (moving ? 1 : 0) - this.vel.x) * Math.min(1, acc * dt);
    this.vel.z += (wz * (moving ? 1 : 0) - this.vel.z) * Math.min(1, acc * dt);

    // integrate with collision (sub-steps)
    const steps = 3;
    for (let i = 0; i < steps; i++) {
      this.pos.x += this.vel.x * dt / steps;
      this.pos.z += this.vel.z * dt / steps;
      this.collide();
    }
    const groundY = this.level.heightAt(this.pos.x, this.pos.z);
    this.pos.y += (groundY - this.pos.y) * Math.min(1, dt * 18);

    // eye height (crouch, with ceiling check irrelevant: ceilings are uniform)
    const targetEye = this.crouching ? EYE_CROUCH : EYE;
    this.eye += (targetEye - this.eye) * Math.min(1, dt * 8);

    // head bob + footsteps
    const sp = this.speed;
    this.bobAmt += ((sp > 0.2 ? 1 : 0) - this.bobAmt) * Math.min(1, dt * 6);
    if (sp > 0.2) {
      const freq = this.sprinting ? 2.35 : this.crouching ? 1.25 : 1.75;
      this.bob += dt * freq * Math.PI * 2 * 0.5;
      const s = Math.sign(Math.sin(this.bob));
      if (s !== this.lastStepSign) {
        this.lastStepSign = s;
        this.footstep();
      }
    }
    this.roll += ((-mx * (this.sprinting ? 0.018 : 0.008)) - this.roll) * Math.min(1, dt * 5);
    this.fovKick += ((this.sprinting ? 6 : 0) - this.fovKick) * Math.min(1, dt * 3);
    this.updateCamera(dt);
  }

  footstep() {
    const surf = this.surface;
    const vol = this.crouching ? 0.12 : this.sprinting ? 0.75 : 0.38;
    this.audio.footstep(surf, { volume: vol, rate: this.sprinting ? 1.08 : 1 });
    if (this.sprinting && Math.random() < 0.3) this.audio.play('cloth' + (1 + Math.floor(Math.random() * 2)), { volume: 0.25 });
    const radius = this.crouching ? 1.2 : this.sprinting ? 13 : 4.5;
    this.onNoise?.(this.pos.clone(), radius, 'step');
  }

  collide() {
    const boxes = this.level.nearbyColliders(this.pos.x, this.pos.z, 1.5);
    for (let iter = 0; iter < 2; iter++) {
      for (const b of boxes) {
        const cx = THREE.MathUtils.clamp(this.pos.x, b.minX, b.maxX);
        const cz = THREE.MathUtils.clamp(this.pos.z, b.minZ, b.maxZ);
        let dx = this.pos.x - cx, dz = this.pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= RADIUS * RADIUS) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const push = RADIUS - d;
          this.pos.x += (dx / d) * push; this.pos.z += (dz / d) * push;
        } else {
          // centre inside box: push out along shortest axis
          const l = this.pos.x - b.minX, r = b.maxX - this.pos.x, t = this.pos.z - b.minZ, bt = b.maxZ - this.pos.z;
          const m = Math.min(l, r, t, bt);
          if (m === l) this.pos.x = b.minX - RADIUS; else if (m === r) this.pos.x = b.maxX + RADIUS;
          else if (m === t) this.pos.z = b.minZ - RADIUS; else this.pos.z = b.maxZ + RADIUS;
        }
      }
    }
  }

  updateCamera(dt) {
    const cam = this.camera;
    if (this.hidden) {
      const breathe = Math.sin(performance.now() * 0.0012) * 0.006;
      cam.position.set(this.hidden.pos.x, this.hidden.pos.y + breathe, this.hidden.pos.z);
    } else {
      const amp = this.sprinting ? 0.065 : this.crouching ? 0.02 : 0.035;
      const by = Math.abs(Math.sin(this.bob)) * amp * this.bobAmt - amp * 0.5 * this.bobAmt;
      const bx = Math.cos(this.bob) * amp * 0.6 * this.bobAmt;
      const idle = Math.sin(performance.now() * 0.0011) * 0.008;
      const sx = Math.cos(this.yaw), sz = -Math.sin(this.yaw);
      cam.position.set(this.pos.x + sx * bx, this.pos.y + this.eye + by + idle, this.pos.z + sz * bx);
    }
    // shake
    this.shake = Math.max(0, this.shake - dt * 1.5);
    const sh = this.shake * this.shake;
    const t = performance.now() * 0.001;
    const ry = (Math.sin(t * 37) + Math.sin(t * 61)) * 0.012 * sh;
    const rp = (Math.sin(t * 43) + Math.sin(t * 29)) * 0.012 * sh;
    const swayP = Math.sin(t * 0.7) * 0.004, swayY = Math.sin(t * 0.53) * 0.004; // breathing camera drift
    cam.rotation.set(this.pitch + rp + swayP, this.yaw + ry + swayY, this.roll + Math.sin(this.bob) * 0.006 * this.bobAmt, 'YXZ');
    const fov = 72 + this.fovKick;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
  }
}
