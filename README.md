# WebGL × Haptics Demo

Interactive 3D WebGL demo with haptic feedback using [web-haptics](https://haptics.lochie.me/).

Touch or click 3D objects to trigger different vibration patterns on mobile devices.

## Objects & Haptic Patterns

| Object | Pattern | Description |
|--------|---------|-------------|
| 🔵 Sphere | `success` | Two short taps |
| 🟡 Cube | `nudge` | Strong + soft tap |
| 🔴 Torus | `error` | Three sharp taps |
| 🟢 Cone | `buzz` | Long vibration |
| 🟣 Icosahedron | `custom` | Custom multi-step pattern |

## Tech Stack

- [Three.js](https://threejs.org/) — WebGL 3D rendering
- [web-haptics](https://haptics.lochie.me/) — Mobile haptic feedback
- [Vite](https://vitejs.dev/) — Build tool

## Development

```bash
npm install
npm run dev
```

## Deploy

```bash
npm run build
npm run deploy
```

## Live Demo

[https://aratahorie.github.io/WebHapticsTest/](https://aratahorie.github.io/WebHapticsTest/)