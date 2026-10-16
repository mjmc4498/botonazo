// Botonazo — documento offscreen.
// · Mantiene la conexión WebRTC (PeerJS) con los celulares y valida cada mensaje.
// · Graba la pestaña (MediaRecorder) y transmite la pantalla en vivo al celular.
// · Mantiene la conexión con OBS Studio (WebSocket) y sus estados.
// Los botones se resuelven en el service worker: el celular solo envía su id.

/* global Peer */

import { ICE_ENDPOINT, FALLBACK_ICE } from './config.js';
import { ObsClient, obsErrorText } from './lib/obs.js';

const ICE_REFRESH_MS = 3 * 60 * 60 * 1000; // las credenciales duran 4 h

const devices = new Map();
let iceConfig = FALLBACK_ICE;
let identity = null;
let peer = null;
let stopped = false;
let retryTimer = 0;
let retryDelay = 1000;

const toSW = (msg) => chrome.runtime.sendMessage({ to: 'sw', ...msg }).catch(() => null);

function setStatus(status, error = null) {
  toSW({ type: 'status', status, error });
}

function publicDevices() {
  return [...devices.values()].map(({ id, name, since }) => ({ id, name, since }));
}

// ---------------------------------------------------------------- conexión con el servidor de señalización

function connect() {
  if (stopped) return;
  clearTimeout(retryTimer);
  setStatus('connecting');
  // debug: 0 — los avisos internos de PeerJS se manejan abajo; si se imprimieran,
  // Chrome los mostraría como errores en la página de Extensiones.
  peer = new Peer(identity.peerId, { debug: 0, config: iceConfig });
  const current = peer;

  current.on('open', () => {
    retryDelay = 1000;
    setStatus('ready');
  });
  current.on('connection', onConnection);
  current.on('disconnected', () => {
    if (stopped || current.destroyed) return;
    scheduleRetry(() => { if (!current.destroyed && current.disconnected) current.reconnect(); });
  });
  current.on('error', (err) => {
    if (stopped) return;
    switch (err.type) {
      case 'unavailable-id':
        // El servidor aún no liberó el identificador: si ya estuvo abierto solo se
        // reintenta la reconexión (destruir el peer cortaría a los celulares).
        setStatus('connecting');
        if (current.destroyed) scheduleRetry(connect);
        else scheduleRetry(() => { if (!current.destroyed && current.disconnected) current.reconnect(); });
        break;
      case 'browser-incompatible':
      case 'invalid-id':
      case 'invalid-key':
      case 'ssl-unavailable':
        setStatus('error', err.type);
        break;
      case 'network':
      case 'server-error':
      case 'socket-error':
      case 'socket-closed':
        setTimeout(() => setStatus('error', 'network'), 0);
        if (current.destroyed) scheduleRetry(connect);
        else scheduleRetry(() => { if (!current.destroyed && current.disconnected) current.reconnect(); });
        break;
      default:
        console.debug('[Botonazo]', err.type, err.message);
    }
  });
}

function scheduleRetry(fn) {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(fn, retryDelay);
  retryDelay = Math.min(retryDelay * 2, 15000);
}

// ---------------------------------------------------------------- envío (con fragmentos)

// PeerJS rechaza mensajes JSON de 16 300 bytes o más: los grandes (el deck, la lista
// de pestañas, imágenes) se parten en trozos que el celular vuelve a unir.
const MAX_JSON = 15000;
const CHUNK = 12000;
const encoder = new TextEncoder();
let partSeq = 0;

function base64Utf8(text) {
  const bytes = encoder.encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function send(conn, msg) {
  try {
    if (!conn.open) return;
    const text = JSON.stringify(msg);
    if (text.length * 3 < MAX_JSON || encoder.encode(text).byteLength < MAX_JSON) {
      conn.send(msg);
      return;
    }
    const data = base64Utf8(text);
    const id = ++partSeq;
    const n = Math.ceil(data.length / CHUNK);
    for (let i = 0; i < n; i++) conn.send({ t: 'part', id, i, n, d: data.slice(i * CHUNK, (i + 1) * CHUNK) });
  } catch {}
}

function sendFile(conn, file) {
  try {
    if (!conn.open || typeof file?.data !== 'string') return;
    const id = ++partSeq;
    const n = Math.max(1, Math.ceil(file.data.length / CHUNK));
    for (let i = 0; i < n; i++) {
      const part = { t: 'file', id, i, n, d: file.data.slice(i * CHUNK, (i + 1) * CHUNK) };
      if (i === 0) Object.assign(part, { kind: file.kind, mime: file.mime, name: file.name, w: file.w, h: file.h });
      conn.send(part);
    }
  } catch {}
}

function broadcast(msg) {
  for (const d of devices.values()) send(d.conn, msg);
}

// ---------------------------------------------------------------- estados (interruptores del deck)

let chromeStates = {};
let obsStates = {};

function allStates() {
  return { ...chromeStates, ...obsStates, ...recStates() };
}

let statesTimer = 0;
function pushStates() {
  clearTimeout(statesTimer);
  statesTimer = setTimeout(() => broadcast({ t: 'states', states: allStates(), now: Date.now() }), 60);
}

// ---------------------------------------------------------------- dispositivos

function deviceName(raw) {
  const name = typeof raw === 'string' ? raw.replace(/[\u0000-\u001f<>]/g, '').trim() : '';
  return name.slice(0, 40) || 'Celular';
}

function onConnection(conn) {
  const device = { id: conn.connectionId, name: 'Celular', since: Date.now(), conn, peerId: conn.peer, authed: false, mirror: null };
  const authTimer = setTimeout(() => { if (!device.authed) conn.close(); }, 10000);

  conn.on('data', async (raw) => {
    const msg = typeof raw === 'string' ? safeParse(raw) : raw;
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;

    if (!device.authed) {
      if (msg.t === 'hello' && typeof msg.k === 'string' && msg.k === identity.token) {
        clearTimeout(authTimer);
        device.authed = true;
        device.name = deviceName(msg.name);
        devices.set(device.id, device);
        const info = await toSW({ type: 'welcome' });
        send(conn, { t: 'welcome', target: info?.target, deck: info?.deck, states: allStates(), now: Date.now(), v: 1 });
        toSW({ type: 'devices', event: 'joined', device: { id: device.id, name: device.name }, devices: publicDevices() });
      } else {
        send(conn, { t: 'denied' });
        setTimeout(() => conn.close(), 300);
      }
      return;
    }

    const cmd = clean(msg);
    if (!cmd) return;
    switch (cmd.t) {
      case 'ping':
        send(conn, { t: 'pong', ts: cmd.ts });
        return;
      case 'mirror':
        if (cmd.on) startMirror(device);
        else stopMirror(device);
        return;
      case 'frameAck':
        if (device.mirror?.mode === 'frames') device.mirror.ack();
        return;
      default: {
        const res = await toSW({ type: 'cmd', cmd });
        if (res?.reply) send(conn, res.reply);
        if (res?.file) sendFile(conn, res.file);
      }
    }
  });

  conn.on('close', () => {
    clearTimeout(authTimer);
    stopMirror(device);
    if (devices.delete(device.id)) {
      toSW({ type: 'devices', event: 'left', device: { id: device.id, name: device.name }, devices: publicDevices() });
    }
  });
  conn.on('error', () => {});
}

function safeParse(text) {
  try { return JSON.parse(text); } catch { return null; }
}

// ---------------------------------------------------------------- validación de mensajes del celular

const KEY_ID = /^[a-z0-9]{1,24}$/;

function clean(m) {
  switch (m.t) {
    case 'ping':
      return { t: 'ping', ts: Number(m.ts) || 0 };
    case 'press':
      return typeof m.id === 'string' && KEY_ID.test(m.id) ? { t: 'press', id: m.id } : null;
    case 'tabs':
      return { t: 'tabs' };
    case 'focus':
    case 'close':
      return Number.isInteger(m.tab) && m.tab >= 0 ? { t: m.t, tab: m.tab } : null;
    case 'mirror':
      return { t: 'mirror', on: m.on === true };
    case 'frameAck':
      return { t: 'frameAck' };
    default:
      return null;
  }
}

// ---------------------------------------------------------------- captura de la pestaña (compartida)

// Chrome no permite capturar dos veces la misma pestaña: la grabación y la vista
// en vivo comparten un único stream, que se libera cuando ninguno lo usa.
let tabStream = null;

async function acquireTabStream(user, { tabId, streamId, audio = true, quality = '1080' }) {
  if (tabStream && tabStream.tabId === tabId && tabStream.stream.active) {
    tabStream.users.add(user);
    return tabStream.stream;
  }
  if (!streamId) throw new Error('capture');
  if (tabStream) {
    // Se pasa a capturar otra pestaña: la vista en vivo del celular se reinicia.
    for (const d of devices.values()) if (d.mirror?.mode === 'video') stopMirror(d, true);
    for (const track of tabStream.stream.getTracks()) track.stop();
    tabStream.audioCtx?.close().catch(() => {});
    tabStream = null;
  }
  const [maxWidth, maxHeight] = quality === '720' ? [1280, 720] : [1920, 1080];
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: audio ? { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } } : false,
    video: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId, maxWidth, maxHeight, maxFrameRate: 30 } },
  });
  // Al capturar una pestaña su sonido deja de oírse: se vuelve a reproducir.
  let audioCtx = null;
  if (stream.getAudioTracks().length) {
    audioCtx = new AudioContext();
    audioCtx.createMediaStreamSource(stream).connect(audioCtx.destination);
  }
  const entry = { tabId, stream, audioCtx, users: new Set([user]) };
  stream.getVideoTracks()[0]?.addEventListener('ended', () => {
    if (tabStream !== entry) return;
    if (recorder) stopRecording();
    for (const d of devices.values()) if (d.mirror?.mode === 'video') stopMirror(d, true);
  });
  tabStream = entry;
  return stream;
}

function releaseTabStream(user) {
  if (!tabStream) return;
  tabStream.users.delete(user);
  if (tabStream.users.size) return;
  for (const track of tabStream.stream.getTracks()) track.stop();
  tabStream.audioCtx?.close().catch(() => {});
  tabStream = null;
}

// ---------------------------------------------------------------- grabación de la pestaña

const MP4 = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4'];
const WEBM = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];

function pickMime(format) {
  const list = format === 'webm' ? [...WEBM, ...MP4] : [...MP4, ...WEBM];
  return list.find((t) => MediaRecorder.isTypeSupported(t)) || '';
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`;
}

let recorder = null;

function recStates() {
  return { 'rec.tab': recorder ? recorder.since : false };
}

async function startRecording({ tabId, streamId, format, quality, audio }) {
  if (recorder) return { ok: true };
  const stream = await acquireTabStream('rec', { tabId, streamId, audio, quality });
  const mime = pickMime(format);
  const mr = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: quality === '720' ? 5e6 : 8e6 });
  const entry = { mr, chunks: [], since: Date.now(), mime: mr.mimeType || mime || 'video/webm', saved: () => {} };
  mr.ondataavailable = (e) => { if (e.data.size) entry.chunks.push(e.data); };
  mr.onstop = async () => {
    const blob = new Blob(entry.chunks, { type: entry.mime });
    const ext = entry.mime.startsWith('video/mp4') ? 'mp4' : 'webm';
    const url = URL.createObjectURL(blob);
    await toSW({ type: 'download', url, filename: `Botonazo/Grabación ${stamp()}.${ext}` });
    entry.saved();
    // El enlace se libera cuando la descarga ya tuvo tiempo de copiar el archivo.
    setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);
  };
  mr.start(1000);
  recorder = entry;
  toSW({ type: 'rec:state', recording: true });
  pushStates();
  return { ok: true };
}

// Resuelve cuando el video ya se entregó a las descargas de Chrome.
function stopRecording() {
  if (!recorder) return Promise.resolve({ ok: false });
  const entry = recorder;
  recorder = null;
  const saved = new Promise((resolve) => {
    entry.saved = resolve;
    setTimeout(resolve, 15000);
  });
  try { entry.mr.stop(); } catch { entry.saved(); }
  releaseTabStream('rec');
  toSW({ type: 'rec:state', recording: false });
  pushStates();
  const seconds = Math.round((Date.now() - entry.since) / 1000);
  return saved.then(() => ({ ok: true, seconds }));
}

// ---------------------------------------------------------------- pantalla en vivo en el celular

// Con la pestaña capturada se envía video real (llamada WebRTC); si Chrome no lo
// permite, se envían imágenes de la pestaña visible (unas dos por segundo).
async function startMirror(device) {
  if (device.mirror) return;
  const mirror = { mode: 'pending', call: null, timer: 0, waiting: false, ack: () => {} };
  device.mirror = mirror;
  const res = await toSW({ type: 'mirror:stream', haveTabId: tabStream?.tabId ?? null });
  if (device.mirror !== mirror) return;

  if (res && (res.streamId || res.reuse)) {
    try {
      const stream = await acquireTabStream(`mirror:${device.id}`, { tabId: res.tabId, streamId: res.streamId, audio: res.audio, quality: res.quality });
      if (device.mirror !== mirror) { releaseTabStream(`mirror:${device.id}`); return; }
      const call = peer.call(device.peerId, new MediaStream(stream.getVideoTracks()), { metadata: { kind: 'mirror' } });
      mirror.mode = 'video';
      mirror.call = call;
      call.on('close', () => { if (device.mirror === mirror) stopMirror(device, true); });
      call.on('error', () => {});
      send(device.conn, { t: 'mirror', mode: 'video', title: res.title || '' });
      return;
    } catch {
      releaseTabStream(`mirror:${device.id}`);
    }
  }

  mirror.mode = 'frames';
  send(device.conn, { t: 'mirror', mode: 'frames', title: res?.title || '' });
  const loop = async () => {
    if (device.mirror !== mirror) return;
    const started = Date.now();
    const frame = await toSW({ type: 'mirror:frame' });
    if (device.mirror !== mirror) return;
    if (frame?.data) {
      mirror.waiting = true;
      sendFile(device.conn, { kind: 'frame', mime: 'image/jpeg', data: frame.data, w: frame.w, h: frame.h });
      // Se espera la confirmación del celular (o 2 s) antes de enviar la siguiente.
      await new Promise((resolve) => {
        mirror.ack = resolve;
        mirror.timer = setTimeout(resolve, 2000);
      });
      clearTimeout(mirror.timer);
      mirror.waiting = false;
    } else if (frame?.error) {
      send(device.conn, { t: 'mirror', mode: 'frames', error: frame.error });
    }
    const wait = Math.max(0, (frame?.data ? 450 : 1500) - (Date.now() - started));
    mirror.timer = setTimeout(loop, wait);
  };
  loop();
}

function stopMirror(device, notify = false) {
  const mirror = device.mirror;
  if (!mirror) return;
  device.mirror = null;
  clearTimeout(mirror.timer);
  mirror.ack();
  if (mirror.call) {
    try { mirror.call.close(); } catch {}
  }
  releaseTabStream(`mirror:${device.id}`);
  if (notify) send(device.conn, { t: 'mirror', mode: 'off' });
}

// ---------------------------------------------------------------- OBS Studio

let obsConfig = { enabled: false };
let obsWatch = { inputs: [], sources: [] };
let obs = null;
let obsConnecting = null;
let obsRetry = 0;
let obsRetryDelay = 3000;
let obsScene = '';
const obsSourceIds = new Map(); // «escena|fuente» → { scene, id }

function setObsState(patch) {
  obsStates = { ...obsStates, ...patch };
  pushStates();
}

async function obsConnect() {
  if (!obsConfig.enabled) throw new Error('disabled');
  if (obs?.connected) return obs;
  if (obsConnecting) return obsConnecting;
  clearTimeout(obsRetry);
  const client = new ObsClient(obsConfig);
  obsConnecting = client.connect()
    .then(async () => {
      obs = client;
      obsRetryDelay = 3000;
      client.on('close', () => {
        if (obs !== client) return;
        obs = null;
        obsStates = { 'obs.connected': false };
        pushStates();
        scheduleObsRetry();
      });
      bindObsEvents(client);
      await refreshObsStates();
      return client;
    })
    .catch((err) => {
      scheduleObsRetry();
      throw err;
    })
    .finally(() => { obsConnecting = null; });
  return obsConnecting;
}

function scheduleObsRetry() {
  clearTimeout(obsRetry);
  if (!obsConfig.enabled || stopped) return;
  obsRetry = setTimeout(() => obsConnect().catch(() => {}), obsRetryDelay);
  obsRetryDelay = Math.min(obsRetryDelay * 2, 30000);
}

function obsDisconnect() {
  clearTimeout(obsRetry);
  const client = obs;
  obs = null;
  client?.close();
  obsStates = {};
  pushStates();
}

function bindObsEvents(client) {
  const since = (active, key) => (active ? obsStates[key] || Date.now() : false);
  client.on('StreamStateChanged', (e) => setObsState({ 'obs.stream': since(e.outputActive, 'obs.stream') }));
  client.on('RecordStateChanged', (e) => {
    const paused = e.outputState === 'OBS_WEBSOCKET_OUTPUT_PAUSED';
    setObsState({ 'obs.record': since(e.outputActive || paused, 'obs.record'), 'obs.paused': paused });
  });
  client.on('VirtualcamStateChanged', (e) => setObsState({ 'obs.virtualcam': !!e.outputActive }));
  client.on('CurrentProgramSceneChanged', (e) => {
    const patch = {};
    for (const key of Object.keys(obsStates)) if (key.startsWith('obs.scene:')) patch[key] = false;
    obsScene = e.sceneName;
    patch[`obs.scene:${e.sceneName}`] = true;
    setObsState(patch);
    refreshObsSources(true).catch(() => {});
  });
  client.on('InputMuteStateChanged', (e) => setObsState({ [`obs.mute:${e.inputName}`]: !!e.inputMuted }));
  client.on('SceneItemEnableStateChanged', (e) => {
    const patch = {};
    for (const [key, ref] of obsSourceIds) {
      if (ref.scene === e.sceneName && ref.id === e.sceneItemId) patch[`obs.source:${key}`] = !!e.sceneItemEnabled;
    }
    if (Object.keys(patch).length) setObsState(patch);
  });
}

async function refreshObsStates() {
  const client = obs;
  if (!client) return;
  const ms = (status) => (status.outputActive ? Date.now() - (status.outputDuration || 0) : false);
  const [stream, record, scene, vcam] = await Promise.all([
    client.call('GetStreamStatus').catch(() => ({})),
    client.call('GetRecordStatus').catch(() => ({})),
    client.call('GetCurrentProgramScene').catch(() => ({})),
    client.call('GetVirtualCamStatus').catch(() => ({})),
  ]);
  obsScene = scene.currentProgramSceneName || scene.sceneName || '';
  const patch = {
    'obs.connected': true,
    'obs.stream': ms(stream),
    'obs.record': ms(record),
    'obs.paused': !!record.outputPaused,
    'obs.virtualcam': !!vcam.outputActive,
  };
  if (obsScene) patch[`obs.scene:${obsScene}`] = true;
  await Promise.all(obsWatch.inputs.map(async (inputName) => {
    const res = await client.call('GetInputMute', { inputName }).catch(() => null);
    if (res) patch[`obs.mute:${inputName}`] = !!res.inputMuted;
  }));
  obsStates = patch;
  pushStates();
  await refreshObsSources(false);
}

async function refreshObsSources(onlyCurrentScene) {
  const client = obs;
  if (!client) return;
  const patch = {};
  await Promise.all(obsWatch.sources.map(async ({ scene, source }) => {
    if (onlyCurrentScene && scene) return;
    const key = `${scene}|${source}`;
    const sceneName = scene || obsScene;
    try {
      const { sceneItemId } = await client.call('GetSceneItemId', { sceneName, sourceName: source });
      const { sceneItemEnabled } = await client.call('GetSceneItemEnabled', { sceneName, sceneItemId });
      obsSourceIds.set(key, { scene: sceneName, id: sceneItemId });
      patch[`obs.source:${key}`] = !!sceneItemEnabled;
    } catch {
      obsSourceIds.delete(key);
      patch[`obs.source:${key}`] = false;
    }
  }));
  setObsState(patch);
}

async function obsAction(a) {
  let client;
  try {
    client = await obsConnect();
  } catch (err) {
    return { ok: false, msg: obsErrorText(err) };
  }
  try {
    switch (a.type) {
      case 'obs.stream': {
        const { outputActive } = await client.call('ToggleStream');
        return { ok: true, msg: outputActive ? 'Transmisión iniciada' : 'Transmisión detenida' };
      }
      case 'obs.record': {
        const { outputActive } = await client.call('ToggleRecord');
        return { ok: true, msg: outputActive ? 'Grabación de OBS iniciada' : 'Grabación de OBS guardada' };
      }
      case 'obs.pause': {
        await client.call('ToggleRecordPause');
        const { outputPaused } = await client.call('GetRecordStatus');
        setObsState({ 'obs.paused': !!outputPaused });
        return { ok: true, msg: outputPaused ? 'Grabación en pausa' : 'Grabación reanudada' };
      }
      case 'obs.scene':
        await client.call('SetCurrentProgramScene', { sceneName: a.scene });
        return { ok: true, msg: `Escena: ${a.scene}` };
      case 'obs.mute': {
        const { inputMuted } = await client.call('ToggleInputMute', { inputName: a.input });
        setObsState({ [`obs.mute:${a.input}`]: !!inputMuted });
        return { ok: true, msg: inputMuted ? `${a.input} silenciado` : `${a.input} activo` };
      }
      case 'obs.source': {
        const sceneName = a.scene || obsScene || (await client.call('GetCurrentProgramScene')).currentProgramSceneName;
        const { sceneItemId } = await client.call('GetSceneItemId', { sceneName, sourceName: a.source });
        const { sceneItemEnabled } = await client.call('GetSceneItemEnabled', { sceneName, sceneItemId });
        await client.call('SetSceneItemEnabled', { sceneName, sceneItemId, sceneItemEnabled: !sceneItemEnabled });
        obsSourceIds.set(`${a.scene || ''}|${a.source}`, { scene: sceneName, id: sceneItemId });
        setObsState({ [`obs.source:${a.scene || ''}|${a.source}`]: !sceneItemEnabled });
        return { ok: true, msg: sceneItemEnabled ? `${a.source} oculto` : `${a.source} visible` };
      }
      case 'obs.replay':
        await client.call('SaveReplayBuffer');
        return { ok: true, msg: 'Repetición guardada' };
      case 'obs.virtualcam': {
        const { outputActive } = await client.call('ToggleVirtualCam');
        return { ok: true, msg: outputActive ? 'Cámara virtual activada' : 'Cámara virtual desactivada' };
      }
    }
    return { ok: false, msg: 'Acción de OBS desconocida' };
  } catch (err) {
    if (a.type === 'obs.replay' && err.code === 501) return { ok: false, msg: 'Activa el búfer de repetición en OBS.' };
    if (a.type === 'obs.pause' && err.code === 501) return { ok: false, msg: 'OBS no está grabando.' };
    return { ok: false, msg: obsErrorText(err, a.scene && a.type === 'obs.scene' ? a.scene : a.input || a.source || '') };
  }
}

function setObsConfig(config, watch) {
  const before = JSON.stringify(obsConfig);
  obsConfig = config || { enabled: false };
  obsWatch = watch || { inputs: [], sources: [] };
  if (JSON.stringify(obsConfig) !== before) {
    obsDisconnect();
    if (obsConfig.enabled) obsConnect().catch(() => {});
  } else if (obs?.connected) {
    refreshObsStates().catch(() => {});
  }
}

// ---------------------------------------------------------------- portapapeles

function copyText(text) {
  const area = document.createElement('textarea');
  area.value = text;
  document.body.append(area);
  area.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch {}
  area.remove();
  return ok;
}

// ---------------------------------------------------------------- mensajes del service worker

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.to !== 'offscreen') return;
  const reply = (promise) => {
    Promise.resolve(promise).then(sendResponse, (err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  };
  switch (msg.type) {
    case 'broadcast':
      broadcast(msg.msg);
      break;
    case 'states':
      chromeStates = msg.states || {};
      pushStates();
      break;
    case 'kick': {
      const d = devices.get(msg.id);
      if (d) {
        send(d.conn, { t: 'bye', reason: 'kicked' });
        setTimeout(() => d.conn.close(), 200);
      }
      break;
    }
    case 'obs:config':
      setObsConfig(msg.config, msg.watch);
      break;
    case 'obs':
      return reply(obsAction(msg.action));
    case 'rec:status':
      sendResponse({ recording: !!recorder, since: recorder?.since || 0, tabId: tabStream?.tabId ?? null });
      break;
    case 'rec:start':
      return reply(startRecording(msg));
    case 'rec:stop':
      return reply(stopRecording());
    case 'copy':
      sendResponse({ ok: copyText(String(msg.text || '')) });
      break;
    case 'stop':
      stopped = true;
      clearTimeout(retryTimer);
      obsDisconnect();
      for (const d of devices.values()) {
        stopMirror(d);
        send(d.conn, { t: 'bye', reason: msg.reason || 'stopped' });
      }
      // Si se estaba grabando, el video se guarda antes de cerrar.
      Promise.all([stopRecording(), new Promise((r) => setTimeout(r, 250))]).then(() => {
        try { peer?.destroy(); } catch {}
        sendResponse({ ok: true });
      });
      return true;
  }
});

// ---------------------------------------------------------------- retransmisión (TURN)

async function loadIce() {
  if (!ICE_ENDPOINT) return FALLBACK_ICE;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(ICE_ENDPOINT, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    if (!Array.isArray(data.iceServers) || !data.iceServers.length) throw new Error('sin servidores');
    return { iceServers: data.iceServers };
  } catch (err) {
    console.debug('[Botonazo] retransmisión no disponible:', err.message);
    return FALLBACK_ICE;
  } finally {
    clearTimeout(timer);
  }
}

setInterval(async () => {
  iceConfig = await loadIce();
  if (peer && !peer.destroyed) peer.options.config = iceConfig;
}, ICE_REFRESH_MS);

// ---------------------------------------------------------------- inicio

(async () => {
  identity = await toSW({ type: 'identity' });
  if (!identity?.peerId) {
    setStatus('error', 'identity');
    return;
  }
  iceConfig = await loadIce();
  connect();
  const boot = await toSW({ type: 'offscreen:ready' });
  if (boot) {
    chromeStates = boot.states || {};
    setObsConfig(boot.obs?.config, boot.obs?.watch);
  }
})();
