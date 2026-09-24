# CLAUDE.md: Headroom

A browser simulator that answers "will this local AI box serve my people" before someone buys it: pick a box, a model, a server and a crowd, and a discrete-event simulation reports the verdict, what runs out first, and the redline.

**Live:** headroom.neorgon.com · **Port:** 8894

## Run

```bash
make serve     # the site
make test      # engine regression suite, Node, no dependencies, under a second
make pars      # recompute mission pars from the catalog
```

Then open http://localhost:8894. It must be served over HTTP: the app is ES modules, and `file://` blocks them.

## Architecture

| Module | Lines | Owns |
|---|---:|---|
| `js/viz.js` | 387 | `skeleton`, `empty`, `error`, `statGrid`, `bars` |
| `js/neorgon-beacon.js` | 358 | none |
| `js/events.js` | 298 | `openModal`, `closeModal`, `bindEvents` |
| `js/engine/sim.js` | 287 | `U`, `createSim`, `runScenario` |
| `js/engine/report.js` | 240 | `DEFAULT_ECON`, `engineSummary`, `buildReport`, `LABELS` |
| `js/ui/floor.js` | 237 | `drawFloor`, `resetFloorLayout` |
| `js/engine/server.js` | 216 | `makeServer`, `admit`, `plan`, `finish`, `dropQueued` |
| `js/engine/perf.js` | 201 | `footprint`, `kvBytes`, `attnFlops`, `weightRead`, `buildEngine` |
| `js/ui/loadout.js` | 199 | `renderLoadout`, `sloText` |
| `js/data/hardware.js` | 190 | `BOXES`, `CUSTOM_BOX`, `STATUS_LABEL`, `boxById` |
| `js/data/models.js` | 165 | `MODELS`, `QUANTS`, `KV_DTYPES`, `modelById`, `quantById` |
| `js/data/crowd.js` | 138 | `PERSONAS`, `CLIENTS`, `LINKS`, `PROTOCOLS`, `BYTES_PER_TOKEN` |
| `js/ui/score.js` | 136 | `ICONS`, `verdictBlock`, `renderScore` |
| `js/engine/batch.js` | 132 | `scaleCrowd`, `findRedline`, `runtimeOn`, `compareBoxes`, `slim` |
| `js/data/missions.js` | 127 | `MISSIONS`, `missionById`, `scoreMission` |
| `js/runner.js` | 119 | `on`, `rebuild`, `play`, `pause`, `skip` |
| `js/state.js` | 119 | `newGroupId`, `defaultScenario`, `CROWDS`, `state`, `loadSaved` |
| `js/ui/charts.js` | 112 | `renderCharts`, `renderBlame` |
| `js/render.js` | 105 | `renderTabs`, `renderTransport`, `renderFrame`, `renderReport`, `renderRedline` |
| `js/engine/network.js` | 89 | `makeLink`, `airtime`, `transmit`, `requestBytes`, `streamBurst` |
| `js/utils.js` | 85 | `$`, `escHtml`, `showToast`, `debounce`, `fmtInt` |
| `js/data/runtimes.js` | 80 | `RUNTIMES`, `runtimeById`, `runtimesFor` |
| `js/engine/rng.js` | 64 | `makeRng`, `hashSeed`, `percentile` |
| `js/ui/compare.js` | 60 | `renderCompareLead`, `renderCompare` |
| `js/data/calibration.js` | 58 | `CALIBRATION`, `BATCH_CALIBRATION` |
| `js/ui/method.js` | 57 | `renderMethod` |
| `js/ui/missions.js` | 51 | `stars`, `renderMissions`, `renderMissionBar`, `renderMissionResult` |
| `js/engine/heap.js` | 43 | `makeHeap` |
| `js/engine/worker.js` | 24 | none |
| `js/app.js` | 21 | none |

Vendored from `packages/neorgon-ui/`, never edit in place; run the sync script instead: `js/neorgon-header.js`, `js/neorgon-footer.js`.

## Data

- `localStorage['headroom:missions']`
- `localStorage['headroom:v1']`

## Conventions

- Zero build step. Plain ES modules loaded by `js/app.js`.
- Header and footer come from the shared kits. Do not add site-local `.neo-footer` or `.header-bar` CSS.
- No single JS file over ~500 lines. It currently holds.

## Gotchas

- **`js/engine/` must stay DOM-free.** It runs in the page, in `js/engine/worker.js` (redline and compare) and in Node (`tests/`). One `document` reference breaks two of the three.
- **Pars are computed, never typed.** A mission's `par` is the cheapest catalog setup that earns a star. Change a price, an efficiency or a mission and `make test` fails until `make pars` agrees with `js/data/missions.js`.
- **Efficiencies are fitted, not guessed.** `js/data/hardware.js` `eff.*` and `js/data/runtimes.js` were tuned against `js/data/calibration.js`; the test asserts typical error under 20%. Moving one to make a mission easier silently breaks the Method tab's honesty table.
- **`.stack` is the template's vertical-rhythm utility.** Horizontal bars are `.bar-stack`; reusing `.stack` draws them as full-width stripes a pixel tall (it shipped that way once).
- **Every edit settles 20 simulated minutes** (`rebuild()` in `js/runner.js`) so a change shows an answer; Restart is `rebuild({ settle: false })` for watching from zero. A new code path that rebuilds must pick one deliberately.
- **Loadout re-renders on every change**, so `commit()` in `js/events.js` restores focus by data attribute. A new control needs a `data-*` key `controlKey()` knows, or keyboard users lose their place.
- **Wi-Fi's 64-client cap often beats the box.** The redline search reports `boxUsers` (the same search with link caps lifted) when `why === 'connections'`; do not "fix" a redline of 63 by raising the cap. The default scenario (gpt-oss-120b on a Spark) is now bandwidth-limited on most seeds, because a Kindle waits out gpt-oss's hidden reasoning.
- **What precedes the first word is modelled.** `models.js` `reasons.min`, persona `lead` and client `thinking` decide when the first visible token leaves the server (`firstIdx` in `sim.js`). A voice lesson that "breaks" after a model change is usually this.
- **Prompt caches key on content** (`prefixKey` in `sim.js`), not on the group. Groups with genuinely different system prompts need distinct `prefixId`s (see the six-language mission).
- **The verdict is not busy time.** `judge()` in `report.js` calls a run tight when the slowest 5% of a group's answers use 80% of its limit (`strain`), or every slot is full on a box over 85% busy. Groups whose persona never pauses (`think: 0`, `readTps: 0`) are background load and never make a run tight on their own.
- **Splits follow the runtime.** `splitMode` in `runtimes.js`: `tensor` multiplies bandwidth and compute, `layer` (llama.cpp RPC) pools memory only, none (Ollama) refuses to split. A split on a box without `pairable` is a fit failure, not a slow run.
- **llama.cpp's slots pool their KV** (`kvUnified`): one request may use slots x context per slot, and admission checks the pool. Ollama keeps fixed per-slot windows and truncates.
- **Stars need a buyable box.** `scoreMission` refuses custom and announced boxes, because pars are solved over shipping ones. A 4-bit KV cache costs 0.1 tier, which moves pars off Q4 KV.
- **Pars are proven on four seeds.** `make pars-check` (minutes) proves each par is still the cheapest setup; `make test` only re-checks the recorded `parSetup`.
- **Playwright's default browser here runs at 80% zoom**, so a 1440 viewport measures 1800 CSS px. Measure layout in a context whose `clientWidth` you have checked.

## Do not touch

- `js/neorgon-*.js` and `css/neorgon-*.css`: vendored kits, regenerated by `packages/neorgon-ui/sync-*.sh`.
