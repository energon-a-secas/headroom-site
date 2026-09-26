# Device artwork

These 24 transparent PNGs are original renders of the procedural models in
`js/ui/device-models.js`, using the same lighting as the interactive scene.
They are illustrative representations, not manufacturer photos or exact CAD.
Enclosure families are mapped in `js/ui/device-art.js`; generic and announced
hardware uses the custom enclosure, and Mac configurations share their family.

Seven additional families in `js/data/enclosures.js` cover slim and large
laptops, compact PCs, mini/mid/full towers and a rack server. These are generic
illustrations, not licensed manufacturer CAD or verified component layouts.
The UI can select them for custom builds and compatible desktop categories.
Their proportions never supply values to the performance engine.

Regenerate after editing geometry:

```sh
make serve
# In another terminal, with Playwright available in the developer environment:
node scripts/render-device-art.mjs
```

Set `HEADROOM_URL` if the dev server runs on another port. Playwright is a
developer utility only; the site loads the committed PNGs directly.
