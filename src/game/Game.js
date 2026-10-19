import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Renderer, QUALITY } from '../render/Renderer.js';
import { Input } from '../core/Input.js';
import { AudioEngine } from '../core/Audio.js';
import { Assets, MODEL_IDS } from '../world/Assets.js';
import { Level, REGIONS } from '../world/Level.js';
import { Props } from '../world/Props.js';
import { Player } from '../player/Player.js';
import { Flashlight } from '../player/Flashlight.js';
import { Monster } from '../ai/Monster.js';
import { Interaction } from './Interaction.js';
import { Story } from './Story.js';
import { UI } from '../ui/UI.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

const SETTINGS_KEY = 'ashgrove.settings';
function loadSettings() {
  try { return { quality: 'high', sens: 1, vol: 0.9, gamma: 1, invert: false, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; }
  catch { return { quality: 'high', sens: 1, vol: 0.9, gamma: 1, invert: false }; }
}

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.state = 'loading';     // loading | menu | playing | paused | overlay | dead | ending
    this.settings = loadSettings();
    if (params.get('quality')) this.settings.quality = params.get('quality');
    this.ui = new UI();
    this.input = new Input(canvas);
    this.audio = new AudioEngine();
    this.clock = new THREE.Clock();
    this.time = 0;
    this.fear = 0;
    this.damage = 0;
  }

  async boot() {
    const ui = this.ui;
    ui.screen('loading');
    const fill = $('loadFill'), text = $('loadText');
    const prog = { tex: 0, models: 0, audio: 0, creature: 0 };
    const upd = () => { const p = prog.tex * 0.3 + prog.models * 0.45 + prog.audio * 0.15 + prog.creature * 0.1; fill.style.width = `${Math.round(p * 100)}%`; };

    this.renderer = new Renderer(this.canvas);
    const r = this.renderer.renderer;
    this.assets = new Assets(r);
    this.assets.aniso = Math.min(QUALITY[this.settings.quality].aniso, r.capabilities.getMaxAnisotropy());
    this.assets.manager.onProgress = (_u, l, t) => { prog.tex = l / t; upd(); };

    await document.fonts.load('20px "Homemade Apple"').catch(() => {});
    await document.fonts.load('20px "Special Elite"').catch(() => {});

    // Scene
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(0x010101);
    scene.fog = new THREE.FogExp2(0x030304, 0.075);
    const pmrem = new THREE.PMREMGenerator(r);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.09;
    scene.add(new THREE.HemisphereLight(0x2a3346, 0x0d0a08, 0.2));

    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.04, 80);
    scene.add(this.camera);

    text.textContent = 'Opening the house…';
    // pre-request all level textures so the loading manager counts them
    for (const R of Object.values(REGIONS)) { this.assets.textureSet(R.wall); this.assets.textureSet(R.floor); this.assets.textureSet(R.ceil); }
    ['dark_wood', 'rusty_metal_02', 'wood_peeling_paint_weathered', 'wooden_panels', 'damaged_concrete_floor', 'worn_plaster_wall'].forEach((t) => this.assets.textureSet(t));

    await Promise.all([
      this.assets.loadModels(MODEL_IDS, (p) => { prog.models = p; upd(); text.textContent = 'Arranging the furniture…'; }),
      this.assets.loadCreature().then(() => { prog.creature = 1; upd(); }),
      this.audio.init((p) => { prog.audio = p; upd(); }),
    ]);
    await new Promise((res) => { if (this.assets.manager.itemsLoaded >= this.assets.manager.itemsTotal) res(); else this.assets.manager.onLoad = res; setTimeout(res, 15000); });

    text.textContent = 'Something is waking up…';
    this.buildWorld();
    this.renderer.setup(scene, this.camera, this.settings.quality);
    this.applySettings();
    // warm up shaders
    this.renderer.renderer.compile(scene, this.camera);
    this.player.updateCamera(0);
    this.renderer.render(0.016);
    prog.tex = prog.models = prog.audio = prog.creature = 1; upd();

    this.bindUI();
    this.loop();

    if (params.has('debug')) { this.startGame(); return; }
    ui.screen('menu');
    this.state = 'menu';
    ui.fade(0.35, 2);
    this.menuCam();
  }

  buildWorld() {
    const q = QUALITY[this.settings.quality];
    this.level = new Level(this.scene, this.assets, this.audio);
    this.level.build();
    this.props = new Props(this.level, this.assets, this.scene, q);
    this.props.populate();
    this.level.onNoise = (p, r) => this.onNoise(p, r);

    this.player = new Player(this.camera, this.level, this.input, this.audio);
    this.player.onNoise = (p, r) => this.onNoise(p, r);
    this.flashlight = new Flashlight(this.scene, this.camera, this.assets, q);
    this.monster = new Monster(this.scene, this.assets, this.level, this.audio);
    this.monster.player = this.player;
    this.monster.onKill = () => this.die();
    this.monster.onSpot = () => { this.player.shake = Math.max(this.player.shake, 0.6); this.audio.stinger(0.55); };
    this.interact = new Interaction(this.camera, this.level);
    this.story = new Story(this);
    this.story.setup();
    this.player.spawn(6.6, 3.1, Math.PI / 2 + 0.25);
  }

  onNoise(pos, radius) { this.monster?.hearNoise(pos, radius); }

  // slow drift for the menu background
  menuCam() {
    this.player.spawn(16.5, 7.5 + 3.0, 0);
    this.camera.position.set(14.2, 1.65, 9.0);
    this.camera.rotation.set(-0.05, -2.45, 0, 'YXZ');
    this.flashlight.has = true; this.flashlight.on = true;
  }

  // ---------- UI wiring ----------
  bindUI() {
    const ui = this.ui;
    let settingsFrom = 'menu';
    $('btnStart').onclick = () => this.startGame();
    $('btnSettings').onclick = () => { settingsFrom = 'menu'; ui.screen('settings'); };
    $('btnCredits').onclick = () => ui.screen('credits');
    $('btnCreditsBack').onclick = () => ui.screen('menu');
    $('btnPauseSettings').onclick = () => { settingsFrom = 'pause'; ui.screen('settings'); };
    $('btnSettingsBack').onclick = () => { this.saveSettings(); ui.screen(settingsFrom); };
    $('btnResume').onclick = () => this.resume();
    $('btnRestart').onclick = () => this.respawn();
    $('btnRetry').onclick = () => this.respawn();
    $('btnAgain').onclick = () => location.reload();

    const s = this.settings;
    $('optQuality').value = s.quality; $('optSens').value = s.sens; $('optVol').value = s.vol; $('optGamma').value = s.gamma; $('optInvert').checked = s.invert;
    ['optSens', 'optVol', 'optGamma', 'optInvert'].forEach((id) => { $(id).oninput = () => { this.readSettings(); this.applySettings(); }; });
    $('optQuality').onchange = () => { this.readSettings(); this.saveSettings(); this.ui.hint('Quality change applies on reload', 3); };

    this.input.onLockChange = (locked) => {
      if (!locked && this.state === 'playing') {
        if (this.ui.overlay === 'note') this.closeOverlay(false);
        this.pause();
      }
    };
    this.canvas.addEventListener('click', () => { if (this.state === 'playing' && !this.input.locked) this.input.lock(); });
    addEventListener('keydown', (e) => {
      if (this.state === 'overlay') {
        if (e.code === 'Escape' || (e.code === 'KeyE' && this.ui.overlay === 'note')) { this.closeOverlay(e.code === 'KeyE'); }
        if (this.ui.overlay === 'clock') {
          if (e.code === 'ArrowUp' || e.code === 'ArrowRight') this.ui._clockAdj(e.shiftKey ? 'h+' : 'm+');
          if (e.code === 'ArrowDown' || e.code === 'ArrowLeft') this.ui._clockAdj(e.shiftKey ? 'h-' : 'm-');
          if (e.code === 'Enter') this.ui._clockTry();
        }
        if (this.ui.overlay === 'lock' && e.code === 'Enter') this.ui._lockTry();
      }
    });
    addEventListener('wheel', (e) => { if (this.state === 'overlay' && this.ui.overlay === 'clock') this.ui._clockAdj(e.deltaY > 0 ? 'm+' : 'm-'); }, { passive: true });
  }

  readSettings() {
    const s = this.settings;
    s.quality = $('optQuality').value; s.sens = +$('optSens').value; s.vol = +$('optVol').value; s.gamma = +$('optGamma').value; s.invert = $('optInvert').checked;
  }
  saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch {} }
  applySettings() {
    const s = this.settings;
    this.input.sensitivity = s.sens;
    this.input.invertY = s.invert;
    this.audio.setVolume(s.vol);
    if (this.renderer.film) this.renderer.film.uniforms.uGamma.value = s.gamma;
  }

  // ---------- flow ----------
  startGame() {
    const ui = this.ui;
    this.audio.resume();
    if (!this.started) {
      this.started = true;
      this.audio.startAmbience();
      this.flashlight.has = false; this.flashlight.on = false;
      this.player.spawn(6.6, 3.1, Math.PI / 2 + 0.25);
      this.applyDebug();
      this.story.objective();
      ui.fade(1, 0.01);
      setTimeout(() => {
        ui.fade(0, 4);
        ui.think('…my head. How long was I asleep?', 4);
        setTimeout(() => ui.hint('<b>WASD</b> move &nbsp;·&nbsp; <b>E</b> interact &nbsp;·&nbsp; <b>Shift</b> sprint &nbsp;·&nbsp; <b>C</b> crouch', 7), 3500);
      }, 600);
    }
    ui.screen(null);
    ui.show('hud', true);
    this.state = 'playing';
    if (!params.has('nolock')) this.input.lock();
  }

  applyDebug() {
    if (!params.has('debug')) return;
    const fl = params.get('flags');
    if (fl) for (const f of fl.split(',')) {
      if (f === 'flashlight') { this.story.flags.flashlight = true; this.story.pickups.flashlight.visible = false; this.flashlight.give(); }
      else if (f === 'power') { this.story.fusesPlaced = 3; this.story.powerOn(); }
      else if (f === 'cellar') { const d = this.level.doorById('cellar'); d.locked = null; this.story.flags.cellarOpen = true; }
      else if (f === 'gate') { const d = this.level.doorById('gate'); d.locked = null; this.story.flags.gateOpen = true; }
      else this.story.flags[f] = true;
    }
    const pos = params.get('pos');
    if (pos) { const [x, z, yaw] = pos.split(',').map(Number); this.player.spawn(x, z, yaw || 0); }
    const ph = params.get('monster');
    if (ph) { const [x, z, p] = ph.split(',').map(Number); this.monster.spawn(new THREE.Vector3(x, 0, z), p || 1); }
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.ui.screen('pause');
    this.audio.ctx?.suspend();
  }
  resume() {
    this.audio.resume();
    this.ui.screen(null);
    this.state = 'playing';
    this.input.lock();
  }

  openNote(note) {
    this.ui.openNote(note);
    this.state = 'overlay';
  }
  openClockPuzzle() {
    this.state = 'overlay';
    this.input.unlock();
    this.audio.play('creak2', { volume: 0.4, rate: 1.4 });
    this.ui.openClock(this.story.clock, () => this.story.clockChanged(), () => this.story.clockTry());
  }
  openLockPuzzle() {
    this.state = 'overlay';
    this.input.unlock();
    this.audio.play('metalLatch', { volume: 0.5 });
    this.lockDigits = this.lockDigits || [0, 0, 0, 0];
    this.ui.openLock(this.lockDigits, () => this.audio.play('metalClick', { volume: 0.3, rate: 1.6 }), () => this.story.tryCode(this.lockDigits));
  }
  closeOverlay(relock = true) {
    const was = this.ui.overlay;
    this.ui.closeOverlay();
    if (this.state !== 'overlay') return;
    this.state = 'playing';
    if (was === 'note') this.audio.play('bookFlip1', { volume: 0.4, rate: 1.2 });
    if (!this.input.locked) {
      if (relock) this.input.lock();
      if (!this.input.locked) setTimeout(() => { if (!this.input.locked && this.state === 'playing') this.pause(); }, 120);
    }
  }

  hide(spot) {
    if (this.player.hidden) return;
    // seen hiding during a chase = it knows exactly where you are
    this.monster.sawHide = this.monster.state === 'chase' && this.monster.canSee;
    this.player.enterHide(spot);
    this.lightBeforeHide = this.flashlight.on;
    if (this.flashlight.on) this.flashlight.toggle(this.audio);
    this.ui.setHidden(true);
    this.audio.setMuffled(true);
    this.ui.hint('[E] leave the wardrobe', 3);
  }
  unhide() {
    this.player.exitHide();
    if (this.lightBeforeHide && !this.flashlight.on) this.flashlight.toggle(this.audio);
    this.ui.setHidden(false);
    this.audio.setMuffled(false);
    this.monster.sawHide = false;
  }

  die() {
    if (this.state === 'dead') return;
    this.state = 'dead';
    const p = this.player, m = this.monster;
    if (p.hidden) { p.hidden = null; this.ui.setHidden(false); this.audio.setMuffled(false); }
    p.frozen = true;
    this.audio.jumpscare();
    // creature lunges into the camera
    const cam = this.camera.position.clone();
    const dir = new THREE.Vector3().subVectors(m.pos, cam).setY(0).normalize();
    m.pos.copy(cam).addScaledVector(dir, 0.75).setY(cam.y - 2.08);
    m.heading = Math.atan2(-dir.x, -dir.z);
    p.lookTarget = m.headPivot.getWorldPosition(new THREE.Vector3()).setY(cam.y + 0.05);
    p.shake = 1.4;
    this.damage = 1;
    this.flashlight.flicker = 1;
    this.deathT = 0;
    const token = this.deathToken = (this.deathToken || 0) + 1;
    setTimeout(() => {
      if (this.deathToken !== token || this.state !== 'dead') return;
      this.ui.fade(1, 0.15);
      setTimeout(() => {
        if (this.deathToken !== token || this.state !== 'dead') return;
        this.input.unlock();
        this.ui.show('hud', false);
        const tips = [
          'It follows the light. Switch the flashlight off [F] when it is near.',
          'Running is loud. Crouch [C] to move silently.',
          'If it sees you enter a wardrobe, it will drag you out. Break line of sight first.',
          'Doors slow it down for a moment — and it can hear them open.',
          'Your flashlight flickers when it is close.',
        ];
        $('deathTip').textContent = tips[Math.floor(Math.random() * tips.length)];
        this.ui.screen('death');
        this.audio.ctx?.suspend();
      }, 900);
    }, 1300);
  }

  respawn() {
    this.audio.resume();
    this.player.frozen = false;
    this.player.lookTarget = null;
    this.damage = 0;
    this.flashlight.flicker = 0;
    if (!this.story.restore()) this.player.spawn(6.6, 3.1, Math.PI / 2);
    this.ui.screen(null);
    this.ui.show('hud', true);
    this.state = 'playing';
    this.ui.fade(1, 0.01);
    setTimeout(() => this.ui.fade(0, 2.5), 200);
    this.ui.think('…I woke again. The same night.', 3.5);
    if (!params.has('nolock')) this.input.lock();
  }

  ending() {
    if (this.state === 'ending') return;
    const A = this.audio, door = this.level.doorById('front');
    this.state = 'cutscene';
    this.player.frozen = true;
    A.play('impactMetal_heavy_000', { volume: 1, rate: 1.2 });
    A.play('metalLatch', { volume: 1, delay: 0.25 });
    door.chain.visible = false;
    door.locked = null;
    setTimeout(() => {
      door.speed = 0.6; door.sign = 1; door.target = 1.6;
      A.creak({ pos: door.center, volume: 0.8, dur: 3, base: 150 });
      // dawn light pours in
      const dawn = new THREE.PointLight(0xfff1dc, 0, 30, 1.2);
      dawn.position.set(6.75, 1.4, 26.5);
      this.scene.add(dawn);
      this.dawn = dawn;
      this.monster.despawn();
      A.amb.gain.setTargetAtTime(0, A.ctx.currentTime, 1.5);
    }, 900);
    setTimeout(() => {
      this.ui.el.fade.style.background = '#f6efe2';
      this.ui.fade(1, 3.5);
    }, 2600);
    setTimeout(() => {
      this.input.unlock();
      this.state = 'ending';
      this.ui.show('hud', false);
      this.ui.el.fade.style.background = '#000';
      $('endText').innerHTML = 'The chain falls. Grey morning light floods the foyer and you run, and you do not look back.<br><br>Behind you, very softly, the front door of Ashgrove House closes itself — and somewhere inside, a clock begins to tick again.<br><br><i>Thank you for playing.</i>';
      this.ui.screen('ending');
    }, 6800);
  }

  // ---------- main loop ----------
  loop() {
    requestAnimationFrame(() => this.loop());
    const dt = Math.min(0.05, this.clock.getDelta());
    this.time += dt;
    const t = this.time;
    const playing = this.state === 'playing';
    const inp = this.input;

    if (this.state === 'menu') {
      // slow drifting camera in the parlour
      this.camera.rotation.y = -2.45 + Math.sin(t * 0.08) * 0.25;
      this.camera.position.y = 1.65 + Math.sin(t * 0.5) * 0.01;
      this.flashlight.update(dt, t, 5);
      this.props.update(dt, t, false);
      this.renderer.render(dt);
      inp.endFrame();
      return;
    }

    if (playing || this.state === 'dead' || this.state === 'cutscene') {
      if (playing) {
        if (inp.hit('KeyF')) this.flashlight.toggle(this.audio);
        if (inp.hit('Tab')) this.ui.showInventory(4);
        if (this.player.hidden && (inp.hit('KeyE') || inp.hit('Mouse0'))) this.unhide();
        else {
          const cur = this.interact.update();
          this.ui.setPrompt(cur?.prompt);
          if (cur && (inp.hit('KeyE') || inp.hit('Mouse0'))) cur.item.use();
        }
      } else this.ui.setPrompt(null);

      this.player.update(dt);
      this.level.update(dt);
      this.monster.update(dt, t, this.player, this.flashlight);
      if (this.state === 'dead') {
        // keep the creature's face in view during the jumpscare
        this.deathT += dt;
        const cam = this.camera.position;
        const f = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).setY(0).normalize();
        this.monster.pos.set(cam.x + f.x * (0.95 - this.deathT * 0.4), cam.y - 2.12, cam.z + f.z * (0.95 - this.deathT * 0.4));
        this.monster.heading = Math.atan2(-f.x, -f.z);
        this.monster.headTilt = 0.1;
      }
      if (this.dawn) this.dawn.intensity = Math.min(40, this.dawn.intensity + dt * 12);
      this.story.update(dt, t);

      // fear model
      const m = this.monster;
      let fear = 0;
      if (m.active) {
        const d = m.pos.distanceTo(this.player.pos);
        fear = THREE.MathUtils.clamp(1 - d / 16, 0, 1) * (m.canSee ? 1 : 0.55);
        if (m.state === 'chase') fear = Math.max(fear, 0.75);
        this.flashlight.flicker = this.state === 'dead' ? 1 : d < 9 ? (1 - d / 9) * 0.8 : 0;
      }
      if (this.player.hidden && m.active) fear = Math.max(fear, 0.3 * THREE.MathUtils.clamp(1 - m.pos.distanceTo(this.player.pos) / 10, 0, 1) + 0.15);
      this.fear += (fear - this.fear) * Math.min(1, dt * 2);
      const exhaustion = this.player.exhausted ? 1 : Math.max(0, 0.7 - this.player.stamina) * (this.player.sprinting ? 1.2 : 0.8);
      this.audio.update(dt, this.fear, exhaustion);

      // listener
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
      this.audio.setListener(this.camera.position, fwd, up);

      this.props.update(dt, t, this.story.power);
      this.flashlight.update(dt, t, this.interact.probe(this.camera.position, this.flashlight.dir));
      this.ui.setMeters(this.player.stamina, this.flashlight.battery, this.flashlight.has);
    }

    // post FX state
    const film = this.renderer.film?.uniforms;
    if (film) {
      this.damage = Math.max(0, this.damage - dt * 0.4);
      film.uFear.value = this.fear;
      film.uDamage.value = this.state === 'dead' ? 0.9 : this.damage;
      film.uHidden.value = this.player?.hidden ? 1 : 0;
      film.uVignette.value = this.player?.hidden ? 0.85 : 0.55;
    }
    this.ui.setDamage(this.state === 'dead' ? 0.6 : 0);
    this.ui.update(dt);
    this.renderer.render(dt);
    inp.endFrame();
  }
}
