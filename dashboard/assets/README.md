# Dashboard assets

The dashboard renders agents as 3D characters on a per-world stage. The 3D scene loads `.glb` models from this folder.

**This folder ships empty.** The models that drove the original Fleet HQ dashboard were generated via Tripo3D and the licensing for redistribution is unclear, so they're not included here.

## What you need

For the full visual experience, drop the following files here:

```
assets/
├── skel.glb              ← the agent character (rigged humanoid with idle + walk animations)
├── world-hq.glb          ← HQ stage
├── world-research.glb    ← Research stage
├── world-intelligence.glb
├── world-etsy.glb
├── world-youtube.glb
├── world-fiverr.glb
├── world-ai-dropship.glb
├── world-examplebrand.glb
└── (optional) matching .jpg or .webp previews used as fallback
```

## Where to source models

- **Tripo3D** ([tripo3d.ai](https://tripo3d.ai)) — text-to-3D, decent quality, paid credits
- **Meshy** ([meshy.ai](https://meshy.ai)) — text-to-3D and image-to-3D, free tier
- **Mixamo** ([mixamo.com](https://mixamo.com)) — free rigged characters with animations (good for `skel.glb`)
- **Sketchfab** ([sketchfab.com](https://sketchfab.com)) — search "rigged humanoid" with CC license filter
- **Ready Player Me** ([readyplayer.me](https://readyplayer.me)) — generate avatars in browser, exports .glb

## Naming convention

The dashboard expects:
- `skel.glb` — a single character model used for every agent (cloned via `SkeletonUtils` in `three-sprites.js`). Must have `idle` and `walk` animation clips.
- `world-<id>.glb` — one file per world `id` declared in `~/.fleet/config/worlds.tsv`.

If a `.glb` is missing, the dashboard falls back to the 2D SVG stage for that world. Agents still render but as flat sprites.
