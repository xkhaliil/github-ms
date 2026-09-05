# ThreeJsDaftPunk

Three.js web experience that renders a Daft Punk 3D model with audio-reactive visuals

![JavaScript](https://img.shields.io/badge/language-JavaScript-yellow)

## What it does

Loads a 3D model (`public/daft.glb`) into a Three.js scene rendered in the browser. The app plays an audio track (`public/music.mp3`) triggered via a play button, with commit history indicating audio initialization and visualizer features tied to the model. Includes `lil-gui` for on-screen controls and `stats.js` for performance monitoring during development.

## Tech stack

- [three](https://threejs.org/) - 3D rendering
- [lil-gui](https://github.com/georgealways/lil-gui) - debug/control UI
- [stats.js](https://github.com/mrdoob/stats.js) - performance monitoring overlay
- [vite](https://vitejs.dev/) - dev server and build tool

## Getting started

```bash
npm install
npm run dev      # start local dev server
npm run build    # production build
npm run preview  # preview the production build
```

## Usage

Open the app in a browser after running `npm run dev`. Interact with the play button to trigger audio playback, and use the `lil-gui` panel for any exposed scene controls.

<!-- TODO: add a screenshot -->

## License

No license file is present in this repository.
