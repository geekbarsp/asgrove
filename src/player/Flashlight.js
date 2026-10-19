import * as THREE from 'three';

// Light cookie: bright hotspot, reflector rings, dim spill and lens imperfections.
function makeCookie() {
  const s = 256;
  const c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d');
  const img = g.createImageData(s, s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = (x - s / 2) / (s / 2), dy = (y - s / 2) / (s / 2);
    const r = Math.sqrt(dx * dx + dy * dy);
    const a = Math.atan2(dy, dx);
    let v = 0.38 * Math.pow(Math.max(0, 1 - r), 1.3);                  // spill
    v += 0.85 * Math.exp(-Math.pow(r / 0.33, 2));                     // hotspot
    v += 0.12 * Math.exp(-Math.pow((r - 0.42) / 0.035, 2));           // reflector ring
    v += 0.07 * Math.exp(-Math.pow((r - 0.63) / 0.05, 2));            // outer ring
    v *= 1 - 0.07 * Math.sin(a * 7 + r * 9) * Math.min(1, r * 3);    // reflector facets
    v *= 0.94 + 0.06 * Math.random();                                 // dirt on lens
    v *= r < 1 ? 1 : 0;
    const i = (y * s + x) * 4;
    const k = Math.min(255, v * 255);
    img.data[i] = k; img.data[i + 1] = k * 0.96; img.data[i + 2] = k * 0.86; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const BeamShader = {
  uniforms: { uIntensity: { value: 0.035 }, uColor: { value: new THREE.Color(1, 0.93, 0.8) } },
  vertexShader: `
    varying float vT; varying vec3 vN; varying vec3 vV;
    void main() {
      vT = -position.y / 7.0 + 0.5;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    uniform float uIntensity; uniform vec3 uColor;
    varying float vT; varying vec3 vN; varying vec3 vV;
    void main() {
      float edge = pow(abs(dot(vN, vV)), 2.2);
      float fall = pow(1.0 - clamp(vT, 0.0, 1.0), 2.4) * smoothstep(0.0, 0.08, vT);
      gl_FragColor = vec4(uColor * uIntensity * edge * fall, 1.0);
    }`,
};

export class Flashlight {
  constructor(scene, camera, assets, quality) {
    this.camera = camera;
    this.has = false;
    this.on = false;
    this.battery = 1;
    this.flicker = 0;     // external flicker request (monster proximity)
    this.cur = 0;
    this.baseIntensity = 40;

    const spot = new THREE.SpotLight(0xfff0d8, 0, 20, 0.52, 0.6, 1.7);
    spot.castShadow = true;
    spot.shadow.mapSize.set(quality.shadow, quality.shadow);
    spot.shadow.bias = -0.00008;
    spot.shadow.normalBias = 0.025;
    spot.shadow.camera.near = 0.15;
    spot.shadow.camera.far = 20;
    spot.shadow.radius = 3;
    spot.map = makeCookie();
    this.spot = spot;
    scene.add(spot, spot.target);

    // bounce light (light reflecting off whatever the beam hits)
    this.bounce = new THREE.PointLight(0xffe2c0, 0, 7, 2);
    if (quality.extraLights) scene.add(this.bounce);
    this.hasBounce = quality.extraLights;

    // volumetric beam cone
    const geo = new THREE.ConeGeometry(Math.tan(0.42) * 7, 7, 32, 1, true);
    geo.translate(0, -3.5, 0);
    this.beam = new THREE.Mesh(geo, new THREE.ShaderMaterial({ ...BeamShader, uniforms: THREE.UniformsUtils.clone(BeamShader.uniforms), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.beam.frustumCulled = false;
    scene.add(this.beam);

    // dust motes inside the beam
    const N = quality.dust ?? 700;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 6; pos[i * 3 + 1] = (Math.random() - 0.5) * 3; pos[i * 3 + 2] = (Math.random() - 0.5) * 6; }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dustMat = new THREE.ShaderMaterial({
      uniforms: { uOrigin: { value: new THREE.Vector3() }, uDir: { value: new THREE.Vector3(0, 0, -1) }, uCos: { value: Math.cos(0.42) }, uI: { value: 0 }, uT: { value: 0 }, uCenter: { value: new THREE.Vector3() } },
      vertexShader: `
        uniform vec3 uOrigin, uDir, uCenter; uniform float uCos, uI, uT;
        varying float vA;
        void main() {
          vec3 p = position;
          p += vec3(sin(uT * 0.3 + position.y * 3.0), sin(uT * 0.2 + position.x * 2.0) * 0.5, cos(uT * 0.25 + position.z * 3.0)) * 0.15;
          p = uCenter + mod(p - uCenter + 3.0, 6.0) - 3.0;
          vec3 d = p - uOrigin; float dist = length(d);
          float c = dot(d / max(dist, 1e-4), uDir);
          vA = smoothstep(uCos, uCos + 0.08, c) * uI * smoothstep(5.5, 0.6, dist) * smoothstep(0.15, 0.5, dist);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = 2.2 * (300.0 / -mv.z) * 0.012 + 1.0;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vA;
        void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vec3(1.0, 0.95, 0.85) * vA * 0.5 * (1.0 - d * 2.0), 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.dust = new THREE.Points(dg, this.dustMat);
    this.dust.frustumCulled = false;
    scene.add(this.dust);

    // hand-held model
    this.hand = new THREE.Group();
    const m = assets.model('vintage_flashlight');
    m.scale.setScalar(0.9);
    m.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    this.hand.add(m);
    this.lens = new THREE.Mesh(new THREE.CircleGeometry(0.03, 20), new THREE.MeshBasicMaterial({ color: 0xfff3d6 }));
    this.lens.position.set(0, 0.07, -0.16);
    this.lens.rotation.y = Math.PI;
    this.lens.visible = false;
    this.hand.add(this.lens);
    this.hand.visible = false;
    camera.add(this.hand);
    this.hand.position.set(0.2, -0.27, -0.34);
    this.hand.rotation.set(0.05, 0.08, 0);

    this.dir = new THREE.Vector3(0, 0, -1);
    this.sway = new THREE.Vector2();
  }

  give() { this.has = true; this.on = true; }

  toggle(audio) {
    if (!this.has) return;
    audio.play('metalClick', { volume: 0.5, rate: this.on ? 0.9 : 1.15 });
    if (!this.on && this.battery <= 0.001) return; // dead
    this.on = !this.on;
  }

  update(dt, t, raycastDist) {
    const cam = this.camera;
    const camDir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    // lagging, slightly springy aim like a hand-held torch
    this.dir.lerp(camDir, Math.min(1, dt * 11)).normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    const origin = cam.position.clone().addScaledVector(right, 0.19).addScaledVector(up, -0.2).addScaledVector(camDir, 0.55);

    // battery
    if (this.on) this.battery = Math.max(0, this.battery - dt / 300);
    if (this.battery <= 0 && this.on) this.on = false;

    let k = this.on ? 1 : 0;
    if (this.on) {
      if (this.battery < 0.2) { k *= 0.45 + this.battery * 2.5; if (Math.random() < 0.02) k *= 0.1; }
      if (this.flicker > 0) {
        const f = Math.sin(t * 60) * Math.sin(t * 13.7 + 1.3);
        if (f > 1 - this.flicker * 1.4) k *= Math.random() * 0.25;
      }
    }
    this.cur += (k - this.cur) * Math.min(1, dt * 30);

    this.spot.position.copy(origin);
    this.spot.target.position.copy(origin).addScaledVector(this.dir, 5);
    this.spot.intensity = this.baseIntensity * this.cur;

    // bounce placed where the beam lands
    if (this.hasBounce) {
      const d = Math.max(0.4, Math.min(raycastDist ?? 6, 12));
      this.bounce.position.copy(origin).addScaledVector(this.dir, d - 0.35);
      this.bounce.intensity = 0.45 * this.cur * Math.min(1, 3 / d);
    }

    // beam
    this.beam.position.copy(origin);
    this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), this.dir);
    this.beam.material.uniforms.uIntensity.value = 0.03 * this.cur;
    this.beam.visible = false; // first-person view looks straight down the cone; dust carries the volume

    this.dustMat.uniforms.uOrigin.value.copy(origin);
    this.dustMat.uniforms.uDir.value.copy(this.dir);
    this.dustMat.uniforms.uI.value = this.cur;
    this.dustMat.uniforms.uT.value = t;
    this.dustMat.uniforms.uCenter.value.copy(cam.position);

    this.lens.material.color.setScalar(0.15 + this.cur * 0.9);
    // hand sway
    this.hand.position.y = -0.27 + Math.sin(t * 1.3) * 0.004;
  }
}
