// Web Audio engine: recorded foley samples + real-time synthesised horror sound design.
// Positional sounds use HRTF panning and optional occlusion low-pass filtering.

const SAMPLE_NAMES = [
  ...[0, 1, 2, 3, 4].map((i) => `footstep_wood_00${i}`),
  ...[0, 1, 2, 3, 4].map((i) => `footstep_concrete_00${i}`),
  ...[0, 1, 2, 3, 4].map((i) => `footstep_carpet_00${i}`),
  'impactWood_heavy_000', 'impactWood_heavy_001', 'impactWood_heavy_002',
  'impactMetal_heavy_000', 'impactMetal_light_001', 'impactGlass_heavy_000', 'impactPlank_medium_000',
  'creak1', 'creak2', 'creak3', 'doorOpen_1', 'doorOpen_2', 'doorClose_1', 'doorClose_3', 'doorClose_4',
  'metalClick', 'metalLatch', 'bookFlip1', 'bookOpen', 'cloth1', 'cloth2', 'dropLeather', 'handleSmallLeather',
];

const rand = (a, b) => a + Math.random() * (b - a);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.buffers = new Map();
    this.ready = false;
    this.listenerPos = { x: 0, y: 0, z: 0 };
  }

  async init(onProgress) {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.25;
    this.muffle.connect(this.master).connect(comp).connect(ctx.destination);

    // Shared room reverb (generated impulse response).
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(2.6, 2.4);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.45;
    this.reverbSend.connect(this.reverb).connect(this.muffle);

    this.sfx = ctx.createGain(); this.sfx.connect(this.muffle); this.sfx.connect(this.reverbSend);
    this.amb = ctx.createGain(); this.amb.gain.value = 0.0; this.amb.connect(this.muffle);
    this.ui = ctx.createGain(); this.ui.connect(this.master);

    this.noiseBuf = this._noise(4, 'white');
    this.pinkBuf = this._noise(6, 'pink');
    this.brownBuf = this._noise(6, 'brown');

    let n = 0;
    await Promise.all(SAMPLE_NAMES.map(async (name) => {
      try {
        const res = await fetch(`/assets/sounds/${name}.ogg`);
        const ab = await res.arrayBuffer();
        this.buffers.set(name, await ctx.decodeAudioData(ab));
      } catch (e) { console.warn('sound failed', name, e); }
      onProgress?.(++n / SAMPLE_NAMES.length);
    }));
    this.ready = true;
  }

  resume() { this.ctx?.state === 'suspended' && this.ctx.resume(); }
  setVolume(v) { if (this.master) this.master.gain.value = v; }
  setMuffled(on) {
    if (!this.ctx) return;
    this.muffle.frequency.setTargetAtTime(on ? 900 : 20000, this.ctx.currentTime, 0.25);
  }

  setListener(pos, forward, up) {
    const L = this.ctx.listener;
    const t = this.ctx.currentTime;
    this.listenerPos = pos;
    if (L.positionX) {
      L.positionX.setTargetAtTime(pos.x, t, 0.02); L.positionY.setTargetAtTime(pos.y, t, 0.02); L.positionZ.setTargetAtTime(pos.z, t, 0.02);
      L.forwardX.setTargetAtTime(forward.x, t, 0.02); L.forwardY.setTargetAtTime(forward.y, t, 0.02); L.forwardZ.setTargetAtTime(forward.z, t, 0.02);
      L.upX.value = up.x; L.upY.value = up.y; L.upZ.value = up.z;
    } else {
      L.setPosition(pos.x, pos.y, pos.z);
      L.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  // ---------- helpers ----------
  _noise(seconds, color) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (color === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      } else if (color === 'brown') {
        last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }

  _impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // early reflections + diffuse tail
        const early = i < ctx.sampleRate * 0.08 && Math.random() < 0.004 ? (Math.random() * 2 - 1) * 0.9 : 0;
        d[i] = early + (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * 0.5;
      }
    }
    return buf;
  }

  _distortion(amount) {
    const n = 2048, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / n) * 2 - 1; curve[i] = ((3 + amount) * x * 20 * Math.PI / 180) / (Math.PI + amount * Math.abs(x)); }
    return curve;
  }

  // Creates a node chain: source -> [occlusion filter] -> panner -> sfx bus. Returns {input, panner, occl}.
  _spatial(pos, { ref = 1.2, rolloff = 1.3, max = 60 } = {}) {
    const ctx = this.ctx;
    const occl = ctx.createBiquadFilter();
    occl.type = 'lowpass'; occl.frequency.value = 20000;
    const p = ctx.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse';
    p.refDistance = ref; p.rolloffFactor = rolloff; p.maxDistance = max;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
    else p.setPosition(pos.x, pos.y, pos.z);
    occl.connect(p).connect(this.sfx);
    return { input: occl, panner: p, occl };
  }

  static setPannerPos(p, pos, ctx) {
    if (p.positionX) {
      const t = ctx.currentTime;
      p.positionX.setTargetAtTime(pos.x, t, 0.03); p.positionY.setTargetAtTime(pos.y, t, 0.03); p.positionZ.setTargetAtTime(pos.z, t, 0.03);
    } else p.setPosition(pos.x, pos.y, pos.z);
  }

  // ---------- one-shot samples ----------
  play(name, { volume = 1, rate = 1, pos = null, detune = 0.06, occluded = false, delay = 0 } = {}) {
    if (!this.ready) return;
    const buf = this.buffers.get(name);
    if (!buf) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate * (1 + rand(-detune, detune));
    const g = ctx.createGain(); g.gain.value = volume;
    src.connect(g);
    if (pos) {
      const s = this._spatial(pos);
      if (occluded) s.occl.frequency.value = 700;
      g.connect(s.input);
    } else g.connect(this.sfx);
    src.start(ctx.currentTime + delay);
    return src;
  }

  playRandom(prefix, count, opts) { return this.play(`${prefix}${Math.floor(Math.random() * count)}`, opts); }

  footstep(surface, { volume = 0.5, pos = null, rate = 1, occluded = false } = {}) {
    const map = { wood: 'footstep_wood_00', carpet: 'footstep_carpet_00', concrete: 'footstep_concrete_00', tile: 'footstep_concrete_00' };
    const r = surface === 'tile' ? 1.25 : 1;
    this.playRandom(map[surface] || map.wood, 5, { volume, pos, rate: r * rate, occluded });
    // occasional floorboard creak under foot
    if (surface === 'wood' && Math.random() < 0.08 && !pos) this.play(`creak${1 + Math.floor(Math.random() * 3)}`, { volume: volume * 0.35, rate: rand(0.7, 1.0) });
  }

  // ---------- ambience ----------
  startAmbience() {
    const ctx = this.ctx, t = ctx.currentTime;
    // Low drone: detuned saws through a slowly breathing low-pass.
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160; lp.Q.value = 3;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05;
    const lfoG = ctx.createGain(); lfoG.gain.value = 70; lfo.connect(lfoG).connect(lp.frequency); lfo.start();
    const droneG = ctx.createGain(); droneG.gain.value = 0.11;
    [41.2, 41.7, 61.7, 82.0, 87.3].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = i % 2 ? 'sawtooth' : 'triangle'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = i > 2 ? 0.25 : 0.5; o.connect(g).connect(lp); o.start();
    });
    lp.connect(droneG).connect(this.amb);

    // Wind / house breathing: pink noise in sweeping band-pass.
    const wind = ctx.createBufferSource(); wind.buffer = this.pinkBuf; wind.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 400; bp.Q.value = 0.8;
    const wl = ctx.createOscillator(); wl.frequency.value = 0.07; const wlg = ctx.createGain(); wlg.gain.value = 250; wl.connect(wlg).connect(bp.frequency); wl.start();
    const wg = ctx.createGain(); wg.gain.value = 0.16;
    const wv = ctx.createOscillator(); wv.frequency.value = 0.11; const wvg = ctx.createGain(); wvg.gain.value = 0.08; wv.connect(wvg).connect(wg.gain); wv.start();
    wind.connect(bp).connect(wg).connect(this.amb); wind.start();

    // Room tone
    const rt = ctx.createBufferSource(); rt.buffer = this.brownBuf; rt.loop = true;
    const rtg = ctx.createGain(); rtg.gain.value = 0.05; rt.connect(rtg).connect(this.amb); rt.start();

    this.amb.gain.setValueAtTime(0, t);
    this.amb.gain.linearRampToValueAtTime(1, t + 6);

    // Heartbeat bus
    this.heartGain = ctx.createGain(); this.heartGain.gain.value = 0; this.heartGain.connect(this.master);
    this._nextBeat = 0;
    this.heartRate = 60;

    // Tension bed (dissonant cluster), faded in by fear level
    this.tension = ctx.createGain(); this.tension.gain.value = 0;
    const tlp = ctx.createBiquadFilter(); tlp.type = 'lowpass'; tlp.frequency.value = 1400;
    [233.1, 246.9, 349.2, 370.0, 523.3].forEach((f) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const v = ctx.createOscillator(); v.frequency.value = rand(4, 6.5); const vg = ctx.createGain(); vg.gain.value = f * 0.006; v.connect(vg).connect(o.frequency); v.start();
      const g = ctx.createGain(); g.gain.value = 0.03; o.connect(g).connect(tlp); o.start();
    });
    tlp.connect(this.tension).connect(this.muffle);

    // Breathing bus
    this.breathGain = ctx.createGain(); this.breathGain.gain.value = 0; this.breathGain.connect(this.master);
    this._breathT = 0;
  }

  // fear 0..1, exhaustion 0..1
  update(dt, fear, exhaustion) {
    if (!this.ctx || !this.heartGain) return;
    const t = this.ctx.currentTime;
    this.tension.gain.setTargetAtTime(Math.max(0, fear - 0.25) * 0.55, t, 0.6);
    this.heartGain.gain.setTargetAtTime(Math.min(1, fear * 1.3) * 0.9, t, 0.3);
    this.heartRate = 62 + fear * 85 + exhaustion * 30;
    this._nextBeat -= dt;
    if (this._nextBeat <= 0 && fear > 0.08) {
      this._nextBeat = 60 / this.heartRate;
      this._thump(t, 1); this._thump(t + 0.16, 0.65);
    }
    this.breathGain.gain.setTargetAtTime(exhaustion * 0.55, t, 0.4);
    this._breathT -= dt;
    if (this._breathT <= 0 && exhaustion > 0.15) {
      const period = 1.4 - exhaustion * 0.65;
      this._breathT = period;
      this._breath(t, period * 0.42, 1400, 0.9);
      this._breath(t + period * 0.48, period * 0.46, 900, 0.75);
    }
  }

  _thump(t, amp) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.12);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(amp, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(this.heartGain); o.start(t); o.stop(t + 0.25);
  }

  _breath(t, dur, freq, amp) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; s.playbackRate.value = rand(0.9, 1.1);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 1.4;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(amp * 0.25, t + dur * 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    s.connect(bp).connect(g).connect(this.breathGain); s.start(t, Math.random() * 2); s.stop(t + dur + 0.05);
  }

  // ---------- synthesised one-shots ----------
  creak({ pos = null, volume = 0.6, dur = 1.2, base = 260 } = {}) {
    // stick-slip friction: pulse train with jittering rate through formant filters
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(base * rand(0.7, 1.2), t);
    for (let i = 1; i <= 8; i++) o.frequency.linearRampToValueAtTime(base * rand(0.5, 1.6), t + (dur * i) / 8);
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 900; f1.Q.value = 6;
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 2100; f2.Q.value = 8;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(volume, t + 0.08); g.gain.setValueAtTime(volume, t + dur * 0.7); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const out = pos ? this._spatial(pos).input : this.sfx;
    o.connect(f1).connect(g); o.connect(f2).connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.1);
  }

  knock(pos, count = 3) {
    for (let i = 0; i < count; i++) this.play('impactWood_heavy_00' + (i % 3), { pos, volume: 0.9, delay: i * rand(0.28, 0.4), rate: 0.8 });
  }

  whisper({ pos = null, volume = 0.35, dur = 2.2 } = {}) {
    const ctx = this.ctx, t = ctx.currentTime;
    const out = pos ? this._spatial(pos, { ref: 0.6 }).input : this.sfx;
    const syll = 5 + Math.floor(Math.random() * 6);
    for (let i = 0; i < syll; i++) {
      const st = t + (i / syll) * dur, d = rand(0.08, 0.26);
      const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = rand(1500, 4800); f.Q.value = rand(2, 6);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, st); g.gain.linearRampToValueAtTime(volume * rand(0.4, 1), st + d * 0.3); g.gain.linearRampToValueAtTime(0.0001, st + d);
      s.connect(f).connect(g).connect(out); s.start(st, Math.random() * 3); s.stop(st + d + 0.02);
    }
  }

  stinger(volume = 0.6) {
    // orchestral "hit": low boom + screeching string cluster
    const ctx = this.ctx, t = ctx.currentTime;
    const boom = ctx.createOscillator(); boom.frequency.setValueAtTime(90, t); boom.frequency.exponentialRampToValueAtTime(28, t + 1.2);
    const bg = ctx.createGain(); bg.gain.setValueAtTime(volume, t); bg.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
    boom.connect(bg).connect(this.sfx); boom.start(t); boom.stop(t + 1.7);
    const sg = ctx.createGain(); sg.gain.setValueAtTime(0.0001, t); sg.gain.linearRampToValueAtTime(volume * 0.22, t + 0.05); sg.gain.exponentialRampToValueAtTime(0.001, t + 2.4);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500;
    [1046, 1108, 1174, 1661, 2217].forEach((f) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * 1.04, t + 2.2);
      o.connect(hp); o.start(t); o.stop(t + 2.5);
    });
    hp.connect(sg).connect(this.sfx);
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(volume * 0.5, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    n.connect(ng).connect(this.sfx); n.start(t); n.stop(t + 0.6);
  }

  screech({ pos = null, volume = 0.8, dur = 1.6 } = {}) {
    const ctx = this.ctx, t = ctx.currentTime;
    const out = pos ? this._spatial(pos, { ref: 2.5, rolloff: 0.9 }).input : this.sfx;
    const ws = ctx.createWaveShaper(); ws.curve = this._distortion(60);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(volume, t + 0.06); g.gain.setValueAtTime(volume, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.7;
    [380, 395, 572, 760].forEach((f) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * 0.6, t); o.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.25); o.frequency.exponentialRampToValueAtTime(f * 0.9, t + dur);
      const v = ctx.createOscillator(); v.frequency.value = rand(18, 34); const vg = ctx.createGain(); vg.gain.value = f * 0.12; v.connect(vg).connect(o.frequency); v.start(t); v.stop(t + dur);
      o.connect(ws); o.start(t); o.stop(t + dur + 0.05);
    });
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf; const ng = ctx.createGain(); ng.gain.value = 0.4;
    n.connect(ng).connect(ws); n.start(t); n.stop(t + dur);
    ws.connect(bp).connect(g).connect(out);
  }

  jumpscare() {
    this.screech({ volume: 1.0, dur: 1.4 });
    this.stinger(0.9);
    this.play('impactMetal_heavy_000', { volume: 1, rate: 0.6 });
  }

  chime(pos, count = 3) {
    // Grandfather clock bell: inharmonic partials
    const ctx = this.ctx;
    for (let k = 0; k < count; k++) {
      const t = ctx.currentTime + k * 1.6;
      const out = this._spatial(pos, { ref: 3, rolloff: 0.7 }).input;
      [1, 2.0, 2.76, 5.4, 8.9].forEach((m, i) => {
        const o = ctx.createOscillator(); o.frequency.value = 196 * m;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32 / (i + 1), t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2 / (1 + i * 0.4));
        o.connect(g).connect(out); o.start(t); o.stop(t + 3.4);
      });
    }
  }

  tick(pos, volume = 0.25) {
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = rand(2600, 3400); f.Q.value = 9;
    const g = ctx.createGain(); g.gain.setValueAtTime(volume, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(f).connect(g).connect(pos ? this._spatial(pos, { ref: 0.8 }).input : this.sfx); s.start(t, Math.random()); s.stop(t + 0.06);
  }

  powerUp() {
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(20, t); o.frequency.exponentialRampToValueAtTime(100, t + 2.5);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4, t + 1.8); g.gain.exponentialRampToValueAtTime(0.0001, t + 4);
    o.connect(lp).connect(g).connect(this.sfx); o.start(t); o.stop(t + 4.2);
    this.play('impactMetal_heavy_000', { volume: 0.8, rate: 0.7 });
  }

  // ---------- looping positional emitters ----------
  // Returns a handle {setPos, setOcclusion, setVolume, stop}
  loop(kind, pos, volume = 0.5) {
    const ctx = this.ctx;
    const sp = this._spatial(pos, kind === 'growl' ? { ref: 1.5, rolloff: 1.1 } : { ref: 1, rolloff: 1.6 });
    const g = ctx.createGain(); g.gain.value = volume; g.connect(sp.input);
    const nodes = [];
    if (kind === 'static') {
      const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
      const am = ctx.createGain(); am.gain.value = 0.5;
      const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 59.94; const lg = ctx.createGain(); lg.gain.value = 0.12; lfo.connect(lg).connect(am.gain); lfo.start();
      s.connect(hp).connect(am).connect(g); s.start(); nodes.push(s, lfo);
    } else if (kind === 'hum') {
      [50, 100, 150, 250].forEach((f, i) => { const o = ctx.createOscillator(); o.frequency.value = f; const og = ctx.createGain(); og.gain.value = 0.25 / (i + 1); o.connect(og).connect(g); o.start(); nodes.push(o); });
    } else if (kind === 'growl') {
      // creature breathing/growl: low saw with noisy AM + formant filter
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 58;
      const fm = ctx.createOscillator(); fm.frequency.value = 0.3; const fmg = ctx.createGain(); fmg.gain.value = 12; fm.connect(fmg).connect(o.frequency); fm.start();
      const n = ctx.createBufferSource(); n.buffer = this.brownBuf; n.loop = true;
      const am = ctx.createGain(); am.gain.value = 0;
      const ng = ctx.createGain(); ng.gain.value = 3.5; n.connect(ng).connect(am.gain);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 2.5;
      const breath = ctx.createBufferSource(); breath.buffer = this.pinkBuf; breath.loop = true;
      const bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 700; bf.Q.value = 1.5;
      const bAm = ctx.createGain(); bAm.gain.value = 0.0;
      const bl = ctx.createOscillator(); bl.frequency.value = 0.42; const blg = ctx.createGain(); blg.gain.value = 0.45; bl.connect(blg).connect(bAm.gain); bl.start();
      o.connect(am).connect(f).connect(g); n.start(); o.start();
      breath.connect(bf).connect(bAm).connect(g); breath.start();
      nodes.push(o, fm, n, breath, bl);
      g._growlOsc = o;
    }
    let stopped = false;
    return {
      setPos: (p) => AudioEngine.setPannerPos(sp.panner, p, ctx),
      setOcclusion: (o) => sp.occl.frequency.setTargetAtTime(o ? 650 : 18000, ctx.currentTime, 0.15),
      setVolume: (v) => g.gain.setTargetAtTime(v, ctx.currentTime, 0.2),
      setPitch: (m) => g._growlOsc && g._growlOsc.frequency.setTargetAtTime(58 * m, ctx.currentTime, 0.3),
      stop: () => { if (stopped) return; stopped = true; g.gain.setTargetAtTime(0, ctx.currentTime, 0.1); setTimeout(() => nodes.forEach((n) => { try { n.stop(); } catch {} }), 600); },
    };
  }
}
