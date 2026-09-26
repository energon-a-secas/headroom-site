// One visual identity per enclosure family. The PNGs are rendered from the
// same original geometry as the interactive scene, not manufacturer photos.
import { enclosureFor, resolveEnclosure } from '../data/enclosures.js';

export function hardwareArt(id, enclosure = '') {
  const chosen = resolveEnclosure(id, enclosure);
  if (chosen) return chosen;
  if (typeof id !== 'string') return 'custom';
  if (enclosureFor(id)) return id;
  if (id.startsWith('mac-mini')) return 'mac-mini';
  if (id.startsWith('mac-')) return 'mac-studio';
  if (id === 'rtx-5090' || id === 'rtx-pro-6000') return id;
  if (['dgx-spark', 'asus-gx10', 'ryzen-ai-halo', 'evo-x2', 'jetson-thor', 'pi5'].includes(id)) return id;
  return 'custom';
}

export const deviceImage = (id, client = false, enclosure = '') => `assets/devices/${client ? (Object.hasOwn(CLIENT_LABELS, id) ? id : 'browser') : hardwareArt(id, enclosure)}.png`;

export const CLIENT_LABELS = {
  browser: ['laptop', 'laptops'], phone: ['phone', 'phones'], kindle: ['e-reader', 'e-readers'],
  speaker: ['speaker', 'speakers'], ide: ['coding station', 'coding stations'], badge: ['e-paper badge', 'e-paper badges'],
};

export const clientLabel = (id, count) => (Object.hasOwn(CLIENT_LABELS, id) ? CLIENT_LABELS[id] : ['device', 'devices'])[count === 1 ? 0 : 1];
