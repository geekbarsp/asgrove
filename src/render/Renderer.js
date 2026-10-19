import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

export const QUALITY = {
  low: { pixelRatio: 0.75, shadow: 512, ao: false, bloom: false, smaa: false, extraLights: false, aniso: 2 },
  medium: { pixelRatio: 1, shadow: 1024, ao: false, bloom: true, smaa: true, extraLights: true, aniso: 4 },
  high: { pixelRatio: 1.25, shadow: 1024, ao: true, bloom: true, smaa: true, extraLights: true, aniso: 8 },
  ultra: { pixelRatio: 2, shadow: 2048, ao: true, bloom: true, smaa: true, extraLights: true, aniso: 16 },
};

// Camera "lens": chromatic aberration, sensor grain, vignette, grading, fear distortion.
const FilmShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uGrain: { value: 0.07 },
    uVignette: { value: 0.55 },
    uCA: { value: 0.0018 },
    uFear: { value: 0 },
    uDamage: { value: 0 },
    uGamma: { value: 1 },
    uFade: { value: 0 },
    uHidden: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uGrain, uVignette, uCA, uFear, uDamage, uGamma, uFade, uHidden;
    uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 uv = 0.5 + c * (1.0 - 0.035 * r2);            // subtle lens barrel
      // fear: heat-haze wobble + pulsing zoom
      float pulse = sin(uTime * 7.0) * 0.5 + 0.5;
      uv += uFear * uFear * vec2(sin(uv.y * 21.0 + uTime * 3.1), cos(uv.x * 17.0 + uTime * 2.3)) * 0.0028;
      uv = 0.5 + (uv - 0.5) * (1.0 - uFear * 0.012 * pulse);
      float ca = (uCA + uFear * 0.006 + uDamage * 0.01) * (0.3 + r2 * 3.0);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * ca).b;
      // grade: desaturate, cool shadows, warm highlights
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, 0.78 - uFear * 0.35);
      col = mix(col * vec3(0.92, 1.0, 1.08), col * vec3(1.06, 1.0, 0.9), smoothstep(0.05, 0.6, l));
      col = pow(max(col, 0.0), vec3(1.0 / uGamma));
      // vignette
      float vig = smoothstep(0.95, 0.25, length(c * vec2(1.0, 0.9)) * (1.0 + uFear * 0.35));
      col *= mix(1.0, vig, clamp(uVignette + uFear * 0.25, 0.0, 1.0));
      // damage / death tint
      col = mix(col, col * vec3(1.5, 0.25, 0.2) + vec3(0.08, 0.0, 0.0), uDamage * smoothstep(0.0, 0.7, length(c) + 0.25));
      // sensor noise, stronger in shadows (like a real camera pushing ISO)
      float n = hash(vUv * uRes + fract(uTime * 13.7) * 91.0) - 0.5;
      col += n * uGrain * (1.15 - l) * (1.0 + uFear * 0.8);
      // rolling line flicker in heavy fear
      col *= 1.0 - uFear * 0.06 * step(0.985, fract(vUv.y * 3.0 - uTime * 0.7));
      col *= 1.0 - uHidden * 0.25;
      col = mix(col, vec3(0.0), uFade);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    const r = this.renderer;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.35;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.quality = 'high';
    this.composer = null;
  }

  setup(scene, camera, quality = 'high') {
    this.scene = scene;
    this.camera = camera;
    this.quality = quality;
    const q = QUALITY[quality];
    const r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    const w = innerWidth, h = innerHeight;
    r.setSize(w, h, false);

    this.composer?.dispose();
    const comp = new EffectComposer(r, new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 0 }));
    comp.setPixelRatio(r.getPixelRatio());
    comp.setSize(w, h);
    comp.addPass(new RenderPass(scene, camera));

    if (q.ao) {
      const ao = new GTAOPass(scene, camera, w, h);
      ao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.4, thickness: 1.2, scale: 1.25, samples: quality === 'ultra' ? 16 : 10 });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      ao.blendIntensity = 0.85;
      comp.addPass(ao);
      this.aoPass = ao;
    } else this.aoPass = null;

    if (q.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.42, 0.55, 0.82);
      comp.addPass(this.bloom);
    }
    comp.addPass(new OutputPass());
    if (q.smaa) comp.addPass(new SMAAPass(w * r.getPixelRatio(), h * r.getPixelRatio()));
    this.film = new ShaderPass(FilmShader);
    comp.addPass(this.film);
    this.film.uniforms.uRes.value.set(w * r.getPixelRatio(), h * r.getPixelRatio());
    this.composer = comp;

    if (!this._onResize) {
      this._onResize = () => this.resize();
      addEventListener('resize', this._onResize);
    }
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.film.uniforms.uRes.value.set(w * this.renderer.getPixelRatio(), h * this.renderer.getPixelRatio());
  }

  render(dt) {
    this.film.uniforms.uTime.value += dt;
    this.composer.render(dt);
  }
}
