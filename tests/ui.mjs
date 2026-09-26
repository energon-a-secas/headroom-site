// Browser checks for the optional 3D view and the configuration workflow.
// Requires Playwright in the developer environment and a running make serve.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { LOCAL_SETUPS, createSetupScenario } from '../js/data/setups.js';
import { ENCLOSURES } from '../js/data/enclosures.js';

const url = process.env.HEADROOM_URL || 'http://localhost:8894';
const browser = await chromium.launch({ headless: true });
let passed = 0;
const check = async (label, fn) => { await fn(); passed++; console.log(`ok   ${label}`); };
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  const ready3D = () => page.waitForFunction(() => !document.getElementById('deviceFloor').hidden);
  const setup = name => page.locator(`.setup-nav [data-setup="${name}"]`).click();
  const assetsLoaded = async () => {
    await page.waitForFunction(() => [...document.querySelectorAll('img[src^="assets/devices/"]')].filter(i => {
      const r = i.getBoundingClientRect();
      return r.width && r.height && r.bottom > 0 && r.top < innerHeight;
    }).every(i => i.complete && i.naturalWidth > 0));
  };
  const legendTotal = () => page.locator('#floorLegend b').evaluateAll(nodes => nodes.reduce((n, el) => n + Number(el.textContent), 0));

  await check('the welcome appears once, can be dismissed, and can be reopened', async () => {
    assert.equal(await page.locator('#welcomeDialog').isVisible(), true);
    await page.getByRole('button', { name: 'Explore the sandbox' }).click();
    assert.equal(await page.locator('#welcomeDialog').isVisible(), false);
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('#welcomeDialog').isVisible(), false);
    await page.getByRole('button', { name: 'Quick start', exact: true }).click();
    assert.equal(await page.locator('#welcomeDialog').isVisible(), true);
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => !!document.activeElement.closest('#welcomeDialog')), true);
    }
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#welcomeBtn').evaluate(el => el === document.activeElement), true);
  });
  await check('default scenario renders real 3D and local device artwork', async () => {
    await ready3D(); await assetsLoaded();
    assert.match(await page.locator('#sceneSummary').textContent(), /DGX Spark.*50 users/);
    assert.equal(await legendTotal(), 50);
    assert.match(await page.locator('.verdict__label').textContent(), /Tight/);
  });
  await check('camera buttons and keyboard change the rendered view', async () => {
    const before = await page.locator('#deviceFloor').screenshot();
    await page.getByRole('button', { name: 'Rotate view right', exact: true }).click();
    const after = await page.locator('#deviceFloor').screenshot();
    assert.ok(!before.equals(after));
    await page.locator('#deviceFloor').focus(); await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('+');
    assert.ok(!after.equals(await page.locator('#deviceFloor').screenshot()));
    await page.getByRole('button', { name: 'Reset camera', exact: true }).click();
  });
  await check('Activity and 3D views preserve the same simulation', async () => {
    const clock = await page.locator('#clock').textContent();
    await page.locator('[data-scene-view="activity"]').click();
    assert.equal(await page.locator('#floor').isVisible(), true);
    assert.equal(await legendTotal(), 50);
    await page.locator('[data-scene-view="devices"]').click(); await ready3D();
    assert.equal(await page.locator('#clock').textContent(), clock);
  });
  await check('every hardware selection has a rendered enclosure and usable controls', async () => {
    const boxes = await page.locator('[data-k="box.id"] option').evaluateAll(opts => opts.map(o => o.value));
    for (const id of boxes) {
      await page.locator('[data-k="box.id"]').selectOption(id);
      await assetsLoaded(); await ready3D();
      assert.ok((await page.locator('#sceneSummary').textContent()).length > 10);
    }
    await page.locator('[data-k="box.id"]').selectOption('pi5');
    assert.equal(await page.locator('#sceneLoad').textContent(), 'Model does not fit');
    await page.locator('[data-k="box.id"]').selectOption('dgx-spark');
    await page.locator('[data-k="box.count"]').selectOption('8');
    assert.match(await page.locator('#sceneSummary').textContent(), /× 8/);
    await page.locator('[data-k="box.count"]').selectOption('1');
  });
  await check('presets, mixed devices and group inspection remain connected to configuration', async () => {
    for (const preset of ['family', 'crew', 'office', 'class', 'mesh']) {
      await page.locator(`[data-crowd="${preset}"]`).click();
      await assetsLoaded(); await ready3D();
      assert.equal(await page.locator(`[data-crowd="${preset}"]`).getAttribute('aria-pressed'), 'true');
    }
    await page.locator('[data-crowd="family"]').click();
    assert.equal(await page.locator('.connected-group').count(), 3);
    assert.equal(await legendTotal(), 5);
    await page.locator('[data-inspect-group="1"]').click();
    assert.equal(await page.locator('[data-g="1"][data-f="count"]').evaluate(el => el === document.activeElement), true);
    await page.locator('[data-g="1"][data-f="count"]').fill('3');
    await page.locator('[data-g="1"][data-f="count"]').press('Enter');
    assert.equal(await legendTotal(), 7);
    const detail = page.locator('.group').nth(1).locator('details');
    await detail.locator('summary').click();
    const distance = page.locator('[data-g="1"][data-f="distance"]');
    await distance.focus(); await distance.fill('12'); await distance.press('Enter');
    assert.equal(await detail.getAttribute('open'), '');
    assert.equal(await distance.evaluate(el => el === document.activeElement), true);
  });
  await check('large crowds show a bounded 3D sample and exact live totals', async () => {
    await page.locator('[data-crowd="kindle"]').click();
    const count = page.locator('[data-g="0"][data-f="count"]');
    await count.fill('5000'); await count.press('Enter');
    assert.match(await page.locator('#sceneCaption').textContent(), /72 of 5,000 devices shown/);
    assert.equal(await legendTotal(), 5000);
    await page.locator('[data-scene-view="activity"]').click();
    assert.equal(await legendTotal(), 5000);
    await page.locator('[data-scene-view="devices"]').click();
    await page.locator('#resetAllBtn').click();
  });
  await check('model and runtime changes retain keyboard focus and refresh results', async () => {
    await setup('model');
    const model = page.locator('[data-k="model.id"]');
    await model.focus(); await model.selectOption('gpt-oss-20b');
    assert.equal(await model.evaluate(el => el === document.activeElement), true);
    assert.match(await page.locator('#sceneSummary').textContent(), /gpt-oss-20b/);
    await page.locator('[data-k="runtime.id"]').selectOption('ollama');
    assert.match(await page.locator('.setup-recap').textContent(), /Ollama/);
    await page.locator('#resetAllBtn').click();
  });
  await check('run, pause, restart, skip and redline still drive the engine', async () => {
    const before = await page.locator('#clock').textContent();
    await page.locator('#playBtn').click();
    await page.waitForFunction(t => document.getElementById('clock').textContent !== t, before);
    await page.locator('#playBtn').click();
    assert.equal(await page.locator('#sceneStatus').textContent(), 'Simulation paused');
    await page.locator('#restartBtn').click();
    assert.equal(await page.locator('#clock').textContent(), '00:00:00');
    await page.locator('#skipBtn').click();
    assert.equal(await page.locator('#clock').textContent(), '00:20:00');
    await page.locator('#redlineBtn').click();
    await page.waitForFunction(() => !document.getElementById('redlineBtn').disabled);
    assert.equal((await page.locator('#redlineCard .big').textContent()).trim(), '62');
  });
  await check('comparison renders device pictures and loads a selected box', async () => {
    await page.locator('#tab-compare').click();
    await page.locator('#compareRedline').uncheck();
    await page.locator('#compareBtn').click();
    await page.waitForFunction(() => !document.getElementById('compareBtn').disabled);
    await assetsLoaded();
    assert.ok(await page.locator('.compare-device').count() >= 10);
    await page.locator('.row-load').first().click();
    assert.equal(await page.locator('#tab-sandbox').getAttribute('aria-selected'), 'true');
    await page.locator('#resetAllBtn').click();
  });
  await check('the layout fits mobile, tablet and desktop without horizontal overflow', async () => {
    for (const width of [320, 390, 768, 1024, 1280, 1600, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.waitForTimeout(180);
      const sizes = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
      assert.ok(sizes.scroll <= sizes.client + 1, `${width}px viewport overflows: ${JSON.stringify(sizes)}`);
      assert.equal(await page.locator('#deviceFloor').isVisible(), true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.locator('#setupContent').isVisible(), false);
    await page.locator('[data-act="toggle-setup"]').click();
    assert.equal(await page.locator('#setupContent').isVisible(), true);
    await setup('people');
    assert.equal(await page.locator('[data-g="0"][data-f="count"]').isVisible(), true);
    await page.locator('[data-act="toggle-setup"]').click();
    assert.equal(await page.locator('#setupContent').isVisible(), false);
  });
  await check('keyboard tab navigation and mission crowd locking still work', async () => {
    await page.setViewportSize({ width: 1600, height: 1100 });
    await page.locator('#tab-sandbox').focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#tab-setups').getAttribute('aria-selected'), 'true');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#tab-missions').getAttribute('aria-selected'), 'true');
    await page.locator('[data-mission]').first().click();
    await setup('people');
    assert.equal(await page.locator('#loadout .locked').getAttribute('inert'), '');
    await page.locator('#leaveMissionBtn').click();
    await page.locator('#tab-method').click();
    assert.equal(await page.locator('#view-method').isVisible(), true);
    await page.locator('#tab-sandbox').click(); await ready3D();
  });
  await check('local setups are discoverable and OS filters preserve keyboard focus', async () => {
    await page.locator('.browse-setups').click();
    assert.equal(await page.locator('#tab-setups').evaluate(el => el === document.activeElement), true);
    assert.equal(await page.locator('.local-setup').count(), 8);
    await page.locator('[data-setup-filter="macos"]').click();
    assert.equal(await page.locator('.local-setup').count(), 3);
    assert.equal(await page.locator('[data-setup-filter="macos"]').evaluate(el => el === document.activeElement), true);
    await page.locator('[data-setup-filter="linux"]').click();
    assert.equal(await page.locator('.local-setup').count(), 5);
    await page.locator('[data-setup-filter="all"]').click();
    await assetsLoaded();
  });
  await check('every local example loads its full scenario, fits and preserves cost preferences', async () => {
    await page.locator('#tab-sandbox').click();
    await setup('hardware');
    await page.locator('[data-disclosure="costs"] > summary').click();
    const electricity = page.locator('[data-econ="kwh"]');
    await electricity.fill('0.28'); await electricity.press('Enter');
    for (const preset of LOCAL_SETUPS) {
      await page.locator('#tab-setups').click();
      await page.locator(`[data-local-setup="${preset.id}"]`).click();
      await ready3D(); await assetsLoaded();
      const result = await page.evaluate(async () => {
        const { state } = await import('/js/state.js');
        return { sc: state.sc, fit: state.sim.eng.fit.ok, mission: state.mission, running: state.running };
      });
      const expected = createSetupScenario(preset.id);
      for (const key of ['box', 'model', 'runtime']) assert.deepEqual(result.sc[key], expected[key]);
      const withoutIds = groups => groups.map(({ id, ...g }) => g);
      assert.deepEqual(withoutIds(result.sc.groups), withoutIds(expected.groups));
      assert.equal(result.sc.econ.kwh, 0.28);
      assert.equal(result.fit, true); assert.equal(result.mission, null); assert.equal(result.running, false);
      assert.equal(await page.locator('#tab-sandbox').evaluate(el => el === document.activeElement), true);
    }
  });
  await check('every custom enclosure is usable and changing its appearance preserves performance', async () => {
    for (const shape of ENCLOSURES) {
      await page.locator('#tab-setups').click();
      await page.locator(`[data-build="${shape.id}"]`).click();
      await ready3D(); await assetsLoaded();
      assert.equal(await page.locator('[data-k="box.id"]').inputValue(), 'custom');
      assert.equal(await page.locator('[data-k="box.enclosure"]').inputValue(), shape.id);
      assert.match(await page.locator('.hardware-preview img').getAttribute('src'), new RegExp(`${shape.id}\\.png$`));
      assert.equal(await page.locator('[data-custom="memGB"]').isVisible(), true);
    }
    const metrics = () => page.evaluate(async () => {
      const { state } = await import('/js/state.js');
      const { report: r } = state;
      return { passRate: r.passRate, util: r.util, weights: r.engine.weightsGB, kv: r.engine.kvPoolGB, econ: r.econ };
    });
    const before = await metrics(), picture = await page.locator('#deviceFloor').screenshot();
    const select = page.locator('[data-k="box.enclosure"]');
    await select.focus(); await select.selectOption('pc-sff');
    assert.equal(await select.evaluate(el => el === document.activeElement), true);
    assert.deepEqual(await metrics(), before);
    assert.ok(!picture.equals(await page.locator('#deviceFloor').screenshot()));
    assert.match(await page.locator('.hardware-title').textContent(), /Custom small form factor/);
  });
  await check('custom hardware and enclosures survive reload and shared links', async () => {
    const memory = page.locator('[data-custom="memGB"]');
    await memory.fill('120'); await memory.press('Enter');
    await page.reload({ waitUntil: 'networkidle' }); await ready3D();
    assert.equal(await page.locator('#welcomeDialog').isVisible(), false);
    assert.equal(await page.locator('[data-k="box.enclosure"]').inputValue(), 'pc-sff');
    assert.equal(await page.locator('[data-custom="memGB"]').inputValue(), '120');
    const shared = await page.evaluate(async () => {
      const { state, shareUrl } = await import('/js/state.js'); return shareUrl(state.sc);
    });
    await page.locator('#resetAllBtn').click();
    await page.goto(shared, { waitUntil: 'networkidle' }); await ready3D();
    assert.equal(await page.locator('[data-k="box.enclosure"]').inputValue(), 'pc-sff');
    assert.equal(await page.locator('[data-custom="memGB"]').inputValue(), '120');
    await page.locator('[data-k="box.id"]').selectOption('dgx-spark');
    assert.equal(await page.locator('[data-k="box.enclosure"]').count(), 0);
    assert.match(await page.locator('.hardware-preview img').getAttribute('src'), /dgx-spark\.png$/);
    const fresh = await context.newPage();
    await fresh.goto(shared, { waitUntil: 'networkidle' });
    assert.equal(await fresh.locator('[data-k="box.enclosure"]').inputValue(), 'pc-sff');
    assert.equal(await fresh.locator('[data-custom="memGB"]').inputValue(), '120');
    await fresh.close();
  });
  await check('the setup gallery and custom builder fit narrow screens', async () => {
    await page.locator('#tab-setups').click();
    for (const width of [320, 390, 768, 1024, 1600]) {
      await page.setViewportSize({ width, height: 1000 });
      // The shared header moves overflow actions after its resize observer.
      await page.waitForTimeout(250);
      const sizes = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
      assert.ok(sizes.scroll <= sizes.client + 1, `Setup gallery overflows at ${width}px`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-act="browse-builds"]').click();
    assert.equal(await page.locator('#buildTitle').evaluate(el => el === document.activeElement), true);
    await page.locator('[data-build="laptop-pro"]').click();
    assert.equal(await page.locator('#setupContent').isVisible(), true);
    await page.locator('[data-custom="memGB"]').fill('48');
    await page.locator('[data-custom="memGB"]').press('Enter');
    const sizes = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    assert.ok(sizes[0] <= sizes[1] + 1);
    await page.setViewportSize({ width: 1600, height: 1100 });
    await page.locator('#resetAllBtn').click();
  });
  await check('3D context loss keeps the Activity view and controls usable', async () => {
    await page.locator('#deviceFloor').evaluate(c => c.dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
    assert.equal(await page.locator('#floor').isVisible(), true);
    assert.match(await page.locator('#sceneCaption').textContent(), /3D unavailable/);
    await page.locator('#skipBtn').click();
  });
  await check('browsers without WebGL still receive working simulations and artwork', async () => {
    const fallback = await browser.newContext({ reducedMotion: 'reduce' });
    await fallback.addInitScript(() => {
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) { return type.startsWith('webgl') ? null : get.call(this, type, ...args); };
    });
    const p = await fallback.newPage();
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(url, { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: 'Explore the sandbox' }).click();
    await p.waitForFunction(() => document.getElementById('sceneCaption').textContent.includes('3D unavailable'));
    assert.equal(await p.locator('#floor').isVisible(), true);
    await p.locator('#playBtn').click();
    await p.waitForFunction(() => document.getElementById('clock').textContent !== '00:20:00');
    await p.locator('#playBtn').click();
    await fallback.close();
  });
  assert.deepEqual(errors, [], 'No uncaught browser errors');
  console.log(`\n${passed} browser checks passed.`);
} finally {
  await browser.close();
}
