// Procedural building layout. Guarantees a route from the roof to the garage:
// the building is split into vertical "zones"; every zone has at least one shaft
// spanning it completely, and adjacent zones meet on a transfer floor where the
// player must cross the floor to the next zone's shaft (or take an escalator).
import { NUM_FLOORS, SHAFT_W, ESC_LEN, HALF_W } from './config.js';
import { mulberry32, randInt, shuffle, pick } from './util.js';

const SLOTS = [-15, -9, -3, 3, 9, 15];
export const GARAGE_CAR_X = 16.5;

export function generateLevel(levelNum) {
  const rng = mulberry32(0x5eed + levelNum * 7919);
  const N = NUM_FLOORS;
  const shafts = [];
  const escalators = [];

  let cur = N;
  let blocked = [];
  let zone = 0;
  while (cur > 0) {
    // occasionally bridge one floor with an escalator instead of an elevator zone
    if (zone > 0 && cur > 2 && rng() < 0.28) {
      const esc = placeEscalator(rng, cur - 1, shafts, escalators, blocked);
      if (esc) {
        escalators.push(esc);
        blocked = [Math.min(esc.xBottom, esc.xTop) - 1, Math.max(esc.xBottom, esc.xTop) + 1];
        blocked = SLOTS.filter(s => s > blocked[0] - SHAFT_W && s < blocked[1] + SHAFT_W);
        cur -= 1; zone++;
        continue;
      }
    }
    const lower = cur < N * 0.5;
    const span = Math.min(cur, randInt(rng, 3, lower ? 6 : 8));
    const bottom = cur - span;
    let avail = SLOTS.filter(s => !blocked.includes(s));
    if (bottom === 0) avail = avail.filter(s => Math.abs(s - GARAGE_CAR_X) > 4);
    shuffle(rng, avail);
    const count = Math.min(avail.length, lower ? randInt(rng, 2, 3) : randInt(rng, 1, 2));
    const used = [];
    for (let i = 0; i < count; i++) {
      const x = avail[i];
      let minF = bottom, maxF = cur;
      if (i > 0 && span > 2) { // secondary shafts may cover part of the zone
        const a = randInt(rng, bottom, cur - 2);
        const b = randInt(rng, a + 2, cur);
        minF = a; maxF = b;
      }
      shafts.push({ id: shafts.length, x, minF, maxF });
      used.push(x);
    }
    blocked = used;
    cur = bottom; zone++;
  }

  // Extra escalators for alternate routes
  for (let f = 1; f < N - 1; f++) {
    if (rng() < 0.22) {
      const esc = placeEscalator(rng, f, shafts, escalators, []);
      if (esc) escalators.push(esc);
    }
  }

  // Doors and lamps
  const doors = [];
  const lamps = [];
  const deco = [];
  for (let f = 0; f < N; f++) {
    const busy = obstacles(f, shafts, escalators);
    if (f === 0) busy.push([GARAGE_CAR_X - 3.5, HALF_W]);
    const free = x => busy.every(([a, b]) => x < a - 1.2 || x > b + 1.2);
    const cands = [];
    for (let x = -19.5; x <= 19.5; x += 1.5) if (free(x)) cands.push(x);
    shuffle(rng, cands);
    const placed = [];
    const want = f === 0 ? 2 : randInt(rng, 2, 4);
    for (const x of cands) {
      if (placed.length >= want) break;
      if (placed.every(p => Math.abs(p - x) > 5)) placed.push(x);
    }
    placed.sort((a, b) => a - b);
    for (const x of placed) doors.push({ id: doors.length, f, x, red: false, collected: false });

    // lamps hang from the ceiling: avoid shafts passing through either this floor or the one above
    const busyL = [...obstacles(f, shafts, []), ...obstacles(f + 1, shafts, [])];
    const lampFree = x => busyL.every(([a, b]) => x < a - 1 || x > b + 1);
    const lx = [];
    for (const base of [-14, -4, 6, 16]) {
      const x = base + (rng() - 0.5) * 4;
      if (lampFree(x) && lx.every(p => Math.abs(p - x) > 6)) lx.push(x);
    }
    for (const x of lx.slice(0, f === 0 ? 4 : 3)) lamps.push({ id: lamps.length, f, x });

    // decorations against the back wall between doors
    if (f > 0) {
      for (let x = -20; x <= 20; x += 2.2) {
        if (!free(x) || placed.some(p => Math.abs(p - x) < 1.6) || rng() < 0.55) continue;
        deco.push({ f, x, kind: pick(rng, ['Desk', 'Desk', 'Plant', 'Cabinet', 'Cooler', 'Chair']) });
      }
    }
  }

  // red (document) doors: spread through the building, never in the garage
  const redCount = Math.min(10, 7 + Math.floor(levelNum / 2));
  const byFloor = new Map();
  for (const d of doors) if (d.f > 0) (byFloor.get(d.f) || byFloor.set(d.f, []).get(d.f)).push(d);
  const floors = shuffle(rng, [...byFloor.keys()]);
  const redFloors = [];
  for (const f of floors) {
    if (redFloors.length >= redCount) break;
    if (redFloors.every(r => Math.abs(r - f) >= 2)) redFloors.push(f);
  }
  for (const f of redFloors) pick(rng, byFloor.get(f)).red = true;

  return { levelNum, N, shafts, escalators, doors, lamps, deco };
}

// x ranges occupied on floor f by shafts (pit or hole) and escalator landings
function obstacles(f, shafts, escalators) {
  const r = [];
  for (const s of shafts) if (f >= s.minF && f <= s.maxF) r.push([s.x - SHAFT_W / 2, s.x + SHAFT_W / 2]);
  for (const e of escalators) {
    if (e.f === f || e.f + 1 === f) r.push([Math.min(e.xBottom, e.xTop) - 1, Math.max(e.xBottom, e.xTop) + 1]);
  }
  return r;
}

function placeEscalator(rng, f, shafts, escalators, blockedSlots) {
  const busy = [...obstacles(f, shafts, escalators), ...obstacles(f + 1, shafts, escalators)];
  for (const s of blockedSlots) busy.push([s - SHAFT_W / 2, s + SHAFT_W / 2]);
  for (let tries = 0; tries < 20; tries++) {
    const dir = rng() < 0.5 ? 1 : -1;
    const xBottom = -17 + rng() * 34;
    const xTop = xBottom - dir * ESC_LEN;
    const lo = Math.min(xBottom, xTop) - 1.5, hi = Math.max(xBottom, xTop) + 1.5;
    if (lo < -20 || hi > 20) continue;
    if (busy.every(([a, b]) => hi < a || lo > b)) return { id: escalators.length, f, xBottom, xTop };
  }
  return null;
}
