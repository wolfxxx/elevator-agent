// Generates all game audio with the ElevenLabs API into public/audio.
// Usage: ELEVENLABS_API_KEY=... node scripts/gen-audio.mjs [--force] [name ...]
import { writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';

const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) { console.error('ELEVENLABS_API_KEY not set'); process.exit(1); }
const OUT = path.resolve('public/audio');
const force = process.argv.includes('--force');
const only = process.argv.slice(2).filter(a => !a.startsWith('--'));

const SFX = {
  shot_player: ['single suppressed spy pistol shot, punchy and short, close mic', 0.5],
  shot_enemy: ['single pistol gunshot, sharp crack, slight room echo', 0.6],
  ding: ['classic elevator arrival bell, one clean ding chime', 1.2],
  elevator_loop: ['steady elevator motor hum and cable whir, mechanical, constant, seamless loop', 3, true],
  door_open: ['office door handle click and door swinging open', 0.8],
  doc_pickup: ['secret papers grabbed quickly, paper rustle followed by a short bright synth confirmation sting', 1.4],
  enemy_die: ['man grunts in pain as he gets hit and falls, short', 0.8],
  player_die: ['man cries out and collapses, dramatic hit, retro action game', 1.4],
  kick: ['fast martial arts kick, cloth whoosh then heavy punch impact thud', 0.6],
  jump: ['quick cloth whoosh of a person jumping', 0.5],
  lamp_break: ['glass light bulb shattering with an electric spark zap', 1.0],
  lamp_crash: ['heavy metal ceiling lamp crashing onto a hard floor', 1.0],
  crush: ['heavy steel elevator car slamming down, crunchy metal impact', 1.0],
  car_escape: ['sports car engine starting, revving hard, then tires screeching as it speeds away', 4.5],
  zipline: ['metal pulley sliding fast down a steel zip line cable, whizzing', 2.0],
  ricochet: ['bullet ricochet whine off metal', 0.6],
  ui_select: ['short retro arcade menu select blip', 0.5],
  ui_start: ['retro arcade coin insert and start jingle, bright', 1.2],
  step_in: ['footstep onto a metal elevator floor, single clank', 0.5],
  alarm: ['short building security alarm buzzer, two pulses', 1.2],
  extra_life: ['retro arcade one-up power chime, ascending notes', 1.0],
  thunder: ['distant rolling thunder over a city at night', 4.0],
  rain_loop: ['steady rain falling on a city rooftop at night, seamless loop', 6, true],
  hook_throw: ['grappling hook thrown hard through the air, fast whoosh with rope uncoiling and whirring behind it', 1.3],
  hook_clink: ['heavy steel grappling hook landing and catching on a metal railing, sharp ringing metallic clink and clank', 0.9],
  rope_tight: ['thick rope yanked taut, tense creak and a short twang', 0.7],
};

const VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb'; // George: calm, British, briefing-officer feel
const VOICE = {
  vo_briefing: 'Agent Seventeen. Retrieve the documents behind every red door, then get to the car in the basement.',
  vo_complete: 'Mission accomplished. Good work, agent.',
  vo_agentdown: 'Agent down.',
  vo_gameover: 'Mission failed.',
  vo_missed: "You missed a document. Go back.",
  vo_ready: 'Ready.',
};

const MUSIC = {
  music_game: ['Tense 1960s spy thriller instrumental: driving walking upright bass, twangy surf guitar riffs, muted trumpet stabs, brushed drums, minor key, 125 bpm, steady energy throughout, loopable, no vocals', 90000],
  music_title: ['Dramatic retro spy movie main title theme, bold brass fanfare over twangy electric guitar and bass, noir cool, short intro, no vocals', 30000],
  music_clear: ['Short triumphant jazzy spy jingle, brass and guitar flourish ending on a big final chord, no vocals', 7000],
};

async function exists(f) { try { await access(f); return true; } catch { return false; } }

async function post(url, body) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(url, { method: 'POST', headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' }, body: JSON.stringify(body) });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    const t = await r.text();
    if (r.status === 422 && body.loop) { delete body.loop; continue; }
    if (r.status === 429) { await new Promise(s => setTimeout(s, 4000)); continue; }
    throw new Error(`${r.status} ${t.slice(0, 300)}`);
  }
  throw new Error('retries exhausted');
}

async function job(name, fn) {
  if (only.length && !only.includes(name)) return;
  const file = path.join(OUT, name + '.mp3');
  if (!force && await exists(file)) { console.log('skip', name); return; }
  try { const buf = await fn(); await writeFile(file, buf); console.log('ok  ', name, buf.length); }
  catch (e) { console.error('FAIL', name, e.message); }
}

await mkdir(OUT, { recursive: true });
const jobs = [];
for (const [n, [text, dur, loop]] of Object.entries(SFX))
  jobs.push(() => job(n, () => post('https://api.elevenlabs.io/v1/sound-generation', { text, duration_seconds: dur, prompt_influence: 0.5, ...(loop ? { loop: true } : {}) })));
for (const [n, text] of Object.entries(VOICE))
  jobs.push(() => job(n, () => post(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, { text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.3 } })));
for (const [n, [prompt, ms]] of Object.entries(MUSIC))
  jobs.push(() => job(n, () => post('https://api.elevenlabs.io/v1/music', { prompt, music_length_ms: ms, force_instrumental: true })));

// small concurrency pool
const queue = [...jobs];
await Promise.all(Array.from({ length: 3 }, async () => { while (queue.length) await queue.shift()(); }));
console.log('done');
