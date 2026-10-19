# ASHGROVE

A first-person survival-horror escape game for the browser, built with three.js.

You wake up in Ashgrove House, a decaying Victorian manor, with no memory. The front door is chained from the inside, and something tall and wrong walks the halls. Solve the house's puzzles, avoid the creature, and get out before dawn.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
```

Use a desktop browser with WebGL2 (Chrome, Edge or Firefox). Graphics quality is auto-detected from your GPU on first run, and a dynamic-resolution scaler keeps the frame rate up. You can change the quality in Settings. Headphones are recommended because the creature's position and occlusion are audible.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move |
| Mouse | Look |
| Shift | Sprint (uses stamina, and it hears you) |
| C / Ctrl | Crouch (quiet, and harder to see) |
| E / Left click | Interact, read, hide, open |
| F | Flashlight on/off (battery drains) |
| Tab | Inventory |
| Esc | Pause and settings |

## Features

- **Physically based visuals.** Poly Haven PBR textures are mapped at real-world scale, and the furniture is real scanned and modelled pieces. Rendering uses ACES tone mapping, GTAO ambient occlusion, bloom, SMAA, and a film-lens pass (grain, chromatic aberration, vignette, colour grade, fear distortion).
- **Flashlight.** A shadow-casting spotlight with a reflector cookie and hand-held lag. It has a bounce-light approximation, dust motes in the beam, battery drain, and flickers when the creature is close.
- **The creature.** A stretched mannequin body with a real scanned human face and hollow eyes, plus procedural twitching and a hunched, elongated rig. Its AI patrols with a director bias toward you, investigates noises (footsteps, doors), and has a sight cone that reacts to your light and crouching. It chases, searches the last known position, bursts doors open, uses the stairs, and will drag you out of a wardrobe if it saw you get in.
- **Sound.** Positional HRTF audio with a convolution reverb and wall occlusion filtering. Recorded foley covers footsteps on wood, carpet, tile and concrete, plus doors and impacts. The drone, wind, heartbeat, breathing, growl, screech, whispers, clock chime, TV static and electrical hum are synthesised live.
- **Puzzle chain.** Mirror-clock riddle → cellar key → three hidden fuses → restore power → the TV broadcasts the cage code (randomised each run) → bolt cutters → escape.
- **Survival systems.** Stamina, hiding spots, checkpoints, scripted and random scares, and four graphics quality presets.

## Performance

- **Optimised assets.** `tools/optimize-assets.mjs` turns the full-quality Poly Haven sources (kept locally in `assets-src/`, not committed) into web assets. It simplifies meshes to a triangle budget with meshoptimizer, merges draw calls, converts textures to WebP, and writes meshopt-compressed `.glb` files. Result: 870k → 158k triangles and 126 MB → 24 MB.
- **Light pooling.** Every candle, lamp and bulb is a light *source*; each frame the most relevant ones are assigned to a fixed pool of 2–6 real lights, so shader cost stays flat and nothing recompiles.
- **Adaptive resolution and quality presets.** Ambient occlusion only on Ultra, FXAA below Ultra, PCF shadows on Low/Medium.
- **Cheaper CPU work.** BVH raycasting (three-mesh-bvh), frozen static matrices, small props don't cast shadows, and all shaders are precompiled at load so there are no mid-game hitches.

Benchmarks: `node tools/bench.mjs "debug&nolock&quality=high"` (with the dev server running).

## Project layout

```
src/
  core/      Input, Audio (WebAudio engine)
  render/    Renderer + post-processing
  world/     Assets, Level (grid → geometry, colliders, line of sight), Door, Props
  player/    Player controller, Flashlight
  ai/        NavGrid (A*), Monster
  game/      Game loop/flow, Story (puzzles, notes, scares, checkpoints), Interaction
  ui/        HUD, notes, clock and lock puzzles
public/assets/  textures, models, sounds, fonts
tools/shot.mjs  headless screenshot/test harness (puppeteer-core + local Chrome)
tools/bench.mjs uncapped FPS / draw-call benchmark
tools/optimize-assets.mjs  asset build pipeline (assets-src/ -> public/assets/)
```

Debug URL parameters (for testing): `?debug&nolock&flags=flashlight,cellar,power&pos=x,z,yaw&monster=x,z,phase&quality=low|medium|high|ultra`. The game instance is exposed as `window.game`.

## Credits

- Textures and furniture models: [Poly Haven](https://polyhaven.com) (CC0)
- Foley: [Kenney](https://kenney.nl) RPG Audio and Impact Sounds (CC0)
- Creature rig: Mixamo X Bot via the three.js examples
- Face scan: Lee Perry-Smith head by [Infinite-Realities](https://ir-ltd.net) (CC BY 3.0)
- Fonts: Special Elite, Homemade Apple, Cormorant Garamond (SIL OFL)
- Engine: [three.js](https://threejs.org) (MIT)
