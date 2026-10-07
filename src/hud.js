import { FH } from './config.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => String(n).padStart(6, '0');

export class HUD {
  constructor() {
    this.el = {
      score: $('score'), hi: $('hi'), lives: $('lives'), mission: $('mission'), docs: $('docs'), floor: $('floor'),
      banner: $('banner'), msg: $('msg'), popups: $('popups'), title: $('title'), titleHi: $('title-hi'),
      clear: $('clear'), over: $('gameover'), pauseEl: $('pause'), fadeEl: $('fade'), map: $('map'), hud: $('hud'),
    };
    this.msgT = 0; this.bannerT = 0;
    this.last = {};
  }

  set(key, el, v) { if (this.last[key] !== v) { this.last[key] = v; el.innerHTML = v; } }

  setLevel(level) {
    // build the minimap: one row per floor, top = roof
    const m = this.el.map;
    m.innerHTML = '';
    this.rows = [];
    for (let f = level.N; f >= 0; f--) {
      const r = document.createElement('div');
      r.className = 'row' + (f === level.N ? ' roof' : f === 0 ? ' garage' : '');
      m.appendChild(r);
      this.rows[f] = r;
    }
    this.marker = document.createElement('div');
    this.marker.className = 'marker';
    m.appendChild(this.marker);
    this.mapN = level.N;
    this.docDots = new Map();
    for (const d of level.doors) if (d.red) {
      const dot = document.createElement('i');
      dot.style.left = `${((d.x + 22) / 44) * 100}%`;
      this.rows[d.f].appendChild(dot);
      this.docDots.set(d, dot);
    }
    this.shaftEls = level.shafts.map(s => {
      const e = document.createElement('b');
      e.style.left = `${((s.x + 22) / 44) * 100}%`;
      e.style.bottom = `${(s.minF / (level.N + 1)) * 100}%`;
      e.style.height = `${((s.maxF - s.minF + 1) / (level.N + 1)) * 100}%`;
      m.appendChild(e);
      return e;
    });
  }

  update(g) {
    const p = g.player;
    const playing = g.state !== 'title';
    this.el.hud.classList.toggle('hidden', !playing);
    if (!playing) return;
    this.set('score', this.el.score, fmt(g.score));
    this.set('hi', this.el.hi, fmt(g.hiscore));
    this.set('lives', this.el.lives, '<span class="life"></span>'.repeat(Math.max(0, Math.min(8, g.lives))));
    this.set('mission', this.el.mission, `MISSION ${g.levelNum}`);
    this.set('docs', this.el.docs, `<span class="doc-ico"></span>${g.docs}<small>/${g.docsTotal}</small>`);
    const fi = Math.max(0, Math.min(g.level.N, Math.round(p.y / FH - 0.1)));
    this.set('floor', this.el.floor, fi === g.level.N ? 'R' : fi === 0 ? 'G' : String(fi).padStart(2, '0'));
    if (this.marker) {
      this.marker.style.bottom = `${(p.y / FH + 0.5) / (this.mapN + 1) * 100}%`;
      this.marker.style.left = `${((p.x + 22) / 44) * 100}%`;
    }
    if (this.docDots) for (const [d, dot] of this.docDots) dot.classList.toggle('got', d.collected);
    const dt = 1 / 60;
    if (this.msgT > 0) { this.msgT -= dt; if (this.msgT <= 0) this.el.msg.classList.remove('show'); }
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.el.banner.classList.remove('show'); }
  }

  banner(title, sub, dur = 3) {
    this.el.banner.innerHTML = `<h2>${title}</h2><p>${sub}</p>`;
    this.el.banner.classList.add('show');
    this.bannerT = dur;
  }
  flashMessage(text, dur = 2) {
    this.el.msg.textContent = text;
    this.el.msg.classList.remove('show'); void this.el.msg.offsetWidth;
    this.el.msg.classList.add('show');
    this.msgT = dur;
  }
  popup(text, pos, camera) {
    const v = pos.clone().project(camera);
    if (v.z > 1) return;
    const d = document.createElement('div');
    d.className = 'popup';
    d.textContent = text;
    d.style.left = `${(v.x * 0.5 + 0.5) * 100}%`;
    d.style.top = `${(-v.y * 0.5 + 0.5) * 100}%`;
    this.el.popups.appendChild(d);
    setTimeout(() => d.remove(), 1100);
  }
  showTitle(hi) { this.el.titleHi.textContent = fmt(hi); this.el.title.classList.add('show'); }
  hideTitle() { this.el.title.classList.remove('show'); }
  pause(on) { this.el.pauseEl.classList.toggle('show', on); }
  fade(v) { this.el.fadeEl.style.opacity = v; }
  showClear(level, bonus, score) {
    this.el.clear.innerHTML = `<h1>MISSION ${level} COMPLETE</h1><div class="tally"><span>ESCAPE BONUS</span><b>${bonus}</b></div><div class="tally"><span>SCORE</span><b>${fmt(score)}</b></div><p class="blink">PRESS ENTER</p>`;
    this.el.clear.classList.add('show');
  }
  hideClear() { this.el.clear.classList.remove('show'); }
  showGameOver(score, hi) {
    this.el.over.innerHTML = `<h1>MISSION FAILED</h1><div class="tally"><span>SCORE</span><b>${fmt(score)}</b></div><div class="tally"><span>HIGH SCORE</span><b>${fmt(hi)}</b></div><p class="blink">PRESS ENTER</p>`;
    this.el.over.classList.add('show');
  }
  hideGameOver() { this.el.over.classList.remove('show'); }
}
