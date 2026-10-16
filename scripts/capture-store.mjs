// Capturas reales de la extensión para las imágenes de la Chrome Web Store.
// Requiere `npm run serve` en otra terminal. Después: npm run store:images
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = path.join(ROOT, 'extension');
const OUT = path.join(ROOT, 'design', 'store', 'captures');
const BASE = process.env.BASE || 'http://localhost:8766';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const W = 1440;
const H = 810;
fs.mkdirSync(OUT, { recursive: true });

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'botonazo-capturas-'));
const browser = await puppeteer.launch({
  headless: true,
  pipe: true,
  userDataDir: profile,
  enableExtensions: [EXT],
  defaultViewport: null,
  args: [`--window-size=${W},${H + 100}`, '--hide-scrollbars'],
});

try {
  const swT = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().endsWith('/background.js'));
  const extId = new URL(swT.url()).host;
  await sleep(600);

  const desk = await browser.newPage();
  await desk.setViewport({ width: W, height: H, deviceScaleFactor: 2 });
  await desk.goto(`${BASE}/design/store/desk.html`, { waitUntil: 'networkidle0' });

  const ctl = await browser.newPage();
  await ctl.goto(`chrome-extension://${extId}/options.html`);
  const sw = (msg) => ctl.evaluate((m) => chrome.runtime.sendMessage({ to: 'sw', ...m }), msg);

  // Pestaña fija (no «seguir la pestaña activa»): así el popup muestra el panel de
  // transmisión como pestaña controlada, aunque el popup se abra en otra pestaña.
  const deskTabId = await ctl.evaluate(async (b) => (await chrome.tabs.query({ url: `${b}/design/*` }))[0]?.id, BASE);
  await ctl.evaluate(async () => {
    const { settings } = await chrome.storage.sync.get('settings');
    await chrome.storage.sync.set({ settings: { ...(settings || {}), followActiveTab: false } });
  });
  await sleep(400);
  await desk.bringToFront();
  await sw({ type: 'session:start', tabId: deskTabId });
  await ctl.evaluate(async () => {
    for (let i = 0; i < 80; i++) {
      const { state } = await chrome.storage.session.get('state');
      if (state?.status === 'ready') return;
      await new Promise((r) => setTimeout(r, 250));
    }
  });
  const { identity } = await ctl.evaluate(() => chrome.storage.local.get('identity'));

  // Celular (iPhone) conectado de verdad.
  const phoneCtx = await browser.createBrowserContext();
  const phone = await phoneCtx.newPage();
  await phone.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');
  await phone.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 });
  await phone.goto(`${BASE}/remote/#id=${identity.peerId}&k=${identity.token}`);
  await phone.waitForFunction(() => document.getElementById('app').dataset.conn === 'connected', { timeout: 30000 });

  // Popup real con el celular conectado.
  await desk.bringToFront();
  await sleep(400);
  const popup = await browser.newPage();
  await popup.setViewport({ width: 340, height: 700, deviceScaleFactor: 2 });
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.waitForFunction(() => document.querySelectorAll('#devices li').length === 1, { timeout: 10000 });
  await popup.evaluate(() => { document.getElementById('use-tab').hidden = true; });
  const ph = await popup.evaluate(() => document.documentElement.scrollHeight);
  await popup.setViewport({ width: 340, height: ph, deviceScaleFactor: 2 });
  await sleep(300);
  await popup.screenshot({ path: `${OUT}/popup.png` });
  await popup.close();

  // Editor del deck (claro y oscuro) con el botón «Volvemos pronto» seleccionado.
  const editor = await browser.newPage();
  await editor.setViewport({ width: 1180, height: 1000, deviceScaleFactor: 2 });
  for (const scheme of ['light', 'dark']) {
    await editor.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
    await editor.goto(`chrome-extension://${extId}/options.html`);
    await editor.waitForSelector('#grid .key');
    await editor.evaluate(() => [...document.querySelectorAll('#grid .key')].find((k) => k.textContent.includes('Volvemos pronto')).click());
    await sleep(300);
    const box = await editor.$eval('.ed-body', (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left - 12, y: r.top - 12 + scrollY, width: r.width + 24, height: Math.min(r.height, 760) + 24 };
    });
    await editor.screenshot({ path: `${OUT}/editor-${scheme}.png`, clip: box, captureBeyondViewport: true });
  }
  await editor.close();

  // Página de capturas: botones con ids conocidos para las tomas del escritorio.
  await ctl.evaluate(async () => {
    const { defaultParams } = await import(chrome.runtime.getURL('actions.js'));
    const { deck } = await chrome.storage.local.get('deck');
    const { getDeck } = await import(chrome.runtime.getURL('deck.js'));
    const base = deck || (await getDeck());
    const k = (id, type, params) => ({ id, label: id, icon: 'ico:zap', color: 'blue', action: { ...defaultParams(type), ...params } });
    base.pages.push({ id: 'capturas', name: 'Capturas', keys: [
      k('cfull', 'screen.message', { text: 'Volvemos en 5 minutos', style: 'full' }),
      k('clower', 'screen.message', { text: 'Nuevo directo cada viernes · ¡suscríbete!', style: 'lower' }),
      k('ctoast', 'screen.toast', { text: '¡Gracias por acompañarnos! 💜' }),
      k('cconf', 'screen.confetti', {}),
    ] });
    await chrome.storage.local.set({ deck: base });
  });
  const press = (id) => sw({ type: 'cmd', cmd: { t: 'press', id } });

  await desk.bringToFront();
  await sleep(500);
  await desk.screenshot({ path: `${OUT}/desk-clean.png` });

  await press('cfull');
  await sleep(700);
  await desk.screenshot({ path: `${OUT}/desk-message.png` });
  await press('cfull');
  await sleep(500);

  await press('clower');
  await sleep(700);
  await desk.screenshot({ path: `${OUT}/desk-lower.png` });
  await press('clower');
  await sleep(500);

  await press('ctoast');
  await sleep(600);
  await desk.screenshot({ path: `${OUT}/desk-toast.png` });
  await sleep(4500);

  await press('cconf');
  await sleep(900);
  await desk.screenshot({ path: `${OUT}/desk-confetti.png` });
  await sleep(4000);

  // Imagen de ejemplo para el modo demostración del celular (captura y pantalla en vivo).
  const { execFileSync } = await import('node:child_process');
  execFileSync('python3', ['-c', `
from PIL import Image
im = Image.open(${JSON.stringify(path.join(OUT, 'desk-clean.png'))}).convert('RGB')
im.resize((1280, 720), Image.LANCZOS).save(${JSON.stringify(path.join(ROOT, 'remote', 'demo-screen.jpg'))}, quality=80, optimize=True)
`]);

  await ctl.evaluate(async () => {
    const { deck } = await chrome.storage.local.get('deck');
    deck.pages = deck.pages.filter((p) => p.id !== 'capturas');
    await chrome.storage.local.set({ deck });
  });
  await sw({ type: 'session:stop' });
  await phoneCtx.close();
  console.log('capturas listas');
} catch (e) {
  console.error('ERROR', e);
  process.exitCode = 1;
} finally {
  await browser.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
