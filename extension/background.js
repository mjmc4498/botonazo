// Botonazo — service worker.
// Coordina la sesión (documento offscreen con la conexión WebRTC), decide qué
// pestaña se controla y ejecuta la acción de cada botón que se pulsa en el celular.

import { DEFAULT_SETTINGS, ID_PREFIX, getObsPassword, getSettings } from './config.js';
import { ACTIONS } from './actions.js';
import { compileDeck, findKey, getDeck } from './deck.js';

const OFFSCREEN_PATH = 'offscreen.html';
const SCRIPTS = [
  { js: ['content/main.js'], world: 'MAIN' },
  { js: ['content/isolated.js'], world: 'ISOLATED' },
];
const EMPTY_STATE = { active: false, status: 'idle', error: null, devices: [], targetTabId: null, recTab: false, recScreen: false };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- ajustes

let settings = { ...DEFAULT_SETTINGS };
const settingsReady = getSettings().then((s) => { settings = s; });

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.settings) {
    const before = settings;
    settings = { ...DEFAULT_SETTINGS, ...(changes.settings.newValue || {}) };
    if (before.followActiveTab !== settings.followActiveTab) targetChanged();
    if (before.obsEnabled !== settings.obsEnabled || before.obsHost !== settings.obsHost || before.obsPort !== settings.obsPort) pushObsConfig();
  }
  if (area === 'local' && changes.deck) deckChanged();
  if (area === 'local' && changes.obsPassword) pushObsConfig();
});

// ---------------------------------------------------------------- estado de la sesión

let state = null;

async function loadState() {
  if (!state) {
    const { state: saved } = await chrome.storage.session.get('state');
    state = { ...EMPTY_STATE, ...(saved || {}) };
  }
  return state;
}

async function patchState(patch) {
  await loadState();
  state = { ...state, ...patch };
  await chrome.storage.session.set({ state });
  updateBadge();
  return state;
}

function updateBadge() {
  const s = state || EMPTY_STATE;
  if (s.active && (s.recTab || s.recScreen)) {
    chrome.action.setBadgeText({ text: 'REC' });
    chrome.action.setBadgeBackgroundColor({ color: '#FF3B30' });
  } else {
    const count = s.active ? s.devices.length : 0;
    chrome.action.setBadgeText({ text: count ? String(count) : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#FF9F0A' });
  }
  chrome.action.setBadgeTextColor?.({ color: '#FFFFFF' });
}

// ---------------------------------------------------------------- identidad

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

function randomId(length) {
  return Array.from(crypto.getRandomValues(new Uint8Array(length)), (b) => ALPHABET[b & 31]).join('');
}

let identityPromise = null;

function getIdentity(regenerate = false) {
  if (regenerate || !identityPromise) {
    identityPromise = (async () => {
      let identity = regenerate ? null : (await chrome.storage.local.get('identity')).identity;
      if (!identity) {
        identity = { peerId: ID_PREFIX + randomId(16), token: randomId(16) };
        await chrome.storage.local.set({ identity });
      }
      return identity;
    })();
  }
  return identityPromise;
}

// ---------------------------------------------------------------- documento offscreen

let creatingOffscreen = null;

async function hasOffscreen() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_PATH)],
  });
  return contexts.length > 0;
}

async function ensureOffscreen() {
  if (await hasOffscreen()) return;
  creatingOffscreen ??= chrome.offscreen
    .createDocument({
      url: OFFSCREEN_PATH,
      reasons: ['WEB_RTC', 'USER_MEDIA', 'BLOBS', 'CLIPBOARD'],
      justification: 'Mantener la conexión WebRTC con el celular, grabar la pestaña elegida, guardar el video y copiar texto al portapapeles.',
    })
    .finally(() => { creatingOffscreen = null; });
  await creatingOffscreen;
}

async function closeOffscreen(reason) {
  if (!(await hasOffscreen())) return;
  await chrome.runtime.sendMessage({ to: 'offscreen', type: 'stop', reason }).catch(() => {});
  await chrome.offscreen.closeDocument().catch(() => {});
}

function toOffscreen(msg) {
  return chrome.runtime.sendMessage({ to: 'offscreen', ...msg }).catch(() => null);
}

// ---------------------------------------------------------------- scripts de contenido

const injecting = new Map();

function inject(tabId) {
  if (!injecting.has(tabId)) {
    const job = (async () => {
      try {
        for (const s of SCRIPTS) {
          await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: s.js, world: s.world, injectImmediately: true });
        }
        return true;
      } catch {
        return false;
      }
    })();
    injecting.set(tabId, job);
    job.finally(() => setTimeout(() => injecting.delete(tabId), 500));
  }
  return injecting.get(tabId);
}

async function sendToTab(tabId, cmd, { injectIfMissing = true } = {}) {
  const message = { botonazo: cmd };
  try {
    return await chrome.tabs.sendMessage(tabId, message, { frameId: 0 });
  } catch {
    if (!injectIfMissing || !(await inject(tabId))) return null;
    try {
      return await chrome.tabs.sendMessage(tabId, message, { frameId: 0 });
    } catch {
      return null;
    }
  }
}

// ---------------------------------------------------------------- pestaña objetivo

function isScriptable(url = '') {
  if (!/^(https?|file):/.test(url)) return false;
  return !/^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore)/.test(url);
}

function hostOf(url = '') {
  try { return new URL(url).hostname; } catch { return ''; }
}

// Pestaña activa de la última ventana normal enfocada (no el estudio ni el popup).
async function activeTab() {
  const win = await chrome.windows.getLastFocused({ windowTypes: ['normal'] }).catch(() => null);
  if (!win) return null;
  const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
  return tab || null;
}

async function targetTab() {
  await settingsReady;
  const s = await loadState();
  let tab = null;
  if (!settings.followActiveTab && s.targetTabId != null) tab = await chrome.tabs.get(s.targetTabId).catch(() => null);
  tab ??= await activeTab();
  const id = tab?.id ?? null;
  if (id !== s.targetTabId) await patchState({ targetTabId: id });
  return tab;
}

async function setTarget(tabId) {
  await patchState({ targetTabId: tabId });
  targetChanged();
}

async function targetInfo() {
  const tab = await targetTab();
  if (!tab) return { t: 'target', title: '', host: '', ok: false };
  const host = hostOf(tab.url);
  return { t: 'target', title: tab.title || host, host, ok: isScriptable(tab.url) };
}

let targetTimer = 0;
function targetChanged() {
  clearTimeout(targetTimer);
  targetTimer = setTimeout(async () => {
    if (!(await loadState()).active) return;
    toOffscreen({ type: 'broadcast', msg: await targetInfo() });
    pushStates();
  }, 200);
}

chrome.tabs.onActivated.addListener(() => targetChanged());
chrome.windows.onFocusChanged.addListener((windowId) => { if (windowId !== chrome.windows.WINDOW_ID_NONE) targetChanged(); });
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(`ov:${tabId}`);
  if (tabId === state?.targetTabId) targetChanged();
});
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'loading' && info.url) chrome.storage.session.remove(`ov:${tabId}`);
  if (tabId === state?.targetTabId && (info.title || info.url || info.mutedInfo || info.pinned !== undefined)) targetChanged();
});
chrome.windows.onBoundsChanged?.addListener(() => pushStates());
chrome.windows.onRemoved.addListener(async (windowId) => {
  const { studio } = await chrome.storage.session.get('studio');
  if (studio?.windowId === windowId) {
    await chrome.storage.session.remove('studio');
    await patchState({ recScreen: false });
    pushStates();
  }
});

// ---------------------------------------------------------------- estados de los interruptores

async function chromeStates() {
  const tab = await targetTab();
  const out = {};
  if (tab) {
    const win = await chrome.windows.get(tab.windowId).catch(() => null);
    const key = `ov:${tab.id}`;
    const overlay = (await chrome.storage.session.get(key))[key];
    out['tab.muted'] = !!tab.mutedInfo?.muted;
    out['tab.pinned'] = !!tab.pinned;
    out['window.fullscreen'] = win?.state === 'fullscreen';
    out['screen.black'] = !!overlay?.black;
    if (overlay?.message) out[`screen.message:${overlay.message}`] = true;
  }
  const { studio } = await chrome.storage.session.get('studio');
  out['rec.screen'] = studio?.recording ? studio.since || true : false;
  return out;
}

let statesTimer = 0;
function pushStates() {
  clearTimeout(statesTimer);
  statesTimer = setTimeout(async () => {
    if (!(await loadState()).active) return;
    toOffscreen({ type: 'states', states: await chromeStates() });
  }, 120);
}

// ---------------------------------------------------------------- deck y OBS

async function deckChanged() {
  if (!(await loadState()).active) return;
  toOffscreen({ type: 'broadcast', msg: { t: 'deck', deck: compileDeck(await getDeck()) } });
  pushObsConfig();
}

async function obsBoot() {
  await settingsReady;
  const deck = await getDeck();
  const inputs = new Set();
  const sources = new Map();
  const visit = (a) => {
    if (a.type === 'obs.mute' && a.input) inputs.add(a.input);
    if (a.type === 'obs.source' && a.source) sources.set(`${a.scene || ''}|${a.source}`, { scene: a.scene || '', source: a.source });
    if (a.type === 'macro') a.steps.forEach(visit);
  };
  for (const page of deck.pages) for (const key of page.keys) visit(key.action);
  return {
    config: { enabled: !!settings.obsEnabled, host: settings.obsHost || 'localhost', port: Number(settings.obsPort) || 4455, password: await getObsPassword() },
    watch: { inputs: [...inputs], sources: [...sources.values()] },
  };
}

async function pushObsConfig() {
  if (!(await loadState()).active) return;
  const boot = await obsBoot();
  toOffscreen({ type: 'obs:config', config: boot.config, watch: boot.watch });
}

// ---------------------------------------------------------------- utilidades de acciones

class UserError extends Error {}
const fail = (message) => { throw new UserError(message); };

async function requireTab({ scriptable = false } = {}) {
  const tab = await targetTab();
  if (!tab) fail('No hay ninguna pestaña abierta.');
  if (scriptable && !isScriptable(tab.url)) fail('Chrome no permite usar esta acción en esta página. Cambia a una pestaña normal.');
  return tab;
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`;
}

const short = (text, n = 40) => (text && text.length > n ? `${text.slice(0, n - 1)}…` : text || '');

function duration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

async function focusTab(tab) {
  await chrome.tabs.update(tab.id, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
  if (!settings.followActiveTab) await setTarget(tab.id);
}

async function overlay(tab, cmd) {
  const res = await sendToTab(tab.id, cmd);
  if (!res) fail('No se pudo mostrar en esta página. Recárgala e inténtalo otra vez.');
  if (res.overlay) await chrome.storage.session.set({ [`ov:${tab.id}`]: res.overlay });
  return res;
}

async function base64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function capture(windowId, options) {
  try {
    return await chrome.tabs.captureVisibleTab(windowId, options);
  } catch (err) {
    // Chrome limita la cantidad de capturas por segundo.
    if (/MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND/.test(String(err?.message))) {
      await sleep(600);
      return chrome.tabs.captureVisibleTab(windowId, options);
    }
    throw err;
  }
}

async function setFullscreen(tab, on) {
  const win = await chrome.windows.get(tab.windowId);
  const isFull = win.state === 'fullscreen';
  if (on === undefined) on = !isFull;
  if (on && !isFull) {
    await chrome.storage.session.set({ [`prevWin:${win.id}`]: win.state });
    await chrome.windows.update(win.id, { state: 'fullscreen', focused: true });
  } else if (!on && isFull) {
    const key = `prevWin:${win.id}`;
    const prev = (await chrome.storage.session.get(key))[key];
    await chrome.windows.update(win.id, { state: prev && prev !== 'fullscreen' ? prev : 'normal' });
  }
  return on;
}

// ---------------------------------------------------------------- multimedia

// Se ejecutan dentro de la página (en cada marco) con chrome.scripting.
function mediaScore() {
  let best = 0;
  for (const m of document.querySelectorAll('video, audio')) {
    const r = m.getBoundingClientRect();
    const area = m.tagName === 'VIDEO' ? Math.max(1, r.width * r.height) : 1;
    best = Math.max(best, (!m.paused ? 1e9 : 0) + (m.currentTime > 0 ? 1e8 : 0) + (m.readyState ? 1e6 : 0) + area);
  }
  return best;
}

async function mediaControl(op, value) {
  const list = [...document.querySelectorAll('video, audio')];
  const score = (m) => {
    const r = m.getBoundingClientRect();
    const area = m.tagName === 'VIDEO' ? Math.max(1, r.width * r.height) : 1;
    return (!m.paused ? 1e9 : 0) + (m.currentTime > 0 ? 1e8 : 0) + (m.readyState ? 1e6 : 0) + area;
  };
  const m = list.sort((a, b) => score(b) - score(a))[0];
  if (!m) return null;
  switch (op) {
    case 'toggle':
      if (m.paused) await m.play().catch(() => {});
      else m.pause();
      return { paused: m.paused };
    case 'seek':
      m.currentTime = Math.max(0, Math.min(Number.isFinite(m.duration) ? m.duration : 1e9, m.currentTime + value));
      return { time: m.currentTime };
    case 'volume':
      if (m.muted && value > 0) m.muted = false;
      m.volume = Math.max(0, Math.min(1, Math.round((m.volume + value / 100) * 100) / 100));
      return { volume: m.volume, muted: m.muted };
    case 'mute':
      m.muted = !m.muted;
      return { muted: m.muted };
    case 'speed': {
      const steps = [1, 1.25, 1.5, 2];
      if (value === 'cycle') {
        const i = steps.findIndex((s) => Math.abs(s - m.playbackRate) < 0.01);
        m.playbackRate = steps[(i + 1) % steps.length];
      } else {
        m.playbackRate = Number(value) || 1;
      }
      return { rate: m.playbackRate };
    }
  }
  return null;
}

async function mediaFrame(tab) {
  const results = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: mediaScore }).catch(() => []);
  const best = results.filter((r) => r.result > 0).sort((a, b) => b.result - a.result)[0];
  return best ? best.frameId : null;
}

async function media(op, value) {
  const audible = await chrome.tabs.query({ audible: true });
  const { lastMediaTab } = await chrome.storage.session.get('lastMediaTab');
  const target = await targetTab();
  const candidates = [];
  const add = (t) => { if (t && !candidates.some((c) => c.id === t.id)) candidates.push(t); };
  add(audible.find((t) => t.id === lastMediaTab));
  audible.forEach(add);
  add(target);
  if (lastMediaTab != null) add(await chrome.tabs.get(lastMediaTab).catch(() => null));
  for (const tab of candidates) {
    if (!isScriptable(tab.url)) continue;
    const frameId = await mediaFrame(tab);
    if (frameId == null) continue;
    // Los argumentos deben ser JSON: undefined no se admite.
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [frameId] }, func: mediaControl, args: [op, value ?? null] });
    await chrome.storage.session.set({ lastMediaTab: tab.id });
    return res?.result || {};
  }
  fail('No hay ningún video o audio en las pestañas abiertas.');
}

// ---------------------------------------------------------------- acciones

const ZOOM_LEVELS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];

async function cycleTab(dir) {
  const tab = await requireTab();
  const tabs = await chrome.tabs.query({ windowId: tab.windowId });
  if (tabs.length < 2) fail('Solo hay una pestaña en esta ventana.');
  const i = tabs.findIndex((t) => t.id === tab.id);
  const next = tabs[(i + dir + tabs.length) % tabs.length];
  await focusTab(next);
  return { msg: short(next.title || hostOf(next.url)) };
}

const RUN = {
  // ---------- capturas y grabación
  async 'capture.screenshot'(a) {
    const tab = await requireTab();
    if (!tab.active) {
      await chrome.tabs.update(tab.id, { active: true });
      await sleep(250);
    }
    const format = settings.shotFormat === 'jpeg' ? 'jpeg' : 'png';
    let dataUrl;
    try {
      dataUrl = await capture(tab.windowId, { format, quality: 92 });
    } catch {
      fail('Chrome no permite capturar esta página.');
    }
    if (settings.shotFlash && isScriptable(tab.url)) sendToTab(tab.id, { t: 'flash' });
    const name = `Captura ${stamp()}.${format === 'jpeg' ? 'jpg' : 'png'}`;
    if (a.dest !== 'phone') {
      await chrome.downloads.download({ url: dataUrl, filename: `Botonazo/${name}`, conflictAction: 'uniquify', saveAs: false });
    }
    const out = { msg: a.dest === 'phone' ? 'Captura enviada' : 'Captura guardada en Descargas' };
    if (a.dest !== 'computer') out.file = { kind: 'shot', mime: `image/${format}`, name, data: dataUrl.slice(dataUrl.indexOf(',') + 1) };
    return out;
  },

  async 'record.tab'() {
    await ensureOffscreen();
    const status = await toOffscreen({ type: 'rec:status' });
    if (status?.recording) {
      const res = await toOffscreen({ type: 'rec:stop' });
      return { msg: `Grabación guardada (${duration(res?.seconds || 0)})` };
    }
    const tab = await requireTab();
    if (!isScriptable(tab.url)) fail('Chrome no permite grabar esta página.');
    let streamId = null;
    if (status?.tabId !== tab.id) {
      try {
        streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
      } catch {
        sendToTab(tab.id, { t: 'toast', text: 'Haz clic en el ícono de Botonazo para permitir grabar esta pestaña' });
        fail('Para grabar esta pestaña, haz clic una vez en el ícono de Botonazo en la computadora y vuelve a pulsar el botón.');
      }
    }
    const res = await toOffscreen({ type: 'rec:start', tabId: tab.id, streamId, format: settings.recFormat, quality: settings.recQuality, audio: settings.recAudio });
    if (!res?.ok) fail('No se pudo iniciar la grabación.');
    return { msg: 'Grabando la pestaña' };
  },

  async 'record.screen'() {
    const { studio } = await chrome.storage.session.get('studio');
    const win = studio?.windowId != null ? await chrome.windows.get(studio.windowId).catch(() => null) : null;
    if (win) {
      if (studio.recording) {
        await chrome.runtime.sendMessage({ to: 'studio', type: 'stop' }).catch(() => {});
        return { msg: 'Grabación guardada en Descargas' };
      }
      await chrome.windows.update(win.id, { focused: true });
      return { msg: 'Elige qué grabar en la computadora' };
    }
    const created = await chrome.windows.create({ url: chrome.runtime.getURL('studio.html'), type: 'popup', width: 440, height: 600, focused: true });
    await chrome.storage.session.set({ studio: { windowId: created.id, recording: false } });
    return { msg: 'Elige qué grabar en la computadora' };
  },

  // ---------- OBS
  ...Object.fromEntries(['obs.stream', 'obs.record', 'obs.pause', 'obs.scene', 'obs.mute', 'obs.source', 'obs.replay', 'obs.virtualcam'].map((type) => [type, async (a) => {
    if (!settings.obsEnabled) fail('Activa OBS en los ajustes de Botonazo (Ajustes › OBS Studio).');
    await ensureOffscreen();
    const res = await toOffscreen({ type: 'obs', action: a });
    if (!res?.ok) fail(res?.msg || 'No se pudo hablar con OBS.');
    return { msg: res.msg };
  }])),

  // ---------- pestañas y ventanas
  'tab.next': () => cycleTab(1),
  'tab.prev': () => cycleTab(-1),
  async 'tab.audible'() {
    const audible = await chrome.tabs.query({ audible: true });
    const current = await targetTab();
    const tab = audible.find((t) => t.id !== current?.id) || audible[0];
    if (!tab) fail('Ninguna pestaña está reproduciendo sonido.');
    await focusTab(tab);
    return { msg: short(tab.title) };
  },
  async 'tab.new'(a) {
    const tab = await targetTab();
    const created = await chrome.tabs.create({ url: a.url || undefined, windowId: tab?.windowId, active: true });
    if (!settings.followActiveTab) await setTarget(created.id);
    return { msg: 'Pestaña nueva' };
  },
  async 'tab.close'() {
    const tab = await requireTab();
    await chrome.tabs.remove(tab.id);
    return { msg: 'Pestaña cerrada' };
  },
  async 'tab.reload'() {
    const tab = await requireTab();
    await chrome.tabs.reload(tab.id);
    return { msg: 'Recargando' };
  },
  async 'tab.duplicate'() {
    const tab = await requireTab();
    await chrome.tabs.duplicate(tab.id);
    return { msg: 'Pestaña duplicada' };
  },
  async 'tab.pin'() {
    const tab = await requireTab();
    await chrome.tabs.update(tab.id, { pinned: !tab.pinned });
    return { msg: tab.pinned ? 'Pestaña sin fijar' : 'Pestaña fijada' };
  },
  async 'tab.mute'() {
    const tab = await requireTab();
    const muted = !tab.mutedInfo?.muted;
    await chrome.tabs.update(tab.id, { muted });
    return { msg: muted ? 'Pestaña silenciada' : 'Sonido activado' };
  },
  async 'window.next'() {
    const wins = (await chrome.windows.getAll({ windowTypes: ['normal'] })).sort((x, y) => x.id - y.id);
    if (wins.length < 2) fail('Solo hay una ventana de Chrome abierta.');
    const current = await chrome.windows.getLastFocused({ windowTypes: ['normal'] }).catch(() => null);
    const i = wins.findIndex((w) => w.id === current?.id);
    const next = wins[(i + 1) % wins.length];
    await chrome.windows.update(next.id, next.state === 'minimized' ? { focused: true, state: 'normal' } : { focused: true });
    const [tab] = await chrome.tabs.query({ active: true, windowId: next.id });
    if (tab && !settings.followActiveTab) await setTarget(tab.id);
    return { msg: `Ventana ${wins.indexOf(next) + 1} de ${wins.length}` };
  },
  async 'window.new'() {
    await chrome.windows.create({ focused: true });
    return { msg: 'Ventana nueva' };
  },
  async 'window.fullscreen'() {
    const tab = await requireTab();
    const on = await setFullscreen(tab);
    return { msg: on ? 'Pantalla completa' : 'Pantalla normal' };
  },
  async 'window.minimize'() {
    const tab = await requireTab();
    await chrome.windows.update(tab.windowId, { state: 'minimized' });
    return { msg: 'Ventana minimizada' };
  },

  // ---------- multimedia
  async 'media.toggle'() {
    const res = await media('toggle');
    return { msg: res.paused ? 'En pausa' : 'Reproduciendo' };
  },
  async 'media.seek'(a) {
    await media('seek', Number(a.seconds) || 0);
    return { msg: `${a.seconds > 0 ? '+' : ''}${a.seconds} s` };
  },
  async 'media.volume'(a) {
    const res = await media('volume', Number(a.step) || 0);
    return { msg: `Volumen ${Math.round((res.volume ?? 0) * 100)} %` };
  },
  async 'media.mute'() {
    const res = await media('mute');
    return { msg: res.muted ? 'Video silenciado' : 'Sonido activado' };
  },
  async 'media.speed'(a) {
    const res = await media('speed', a.rate);
    return { msg: `Velocidad ${String(res.rate).replace('.', ',')}×` };
  },

  // ---------- mensajes en pantalla
  async 'screen.message'(a) {
    const tab = await requireTab({ scriptable: true });
    const res = await overlay(tab, { t: 'message', text: a.text, style: a.style });
    return { msg: res.overlay?.message ? 'Cartel visible' : 'Cartel oculto' };
  },
  async 'screen.black'() {
    const tab = await requireTab({ scriptable: true });
    const res = await overlay(tab, { t: 'black' });
    return { msg: res.overlay?.black ? 'Pantalla oculta' : 'Pantalla visible' };
  },
  async 'screen.toast'(a) {
    const tab = await requireTab({ scriptable: true });
    await overlay(tab, { t: 'toast', text: a.text, big: true });
    return { msg: 'Aviso mostrado' };
  },
  async 'screen.confetti'() {
    const tab = await requireTab({ scriptable: true });
    await overlay(tab, { t: 'confetti' });
    return { msg: '¡Confeti!' };
  },

  // ---------- teclado y texto
  async 'input.keys'(a) {
    if (!a.combo) fail('Configura la combinación en el editor del deck.');
    const tab = await requireTab({ scriptable: true });
    await overlay(tab, { t: 'combo', combo: a.combo });
    return {};
  },
  async 'input.text'(a) {
    if (!a.text) fail('Escribe el texto en el editor del deck.');
    const tab = await requireTab({ scriptable: true });
    await overlay(tab, { t: 'text', s: a.text, enter: a.enter });
    return { msg: 'Texto escrito' };
  },
  async 'input.copy'(a) {
    await ensureOffscreen();
    const res = await toOffscreen({ type: 'copy', text: a.text });
    if (!res?.ok) fail('No se pudo copiar al portapapeles.');
    return { msg: 'Copiado en la computadora' };
  },

  // ---------- página
  async 'page.scroll'(a) {
    const tab = await requireTab({ scriptable: true });
    await overlay(tab, { t: 'scroll', dir: a.dir });
    return {};
  },
  async 'page.zoom'(a) {
    const tab = await requireTab();
    if (a.dir === 'reset') {
      await chrome.tabs.setZoom(tab.id, 0);
      return { msg: 'Zoom 100 %' };
    }
    const current = await chrome.tabs.getZoom(tab.id);
    const next = a.dir === 'in'
      ? ZOOM_LEVELS.find((z) => z > current + 0.001) ?? ZOOM_LEVELS.at(-1)
      : [...ZOOM_LEVELS].reverse().find((z) => z < current - 0.001) ?? ZOOM_LEVELS[0];
    await chrome.tabs.setZoom(tab.id, next);
    return { msg: `Zoom ${Math.round(next * 100)} %` };
  },
  async 'page.back'() {
    const tab = await requireTab();
    await chrome.tabs.goBack(tab.id).catch(() => fail('No hay una página anterior.'));
    return {};
  },
  async 'page.forward'() {
    const tab = await requireTab();
    await chrome.tabs.goForward(tab.id).catch(() => fail('No hay una página siguiente.'));
    return {};
  },

  // ---------- web y automatización
  async 'url.open'(a) {
    if (!a.url) fail('Configura la dirección en el editor del deck.');
    if (a.where === 'window') {
      await chrome.windows.create({ url: a.url, focused: true });
    } else if (a.where === 'current') {
      const tab = await requireTab();
      await chrome.tabs.update(tab.id, { url: a.url });
    } else {
      const tab = await targetTab();
      await chrome.tabs.create({ url: a.url, windowId: tab?.windowId, active: true });
    }
    return { msg: short(hostOf(a.url)) };
  },
  async 'web.webhook'(a) {
    if (!a.url) fail('Configura la dirección del webhook en el editor del deck.');
    const headers = {};
    for (const line of String(a.headers || '').split('\n')) {
      const i = line.indexOf(':');
      const name = line.slice(0, i).trim();
      if (i > 0 && /^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(name)) headers[name] = line.slice(i + 1).trim();
    }
    const init = { method: a.method || 'POST', headers, signal: AbortSignal.timeout(10000), credentials: 'omit' };
    if (a.body && !['GET', 'HEAD'].includes(init.method)) {
      init.body = a.body;
      if (!Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')) {
        let json = false;
        try { JSON.parse(a.body); json = true; } catch {}
        headers['Content-Type'] = json ? 'application/json' : 'text/plain;charset=utf-8';
      }
    }
    let res;
    try {
      res = await fetch(a.url, init);
    } catch (err) {
      fail(err?.name === 'TimeoutError' ? 'El servicio no respondió a tiempo.' : 'No se pudo conectar con el servicio.');
    }
    if (!res.ok) fail(`El servicio respondió con el código ${res.status}.`);
    return { msg: `Enviado (${res.status})` };
  },

  // ---------- deck
  async macro(a) {
    if (!a.steps?.length) fail('La macro no tiene pasos. Agrégalos en el editor del deck.');
    let done = 0;
    let firstError = '';
    for (const step of a.steps) {
      if (step.delay) await sleep(step.delay);
      try {
        await runAction(step);
        done++;
      } catch (err) {
        firstError ||= err instanceof UserError ? err.message : 'Un paso falló.';
      }
      pushStates();
    }
    if (firstError) fail(`${done} de ${a.steps.length} pasos. ${firstError}`);
    return { msg: `Macro completa (${done} ${done === 1 ? 'paso' : 'pasos'})` };
  },
};

async function runAction(action) {
  const fn = RUN[action?.type];
  if (!fn) fail('Esta acción no está disponible.');
  return (await fn(action)) || {};
}

// ---------------------------------------------------------------- pantalla en vivo (imágenes)

let lastFrame = null;

async function mirrorFrame() {
  const tab = await targetTab();
  if (!tab) return { error: 'No hay ninguna pestaña abierta.' };
  const now = Date.now();
  // Varios celulares pueden pedir imágenes a la vez: se comparte la más reciente.
  if (lastFrame && lastFrame.windowId === tab.windowId && now - lastFrame.at < 450) return lastFrame.out;
  try {
    const dataUrl = await capture(tab.windowId, { format: 'jpeg', quality: 70 });
    const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = new OffscreenCanvas(w, h);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const out = { data: await base64(await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.62 })), w, h };
    lastFrame = { at: now, windowId: tab.windowId, out };
    return out;
  } catch {
    return { error: 'Chrome no permite mostrar esta página.' };
  }
}

// ---------------------------------------------------------------- órdenes del celular

async function listTabs() {
  const wins = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
  const focused = (await chrome.windows.getLastFocused({ windowTypes: ['normal'] }).catch(() => null))?.id;
  const tabs = [];
  wins.forEach((w, i) => {
    for (const t of w.tabs) {
      tabs.push({
        id: t.id,
        title: short(t.title || '', 120),
        host: hostOf(t.url),
        active: t.active && w.id === focused,
        audible: !!t.audible,
        muted: !!t.mutedInfo?.muted,
        pinned: !!t.pinned,
        win: i + 1,
      });
    }
  });
  return { t: 'tabs', tabs, windows: wins.length };
}

async function handleCommand(cmd) {
  await settingsReady;
  switch (cmd.t) {
    case 'press': {
      const deck = await getDeck();
      const key = findKey(deck, cmd.id);
      if (!key) return { reply: { t: 'done', id: cmd.id, ok: false, msg: 'Este botón ya no existe en el deck.' } };
      if (ACTIONS[key.action.type]?.ui) return null;
      try {
        const res = await runAction(key.action);
        return { reply: { t: 'done', id: cmd.id, ok: true, msg: res.msg || '' }, file: res.file };
      } catch (err) {
        if (!(err instanceof UserError)) console.warn('[Botonazo]', key.action.type, err);
        return { reply: { t: 'done', id: cmd.id, ok: false, msg: err instanceof UserError ? err.message : 'No se pudo completar la acción.' } };
      } finally {
        pushStates();
      }
    }
    case 'tabs':
      return { reply: await listTabs() };
    case 'focus': {
      const tab = await chrome.tabs.get(cmd.tab).catch(() => null);
      if (tab) await focusTab(tab);
      return { reply: { t: 'focused', tab: cmd.tab, ok: !!tab } };
    }
    case 'close':
      await chrome.tabs.remove(cmd.tab).catch(() => {});
      await sleep(150);
      return { reply: await listTabs() };
  }
  return null;
}

// ---------------------------------------------------------------- enrutamiento a iframes

// Las teclas se envían al iframe que tiene el foco aunque sea de otro origen: el
// script del marco superior manda una sonda de un solo uso al iframe, este la
// reporta y así se conoce su frameId sin exponer ninguna clave a la página.
const probes = new Map();

function probeEntry(nonce) {
  let entry = probes.get(nonce);
  if (!entry) {
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    entry = { promise, resolve, frame: null };
    probes.set(nonce, entry);
    setTimeout(() => probes.delete(nonce), 5000);
  }
  return entry;
}

async function routeToFrame(nonce, cmd, sender) {
  const entry = probeEntry(nonce);
  const frame = await Promise.race([entry.promise, sleep(800).then(() => null)]);
  probes.delete(nonce);
  if (!frame || frame.tabId !== sender.tab?.id) return;
  chrome.tabs.sendMessage(frame.tabId, { botonazo: cmd, routed: true }, { frameId: frame.frameId }).catch(() => {});
}

// ---------------------------------------------------------------- sesión

async function startSession(tabId) {
  await settingsReady;
  const s = await loadState();
  if (!s.active) {
    if (settings.newCodeEachSession) await getIdentity(true);
    await patchState({ ...EMPTY_STATE, active: true, status: 'starting' });
  }
  // Con pestaña fija, abrir el popup la elige solo si aún no hay una controlada
  // (para cambiarla está «Controlar esta pestaña»).
  if (tabId != null && !settings.followActiveTab) {
    const current = s.targetTabId != null ? await chrome.tabs.get(s.targetTabId).catch(() => null) : null;
    if (!current || !s.active) await setTarget(tabId);
  }
  await ensureOffscreen();
  return snapshot();
}

async function stopSession() {
  await closeOffscreen('stopped');
  await patchState({ ...EMPTY_STATE });
  return snapshot();
}

async function resetCode() {
  await closeOffscreen('revoked');
  await getIdentity(true);
  const s = await loadState();
  await patchState({ devices: [], status: s.active ? 'starting' : 'idle', recTab: false });
  if (s.active) await ensureOffscreen();
  return snapshot();
}

async function snapshot() {
  const s = await loadState();
  const identity = await getIdentity();
  let target = null;
  if (s.active) {
    const tab = await targetTab();
    if (tab) target = { id: tab.id, title: tab.title, url: tab.url, favIconUrl: tab.favIconUrl, ok: isScriptable(tab.url) };
  }
  return { state: await loadState(), identity, target, follow: settings.followActiveTab };
}

// ---------------------------------------------------------------- mensajes

const handlers = {
  // popup / editor
  'session:start': (msg) => startSession(msg.tabId ?? null),
  'session:stop': () => stopSession(),
  'session:reset': () => resetCode(),
  'session:get': () => snapshot(),
  'target:set': async (msg) => { await setTarget(msg.tabId); return snapshot(); },
  'device:kick': (msg) => toOffscreen({ type: 'kick', id: msg.id }),

  // documento offscreen
  identity: () => getIdentity(),
  status: (msg) => patchState({ status: msg.status, error: msg.error || null }),
  devices: async (msg) => {
    await patchState({ devices: msg.devices });
    if (msg.event === 'joined' && settings.showToasts) {
      const tab = await targetTab();
      if (tab && isScriptable(tab.url)) {
        sendToTab(tab.id, { t: 'toast', text: chrome.i18n.getMessage('toastConnected', [msg.device?.name || '']) });
      }
    }
  },
  welcome: async () => ({ target: await targetInfo(), deck: compileDeck(await getDeck()) }),
  'offscreen:ready': async () => ({ states: await chromeStates(), obs: await obsBoot() }),
  cmd: (msg) => handleCommand(msg.cmd),
  download: async (msg) => {
    if (typeof msg.url !== 'string' || !msg.url.startsWith('blob:')) return;
    await chrome.downloads.download({ url: msg.url, filename: msg.filename, conflictAction: 'uniquify', saveAs: false }).catch((err) => console.warn('[Botonazo] descarga', err));
  },
  'rec:state': (msg) => patchState({ recTab: !!msg.recording }),
  'mirror:stream': async (msg) => {
    const tab = await targetTab();
    if (!tab) return null;
    const base = { tabId: tab.id, title: tab.title || '', audio: settings.recAudio, quality: settings.recQuality };
    // Si ya se está grabando una pestaña, se muestra esa misma captura.
    if (msg.haveTabId != null) return { ...base, tabId: msg.haveTabId, reuse: true };
    if (!isScriptable(tab.url)) return base;
    try {
      return { ...base, streamId: await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }) };
    } catch {
      return base;
    }
  },
  'mirror:frame': () => mirrorFrame(),

  // estudio (grabación de pantalla)
  'studio:state': async (msg, sender) => {
    const windowId = sender.tab?.windowId;
    await chrome.storage.session.set({ studio: { windowId, recording: !!msg.recording, since: msg.recording ? Date.now() : 0 } });
    await patchState({ recScreen: !!msg.recording });
    pushStates();
  },

  // scripts de contenido
  'frame:hello': (msg, sender) => {
    if (typeof msg.nonce !== 'string' || !sender.tab) return;
    const entry = probeEntry(msg.nonce);
    if (!entry.frame) {
      entry.frame = { tabId: sender.tab.id, frameId: sender.frameId };
      entry.resolve(entry.frame);
    }
  },
  'frame:route': (msg, sender) => { if (typeof msg.nonce === 'string' && msg.cmd) routeToFrame(msg.nonce, msg.cmd, sender); },
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.to !== 'sw' || sender.id !== chrome.runtime.id) return;
  const handler = handlers[msg.type];
  if (!handler) return;
  Promise.resolve()
    .then(() => handler(msg, sender))
    .then((res) => sendResponse(res ?? null), (err) => sendResponse({ ok: false, error: String(err?.message || err) }));
  return true;
});

// ---------------------------------------------------------------- ciclo de vida

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await chrome.storage.session.set({ state: { ...EMPTY_STATE } });
  state = null;
  updateBadge();
  if (reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('options.html#bienvenida') });
});

chrome.runtime.onStartup.addListener(async () => {
  await settingsReady;
  if (settings.autoStart) startSession(null);
});

loadState().then(updateBadge);
