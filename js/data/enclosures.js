// Visual choices only. These proportions do not describe dimensions, component
// clearance, cooling or performance. Keep them out of the simulation engine.
export const ENCLOSURES = [
  { id: 'laptop-slim', name: 'Slim laptop', detail: 'A thin aluminum notebook.', kind: 'laptop', extent: 1.95, target: 0.75 },
  { id: 'laptop-pro', name: 'Large laptop', detail: 'A wider screen and deeper chassis.', kind: 'laptop', extent: 2.2, target: 0.85 },
  { id: 'pc-sff', name: 'Small form factor', detail: 'A compact, vented desktop.', kind: 'pc', extent: 1.65, target: 0.55 },
  { id: 'pc-small', name: 'Mini tower', detail: 'A short tower with a mesh front.', kind: 'pc', extent: 1.85, target: 0.8 },
  { id: 'pc-mid', name: 'Mid tower', detail: 'A full desktop with visible internals.', kind: 'pc', extent: 2.2, target: 1.2 },
  { id: 'pc-full', name: 'Full tower', detail: 'A tall workstation with three front fans.', kind: 'pc', extent: 2.65, target: 1.55 },
  { id: 'rack', name: 'Rack server', detail: 'A horizontal chassis with drive bays.', kind: 'pc', extent: 2.05, target: 0.35 },
];

export const enclosuresFor = id => id === 'custom' ? ENCLOSURES
  : ['rtx-5090', 'rtx-pro-6000'].includes(id) ? ENCLOSURES.filter(x => x.kind === 'pc') : [];

export const enclosureFor = id => ENCLOSURES.find(x => x.id === id);
export const resolveEnclosure = (boxId, id) => enclosuresFor(boxId).find(x => x.id === id)?.id || '';
