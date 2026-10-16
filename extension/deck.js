// Botonazo — modelo del deck: plantillas, validación y la versión que se envía al celular.
//
// Formato guardado (chrome.storage.local › deck):
//   { v: 1, cols: 4, pages: [ { id, name, keys: [ { id, label, icon, color, action } ] } ] }
//   · icon:   'ico:<nombre>' (lib/icons.js) o un emoji
//   · action: { type: '<acción de actions.js>', ...parámetros }
//
// El celular solo recibe lo necesario para dibujar los botones (sin URLs, textos de
// webhooks ni parámetros): al pulsar envía el id y la extensión resuelve la acción.

import { ACTIONS, MAX_MACRO_DELAY, MAX_MACRO_STEPS, NOT_IN_MACRO, defaultParams, stateKeyFor } from './actions.js';
import { ICONS, iconShapes } from './lib/icons.js';

export const DECK_VERSION = 1;
export const LIMITS = { pages: 12, keys: 40, label: 32, pageName: 24, text: 2000 };

export const COLORS = {
  graphite: ['#2C2C31', '#FFFFFF', 'Grafito'],
  red: ['#FF3B30', '#FFFFFF', 'Rojo'],
  orange: ['#FF9F0A', '#FFFFFF', 'Naranja'],
  yellow: ['#FFD60A', '#1C1C1E', 'Amarillo'],
  green: ['#30D158', '#FFFFFF', 'Verde'],
  teal: ['#40C8E0', '#FFFFFF', 'Turquesa'],
  blue: ['#0A84FF', '#FFFFFF', 'Azul'],
  indigo: ['#5E5CE6', '#FFFFFF', 'Índigo'],
  purple: ['#BF5AF2', '#FFFFFF', 'Morado'],
  pink: ['#FF375F', '#FFFFFF', 'Rosa'],
  brown: ['#A2845E', '#FFFFFF', 'Café'],
  white: ['#F2F2F7', '#1C1C1E', 'Blanco'],
};

export function uid() {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b & 31]).join('');
}

// ---------------------------------------------------------------- plantillas

function k(type, label, icon, color, params = {}) {
  return { id: uid(), label, icon: icon.startsWith('ico:') || !/^[a-z]/i.test(icon) ? icon : `ico:${icon}`, color, action: { ...defaultParams(type), ...params } };
}

export const TEMPLATES = {
  inicio: {
    name: 'Inicio',
    title: 'Inicio · lo esencial',
    keys: () => [
      k('capture.screenshot', 'Captura', 'capture', 'blue'),
      k('record.tab', 'Grabar pestaña', 'record', 'red'),
      k('mirror', 'Ver pantalla', 'cast', 'indigo'),
      k('tab.switcher', 'Pestañas', 'tabs', 'graphite'),
      k('tab.prev', 'Anterior', 'chevronsLeft', 'graphite'),
      k('tab.next', 'Siguiente', 'chevronsRight', 'graphite'),
      k('window.next', 'Cambiar ventana', 'windows', 'graphite'),
      k('window.fullscreen', 'Pantalla completa', 'maximize', 'graphite'),
      k('media.toggle', 'Play / Pausa', 'playPause', 'green'),
      k('tab.mute', 'Silenciar', 'mute', 'graphite'),
      k('screen.message', 'Volvemos pronto', 'coffee', 'orange', { text: 'Volvemos en 5 minutos', style: 'full' }),
      k('screen.black', 'Privacidad', 'eyeOff', 'graphite'),
    ],
  },
  obs: {
    name: 'OBS',
    title: 'Transmisión con OBS Studio',
    keys: () => [
      k('obs.stream', 'En vivo', 'live', 'red'),
      k('obs.record', 'Grabar', 'record', 'red'),
      k('obs.pause', 'Pausar', 'pause', 'graphite'),
      k('obs.replay', 'Repetición', 'replay', 'graphite'),
      k('obs.scene', 'Principal', 'scene', 'purple', { scene: 'Principal' }),
      k('obs.scene', 'Pantalla', 'monitor', 'purple', { scene: 'Pantalla' }),
      k('obs.scene', 'Pausa', 'coffee', 'purple', { scene: 'Pausa' }),
      k('obs.mute', 'Micrófono', 'mic', 'graphite', { input: 'Mic/Aux' }),
      k('obs.source', 'Cámara', 'webcam', 'graphite', { source: 'Cámara', scene: '' }),
      k('obs.virtualcam', 'Cámara virtual', 'video', 'graphite'),
      k('screen.confetti', '¡Confeti!', 'sparkles', 'pink'),
      k('screen.toast', 'Gracias', 'heart', 'pink', { text: '¡Gracias por acompañarnos! 💜' }),
    ],
  },
  atajos: {
    name: 'Atajos',
    title: 'Atajos del navegador',
    keys: () => [
      k('tab.new', 'Nueva pestaña', 'plus', 'graphite'),
      k('tab.reload', 'Recargar', 'refresh', 'graphite'),
      k('tab.duplicate', 'Duplicar', 'copy', 'graphite'),
      k('tab.close', 'Cerrar pestaña', 'x', 'red'),
      k('url.open', 'YouTube Studio', 'play', 'red', { url: 'https://studio.youtube.com/', where: 'new' }),
      k('url.open', 'Twitch', 'live', 'purple', { url: 'https://dashboard.twitch.tv/', where: 'new' }),
      k('input.text', 'Saludo', 'hand', 'teal', { text: '¡Hola a todos! 👋', enter: false }),
      k('macro', 'Modo cine', 'film', 'purple', { steps: [{ ...defaultParams('window.fullscreen'), delay: 0 }, { ...defaultParams('media.toggle'), delay: 400 }] }),
      k('page.back', 'Atrás', 'arrowLeft', 'graphite'),
      k('page.zoom', 'Acercar', 'zoomIn', 'graphite', { dir: 'in' }),
      k('page.zoom', 'Alejar', 'zoomOut', 'graphite', { dir: 'out' }),
      k('page.scroll', 'Bajar', 'arrowDown', 'graphite', { dir: 'down' }),
    ],
  },
  multimedia: {
    name: 'Multimedia',
    title: 'Música y video',
    keys: () => [
      k('media.toggle', 'Play / Pausa', 'playPause', 'green'),
      k('media.seek', '−10 s', 'rewind', 'graphite', { seconds: -10 }),
      k('media.seek', '+10 s', 'fastForward', 'graphite', { seconds: 10 }),
      k('media.speed', 'Velocidad', 'speed', 'graphite', { rate: 'cycle' }),
      k('media.volume', 'Bajar volumen', 'volumeDown', 'graphite', { step: -10 }),
      k('media.volume', 'Subir volumen', 'volume', 'graphite', { step: 10 }),
      k('media.mute', 'Silenciar video', 'mute', 'graphite'),
      k('tab.audible', 'Ir al sonido', 'music', 'blue'),
    ],
  },
  vacia: { name: 'Nueva página', title: 'Página en blanco', keys: () => [] },
};

export function pageFromTemplate(name) {
  const tpl = TEMPLATES[name] || TEMPLATES.vacia;
  return { id: uid(), name: tpl.name, keys: tpl.keys() };
}

export function defaultDeck() {
  return { v: DECK_VERSION, cols: 4, pages: ['inicio', 'obs', 'atajos'].map(pageFromTemplate) };
}

// ---------------------------------------------------------------- validación

const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, max) : '');
const ID = /^[a-z0-9]{1,24}$/;

function cleanUrl(v) {
  const s = str(v, 2000).trim();
  if (!s) return '';
  try {
    const u = new URL(s);
    return /^https?:$/.test(u.protocol) ? u.toString() : '';
  } catch {
    return '';
  }
}

function cleanCombo(c) {
  if (!c || typeof c !== 'object' || typeof c.key !== 'string' || !c.key || c.key.length > 24) return null;
  return {
    key: c.key,
    code: typeof c.code === 'string' ? c.code.slice(0, 24) : '',
    ctrl: !!c.ctrl, shift: !!c.shift, alt: !!c.alt, meta: !!c.meta,
  };
}

export function cleanAction(raw, { inMacro = false } = {}) {
  const type = raw && typeof raw === 'object' ? raw.type : null;
  const def = ACTIONS[type];
  if (!def || (inMacro && NOT_IN_MACRO.has(type))) return null;
  const out = { type };
  for (const p of def.params || []) {
    const v = raw[p.key];
    switch (p.type) {
      case 'text':
      case 'textarea':
        out[p.key] = str(v ?? p.def ?? '', LIMITS.text);
        break;
      case 'url':
        out[p.key] = cleanUrl(v);
        break;
      case 'number': {
        const n = Number(v ?? p.def ?? 0);
        out[p.key] = Number.isFinite(n) ? Math.max(p.min ?? -1e6, Math.min(p.max ?? 1e6, n)) : p.def ?? 0;
        break;
      }
      case 'select':
        out[p.key] = p.options.some(([value]) => value === String(v)) ? String(v) : p.def;
        break;
      case 'bool':
        out[p.key] = v === true;
        break;
      case 'combo':
        out[p.key] = cleanCombo(v);
        break;
      case 'page':
        out[p.key] = typeof v === 'string' && ID.test(v) ? v : '';
        break;
      case 'steps':
        out[p.key] = (Array.isArray(v) ? v : []).slice(0, MAX_MACRO_STEPS).map((step) => {
          const a = cleanAction(step, { inMacro: true });
          if (!a) return null;
          const delay = Math.round(Number(step.delay) || 0);
          a.delay = Math.max(0, Math.min(MAX_MACRO_DELAY, delay));
          return a;
        }).filter(Boolean);
        break;
    }
  }
  return out;
}

function cleanIcon(v) {
  if (typeof v !== 'string') return 'ico:zap';
  if (v.startsWith('ico:')) return ICONS[v.slice(4)] ? v : 'ico:zap';
  const text = [...v.trim()].slice(0, 4).join('');
  return text || 'ico:zap';
}

export function normalizeDeck(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.pages)) return defaultDeck();
  const seen = new Set();
  const freshId = (id) => {
    let out = typeof id === 'string' && ID.test(id) && !seen.has(id) ? id : uid();
    while (seen.has(out)) out = uid();
    seen.add(out);
    return out;
  };
  const pages = raw.pages.slice(0, LIMITS.pages).map((p, i) => ({
    id: freshId(p?.id),
    name: str(p?.name, LIMITS.pageName).trim() || `Página ${i + 1}`,
    keys: (Array.isArray(p?.keys) ? p.keys : []).slice(0, LIMITS.keys).map((key) => {
      const action = cleanAction(key?.action);
      if (!action) return null;
      return {
        id: freshId(key.id),
        label: str(key.label, LIMITS.label),
        icon: cleanIcon(key.icon),
        color: COLORS[key.color] ? key.color : 'graphite',
        action,
      };
    }).filter(Boolean),
  }));
  if (!pages.length) pages.push(pageFromTemplate('vacia'));
  const cols = [3, 4, 5].includes(Number(raw.cols)) ? Number(raw.cols) : 4;
  return { v: DECK_VERSION, cols, pages };
}

export function findKey(deck, id) {
  for (const page of deck.pages) {
    const key = page.keys.find((k) => k.id === id);
    if (key) return key;
  }
  return null;
}

// ---------------------------------------------------------------- versión para el celular

export function compileIcon(icon) {
  if (icon.startsWith('ico:')) return { s: iconShapes(icon.slice(4)) || iconShapes('zap') };
  return { e: icon };
}

export function compileDeck(deck) {
  return {
    v: DECK_VERSION,
    cols: deck.cols,
    pages: deck.pages.map((page) => ({
      id: page.id,
      name: page.name,
      keys: page.keys.map((key) => {
        const [bg, fg] = COLORS[key.color] || COLORS.graphite;
        const def = ACTIONS[key.action.type];
        const out = { id: key.id, label: key.label, icon: compileIcon(key.icon), bg, fg };
        const st = stateKeyFor(key.action);
        if (st) out.st = st;
        if (def.ui) out.ui = def.ui;
        if (def.ui === 'page') out.go = key.action.page;
        return out;
      }),
    })),
  };
}

// ---------------------------------------------------------------- almacenamiento

export async function getDeck() {
  const { deck } = await chrome.storage.local.get('deck');
  return deck ? normalizeDeck(deck) : defaultDeck();
}

export async function saveDeck(deck) {
  const clean = normalizeDeck(deck);
  await chrome.storage.local.set({ deck: clean });
  return clean;
}
