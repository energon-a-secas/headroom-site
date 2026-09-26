# Three.js 0.186.1

`three.module.js` is a minified, bundled subset of Three.js, distributed under
the adjacent MIT `LICENSE`. It is loaded only by the optional 3D scene.

Source: https://registry.npmjs.org/three/-/three-0.186.1.tgz

Package integrity (SHA-512):
`blFeqb49wRCSGUGj7gtpfnSGHy2lwDk94RhUmS1c/hTby70kvChbWpkJ4Pm1390LqzzvTmzgXKHPEafJwCb8jA==`

To reproduce, extract the package and bundle an ES module re-exporting the names
below from `package/build/three.module.js` using esbuild with `bundle: true`,
`format: 'esm'`, `target: 'es2020'`, `minify: true`, and `legalComments: 'eof'`.
The ES2020 target lowers class static blocks and preserves their initialization
order with the repository's esbuild version. Include the package LICENSE.

```js
export {
  ACESFilmicToneMapping, BoxGeometry, BufferGeometry, CanvasTexture,
  CircleGeometry, Color, CylinderGeometry, DirectionalLight, DoubleSide,
  ExtrudeGeometry, Float32BufferAttribute, Group, HemisphereLight, Line,
  LineBasicMaterial, LineDashedMaterial, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, OrthographicCamera, PlaneGeometry, Points,
  PointsMaterial, RingGeometry, Scene, Shape, SphereGeometry,
  SRGBColorSpace, Vector3, WebGLRenderer,
} from './package/build/three.module.js';
```

There is no build step, package install, or external library request at runtime.
