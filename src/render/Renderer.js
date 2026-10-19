import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

// lights = max simultaneous point lights (nearest practical lights are pooled into these slots)
// minScale/maxScale bound the adaptive resolution scaler
export const QUALITY = {
  low: { maxScale: 0.75, minScale: 0.5, shadow: 512, softShadows: false, ao: false, bloom: false, aa: 'fxaa', lights: 2, extraLights: false, aniso: 2, dust: 300 },
  medium: { maxScale: 1, minScale: 0.6, shadow: 1024, softShadows: false, ao: false, bloom: true, aa: 'fxaa', lights: 3, extraLights: true, aniso: 4, dust: 500 },
  high: { maxScale: 1.25, minScale: 0.6, shadow: 1024, softShadows: true, ao: false, bloom: true, aa: 'fxaa', lights: 4, extraLights: true, aniso: 8, dust: 700 },
  ultra: { maxScale: 1.5, minScale: 0.7, shadow: 2048, softShadows: true, ao: true, bloom: true, aa: 'smaa', lights: 6, extraLights: true, aniso: 16, dust: 900 },
};

// Pick a sensible default from the GPU name (integrated / mobile GPUs start lower).
export function detectQuality(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || '';
    if (/swiftshader|llvmpipe|software|microsoft basic/i.test(name)) return 'low';
    if (/intel|uhd|iris|mali|adreno|powervr|apple gpu|vega \d+ graphics|radeon\(tm\) graphics/i.test(name)) return 'medium';
    return 'high'; // Ultra is opt-in only: it is far heavier on high-DPI and laptop displays
  } catch { return 'medium'; }
}

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
    this.scale = 1;
    this.frameTimes = [];
    this.adaptT = 0;
    this.slowWindows = 0;
    this.onDowngrade = null; // called when even the minimum render scale can't hold the frame rate
    this.fps = 0;
  }

  get dpr() { return Math.min(window.devicePixelRatio || 1, 2); }

  setup(scene, camera, quality = 'high') {
    this.scene = scene;
    this.camera = camera;
    this.quality = quality;
    const q = this.q = QUALITY[quality];
    const r = this.renderer;
    r.shadowMap.type = q.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.scale = Math.min(q.maxScale, this.dpr);
    r.setPixelRatio(this.scale);
    const w = innerWidth, h = innerHeight;
    r.setSize(w, h, false);

    this.composer?.passes.forEach((p) => p.dispose?.());
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
    this.fxaa = null;
    if (q.aa === 'smaa') comp.addPass(new SMAAPass(w * r.getPixelRatio(), h * r.getPixelRatio()));
    else if (q.aa === 'fxaa') { this.fxaa = new ShaderPass(FXAAShader); comp.addPass(this.fxaa); }
    this.film = new ShaderPass(FilmShader);
    comp.addPass(this.film);
    this.composer = comp;
    this._applySize();

    if (!this._onResize) {
      this._onResize = () => this.resize();
      addEventListener('resize', this._onResize);
    }
  }

  _applySize() {
    const w = innerWidth, h = innerHeight, pr = this.scale;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.film.uniforms.uRes.value.set(w * pr, h * pr);
    if (this.fxaa) this.fxaa.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this._applySize();
  }

  // Dynamic resolution: drop render scale when frames run long, restore it when there is headroom.
  _adapt(dt) {
    this.frameTimes.push(dt);
    this.adaptT += dt;
    if (this.adaptT < 1.0) return;
    const ft = this.frameTimes.slice().sort((a, b) => a - b);
    const p75 = ft[Math.floor(ft.length * 0.75)];
    this.frameTimes.length = 0;
    this.adaptT = 0;
    this.fps = Math.round(1 / p75);
    const max = Math.min(this.q.maxScale, this.dpr), min = this.q.minScale;
    let next = this.scale;
    if (p75 > 1 / 50 && this.scale > min) next = Math.max(min, this.scale - (p75 > 1 / 30 ? 0.2 : 0.1));
    else if (p75 < 1 / 75 && this.scale < max) next = Math.min(max, this.scale + 0.05);
    if (Math.abs(next - this.scale) > 0.01) { this.scale = next; this._applySize(); }
    // still slow at the lowest scale for a few seconds -> drop a quality preset
    this.slowWindows = p75 > 1 / 45 && this.scale <= min + 0.01 ? this.slowWindows + 1 : 0;
    if (this.slowWindows >= 3 && this.onDowngrade) { this.slowWindows = 0; this.onDowngrade(); }
  }

  render(dt, adapt = true) {
    this.film.uniforms.uTime.value += dt;
    if (adapt && this.q) this._adapt(dt);
    this.composer.render(dt);
  }
}
