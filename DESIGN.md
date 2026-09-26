---
name: Headroom
description: A local AI workbench with tangible hardware and a readable simulation.
colors:
  accent: "#22d3ee"
  accent-bright: "#67e8f9"
  workspace-surface: "oklch(0.19 0.016 260)"
  workspace-line: "oklch(0.52 0.02 260 / 0.24)"
  workspace-secondary: "oklch(0.77 0.016 260)"
typography:
  heading:
    fontFamily: "Avenir Next, -apple-system, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.035em"
  section:
    fontFamily: "Avenir Next, -apple-system, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
  control:
    fontFamily: "Avenir Next, -apple-system, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
rounded:
  control: "6px"
  workspace: "12px"
spacing:
  compact: "8px"
  section: "18px"
  page: "28px"
---

## Overview

Headroom is a product interface for someone at a desk in the evening comparing
local AI hardware with a shopping tab open. The dark workspace supports that
longer session and follows the existing Neorgon shell. Keep the actual experiment
visible: hardware, devices, activity, and the verdict belong together.

Desktop uses three columns: configuration, simulation, and results. On tablets,
results move below the simulation. On phones, configuration is a compact summary
with an inline Edit setup disclosure, followed by the scene and its results.

## Colors

Fleet primitives come from the shared CDN stylesheet. Do not redeclare them or
edit the vendored header, footer, or theme kits. Workspace-specific surfaces live
in `css/workspace.css`. Cyan indicates actions and selections; status colors
indicate sending, waiting, receiving, and offline users. Pair every state with a
label and a count. Materials in the 3D scene describe devices, not status.

## Typography

Use the inherited system-oriented font stack for all interface text. Hierarchy
comes from weight and spacing; reserve the largest type for the page heading,
the selected hardware, and useful result values. Use tabular figures for timers,
prices, counts, and rates. Supporting technical labels are deliberately compact.

## Elevation

Use low-contrast surfaces and one-pixel borders to separate the three work areas.
Within each area, use dividers and spacing. Avoid nested cards, decorative glass,
and shadows behind every number. Lighting and perspective belong to the device
scene, where they help the visitor recognize physical hardware.

## Components

A brief native welcome dialog holds the introductory copy and device artwork.
Show it once per browser, with a session-storage fallback, and keep Quick start
in the header so people can reopen it. Dismissal supports the primary button,
close button, Escape, and backdrop. Return focus to the trigger or mobile header
menu. Keep the regular workspace free of the introductory heading.

The configuration has Hardware, Model & server, and People sections. Preserve
focus, disclosure state, and scroll position after changing any control. Show
specifications and protocol settings through native details elements.

The device thumbnails and interactive models share original procedural geometry
in `js/ui/device-models.js`. They are illustrative enclosure models, never
manufacturer photographs or dimensional CAD. Multiple configurations can share
an enclosure family. Unknown and announced hardware uses the generic enclosure.
Keep geometry isolated from engine specifications so exact product meshes can
replace the artwork later without affecting results.

Local setups pair hardware, an AI model, a runtime and a workload in complete
examples. Filter by macOS or Linux and load the whole example into the sandbox,
preserving the user's economic preferences. Describe OS as the intended host,
not an extra performance multiplier. Keep the example metadata DOM-free so the
same scenarios can run in Node through `scripts/calculate-setups.mjs`.

The enclosure gallery offers generic laptops, compact PCs, towers and a rack.
Custom builds explicitly name the catalog baseline copied into the spec editor.
Persist their allowlisted `box.enclosure` selection in saved/shareable scenarios.
Case changes affect appearance only; do not imply verified GPU clearance,
cooling, dimensions or a measured laptop profile. Real product research is
scoped in `docs/local-setup-research-handoff.md`.

The 3D scene is optional and lazy-loaded. It responds to simulation states, offers
drag, keyboard, and button camera controls, and falls back to Activity if WebGL
is unavailable. Above 72 users, show a clearly labeled representative sample in
3D; the Activity view and counters continue to include every user. Paused scenes
do not animate. Respect reduced motion and leave browser zoom shortcuts intact.

## Do's and Don'ts

- Keep the simulation and all reports usable without 3D.
- Use local assets with reserved dimensions; avoid manufacturer-image hotlinks.
- Make examples easy to switch and keep the selected crowd visible.
- Label approximations, sampled views, and model-fit failures accurately.
- Keep engine modules DOM-free and preserve the zero-build deployment.
- Do not use the hardware artwork as a source for specs or performance claims.
- Do not change the shared Neorgon kits to achieve a site-specific layout.
