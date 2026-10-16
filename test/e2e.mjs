// Prueba de punta a punta de Botonazo: extensión + deck del celular conectados por PeerJS,
// con un OBS Studio simulado. Requiere un servidor local en la raíz del proyecto:
//   npm run serve        (otra terminal)
//   npm run test:e2e
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import puppeteer from 'puppeteer';

import { startObsMock } from './obs-mock.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = path.join(ROOT, 'extension');
const BASE = process.env.BASE || 'http://localhost:8766';
const OUT = process.env.OUT || path.join(ROOT, 'test', 'out');
const DL = path.join(OUT, 'downloads');
fs.rmSync(DL, { recursive: true, force: true });
fs.mkdirSync(DL, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, { timeout = 15000, interval = 150 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { const v = await fn(); if (v) return v; } catch {}
    await sleep(interval);
  }
  return null;
}

// Una extensión sin «key» recibe un id derivado de su ruta: así se puede autorizar
// la captura de pestañas en la prueba (--allowlisted-extension-id) sin hacer clic.
function extensionId(dir) {
  const hex = crypto.createHash('sha256').update(dir).digest('hex').slice(0, 32);
  return [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
}
const expectedId = extensionId(EXT);

const downloads = () => {
  const dir = path.join(DL, 'Botonazo');
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => !f.endsWith('.crdownload')) : [];
};

const obs = startObsMock({ port: 4466, password: 'secreto' });

// Perfil temporal con carpeta de descargas propia (chrome.downloads respeta la subcarpeta).
const PROFILE = fs.mkdtempSync(path.join(OUT, 'perfil-'));
fs.mkdirSync(path.join(PROFILE, 'Default'), { recursive: true });
fs.writeFileSync(path.join(PROFILE, 'Default', 'Preferences'), JSON.stringify({
  download: { default_directory: DL, prompt_for_download: false, directory_upgrade: true },
  savefile: { default_directory: DL },
}));

const browser = await puppeteer.launch({
  headless: process.env.HEADFUL ? false : true,
  pipe: true,
  userDataDir: PROFILE,
  enableExtensions: [EXT],
  args: ['--window-size=1280,860', `--allowlisted-extension-id=${expectedId}`, '--autoplay-policy=no-user-gesture-required'],
  defaultViewport: null,
});

try {
  // ---------- extensión cargada
  const swTarget = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().endsWith('/background.js'), { timeout: 15000 });
  const extId = new URL(swTarget.url()).host;
  check('Service worker cargado', !!extId, extId);
  check('Id de la extensión según su ruta', extId === expectedId);

  const welcome = await waitFor(async () => (await browser.pages()).find((p) => p.url().includes('options.html')), { timeout: 6000 });
  check('Se abre el editor de bienvenida al instalar', !!welcome);
  const ctl = welcome || (await browser.newPage());
  if (!welcome) await ctl.goto(`chrome-extension://${extId}/options.html`);
  await ctl.waitForSelector('#grid .key');
  const editorKeys = await ctl.$$eval('#grid .key:not(.add)', (n) => n.length);
  check('El editor muestra el deck de ejemplo', editorKeys === 12, `${editorKeys} botones en la primera página`);

  const sw = (msg) => ctl.evaluate((m) => chrome.runtime.sendMessage({ to: 'sw', ...m }), msg);

  // Instalación nueva: el deck de ejemplo debe quedar guardado (ids estables), si no el
  // celular recibiría ids que la extensión no reconoce.
  const firstIds = await ctl.evaluate(async () => (await chrome.storage.local.get('deck')).deck?.pages?.[0]?.keys?.map((k) => k.id).join(','));
  const sameIds = await ctl.evaluate(async () => {
    const { getDeck } = await import(chrome.runtime.getURL('deck.js'));
    return (await getDeck()).pages[0].keys.map((k) => k.id).join(',');
  });
  check('El deck de ejemplo queda guardado al instalar', !!firstIds && firstIds === sameIds);

  // ---------- deck de prueba + OBS
  await ctl.evaluate(async () => {
    const { defaultDeck, normalizeDeck } = await import(chrome.runtime.getURL('deck.js'));
    const { defaultParams } = await import(chrome.runtime.getURL('actions.js'));
    const k = (id, type, label, params = {}) => ({ id, label, icon: 'ico:zap', color: 'blue', action: { ...defaultParams(type), ...params } });
    const base = 'http://localhost:8766';
    const test = {
      id: 'prueba',
      name: 'Prueba',
      keys: [
        k('kshot', 'capture.screenshot', 'Captura', { dest: 'both' }),
        k('knext', 'tab.next', 'Siguiente'),
        k('kprev', 'tab.prev', 'Anterior'),
        k('kplay', 'media.toggle', 'Play'),
        k('kseek', 'media.seek', '+10', { seconds: 10 }),
        k('kvol', 'media.volume', 'Vol', { step: -20 }),
        k('kmsg', 'screen.message', 'Cartel', { text: 'Volvemos pronto', style: 'banner' }),
        k('kblack', 'screen.black', 'Privacidad'),
        k('ktoast', 'screen.toast', 'Aviso', { text: '¡Gracias!' }),
        k('kconf', 'screen.confetti', 'Confeti'),
        k('ktext', 'input.text', 'Texto', { text: 'Hola 👋', enter: false }),
        k('kkeys', 'input.keys', 'Atajo', { combo: { key: 'k', code: 'KeyK', ctrl: true, shift: false, alt: false, meta: false } }),
        k('khook', 'web.webhook', 'Hook', { method: 'GET', url: `${base}/test/frame.html` }),
        k('khook404', 'web.webhook', 'Hook 404', { method: 'GET', url: `${base}/test/no-existe.html` }),
        k('kscene', 'obs.scene', 'Pantalla', { scene: 'Pantalla' }),
        k('kstream', 'obs.stream', 'En vivo'),
        k('kmute', 'obs.mute', 'Mic', { input: 'Mic/Aux' }),
        k('ksrc', 'obs.source', 'Cámara', { source: 'Cámara', scene: '' }),
        k('kreplay', 'obs.replay', 'Repetición'),
        k('kmacro', 'macro', 'Macro', { steps: [{ ...defaultParams('tab.mute'), delay: 0 }, { ...defaultParams('screen.toast'), text: 'Macro', delay: 200 }] }),
        k('kzoom', 'page.zoom', 'Zoom', { dir: 'in' }),
        k('kzoom0', 'page.zoom', 'Zoom 0', { dir: 'reset' }),
        k('kcopy', 'input.copy', 'Copiar', { text: 'Copiado desde Botonazo' }),
        k('kfull', 'window.fullscreen', 'Pantalla completa'),
        k('krec', 'record.tab', 'Grabar'),
        k('kgo', 'deck.page', 'Ir', { page: 'prueba' }),
      ],
    };
    const deck = defaultDeck();
    deck.pages.unshift(test);
    await chrome.storage.local.set({ deck: normalizeDeck(deck), obsPassword: 'secreto' });
    const { settings } = await chrome.storage.sync.get('settings');
    await chrome.storage.sync.set({ settings: { ...(settings || {}), obsEnabled: true, obsPort: 4466 } });
  });
  const stored = await ctl.evaluate(async () => (await chrome.storage.local.get('deck')).deck);
  check('Deck de prueba guardado y validado', stored?.pages?.[0]?.keys?.length === 26, `${stored?.pages?.length} páginas`);

  // ---------- presentación de prueba
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 760 });
  await page.goto(`${BASE}/test/index.html`, { waitUntil: 'networkidle0' });
  await page.bringToFront();

  const snap = await sw({ type: 'session:start', tabId: null });
  check('Sesión iniciada', snap?.state?.active === true, snap?.identity?.peerId);
  const ready = await waitFor(async () => {
    const { state } = await ctl.evaluate(() => chrome.storage.session.get('state'));
    return state?.status === 'ready';
  }, { timeout: 25000 });
  check('Conectado al servidor de señalización (PeerJS)', !!ready);
  check('Sin scripts registrados de forma permanente', (await ctl.evaluate(() => chrome.scripting.getRegisteredContentScripts())).length === 0);

  // ---------- celular
  const { identity } = await ctl.evaluate(() => chrome.storage.local.get('identity'));
  const phoneCtx = await browser.createBrowserContext();
  const phone = await phoneCtx.newPage();
  await phone.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 });
  await phone.goto(`${BASE}/remote/#id=${identity.peerId}&k=${identity.token}`);
  const connected = await phone.waitForFunction(() => document.getElementById('app').dataset.conn === 'connected', { timeout: 30000 }).then(() => true, () => false);
  check('El celular se conecta con el código QR', connected);
  check('La clave se borra de la barra de direcciones', !(await phone.evaluate(() => location.hash)));
  const phoneKeys = await phone.$$eval('.key', (n) => n.length);
  check('El celular dibuja el deck completo', phoneKeys === 26 + 36, `${phoneKeys} botones`);
  const pageNames = await phone.$$eval('#pages button', (n) => n.map((b) => b.textContent));
  check('Páginas del deck en el celular', pageNames.join(',') === 'Prueba,Inicio,OBS,Atajos', pageNames.join(', '));
  const iconOk = await phone.$eval('.key[data-id="kshot"] svg.ico', (s) => s.childElementCount > 0).catch(() => false);
  check('Íconos dibujados con formas SVG', iconOk);
  const target = await phone.$eval('#target-title', (n) => n.textContent);
  check('El celular muestra la pestaña controlada', /Página de prueba/.test(target), target);
  await page.bringToFront();

  const press = async (id) => phone.evaluate((id) => new Promise((resolve) => {
    const el = document.querySelector(`.key[data-id="${id}"]`);
    if (!el) return resolve({ error: 'sin botón' });
    const toastEl = document.getElementById('toast');
    const mo = new MutationObserver(() => {
      if (el.classList.contains('done') || el.classList.contains('fail')) {
        mo.disconnect();
        setTimeout(() => resolve({ ok: el.classList.contains('done'), msg: toastEl.classList.contains('on') ? toastEl.textContent : '' }), 40);
      }
    });
    mo.observe(el, { attributes: true, attributeFilter: ['class'] });
    el.click();
    setTimeout(() => { mo.disconnect(); resolve({ timeout: true }); }, 25000);
  }), id);
  const isOn = (id) => phone.$eval(`.key[data-id="${id}"]`, (el) => el.classList.contains('on'));

  // ---------- capturas
  let r = await press('kshot');
  check('Captura de pantalla', r.ok, r.msg);
  const shotFile = await waitFor(() => downloads().find((f) => f.endsWith('.png')), { timeout: 8000 });
  check('La captura se guarda en Descargas › Botonazo', !!shotFile, shotFile || '');
  const gotShot = await phone.waitForFunction(() => document.getElementById('gallery-count').textContent === '1' && document.getElementById('shot-img').naturalWidth > 0, { timeout: 15000 }).then(() => true, () => false);
  check('La captura llega al celular (en partes)', gotShot);
  await phone.evaluate(() => document.getElementById('shot-sheet').close());

  // ---------- multimedia
  r = await press('kplay');
  const playing = await page.evaluate(() => !document.getElementById('audio').paused);
  check('Reproducir / pausar (inicia)', r.ok && playing, r.msg);
  await sleep(300);
  r = await press('kseek');
  const time = await page.evaluate(() => document.getElementById('audio').currentTime);
  check('Adelantar 10 s', r.ok && time >= 10, `${time.toFixed(1)} s`);
  r = await press('kvol');
  const vol = await page.evaluate(() => document.getElementById('audio').volume);
  check('Bajar volumen', r.ok && Math.abs(vol - 0.8) < 0.01, r.msg);
  r = await press('kplay');
  check('Reproducir / pausar (pausa)', r.ok && (await page.evaluate(() => document.getElementById('audio').paused)), r.msg);

  // ---------- capa visual
  r = await press('kmsg');
  const overlay = () => page.evaluate(() => {
    const host = document.querySelector('botonazo-overlay');
    return host ? { open: host.matches(':popover-open'), pe: getComputedStyle(host).pointerEvents } : null;
  });
  let ov = await overlay();
  check('Cartel en pantalla (aparece)', r.ok && ov?.open && ov.pe === 'auto', r.msg);
  check('El botón del cartel se enciende en el celular', await waitFor(() => isOn('kmsg'), { timeout: 4000 }));
  r = await press('kmsg');
  ov = await overlay();
  check('Cartel en pantalla (se quita)', r.ok && ov?.pe === 'none', r.msg);
  check('El botón del cartel se apaga', await waitFor(async () => !(await isOn('kmsg')), { timeout: 4000 }));
  r = await press('kblack');
  check('Pantalla de privacidad', r.ok && (await waitFor(() => isOn('kblack'), { timeout: 4000 })), r.msg);
  r = await press('kblack');
  check('Pantalla de privacidad (se quita)', r.ok);
  r = await press('ktoast');
  check('Aviso rápido', r.ok, r.msg);
  r = await press('kconf');
  check('Confeti', r.ok, r.msg);

  // ---------- teclado y texto
  await page.click('#field');
  r = await press('ktext');
  const typed = await page.$eval('#field', (i) => i.value);
  check('Escribir texto en el campo con el foco', r.ok && typed === 'Hola 👋', JSON.stringify(typed));
  r = await press('kkeys');
  const lastKey = await page.evaluate(() => window.keys.at(-1));
  check('Atajo de teclado (Ctrl+K con keyCode)', r.ok && lastKey?.ctrl && lastKey?.keyCode === 75, JSON.stringify(lastKey));
  const frame = page.frames().find((f) => f.url().includes('/test/frame.html'));
  await frame.click('#inner');
  r = await press('ktext');
  const typedFrame = await frame.$eval('#inner', (i) => i.value);
  check('Texto dentro de un iframe de otro origen', r.ok && typedFrame === 'Hola 👋', JSON.stringify(typedFrame));
  await page.click('#field');

  // ---------- página y web
  r = await press('kzoom');
  const zoom = await ctl.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'http://localhost:8766/test/*' });
    return chrome.tabs.getZoom(tab.id);
  });
  check('Zoom', r.ok && zoom > 1, r.msg);
  r = await press('kzoom0');
  check('Restablecer zoom', r.ok, r.msg);
  r = await press('khook');
  check('Webhook (200)', r.ok && /200/.test(r.msg), r.msg);
  r = await press('khook404');
  check('Webhook con error muestra el código', !r.ok && /404/.test(r.msg), r.msg);
  r = await press('kcopy');
  check('Copiar al portapapeles', r.ok, r.msg);

  // ---------- pestañas y ventanas
  const second = await browser.newPage();
  await second.goto(`${BASE}/test/frame.html`);
  await page.bringToFront();
  await sleep(300);
  r = await press('knext');
  const active = await ctl.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.url);
  check('Pestaña siguiente', r.ok && /frame\.html/.test(active || ''), `${r.msg} · ${active}`);
  r = await press('kprev');
  const back = await ctl.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.url);
  check('Pestaña anterior', r.ok && /index\.html/.test(back || ''), r.msg);
  check('El título de la pestaña controlada se actualiza', await waitFor(async () => /Página de prueba/.test(await phone.$eval('#target-title', (n) => n.textContent)), { timeout: 4000 }));

  // El botón «Pestañas» de la página Inicio abre la lista en el celular.
  const tabsKey = await phone.evaluate(() => {
    const keys = [...document.querySelectorAll('.key')];
    const k = keys.find((el) => el.querySelector('.label').textContent === 'Pestañas');
    k.click();
    return !!k;
  });
  const tabsShown = await phone.waitForFunction(() => document.querySelectorAll('#tab-list .tab-item').length >= 3, { timeout: 8000 }).then(() => true, () => false);
  check('Lista de pestañas en el celular', tabsKey && tabsShown, `${await phone.$$eval('#tab-list .tab-item', (n) => n.length)} pestañas`);
  await phone.evaluate(() => [...document.querySelectorAll('#tab-list .tab-item')].find((li) => /frame\.html|iframe de prueba/.test(li.textContent))?.querySelector('.tab-open').click());
  const focused = await waitFor(async () => /frame\.html/.test(await ctl.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.url)), { timeout: 5000 });
  check('Saltar a una pestaña desde la lista', !!focused);
  await page.bringToFront();
  await sleep(300);
  await phone.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));

  r = await press('kmacro');
  const muted = await ctl.evaluate(async () => (await chrome.tabs.query({ url: 'http://localhost:8766/test/index.html' }))[0]?.mutedInfo?.muted);
  check('Macro (silenciar pestaña + aviso)', r.ok && muted === true, r.msg);
  await press('kmacro');

  // ---------- OBS (simulado)
  const obsUp = await waitFor(() => obs.calls.some((c) => c.type === 'GetStreamStatus'), { timeout: 8000 });
  check('Conexión con OBS (contraseña correcta)', !!obsUp);
  r = await press('kscene');
  check('OBS: cambiar de escena', r.ok && obs.state.scene === 'Pantalla', r.msg);
  check('OBS: la escena activa se ilumina', await waitFor(() => isOn('kscene'), { timeout: 4000 }));
  r = await press('kstream');
  check('OBS: iniciar transmisión', r.ok && obs.state.stream, r.msg);
  const timed = await waitFor(() => phone.$eval('.key[data-id="kstream"]', (el) => el.classList.contains('timed') && /\d:\d\d/.test(el.querySelector('.live span').textContent)), { timeout: 4000 });
  check('OBS: cronómetro de la transmisión en el botón', !!timed);
  r = await press('kmute');
  check('OBS: silenciar micrófono', r.ok && obs.state.inputs['Mic/Aux'] === true && (await waitFor(() => isOn('kmute'), { timeout: 4000 })), r.msg);
  r = await press('ksrc');
  check('OBS: mostrar fuente en la escena actual', r.ok && obs.state.items.Pantalla['Cámara'].enabled === true && (await waitFor(() => isOn('ksrc'), { timeout: 4000 })), r.msg);
  r = await press('kreplay');
  check('OBS: error claro si la repetición no está activa', !r.ok && /repetición/i.test(r.msg), r.msg);
  r = await press('kstream');
  check('OBS: detener transmisión', r.ok && !obs.state.stream, r.msg);

  // ---------- pantalla en vivo
  const mirrorKey = await phone.evaluate(() => {
    const k = [...document.querySelectorAll('.key')].find((el) => el.querySelector('.label').textContent === 'Ver pantalla');
    k.click();
    return !!k;
  });
  const mirror = await phone.waitForFunction(() => {
    const v = document.getElementById('viewer-video');
    const img = document.getElementById('viewer-img');
    if (!v.hidden && v.videoWidth > 0) return 'video';
    if (!img.hidden && img.naturalWidth > 0) return 'imágenes';
    return false;
  }, { timeout: 20000 }).then((h) => h.jsonValue(), () => null);
  check('Ver pantalla en el celular', mirrorKey && !!mirror, mirror || '');
  await phone.click('#viewer-close');

  // ---------- grabación de la pestaña
  r = await press('krec');
  check('Grabar pestaña (inicia)', r.ok, r.msg);
  if (r.ok) {
    check('El botón de grabación se enciende con cronómetro', await waitFor(() => phone.$eval('.key[data-id="krec"]', (el) => el.classList.contains('on') && el.classList.contains('timed')), { timeout: 4000 }));
    const badge = await ctl.evaluate(() => chrome.action.getBadgeText({}));
    check('Insignia REC en el ícono', badge === 'REC', badge);
    await sleep(2500);
    r = await press('krec');
    check('Grabar pestaña (detiene)', r.ok, r.msg);
    const video = await waitFor(() => downloads().find((f) => /\.(mp4|webm)$/.test(f)), { timeout: 15000 });
    const size = video ? fs.statSync(path.join(DL, 'Botonazo', video)).size : 0;
    check('El video se guarda en Descargas › Botonazo', !!video && size > 10000, `${video || ''} · ${Math.round(size / 1024)} KB`);
  }

  // ---------- navegación del deck en el celular
  await phone.evaluate(() => document.querySelector('#pages button:nth-child(3)').click());
  await sleep(600);
  await phone.evaluate(() => document.querySelector('.key[data-id="kgo"]').click());
  const backToTest = await phone.waitForFunction(() => document.querySelector('#pages button[aria-selected="true"]')?.textContent === 'Prueba', { timeout: 4000 }).then(() => true, () => false);
  check('Botón «Ir a otra página del deck»', backToTest);

  // ---------- cambios del deck en vivo
  await ctl.evaluate(async () => {
    const { deck } = await chrome.storage.local.get('deck');
    deck.pages[0].keys[0].label = 'Foto';
    await chrome.storage.local.set({ deck });
  });
  const relabel = await phone.waitForFunction(() => document.querySelector('.key[data-id="kshot"] .label')?.textContent === 'Foto', { timeout: 6000 }).then(() => true, () => false);
  check('Los cambios del editor llegan al celular al instante', relabel);

  // ---------- seguridad
  const intruderCtx = await browser.createBrowserContext();
  const intruder = await intruderCtx.newPage();
  await intruder.goto(`${BASE}/remote/#id=${identity.peerId}&k=clave-incorrecta`);
  const denied = await intruder.waitForFunction(() => document.getElementById('app').dataset.conn === 'denied', { timeout: 30000 }).then(() => true, () => false);
  check('Una clave incorrecta es rechazada', denied);
  await intruderCtx.close();

  // ---------- fin de la sesión
  const stopped = await sw({ type: 'session:stop' });
  check('Sesión detenida', stopped?.state?.active === false);
  const ended = await phone.waitForFunction(() => document.getElementById('app').dataset.conn === 'ended', { timeout: 8000 }).then(() => true, () => false);
  check('El celular muestra «Sesión finalizada»', ended);

  await phoneCtx.close();
} catch (err) {
  check('Sin errores inesperados', false, err.stack || String(err));
} finally {
  await browser.close();
  await obs.close();
  fs.rmSync(PROFILE, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} comprobaciones correctas`);
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
