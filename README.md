# GeoInsight Enterprise — From Satellite to Watershed

An interactive 3D web app for **beginners in Remote Sensing and Hydrology**,
branded with the official GeoInsight Enterprise logo (`assets/gielogo.png`).

## The 11 interactive steps

1. **What is Remote Sensing?** — satellite orbiting Earth with sensor footprint
2. **Passive vs Active Sensors** — animated photons: sunlight vs radar/LiDAR pulses
3. **Measuring Height: Laser Pulses** — live point-cloud scan with point counter
4. **From Points to a Raster Grid** — cells rise to the average of their points (resolution concept)
5. **The DEM — Explore It!** — *hover the terrain* to read any cell's elevation (Identify tool)
6. **The Problem: Sinks** — raindrops getting trapped and turning red in depressions
7. **Filling the Sinks — You Do It!** — *drag the fill slider* (or auto-fill) to the pour point
8. **Flow Direction (D8) — Click to Trace!** — *click the terrain* to release a drop and watch its full flow path
9. **Flow Accumulation → Streams** — stream network grows; click-tracing still active
10. **Watersheds — Click a Basin!** — *click any basin* to highlight it and see its area; rain drains to outlets
11. **Recap & Quiz** — 6-question quiz with instant feedback and explanations

All hydrology is **computed for real** in the browser (`js/terrain.js`):
priority-flood sink filling, D8 flow direction, flow accumulation, and
watershed labelling — the same algorithms GIS software uses.

## Run it

Because the app uses ES modules, serve it from a local web server
(opening `index.html` directly via `file://` will not work):

```powershell
# from this folder (any one of these):
python -m http.server 8000
# or
npx serve .
```

Then open <http://localhost:8000>.

Requires an internet connection (three.js is loaded from a CDN).

## Controls

- **Drag** to rotate, **scroll** to zoom
- **◀ / ▶ buttons** or arrow keys to move between steps
- **Auto-play** checkbox advances every 22 s — great for presentations

## Tech

- [three.js](https://threejs.org/) 0.160 (CDN, no build step)
- Vanilla JS + CSS, no dependencies to install
