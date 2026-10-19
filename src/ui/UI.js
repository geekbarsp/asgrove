const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.el = {
      hud: $('hud'), prompt: $('prompt'), cross: $('crosshair'), objective: $('objective'), objText: $('objText'),
      thought: $('thought'), inventory: $('inventory'), meters: $('meters'), stamina: $('mStamina'), battery: $('mBattery'),
      hint: $('hint'), note: $('note'), noteBody: $('noteBody'), hide: $('hideOverlay'), damage: $('damage'), fade: $('fade'),
      clock: $('clockUI'), lock: $('lockUI'),
    };
    this.thoughtTimer = 0;
    this.hintTimer = 0;
    this.invTimer = 0;
    this.overlay = null; // 'note' | 'clock' | 'lock'
  }

  show(id, on = true) { $(id).classList.toggle('hidden', !on); }
  screen(id) {
    for (const s of ['loading', 'menu', 'settings', 'credits', 'pause', 'death', 'ending']) $(s).classList.toggle('hidden', s !== id);
  }
  fade(v, dur = 1.4) { this.el.fade.style.transition = `opacity ${dur}s`; this.el.fade.style.opacity = v; }

  setPrompt(text, key = 'E') {
    if (!text) { this.el.prompt.classList.remove('on'); this.el.cross.classList.remove('active'); return; }
    this.el.prompt.innerHTML = `<span class="k">${key}</span>${text}`;
    this.el.prompt.classList.add('on');
    this.el.cross.classList.add('active');
  }

  setObjective(text) {
    if (!text) { this.el.objective.classList.remove('on'); return; }
    this.el.objText.textContent = text;
    this.el.objective.classList.remove('on');
    void this.el.objective.offsetWidth;
    this.el.objective.classList.add('on');
    this.objTimer = 9;
  }
  pulseObjective() { this.el.objective.classList.add('on'); this.objTimer = 5; }

  think(text, dur = 4.5) {
    this.el.thought.textContent = text;
    this.el.thought.classList.add('on');
    this.thoughtTimer = dur;
  }
  hint(text, dur = 5) {
    this.el.hint.innerHTML = text;
    this.el.hint.classList.add('on');
    this.hintTimer = dur;
  }

  setInventory(items, newId) {
    this.el.inventory.innerHTML = items.map((i) => `<div class="item ${i.id === newId ? 'new' : ''}">${i.name}</div>`).join('');
    this.showInventory(5);
  }
  showInventory(t = 4) { this.el.inventory.classList.add('on'); this.invTimer = t; }

  setMeters(stamina, battery, hasLight) {
    this.el.stamina.firstElementChild.style.width = `${stamina * 100}%`;
    this.el.stamina.classList.toggle('low', stamina < 0.25);
    this.el.battery.style.display = hasLight ? '' : 'none';
    this.el.battery.firstElementChild.style.width = `${battery * 100}%`;
    this.el.battery.classList.toggle('low', battery < 0.2);
    const show = stamina < 0.98 || (hasLight && battery < 0.35);
    this.el.meters.classList.toggle('on', show);
  }

  setHidden(on) { this.el.hide.classList.toggle('hidden', !on); }
  setDamage(v) { this.el.damage.style.opacity = v; }

  update(dt) {
    if (this.thoughtTimer > 0 && (this.thoughtTimer -= dt) <= 0) this.el.thought.classList.remove('on');
    if (this.hintTimer > 0 && (this.hintTimer -= dt) <= 0) this.el.hint.classList.remove('on');
    if (this.invTimer > 0 && (this.invTimer -= dt) <= 0) this.el.inventory.classList.remove('on');
    if (this.objTimer > 0 && (this.objTimer -= dt) <= 0) this.el.objective.classList.remove('on');
  }

  // ---------- notes ----------
  openNote(note) {
    const b = this.el.noteBody;
    b.className = note.style || 'hand';
    b.innerHTML = note.html;
    this.show('note', true);
    this.overlay = 'note';
  }
  closeOverlay() {
    this.show('note', false); this.show('clockUI', false); this.show('lockUI', false);
    this.overlay = null;
  }

  // ---------- clock puzzle ----------
  openClock(state, onChange, onTry) {
    this.overlay = 'clock';
    this.show('clockUI', true);
    const cv = $('clockCanvas');
    const draw = () => drawClockFace(cv, state.h, state.m);
    draw();
    const adj = (c) => {
      if (c === 'h+') state.h = (state.h % 12) + 1;
      if (c === 'h-') state.h = ((state.h + 10) % 12) + 1;
      if (c === 'm+') state.m = (state.m + 5) % 60;
      if (c === 'm-') state.m = (state.m + 55) % 60;
      onChange(); draw();
    };
    this._clockAdj = adj;
    document.querySelectorAll('#clockUI [data-c]').forEach((b) => { b.onclick = () => adj(b.dataset.c); });
    $('clockTry').onclick = () => onTry();
    this._clockTry = onTry;
  }

  // ---------- combination lock ----------
  openLock(digits, onChange, onTry) {
    this.overlay = 'lock';
    this.show('lockUI', true);
    const wrap = $('dials');
    wrap.innerHTML = '';
    digits.forEach((d, i) => {
      const el = document.createElement('div'); el.className = 'dial';
      el.innerHTML = `<button>▲</button><div class="num">${d}</div><button>▼</button>`;
      const [up, , down] = el.children;
      const num = el.querySelector('.num');
      up.onclick = () => { digits[i] = (digits[i] + 1) % 10; num.textContent = digits[i]; onChange(); };
      down.onclick = () => { digits[i] = (digits[i] + 9) % 10; num.textContent = digits[i]; onChange(); };
      num.onclick = up.onclick;
      wrap.appendChild(el);
    });
    $('lockTry').onclick = () => onTry();
    this._lockTry = onTry;
  }
}

export function drawClockFace(cv, h, m) {
  const g = cv.getContext('2d');
  const S = cv.width, c = S / 2;
  g.clearRect(0, 0, S, S);
  // brass bezel
  let grd = g.createRadialGradient(c, c, S * 0.38, c, c, S * 0.5);
  grd.addColorStop(0, '#5b4524'); grd.addColorStop(0.5, '#b89456'); grd.addColorStop(1, '#3a2a12');
  g.fillStyle = grd; g.beginPath(); g.arc(c, c, S * 0.5, 0, Math.PI * 2); g.fill();
  // aged enamel dial
  grd = g.createRadialGradient(c * 0.8, c * 0.8, 10, c, c, S * 0.44);
  grd.addColorStop(0, '#efe6cf'); grd.addColorStop(0.75, '#d8c9a3'); grd.addColorStop(1, '#9d8a5f');
  g.fillStyle = grd; g.beginPath(); g.arc(c, c, S * 0.43, 0, Math.PI * 2); g.fill();
  // stains & cracks
  for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(90,60,20,${Math.random() * 0.06})`; g.beginPath(); g.arc(c + (Math.random() - 0.5) * S * 0.6, c + (Math.random() - 0.5) * S * 0.6, Math.random() * 40, 0, 7); g.fill(); }
  g.strokeStyle = 'rgba(40,30,15,.35)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(c - 60, c - 150); g.lineTo(c - 40, c - 90); g.lineTo(c - 55, c - 40); g.stroke();
  // ticks + roman numerals
  const roman = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  g.fillStyle = '#1b130a'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `${S * 0.06}px Cormorant, serif`;
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const r1 = S * 0.41, r2 = i % 5 === 0 ? S * 0.375 : S * 0.395;
    g.lineWidth = i % 5 === 0 ? 3 : 1;
    g.strokeStyle = '#1b130a';
    g.beginPath(); g.moveTo(c + Math.sin(a) * r1, c - Math.cos(a) * r1); g.lineTo(c + Math.sin(a) * r2, c - Math.cos(a) * r2); g.stroke();
  }
  roman.forEach((r, i) => {
    const a = (i / 12) * Math.PI * 2;
    g.save(); g.translate(c + Math.sin(a) * S * 0.315, c - Math.cos(a) * S * 0.315); g.rotate(a); g.fillText(r, 0, 0); g.restore();
  });
  g.font = `${S * 0.03}px "Special Elite"`; g.fillStyle = '#4a3a22'; g.fillText('ASHGROVE & SONS · 1889', c, c + S * 0.16);
  // hands
  const hand = (ang, len, w, col) => {
    g.save(); g.translate(c, c); g.rotate(ang);
    g.fillStyle = col; g.beginPath(); g.moveTo(-w, 18); g.lineTo(-w * 0.5, -len * 0.7); g.lineTo(0, -len); g.lineTo(w * 0.5, -len * 0.7); g.lineTo(w, 18); g.closePath(); g.fill();
    g.restore();
  };
  const ha = ((h % 12) + m / 60) / 12 * Math.PI * 2;
  const ma = (m / 60) * Math.PI * 2;
  hand(ha, S * 0.22, 7, '#120c06');
  hand(ma, S * 0.34, 4.5, '#120c06');
  g.fillStyle = '#7a5d2c'; g.beginPath(); g.arc(c, c, 9, 0, 7); g.fill();
  // glass reflection
  grd = g.createLinearGradient(0, 0, S, S); grd.addColorStop(0, 'rgba(255,255,255,.12)'); grd.addColorStop(0.4, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.beginPath(); g.arc(c, c, S * 0.43, 0, Math.PI * 2); g.fill();
}
