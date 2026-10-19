import * as THREE from 'three';
import { CELLAR_Y } from '../world/Level.js';
import { canvasPlane } from '../world/Props.js';

const brass = () => new THREE.MeshStandardMaterial({ color: 0xa8864f, metalness: 1, roughness: 0.32 });

const ITEMS = {
  flashlight: 'Flashlight',
  cellar_key: 'Ornate cellar key',
  fuse: 'Ceramic fuse',
  bolt_cutters: 'Bolt cutters',
};

// ---------- procedural item meshes ----------
function keyMesh() {
  const g = new THREE.Group(); const m = brass();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.005, 8, 20), m); ring.position.x = -0.05; g.add(ring);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.09, 8), m); shaft.rotation.z = Math.PI / 2; shaft.position.x = 0.01; g.add(shaft);
  [0.04, 0.052].forEach((x, i) => { const t = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.016 + i * 0.006, 0.004), m); t.position.set(x, -0.01, 0); g.add(t); });
  g.rotation.x = -Math.PI / 2;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function fuseMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.06, 14), new THREE.MeshStandardMaterial({ color: 0xe4ded0, roughness: 0.3 }));
  g.add(body);
  for (const s of [-1, 1]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.0155, 0.0155, 0.012, 14), brass()); c.position.y = s * 0.034; g.add(c); }
  g.rotation.z = Math.PI / 2;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function batteryMesh() {
  const g = new THREE.Group();
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const x = c.getContext('2d'); x.fillStyle = '#7a1c12'; x.fillRect(0, 0, 128, 64); x.fillStyle = '#e8d9a8'; x.font = 'bold 22px serif'; x.fillText('EVEREADY', 10, 30); x.fillStyle = '#111'; x.fillRect(0, 44, 128, 20);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.06, 16), new THREE.MeshStandardMaterial({ map: t, roughness: 0.45, metalness: 0.2 }));
  g.add(body);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.006, 8), brass()); tip.position.y = 0.033; g.add(tip);
  g.rotation.z = Math.PI / 2;
  return g;
}
function paperMesh(w = 0.21, h = 0.28) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 170;
  const g = c.getContext('2d');
  g.fillStyle = '#d8ccab'; g.fillRect(0, 0, 128, 170);
  g.strokeStyle = 'rgba(40,30,20,.55)'; g.lineWidth = 1.2;
  for (let y = 22; y < 160; y += 9) { g.beginPath(); g.moveTo(12, y); for (let x = 12; x < 116; x += 6) g.lineTo(x, y + Math.random() * 2); g.stroke(); }
  const grd = g.createRadialGradient(64, 85, 30, 64, 85, 110); grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(80,50,15,.4)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 170);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  return m;
}

function drawChildDrawing(g, w, h) {
  g.fillStyle = '#ece6d4'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2000; i++) { g.fillStyle = `rgba(120,100,60,${Math.random() * 0.05})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  const crayon = (col, wd, pts) => { g.strokeStyle = col; g.lineWidth = wd; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); pts.forEach(([x, y], i) => { const jx = x * w + (Math.random() - 0.5) * 3, jy = y * h + (Math.random() - 0.5) * 3; i ? g.lineTo(jx, jy) : g.moveTo(jx, jy); }); g.stroke(); };
  // big mirror frame
  g.save();
  g.strokeStyle = '#8a6a1c'; g.lineWidth = 10; g.beginPath(); g.ellipse(w * 0.5, h * 0.44, w * 0.27, h * 0.33, 0, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(150,180,200,.25)'; g.fill();
  g.restore();
  // clock inside mirror showing (mirrored) 8:45
  const cx = w * 0.5, cy = h * 0.42, r = w * 0.13;
  g.strokeStyle = '#2b1a0a'; g.lineWidth = 6; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#2b1a0a'; g.font = `${r * 0.32}px "Homemade Apple"`; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 1; i <= 12; i++) { const a = (i / 12) * Math.PI * 2; g.fillText(String(i), cx + Math.sin(a) * r * 0.76, cy - Math.cos(a) * r * 0.76); }
  const hand = (ang, len, wd) => crayon('#111', wd, [[cx / w, cy / h], [(cx + Math.sin(ang) * len) / w, (cy - Math.cos(ang) * len) / h]]);
  hand((8.75 / 12) * Math.PI * 2, r * 0.42, 9);
  hand((45 / 60) * Math.PI * 2, r * 0.8, 4);
  // stick figures: mommy lying down, tall man behind
  crayon('#b02020', 5, [[0.16, 0.86], [0.34, 0.86]]);
  crayon('#b02020', 5, [[0.13, 0.86], [0.13, 0.85]]);
  g.beginPath(); g.strokeStyle = '#b02020'; g.lineWidth = 5; g.arc(w * 0.12, h * 0.85, 12, 0, 7); g.stroke();
  crayon('#111', 6, [[0.82, 0.18], [0.82, 0.75]]);
  crayon('#111', 5, [[0.82, 0.32], [0.70, 0.62]]); crayon('#111', 5, [[0.82, 0.32], [0.94, 0.62]]);
  crayon('#111', 5, [[0.82, 0.75], [0.76, 0.95]]); crayon('#111', 5, [[0.82, 0.75], [0.88, 0.95]]);
  g.beginPath(); g.fillStyle = '#111'; g.arc(w * 0.82, h * 0.14, 16, 0, 7); g.fill();
  g.fillStyle = '#ece6d4'; g.beginPath(); g.arc(w * 0.815, h * 0.135, 4, 0, 7); g.arc(w * 0.828, h * 0.135, 4, 0, 7); g.fill();
  // crayon text
  g.fillStyle = '#7a1010'; g.font = `${w * 0.045}px "Homemade Apple"`; g.textAlign = 'left';
  g.fillText('MOMMY WENT TO SLEEP', w * 0.05, h * 0.06);
  g.fillText('WHEN THE CLOK SAID THIS', w * 0.05, h * 0.12);
  g.fillStyle = '#1a2a6a'; g.font = `${w * 0.035}px "Homemade Apple"`;
  g.fillText('i saw it in my mirror', w * 0.42, h * 0.95);
  g.fillText('- clara', w * 0.42, h * 0.99);
}

export const NOTES = {
  wake: { style: 'hand', html: `<h3>— a torn page, in your own handwriting —</h3>
    <p>If you are reading this, then you are me, and you have forgotten again.</p>
    <p>It happens every night. You wake in the big bed and the house has eaten another day.</p>
    <p>Listen. <b>I chained the front door myself</b>, so that it could never get out. I threw away the key. The <b>bolt cutters are in the cellar workshop</b>.</p>
    <p>It walks the halls. It is tall and it is <i>wrong</i>. It follows the light — and it hears you run.</p>
    <p>If it sees you, break its line of sight and <b>hide in a wardrobe</b>. Stay quiet. Crouch.</p>
    <p class="blood">Don't trust the mirrors.</p>` },
  diary: { style: 'hand', html: `<h3>Margaret Ashgrove — 3rd November, 1961</h3>
    <p>Clara will not sleep unless the mirror over her crib faces the hall, so she can watch the great clock in the study. She says the tall man stands behind it — but only in the reflection.</p>
    <p>Edmund has been in the cellar every night this month. He says he has found a way to keep what lives here bound to the house. That it only needs <i>one of us</i>.</p>
    <p>He has rigged the grandfather clock so it will only open at <b>the hour it happens</b>. He would not tell me which hour.</p>
    <p>I think he means me.</p>` },
  journal: { style: 'hand', html: `<h3>E. Ashgrove — ledger, final entry</h3>
    <p>It is done. Margaret is gone and the thing is quiet. God forgive me.</p>
    <p>Every clock in the house stopped the moment she died. The <b>cellar key</b> rests in the belly of the grandfather clock — set its hands to that hour and the case will give it up. I will not write the hour here.</p>
    <p>Only Clara saw it happen. Clara always sees. But she only ever looks at the world <b>through her mirror</b>.</p>
    <p>The house is hungry again.</p>` },
  fuses: { style: 'type', html: `<h3>ASHGROVE HOUSE — ELECTRICAL</h3>
    <p>Main board: cellar, north wall. Requires three (3) ceramic fuses.</p>
    <p style="font-family:'Homemade Apple';line-height:2">Pulled them so it can't use the lights against me. Hid them — one in the guest room luggage, one in the kitchen drawers, one down by the boiler.</p>` },
  tv: { style: 'hand', html: `<p>Changed the cage combination so I'd stop opening it in my sleep.</p>
    <p>I can't keep numbers in my head anymore, so I gave them to the old set. When the house has <b>power</b>, the television will show them, between the snow.</p><p>— E.</p>` },
  door: { style: 'hand', html: `<p>Don't. Don't open it. If it gets past this door it will never stop.</p>
    <p>…but if you have to — if you <i>remember</i> who you are — use the cutters. Cut it and run toward the light and don't look back.</p>` },
};

export class Story {
  constructor(game) {
    this.g = game;
    this.flags = {};
    this.inventory = [];
    this.fusesHeld = 0;
    this.fusesPlaced = 0;
    this.code = Array.from({ length: 4 }, () => 1 + Math.floor(Math.random() * 9));
    this.clock = { h: 12, m: 0 };
    this.clockFails = 0;
    this.ambientT = 20;
    this.pickups = {};
    this.triggers = [];
    this.power = false;
    this.tvT = 0;
  }

  has(id) { return this.inventory.some((i) => i.id === id); }
  give(id) {
    if (id === 'fuse') { this.fusesHeld++; this._invRefresh('fuse'); return; }
    if (!this.has(id)) this.inventory.push({ id, name: ITEMS[id] });
    this._invRefresh(id);
  }
  take(id) { this.inventory = this.inventory.filter((i) => i.id !== id); this._invRefresh(); }
  _invRefresh(newId) {
    const items = this.inventory.map((i) => ({ ...i }));
    if (this.fusesHeld > 0) items.push({ id: 'fuse', name: `Ceramic fuse ×${this.fusesHeld}` });
    this.g.ui.setInventory(items, newId);
  }

  // ---------- world setup ----------
  setup() {
    const g = this.g, P = g.props.named, I = g.interact, A = g.audio, ui = g.ui;
    const scene = g.scene;
    const addPickup = (id, obj, x, y, z, prompt, onTake, opts = {}) => {
      obj.position.set(x, y, z);
      if (opts.rotY) obj.rotation.y = opts.rotY;
      scene.add(obj);
      this.pickups[id] = obj;
      I.add(obj, {
        prompt: () => (this.flags[id] ? null : prompt),
        use: () => { this.flags[id] = true; obj.visible = false; onTake(); },
        range: opts.range ?? 2.0,
      });
      return obj;
    };
    const addNote = (id, obj, x, y, z, rotY = 0) => {
      obj.position.set(x, y, z);
      obj.rotation.z = rotY;
      scene.add(obj);
      I.add(obj, {
        prompt: () => 'Read',
        use: () => { A.play('bookFlip1', { volume: 0.7 }); g.openNote(NOTES[id] || this.extraNotes[id]); this.onRead(id); },
      });
    };

    // --- flashlight on nightstand ---
    const fl = g.assets.model('vintage_flashlight');
    fl.rotation.y = 0.6;
    addPickup('flashlight', fl, 4.45, 0.705, 0.42, 'Take flashlight', () => {
      g.flashlight.give();
      A.play('metalClick', { volume: 0.8 });
      ui.think('An old flashlight. The batteries won\'t last forever — [F] to switch it off and on.');
      this.objective();
      this.checkpoint();
    });

    // --- notes ---
    addNote('wake', paperMesh(), 0.42, 0.836, 4.35, 0.25);
    this.extraNotes = {
      drawing: { style: 'drawing', html: '' },
    };
    // child's drawing pinned to the nursery wall
    const draw = canvasPlane(0.5, 0.62, drawChildDrawing, { px: 700, transparent: false });
    draw.position.set(18 - 0.08, 1.35, 3.1); draw.rotation.y = -Math.PI / 2;
    scene.add(draw);
    this.extraNotes.drawing.html = `<img src="${draw.userData.canvas.toDataURL()}" alt="A child's crayon drawing: a clock seen in a mirror" />`;
    I.add(draw, { prompt: () => 'Look at the drawing', use: () => { A.play('handleSmallLeather', { volume: 0.5 }); g.openNote(this.extraNotes.drawing); this.onRead('drawing'); } });

    addNote('diary', paperMesh(0.18, 0.24), 19.3, 0.47, 4.6, 0.6);
    addNote('journal', paperMesh(), 6.35, 0.836, 11.95, -0.2);
    addNote('fuses', paperMesh(), 19.0, 0.785, 20.0, 0.4);
    addNote('tv', paperMesh(0.15, 0.2), 19.6, 0.56, 16.05, 0.3);
    const doorNote = paperMesh(0.2, 0.26); doorNote.rotation.set(0, Math.PI, 0);
    addNote('door', doorNote, 5.35, 1.45, 25.5 - 0.085, 0);

    // --- grandfather clock puzzle ---
    const clock = P.clock;
    this.clockHands = { hour: clock.getObjectByName('vintage_grandfather_clock_01_HourHand'), minute: clock.getObjectByName('vintage_grandfather_clock_01_MinuteHand') };
    this._setClockHands();
    I.add(clock, {
      prompt: () => (this.flags.clockSolved ? null : 'Examine the clock'),
      use: () => g.openClockPuzzle(),
    });
    this.tickT = 0;

    // cellar key (appears when solved)
    const key = keyMesh();
    key.visible = false;
    addPickup('cellar_key', key, 6.2, 0.012, 8.2, 'Take the key', () => {
      this.give('cellar_key');
      A.play('metalClick', { volume: 0.7 });
      this.startPhase(1);
      this.objective();
    });

    // --- fuses ---
    I.add(P.suitcase, {
      prompt: () => (this.flags.fuseSuitcase ? null : 'Search the luggage'),
      use: () => { this.flags.fuseSuitcase = true; A.play('cloth2', { volume: 0.8 }); A.play('metalClick', { volume: 0.5, delay: 0.5 }); this.give('fuse'); ui.think('A ceramic fuse, wrapped in a child\'s sock.'); this.objective(); },
    });
    I.add(P.kitchenDrawers, {
      prompt: () => (this.flags.fuseDrawer ? null : 'Search the drawers'),
      use: () => { this.flags.fuseDrawer = true; A.play('impactPlank_medium_000', { volume: 0.5 }); A.play('metalClick', { volume: 0.5, delay: 0.4 }); this.give('fuse'); ui.think('Cutlery, string... a fuse.'); g.onNoise(g.player.pos.clone(), 5); this.objective(); },
    });
    addPickup('fuseBoiler', fuseMesh(), 27.3, CELLAR_Y + 0.88, 36.9, 'Take the fuse', () => { this.give('fuse'); A.play('metalClick', { volume: 0.6 }); this.objective(); });

    // --- fuse box ---
    const fb = P.fuseBox;
    this.fuseDoor = fb.getObjectByName('power_box_01_door');
    I.add(fb, {
      prompt: () => {
        if (this.power) return null;
        if (this.fusesHeld > 0) return `Insert fuse (${this.fusesPlaced}/3)`;
        return `Fuse board (${this.fusesPlaced}/3)`;
      },
      use: () => this.useFuseBox(),
    });

    // --- batteries ---
    [[21.0, 0.03, 1.2], [32.5, 1.0, 21.3], [32.2, CELLAR_Y + 0.85, 33.6], [10.2, CELLAR_Y + 0.03, 31.0]].forEach(([x, y, z], i) => {
      const id = 'battery' + i;
      addPickup(id, batteryMesh(), x, y, z, 'Take battery', () => {
        g.flashlight.battery = Math.min(1, g.flashlight.battery + 0.45);
        A.play('metalClick', { volume: 0.6 });
        ui.hint('Flashlight battery replaced', 2.5);
      });
    });

    // --- bolt cutters ---
    const bc = g.assets.model('bolt_cutters_01');
    bc.rotation.set(-Math.PI / 2, 0, 0.4);
    addPickup('bolt_cutters', bc, 32.4, CELLAR_Y + 0.84, 33.2, 'Take the bolt cutters', () => {
      this.give('bolt_cutters');
      A.play('impactMetal_light_001', { volume: 0.8 });
      this.startPhase(3);
      this.objective();
      this.checkpoint();
    }, { range: 2.2 });

    // --- TV ---
    I.add(P.tv, { prompt: () => (this.power ? 'Watch the screen' : 'Television (no power)'), use: () => { if (this.power) ui.think('Channel 3. Between the snow... numbers.'); } });

    // --- hide spots ---
    for (const spot of g.props.hideSpots) {
      I.add(spot.object, { prompt: () => (g.player.hidden ? null : 'Hide'), use: () => g.hide(spot) });
    }

    // --- doors ---
    for (const d of g.level.doors) {
      I.add(d.panel, {
        prompt: () => {
          if (d.locked === 'cellar_key') return this.has('cellar_key') ? 'Unlock with the ornate key' : 'Locked';
          if (d.locked === 'combo') return 'Combination lock';
          if (d.locked === 'chain') return this.has('bolt_cutters') ? 'Cut the chain' : 'Chained shut';
          return d.target > 0.1 ? 'Close' : 'Open';
        },
        use: () => this.useDoor(d),
        range: 2.3,
      });
    }

    // --- scripted triggers (region entries) ---
    this.triggers = [
      { id: 'hall', test: (p) => p.z > 6.1 && p.z < 7.5 && p.x < 9 && this.flags.flashlight, run: () => this.scareHallway() },
      { id: 'nursery', test: (p) => g.level.regionAt(p.x, p.z) === 'n', run: () => { const r = g.props.rockers[0]; r.amp = 1; A.creak({ pos: r.obj.position.clone().setY(0.6), volume: 0.5, dur: 2.5, base: 180 }); setTimeout(() => A.whisper({ pos: r.obj.position.clone().setY(1), volume: 0.4 }), 1800); } },
      { id: 'bath', test: (p) => g.level.regionAt(p.x, p.z) === 't', run: () => { A.knock(new THREE.Vector3(24, 1.4, 3), 3); g.ui.think('…someone is knocking. From inside the wall.', 3.5); } },
      { id: 'cellar', test: (p) => p.y < -2.5, run: () => { g.ui.think('Cold down here. It smells of wet brick… and something sweeter.'); this.flags.seenCellar = true; this.objective(); } },
      { id: 'parlour', test: (p) => g.level.regionAt(p.x, p.z) === 'l' && this.flags.flashlight, run: () => { A.play('impactGlass_heavy_000', { pos: new THREE.Vector3(27, 1, 12), volume: 0.7 }); } },
    ];
  }

  // ---------- puzzle logic ----------
  _setClockHands() {
    const { hour, minute } = this.clockHands;
    if (minute) minute.rotation.z = -(this.clock.m / 60) * Math.PI * 2;
    if (hour) hour.rotation.z = -((this.clock.h % 12) + this.clock.m / 60) / 12 * Math.PI * 2;
  }

  clockChanged() { this._setClockHands(); this.g.audio.tick(null, 0.4); }

  clockTry() {
    const g = this.g, A = g.audio;
    if (this.clock.h === 3 && this.clock.m === 15) {
      this.flags.clockSolved = true;
      g.closeOverlay();
      const pos = g.props.named.clock.position.clone().setY(1.6);
      A.chime(pos, 3);
      A.play('metalLatch', { pos, volume: 0.9, delay: 0.3 });
      const key = this.pickups.cellar_key;
      key.visible = true;
      // the key drops from the case
      key.position.y = 0.9;
      const fall = () => { key.position.y = Math.max(0.012, key.position.y - 0.05); if (key.position.y > 0.012) requestAnimationFrame(fall); else A.play('metalClick', { pos: key.position.clone(), volume: 0.8, rate: 0.8 }); };
      fall();
      g.ui.think('Something dropped from inside the clock case.');
    } else {
      this.clockFails++;
      A.play('metalClick', { volume: 0.6, rate: 0.7 });
      A.play('impactWood_heavy_001', { volume: 0.25, rate: 1.4 });
      const hints = [
        'The pendulum shudders, then stops. Wrong hour.',
        'Nothing. Margaret died at a particular hour… Clara saw it.',
        'Clara only ever saw the clock through her mirror. Her drawing would be… backwards.',
        'A mirror flips the clock face left to right. What would her drawing really read?',
      ];
      g.ui.think(hints[Math.min(this.clockFails - 1, hints.length - 1)], 5);
    }
  }

  useFuseBox() {
    const g = this.g, A = g.audio;
    if (!this.flags.sawFuseBox) { this.flags.sawFuseBox = true; this.objective(); }
    if (this.fuseDoor) this.fuseDoor.rotation.y = -1.6;
    if (this.fusesHeld <= 0) {
      A.play('metalLatch', { volume: 0.6 });
      g.ui.think(this.fusesPlaced ? `${3 - this.fusesPlaced} sockets still empty.` : 'Three empty fuse sockets. The house is dead without them.');
      return;
    }
    while (this.fusesHeld > 0 && this.fusesPlaced < 3) { this.fusesHeld--; this.fusesPlaced++; }
    this._invRefresh();
    A.play('metalClick', { volume: 0.9 }); A.play('metalClick', { volume: 0.8, delay: 0.25 });
    if (this.fusesPlaced >= 3) {
      setTimeout(() => this.powerOn(), 900);
      A.play('metalLatch', { volume: 1, delay: 0.6 });
    } else g.ui.think(`${3 - this.fusesPlaced} more fuse${3 - this.fusesPlaced > 1 ? 's' : ''}.`);
    this.objective();
  }

  powerOn() {
    const g = this.g, A = g.audio;
    this.power = true;
    A.powerUp();
    g.props.named.tvLight && (g.props.named.tvLight.on = true);
    this.tvHum = A.loop('static', g.props.named.tvScreen.position.clone(), 0.35);
    this.hum = A.loop('hum', new THREE.Vector3(14, CELLAR_Y + 2.4, 33.5), 0.08);
    g.ui.think('Lights… and somewhere upstairs, the hiss of a television.', 5);
    this.startPhase(2);
    // the surge is loud: it heard
    g.monster.hearNoise(g.player.pos.clone(), 60);
    this.objective();
    this.checkpoint();
  }

  tryCode(digits) {
    const g = this.g, A = g.audio;
    if (digits.join('') === this.code.join('')) {
      this.flags.gateOpen = true;
      const gate = g.level.doorById('gate');
      gate.locked = null;
      A.play('metalLatch', { volume: 1 });
      A.play('impactMetal_light_001', { volume: 0.7, delay: 0.2 });
      g.closeOverlay();
      gate.open(g.player.pos);
      this.objective();
    } else {
      A.play('metalLatch', { volume: 0.7, rate: 1.2 });
      g.ui.hint('The shackle doesn\'t budge.', 2);
    }
  }

  useDoor(d) {
    const g = this.g, A = g.audio;
    if (d.locked === 'cellar_key') {
      if (this.has('cellar_key')) {
        d.locked = null;
        A.play('metalLatch', { pos: d.center, volume: 1 });
        this.take('cellar_key');
        this.flags.cellarOpen = true;
        d.open(g.player.pos);
        this.objective();
      } else {
        d.rattle();
        this.flags.triedCellar = true;
        g.ui.think('Locked. The keyhole is ornate, old brass.');
        this.objective();
      }
      return;
    }
    if (d.locked === 'combo') { g.openLockPuzzle(); return; }
    if (d.locked === 'chain') {
      if (this.has('bolt_cutters')) { g.ending(); return; }
      d.rattle();
      this.flags.triedFront = true;
      g.ui.think(this.flags.wake ? 'The chain. I did this. I need the bolt cutters from the cellar.' : 'Chained shut from the inside, with a heavy padlock. Who would…');
      this.objective();
      return;
    }
    d.toggle(g.player.pos);
  }

  onRead(id) {
    this.flags[id] = true;
    this.objective();
  }

  // ---------- phases ----------
  startPhase(n) {
    const g = this.g, A = g.audio;
    if (n === 1 && !g.monster.active) {
      setTimeout(() => {
        A.screech({ pos: new THREE.Vector3(27, 2, 12), volume: 0.7, dur: 2.2 });
        A.stinger(0.5);
        g.ui.think('…that came from inside the house.', 4);
        g.monster.spawn(new THREE.Vector3(27.0, 0, 9.3), 1);
      }, 2600);
      this.checkpoint({ delayMonster: true });
    }
    if (n === 2) g.monster.setPhase(2);
    if (n === 3) {
      g.monster.setPhase(3);
      A.screech({ pos: g.player.pos.clone().add(new THREE.Vector3(0, 3, -8)), volume: 0.9, dur: 2.0 });
      A.stinger(0.6);
      g.ui.think('It knows. RUN.', 3);
      g.monster.hearNoise(g.player.pos.clone(), 100);
    }
  }

  // ---------- objectives ----------
  objective() {
    const f = this.flags, ui = this.g.ui;
    let t;
    if (!f.flashlight) t = 'Find a light.';
    else if (this.has('bolt_cutters')) t = 'ESCAPE. Cut the chain on the front door.';
    else if (f.gateOpen) t = 'Take the bolt cutters from the workbench.';
    else if (this.power) t = 'Find the combination for the workshop cage.';
    else if (f.cellarOpen && (f.seenCellar || f.sawFuseBox || f.fuses)) t = `Restore the power — fuses ${this.fusesPlaced + this.fusesHeld}/3.`;
    else if (f.cellarOpen) t = 'Go down into the cellar.';
    else if (f.cellar_key) t = 'Unlock the cellar door in the kitchen.';
    else if (f.journal) t = 'Open the grandfather clock in the study.';
    else if (f.triedCellar) t = 'Find the key to the cellar.';
    else if (f.wake || f.triedFront) t = 'Get to the cellar workshop.';
    else t = 'Find a way out of the house.';
    if (t !== this._lastObj) { this._lastObj = t; ui.setObjective(t); }
  }

  // ---------- scares ----------
  scareHallway() {
    const g = this.g, A = g.audio, m = g.monster;
    const p = new THREE.Vector3(12.2, 0, 6.6); // just beyond the hallway candle: a lit silhouette
    m.showAt(p, -Math.PI / 2);
    A.whisper({ pos: p.clone().setY(1.8), volume: 0.5, dur: 3 });
    this.apparition = { t: 0, pos: p };
  }

  update(dt, t) {
    const g = this.g, A = g.audio;
    const p = g.player.pos;
    for (const tr of this.triggers) if (!this.flags['tr_' + tr.id] && tr.test(p)) { this.flags['tr_' + tr.id] = true; tr.run(); }

    // hallway apparition: vanishes when lit or after a moment
    if (this.apparition) {
      const a = this.apparition;
      a.t += dt;
      const toA = a.pos.clone().setY(1.6).sub(g.camera.position);
      const lit = g.flashlight.on && g.flashlight.dir.dot(toA.clone().normalize()) > 0.93;
      if ((lit && a.t > 0.6) || a.t > 4 || toA.length() < 4) {
        if (!g.monster.active) g.monster.root.visible = false;
        if (lit) { A.stinger(0.45); g.flashlight.flicker = 1; setTimeout(() => (g.flashlight.flicker = 0), 700); }
        const guest = g.level.doorById('guest');
        if (guest && guest.target > 0.1) guest.close({ slam: true });
        else A.play('doorClose_4', { pos: new THREE.Vector3(29.25, 1, 6), volume: 1.2 });
        this.apparition = null;
      }
    }

    // grandfather clock ticking
    const cp = g.props.named.clock.position;
    if (!this.flags.clockSolved) {
      this.tickT -= dt;
      if (this.tickT <= 0) { this.tickT = 1; if (cp.distanceTo(p) < 10) A.tick(cp.clone().setY(1.5), 0.3); }
    }

    // TV screen: snow with the code flickering through
    if (this.power) this._drawTV(dt, t);

    // ambient horror events
    this.ambientT -= dt;
    if (this.ambientT <= 0 && this.flags.flashlight) {
      this.ambientT = 18 + Math.random() * 30;
      const r = Math.random();
      const dir = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize().multiplyScalar(6 + Math.random() * 8);
      const at = p.clone().add(dir).setY(p.y + 1.5 + Math.random());
      if (r < 0.3) A.creak({ pos: at, volume: 0.5, dur: 1 + Math.random() * 2, base: 120 + Math.random() * 200 });
      else if (r < 0.5) A.knock(at, 2 + Math.floor(Math.random() * 3));
      else if (r < 0.65) A.whisper({ pos: at, volume: 0.35 });
      else if (r < 0.8) A.play('impactWood_heavy_002', { pos: at, volume: 0.6, rate: 0.6 });
      else {
        const open = g.level.doors.filter((d) => d.target > 0.1 && !d.locked && d.center.distanceTo(p) > 4);
        if (open.length) open[Math.floor(Math.random() * open.length)].close({ slam: Math.random() < 0.5 });
        else A.creak({ pos: at, volume: 0.4 });
      }
    }
  }

  _drawTV(dt, t) {
    this.tvT += dt;
    if (this.tvT < 0.06) return;
    this.tvT = 0;
    const scr = this.g.props.named.tvScreen;
    const c = scr.userData.canvas, x = c.getContext('2d');
    const w = c.width, h = c.height;
    const img = this._tvImg || (this._tvImg = x.createImageData(w, h));
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 200; img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v * 1.05; img.data[i + 3] = 255; }
    x.putImageData(img, 0, 0);
    const cyc = t % 5;
    if (cyc > 2.8 && cyc < 4.4) {
      x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(0, h * 0.25, w, h * 0.5);
      x.fillStyle = '#f4f0e8'; x.font = `bold ${h * 0.3}px "Special Elite", monospace`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.shadowColor = '#fff'; x.shadowBlur = 12;
      x.fillText(this.code.join(' '), w / 2 + (Math.random() - 0.5) * 3, h / 2);
      x.shadowBlur = 0;
    }
    x.fillStyle = '#9f9'; x.font = `${h * 0.09}px monospace`; x.textAlign = 'left'; x.fillText('CH 3', 8, h * 0.1);
    scr.material.map.needsUpdate = true;
    scr.material.emissiveIntensity = 1.2;
  }

  // ---------- checkpoints ----------
  checkpoint(opts = {}) {
    const g = this.g;
    this.saved = {
      pos: g.player.pos.clone(), yaw: g.player.yaw,
      flags: { ...this.flags }, inventory: this.inventory.map((i) => ({ ...i })),
      fusesHeld: this.fusesHeld, fusesPlaced: this.fusesPlaced, power: this.power,
      battery: Math.max(0.5, g.flashlight.battery),
      doors: g.level.doors.map((d) => ({ locked: d.locked, open: d.target > 0.1 })),
      phase: g.monster.phase, monsterActive: g.monster.active || !!opts.delayMonster,
    };
  }

  restore() {
    const g = this.g, s = this.saved;
    if (!s) return false;
    this.flags = { ...s.flags };
    this.inventory = s.inventory.map((i) => ({ ...i }));
    this.fusesHeld = s.fusesHeld; this.fusesPlaced = s.fusesPlaced;
    g.flashlight.battery = s.battery;
    g.level.doors.forEach((d, i) => { d.locked = s.doors[i].locked; d.target = 0; d.angle = 0; d.update(0); });
    for (const [id, obj] of Object.entries(this.pickups)) obj.visible = !this.flags[id] && (id !== 'cellar_key' || this.flags.clockSolved);
    if (this.flags.clockSolved && !this.flags.cellar_key) this.pickups.cellar_key.position.y = 0.012;
    this.apparition = null;
    g.player.spawn(s.pos.x, s.pos.z, s.yaw);
    g.monster.despawn();
    if (s.monsterActive) {
      // respawn the creature far from the player
      const cells = g.monster.nav.reachable(g.player.pos.clone().setY(0));
      let best = null, bd = 0;
      for (let i = 0; i < 40; i++) {
        const c = cells[Math.floor(Math.random() * cells.length)];
        const cc = g.level.cellCenter(c[0], c[1]);
        const d = cc.distanceTo(g.player.pos);
        if (d > bd && d < 40) { bd = d; best = cc; }
      }
      setTimeout(() => g.monster.spawn(best || new THREE.Vector3(27, 0, 9), s.phase), 6000);
    }
    this._lastObj = null;
    this.objective();
    this._invRefresh();
    return true;
  }
}
