// Botonazo — estudio: graba la pantalla completa, una ventana o una pestaña con el
// selector de Chrome. Lo abre el botón «Grabar pantalla o ventana» y se detiene
// desde el celular (pulsando otra vez) o desde aquí.

import { getSettings } from './config.js';
import { applyI18n, t } from './lib/i18n.js';

applyI18n();

const $ = (id) => document.getElementById(id);
const settings = await getSettings();
$('audio').checked = settings.recAudio;

const MP4 = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4'];
const WEBM = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];

function pickMime() {
  const list = settings.recFormat === 'webm' ? [...WEBM, ...MP4] : [...MP4, ...WEBM];
  return list.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`;
}

const clock = (ms) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};

let stream = null;
let recorder = null;
let since = 0;
let clockTimer = 0;
const urls = [];

function setState(state) {
  document.body.dataset.state = state;
  const [tone, key] = { idle: ['muted', 'studioReady'], recording: ['error', 'studioRecording'], saved: ['ok', 'studioSaved'] }[state];
  $('pill').dataset.tone = tone;
  $('pill-text').textContent = t(key);
}

function notify(recording) {
  chrome.runtime.sendMessage({ to: 'sw', type: 'studio:state', recording }).catch(() => {});
}

function alertText(text) {
  $('alert').textContent = text;
  $('alert').hidden = !text;
}

async function choose({ auto = false } = {}) {
  if (recorder) return;
  alertText('');
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: $('audio').checked,
      systemAudio: 'include',
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'include',
    });
  } catch (err) {
    // Sin un clic previo Chrome puede negar el selector: se espera al botón.
    if (!auto && err?.name !== 'NotAllowedError') alertText(t('studioError'));
    return;
  }
  const mime = pickMime();
  recorder = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: 8e6 });
  const chunks = [];
  const type = recorder.mimeType || mime || 'video/webm';
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  recorder.onstop = async () => {
    const seconds = Math.round((Date.now() - since) / 1000);
    const blob = new Blob(chunks, { type });
    const url = URL.createObjectURL(blob);
    urls.push(url);
    const ext = type.startsWith('video/mp4') ? 'mp4' : 'webm';
    try {
      await chrome.downloads.download({ url, filename: `Botonazo/Pantalla ${stamp()}.${ext}`, conflictAction: 'uniquify', saveAs: false });
      $('saved-body').textContent = t('studioSavedBody', [clock(seconds * 1000)]);
    } catch {
      $('saved-body').textContent = t('studioError');
    }
    setState('saved');
  };
  for (const track of stream.getVideoTracks()) track.addEventListener('ended', stop);
  $('preview').srcObject = stream;
  $('preview').play().catch(() => {});
  recorder.start(1000);
  since = Date.now();
  $('clock').textContent = '0:00';
  clockTimer = setInterval(() => { $('clock').textContent = clock(Date.now() - since); }, 500);
  setState('recording');
  notify(true);
}

function stop() {
  if (!recorder) return;
  const r = recorder;
  recorder = null;
  clearInterval(clockTimer);
  try { r.stop(); } catch {}
  for (const track of stream?.getTracks() || []) track.stop();
  $('preview').srcObject = null;
  stream = null;
  notify(false);
}

$('choose').addEventListener('click', () => choose());
$('again').addEventListener('click', () => { setState('idle'); choose(); });
$('stop').addEventListener('click', stop);
$('close').addEventListener('click', () => window.close());

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.to !== 'studio') return;
  if (msg.type === 'stop') stop();
  sendResponse({ ok: true });
});

window.addEventListener('beforeunload', (e) => {
  if (recorder) e.preventDefault();
});
window.addEventListener('pagehide', () => {
  for (const url of urls) URL.revokeObjectURL(url);
});

setState('idle');
notify(false);
// Se intenta abrir el selector de inmediato (el usuario ya pulsó el botón en el celular).
choose({ auto: true });
