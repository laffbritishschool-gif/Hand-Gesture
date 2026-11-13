# HoloDesk — Hand-Controlled Map Interface

HoloDesk is an experimental browser-based spatial interface. It combines an interactive MapLibre map, Three.js holographic effects, and MediaPipe hand tracking so you can explore a map using webcam gestures.

## Features

- Interactive map with 3D building extrusions where building data is available
- Search for places and fly to the first matching result
- Optional browser geolocation
- Webcam hand tracking using MediaPipe Tasks Vision
- Open-palm horizontal movement to rotate the map
- Pinch gesture to zoom
- Index-finger pointing to select a position on the map
- Three.js holographic rings and particles
- Responsive layout and mouse/touch map controls

> This is a holographic-style display rendered on your laptop screen. It does not project a physical floating hologram into the air.

## Run locally

Requirements: Node.js 20 or newer and a modern browser.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite (usually http://localhost:5173). Allow camera access when prompted. Camera access is supported on localhost and secure HTTPS websites.

To create a production build:

```bash
npm run build
npm run preview
```

## Deploy to Render

This repository includes a `render.yaml` blueprint. In Render:

1. Choose **New → Blueprint** and connect this GitHub repository.
2. Render reads `render.yaml` and creates a static site.
3. The build command is `npm install && npm run build`.
4. The publish directory is `dist`.
5. After deployment, open the HTTPS site and allow camera access.

You can also create a Static Site manually with the same build and publish settings.

## Map and data providers

- Map rendering: [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/)
- Default map style: [OpenFreeMap](https://openfreemap.org/)
- Place search: [Photon](https://photon.komoot.io/)
- Map data and attribution: OpenStreetMap contributors

The public map and search services are convenient for prototyping. For a production service with significant traffic, review each provider's current terms, attribution requirements, rate limits, and service guarantees.

## Camera privacy

Hand landmarks are processed in the browser by MediaPipe. This app does not upload or record webcam video. The browser may download the MediaPipe model and WASM runtime from Google's CDN when hand tracking starts.

## Current prototype limitations

- The point gesture selects a screen position; it does not yet identify a business or address at that point.
- 3D buildings depend on building features being present in the selected map style.
- Hand tracking quality depends on lighting, camera position, and browser/GPU support.
- If the browser cannot initialize the GPU delegate, try a browser with WebGL enabled.

## Project structure

```
index.html
src/
  main.js
  map.js
  handTracking.js
  hologram.js
  style.css
package.json
render.yaml
```

## Next improvements

- Add GPU-to-CPU fallback for hand tracking
- Add a visible gesture calibration and sensitivity control
- Add reverse geocoding for selected map positions
- Add richer map markers and saved places
- Add accessibility controls and automated tests
