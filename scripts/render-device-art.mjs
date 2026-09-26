// Developer utility: node scripts/render-device-art.mjs (requires Playwright).
// Serve the site first with make serve. No build step is needed by the app.
import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(process.env.HEADROOM_URL || 'http://localhost:8894', { waitUntil: 'networkidle' });
  const images = await page.evaluate(async () => {
    const T = await import('/js/vendor/three/three.module.js');
    const { createHardware, createClient } = await import('/js/ui/device-models.js');
    const { ENCLOSURES, enclosureFor } = await import('/js/data/enclosures.js');
    const families = ['dgx-spark', 'asus-gx10', 'ryzen-ai-halo', 'evo-x2', 'jetson-thor', 'mac-studio', 'mac-mini', 'rtx-5090', 'rtx-pro-6000', 'pi5', 'custom'];
    const clients = ['browser', 'phone', 'kindle', 'speaker', 'ide', 'badge'];
    const renderer = new T.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(600, 400); renderer.setPixelRatio(1);
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.3;
    const scene = new T.Scene(); scene.add(new T.HemisphereLight('#e2effb', '#404b61', 3));
    const key = new T.DirectionalLight('#fff0d9', 4.2); key.position.set(-5, 9, 5); scene.add(key);
    const rim = new T.DirectionalLight('#b8d6ff', 2.5); rim.position.set(5, 5, -4); scene.add(rim);
    const output = [];
    for (const id of [...families, ...ENCLOSURES.map(x => x.id), ...clients]) {
      const client = clients.includes(id), tall = ['rtx-5090', 'rtx-pro-6000', 'custom'].includes(id);
      const model = client ? createClient(id) : createHardware(id); scene.add(model);
      const enclosure = enclosureFor(id);
      const extent = enclosure?.extent ?? (client ? 0.63 : tall ? 1.75 : 1.85);
      const camera = new T.OrthographicCamera(-extent * 1.5, extent * 1.5, extent, -extent, 0.1, 80);
      camera.position.set(4, 3.7, 5); camera.lookAt(0, enclosure?.target ?? (client ? 0.18 : tall ? 1.03 : 0.4), 0);
      camera.updateProjectionMatrix(); renderer.render(scene, camera);
      output.push({ id, data: renderer.domElement.toDataURL('image/png').split(',')[1] });
      scene.remove(model);
    }
    renderer.dispose(); return output;
  });
  const dir = new URL('../assets/devices/', import.meta.url);
  await mkdir(dir, { recursive: true });
  for (const { id, data } of images) await writeFile(new URL(`${id}.png`, dir), Buffer.from(data, 'base64'));
  console.log(`Rendered ${images.length} device thumbnails from the interactive models.`);
} finally {
  await browser.close();
}
