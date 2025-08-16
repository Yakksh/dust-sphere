# Dust-sphere - Three.js implementation

## How to use:
- Install three: `npm i three`
- Drop this file into your React app and render `<DustSphereApp/>`

## Defaults:
  ```
  particleCount=5000,
  baseRadius=5,
  pulseAmplitude=0.5,
  pulseSpeed=3,
  rotationSpeed=0.65
  ```

Animation updates particle positions every frame (moves particles along precomputed normals). This gives an "in-and-out" dust pulse.
