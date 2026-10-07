# Elevator Agent

A modern 2.5D tribute to Taito's *Elevator Action* (1983), built with Three.js.

You play Agent 17, a sporty granny with a pistol. Throw your grappling line across from the neighbouring tower, slide down it onto the roof of Meridian Tower, work your way down 30 floors, grab the secret documents behind every **red door**, and escape in the getaway car parked in the basement garage.

## Play

Play it in the browser at **https://wolfxxx.github.io/elevator-agent/**.

## Run

```bash
npm install
npm run dev        # http://localhost:5199
npm run build      # static build in dist/ (works from any sub-path)
```

## Controls

| Action | Keyboard | Gamepad |
|---|---|---|
| Move | ← → / A D | Stick / D-pad |
| Drive elevator, take escalator, enter red door | ↑ ↓ / W S | Stick / D-pad |
| Duck (on a floor) | ↓ | Down |
| Fire | Z / J / F | X / B / RT |
| Jump (kicks enemies in mid-air) | X / K / Space | A / LT |
| Pause / Mute | P or Esc / M | Select |

Touch controls appear automatically on phones and tablets.

## Mechanics (faithful to the arcade)

- **Elevators:** step into a stopped car and hold ↑/↓ to drive it. Cars stop bullets while they're between floors.
- **Car roofs:** walk into an open shaft to drop onto the car's roof. You can ride it, but the top of the shaft will squash you.
- **Crushing:** anyone standing in a shaft pit gets flattened by a descending car, including enemies (300 pts).
- **Lights:** jump and shoot a ceiling lamp. It falls and kills whoever is under it, and the floor goes dark. Enemies in the dark can barely see you.
- **Ducking and jumping:** duck under standing shots and jump over crouching shots. Enemies dodge your bullets the same way.
- **Documents:** if you reach the garage with documents missing, you're sent back to the floor you skipped.
- Difficulty rises each mission: more agents, faster bullets, quicker reactions, and elite agents in red suits.

## Assets

- **3D models** (`public/models/`): the getaway car, rooftop water tower, and office props were modeled procedurally in Blender via MCP and exported as GLB. The source scenes are in `blender/models-source.blend`. The player is Mixamo's *Sporty Granny* (`public/models/granny.glb`, exported from Blender with 1K textures). The game's procedural animation is retargeted onto her Mixamo skeleton at runtime (`makeSkinnedHumanoid` in `src/characters.js`). The enemy agents (`public/models/agent.glb`) were modeled and rigged in Blender from the reference picture `secretagentpic.png`: navy suit, white shirt, black tie, swept brown hair and an earpiece. The rig uses a Mixamo-compatible skeleton with automatic weights, and elite agents are recoloured into oxblood suits. They also wear the arcade look, a fedora and sunglasses (gold hat band on elites). These are attached at runtime and switched by `AGENT_HAT_AND_SHADES` in `src/config.js`.
- **Audio** (`public/audio/`): every sound effect, voice line, and music track was generated with the ElevenLabs API. Regenerate with:
  ```bash
  ELEVENLABS_API_KEY=... npm run gen-audio -- --force          # everything
  ELEVENLABS_API_KEY=... npm run gen-audio -- --force ding jump # specific clips
  ```
  If a file is missing, the game falls back to synthesized beeps.
- **PBR textures** (`public/textures/`) are CC0 materials from [Poly Haven](https://polyhaven.com): carpet, parquet, marble, concrete, tarred gravel, asphalt, ceiling tiles and metal. Each comes with normal and AO/roughness maps. Re-download with `python scripts/fetch-textures.py`. Wallpaper, skyline and neon signs are drawn at runtime on canvas.

## Graphics

Lamp spotlights cast real shadows (the four nearest the camera), with GTAO ambient occlusion, HDR bloom, 4x MSAA and a split-tone colour grade. The scene adds animated rain on the window glass, moonlight through the windows, dust in the light beams, rain splashes, and sparking cords on shot-out lamps. On a slow machine, add `?low` to the URL to turn off shadows, ambient occlusion and MSAA.

## Code map

| File | Purpose |
|---|---|
| `src/level.js` | Procedural building generator; always leaves a route from the roof to the garage |
| `src/game.js` | Game states, elevator logic, bullets, lamps, spawning, camera, lighting pool |
| `src/player.js`, `src/enemy.js` | Agent and enemy behavior (floor, car, roof, fall, escalator, door modes) |
| `src/world.js` | Builds the tower, shafts, cars, doors, lamps, roof, garage, and city backdrop |
| `src/characters.js` | Procedural humanoid rigs and animation |
| `src/fx.js` | Instanced particles, muzzle flashes, bullet tracers |
| `src/audio.js`, `src/input.js`, `src/hud.js` | Web Audio, keyboard/gamepad/touch input, DOM HUD |
