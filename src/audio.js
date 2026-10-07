// Web Audio wrapper: ElevenLabs-generated samples with synthesized fallbacks.
const BASE = import.meta.env.BASE_URL;
const NAMES = ['shot_player', 'shot_enemy', 'ding', 'elevator_loop', 'door_open', 'doc_pickup', 'enemy_die', 'player_die', 'jump', 'kick',
  'lamp_break', 'lamp_crash', 'crush', 'car_escape', 'zipline', 'ricochet', 'ui_select', 'ui_start', 'step_in', 'alarm', 'extra_life',
  'thunder', 'rain_loop', 'hook_throw', 'hook_clink', 'rope_tight', 'vo_briefing', 'vo_complete', 'vo_agentdown', 'vo_gameover', 'vo_missed', 'vo_ready',
  'music_game', 'music_title', 'music_clear'];

class Audio {
  constructor() {
    this.ctx = null; this.buffers = {}; this.loops = {}; this.music = null; this.musicName = null;
    this.muted = false; this.loaded = false;
    try { this.muted = localStorage.getItem('ea_muted') === '1'; } catch { /* ignore */ }
  }

  async init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') await this.ctx.resume(); return; }
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : 1;
    this.comp = this.ctx.createDynamicsCompressor();
    this.master.connect(this.comp); this.comp.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = 0.9; this.sfxBus.connect(this.master);
    this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = 0.42; this.musicBus.connect(this.master);
    this.voBus = this.ctx.createGain(); this.voBus.gain.value = 1.0; this.voBus.connect(this.master);
    await Promise.all(NAMES.map(async n => {
      try {
        const r = await fetch(`${BASE}audio/${n}.mp3`);
        if (!r.ok) return;
        this.buffers[n] = await this.ctx.decodeAudioData(await r.arrayBuffer());
      } catch { /* fallback synth */ }
    }));
    this.loaded = true;
  }

  toggleMute() {
    this.muted = !this.muted;
    try { localStorage.setItem('ea_muted', this.muted ? '1' : '0'); } catch { /* ignore */ }
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  play(name, { vol = 1, pan = 0, rate = 1, bus } = {}) {
    if (!this.ctx || vol <= 0.01) return;
    const out = bus || (name.startsWith('vo_') ? this.voBus : this.sfxBus);
    const g = this.ctx.createGain(); g.gain.value = vol;
    const p = this.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p); p.connect(out);
    const buf = this.buffers[name];
    if (buf) {
      const s = this.ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
      s.connect(g); s.start();
      return s;
    }
    this.synth(name, g);
  }

  synth(name, out) {
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); const e = this.ctx.createGain();
    o.connect(e); e.connect(out);
    const presets = {
      shot_player: ['square', 900, 120, 0.12], shot_enemy: ['sawtooth', 600, 80, 0.15], ding: ['sine', 1320, 1318, 0.8],
      jump: ['triangle', 300, 700, 0.15], kick: ['square', 200, 60, 0.15], enemy_die: ['sawtooth', 400, 60, 0.4],
      player_die: ['sawtooth', 600, 40, 1.0], doc_pickup: ['square', 600, 1200, 0.3], lamp_break: ['square', 2000, 300, 0.3],
    };
    const [type, f0, f1, d] = presets[name] || ['sine', 440, 440, 0.08];
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + d);
    e.gain.setValueAtTime(0.2, t); e.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.start(t); o.stop(t + d + 0.05);
  }

  loop(name, vol) {
    if (!this.ctx || !this.buffers[name]) return;
    let L = this.loops[name];
    if (!L) {
      const s = this.ctx.createBufferSource(); s.buffer = this.buffers[name]; s.loop = true;
      const g = this.ctx.createGain(); g.gain.value = 0;
      s.connect(g); g.connect(this.sfxBus); s.start();
      L = this.loops[name] = { s, g };
    }
    L.g.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.1);
  }

  playMusic(name, { loop = true, vol = 1 } = {}) {
    if (!this.ctx || this.musicName === name) return;
    this.stopMusic(0.6);
    this.musicName = name;
    const buf = this.buffers[name];
    if (!buf) return;
    const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = loop;
    const g = this.ctx.createGain(); g.gain.value = 0;
    g.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.3);
    s.connect(g); g.connect(this.musicBus); s.start();
    this.music = { s, g };
  }
  stopMusic(fade = 0.5) {
    if (!this.music) { this.musicName = null; return; }
    const { s, g } = this.music;
    g.gain.setTargetAtTime(0, this.ctx.currentTime, fade / 3);
    setTimeout(() => { try { s.stop(); } catch { /* already stopped */ } }, fade * 1000 + 100);
    this.music = null; this.musicName = null;
  }
  duckMusic(amount) { if (this.musicBus) this.musicBus.gain.setTargetAtTime(0.42 * amount, this.ctx.currentTime, 0.2); }
}

export const audio = new Audio();
