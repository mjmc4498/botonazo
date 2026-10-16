// Botonazo — deck en el celular.
// Se conecta por WebRTC (PeerJS) con la extensión de Chrome, dibuja los botones
// que configuraste y envía el botón pulsado. La acción se ejecuta en la computadora.

/* global Peer */
(() => {
  'use strict';

  const VERSION = '1.1.0';

  // Worker de Cloudflare que entrega credenciales temporales de retransmisión (TURN)
  // para redes que bloquean la conexión directa.
  const ICE_ENDPOINT = 'https://mando-turn.mjmc4498.workers.dev/ice';
  const FALLBACK_ICE = {
    iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }, { urls: 'stun:stun.l.google.com:19302' }],
  };
  const ICE_REFRESH_MS = 3 * 60 * 60 * 1000;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const app = $('#app');

  // ================================================================ textos

  const TEXT = {
    settings: 'Ajustes', captures: 'Capturas', capture: 'Captura', close: 'Cerrar', refresh: 'Actualizar',
    openTabs: 'Pestañas abiertas', saveShot: 'Guardar en el celular',
    shotHint: 'También puedes mantener presionada la imagen para guardarla o compartirla.',
    retry: 'Reintentar', haptics: 'Vibración', keepAwake: 'Mantener la pantalla encendida', showLabels: 'Mostrar nombres',
    latency: 'Latencia', forget: 'Olvidar esta computadora', done: 'Listo', madeBy: 'Creado por Miguel Mogrovejo', privacy: 'Privacidad',
    connected: 'Conectado', connecting: 'Conectando…', reconnecting: 'Reconectando…', offline: 'Sin conexión',
    gateIdleTitle: 'Escanea el código', gateIdleBody: 'Abre la extensión Botonazo en Chrome y escanea el código QR con la cámara de tu celular.',
    gateConnectingTitle: 'Conectando…', gateConnectingBody: 'Buscando tu computadora.',
    gateWaitingTitle: 'Esperando a la computadora', gateWaitingBody: 'Abre el panel de Botonazo en Chrome. Si muestra un código nuevo, escanéalo otra vez.',
    gateOfflineTitle: 'Sin conexión', gateOfflineBody: 'Revisa la conexión a internet de tu celular.',
    gateDeniedTitle: 'Código no válido', gateDeniedBody: 'Este código fue renovado. Escanea el código nuevo desde la extensión.',
    gateEndedTitle: 'Sesión finalizada', gateEndedBody: 'La sesión se detuvo en la computadora. Si al volver a iniciarla aparece un código nuevo, escanéalo.',
    gateKickedTitle: 'Desconectado', gateKickedBody: 'La computadora cerró la conexión con este celular.',
    gateUnsupportedTitle: 'Navegador no compatible', gateUnsupportedBody: 'Abre este enlace en Chrome o Safari actualizados.',
    restricted: 'Chrome no permite usar extensiones en esta pestaña',
    notConnected: 'Sin conexión con la computadora',
    noResponse: 'La computadora no respondió',
    actionFailed: 'No se pudo completar la acción',
    pageMissing: 'Esa página ya no existe en el deck',
    emptyPage: 'Esta página no tiene botones.\nAgrégalos desde el editor de Botonazo en Chrome.',
    noTabs: 'No hay pestañas abiertas',
    window: 'Ventana',
    chromePage: 'Página de Chrome',
    hiddenSite: 'Sin acceso al sitio',
    live: 'En vivo', preview: 'Vista previa',
    mirrorWait: 'Conectando con la pantalla…',
    mirrorEnded: 'La pantalla en vivo terminó',
    shotSaved: 'Captura lista',
    tabFocused: 'Pestaña abierta',
  };
  const t = (key) => TEXT[key] ?? key;

  document.documentElement.lang = 'es';
  for (const el of $$('[data-t]')) el.textContent = t(el.dataset.t);
  for (const el of $$('[data-t-aria]')) el.setAttribute('aria-label', t(el.dataset.tAria));
  $('#version').textContent = VERSION;

  // ================================================================ preferencias

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(`botonazo.${key}`);
        return raw == null ? fallback : JSON.parse(raw);
      } catch { return fallback; }
    },
    set(key, value) {
      try {
        if (value == null) localStorage.removeItem(`botonazo.${key}`);
        else localStorage.setItem(`botonazo.${key}`, JSON.stringify(value));
      } catch {}
    },
  };

  const prefs = { haptics: true, wake: true, labels: true, ...store.get('prefs', {}) };
  const savePrefs = () => store.set('prefs', prefs);

  // ================================================================ utilidades

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // Vibración: navigator.vibrate en Android; en iOS 18+ un interruptor nativo produce un toque háptico.
  const hapticSwitch = (() => {
    if (!isIOS) return null;
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.append(input);
    label.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;overflow:hidden;pointer-events:none;left:-10px;top:-10px';
    label.setAttribute('aria-hidden', 'true');
    document.body.append(label);
    return label;
  })();

  function buzz(pattern = 10) {
    if (!prefs.haptics) return;
    if (navigator.vibrate) navigator.vibrate(pattern);
    else if (hapticSwitch) hapticSwitch.click();
  }

  let toastTimer = 0;
  function toast(text, { error = false } = {}) {
    const el = $('#toast');
    el.textContent = text;
    el.classList.toggle('error', error);
    el.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('on'), error ? 3600 : 2200);
  }

  function deviceName() {
    const ua = navigator.userAgent;
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua) || isIOS) return 'iPad';
    const m = ua.match(/Android[^;]*;\s*([^;)]+?)(?:\s+Build|\))/);
    if (m && m[1] && !/^K$|wv/.test(m[1])) return m[1].trim().slice(0, 32);
    if (/Android/.test(ua)) return 'Android';
    return 'Navegador';
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';
  function svgIcon(markup) {
    const doc = new DOMParser().parseFromString(`<svg xmlns="${SVG_NS}" viewBox="0 0 24 24">${markup}</svg>`, 'image/svg+xml');
    return document.importNode(doc.documentElement, true);
  }
  const UI_ICONS = {
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    volume: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>',
    mute: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6M16 9l6 6"/>',
  };

  // Íconos de los botones: llegan como [etiqueta, atributos] y se construyen con DOM
  // (sin interpretar HTML), solo con formas y atributos geométricos.
  const SHAPES = new Set(['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse']);
  const SHAPE_ATTRS = new Set(['d', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'points', 'fill']);
  function keyIcon(icon) {
    if (icon && Array.isArray(icon.s)) {
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('class', 'ico');
      for (const shape of icon.s.slice(0, 24)) {
        if (!Array.isArray(shape) || !SHAPES.has(shape[0])) continue;
        const node = document.createElementNS(SVG_NS, shape[0]);
        for (const [k, v] of Object.entries(shape[1] || {})) {
          if (SHAPE_ATTRS.has(k) && typeof v === 'string' && /^[-\w.,\s#]*$/.test(v)) node.setAttribute(k, v);
        }
        svg.append(node);
      }
      return svg;
    }
    const span = document.createElement('span');
    span.className = 'emoji';
    span.textContent = typeof icon?.e === 'string' ? icon.e.slice(0, 16) : '•';
    return span;
  }

  const safeColor = (c, fallback) => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : fallback);

  // ================================================================ sesión

  const query = new URLSearchParams(location.search);
  const demo = query.has('demo');
  const hash = new URLSearchParams(location.hash.slice(1));
  let session = null;
  if (hash.get('id') && hash.get('k')) {
    session = { id: hash.get('id'), k: hash.get('k') };
    store.set('session', session);
    // Quitamos el secreto de la barra de direcciones.
    history.replaceState(null, '', location.pathname + location.search);
  } else {
    session = store.get('session', null);
  }

  // ================================================================ deck

  let deck = store.get('deck', null);
  let states = {};
  let clockOffset = 0;
  let pageIndex = store.get('page', 0);
  const keyEls = new Map();

  function effectiveCols() {
    const base = deck?.cols || 4;
    return innerWidth > innerHeight ? Math.min(8, base + 2) : base;
  }

  function renderDeck() {
    const deckEl = $('#deck');
    keyEls.clear();
    if (!deck || !Array.isArray(deck.pages)) {
      deckEl.replaceChildren();
      renderPagesNav();
      return;
    }
    const cols = effectiveCols();
    deckEl.replaceChildren(...deck.pages.map((page) => {
      const section = document.createElement('section');
      section.className = 'page';
      if (!page.keys?.length) {
        const empty = document.createElement('div');
        empty.className = 'empty-page';
        empty.textContent = t('emptyPage');
        empty.style.whiteSpace = 'pre-line';
        section.append(empty);
        return section;
      }
      const grid = document.createElement('div');
      grid.className = 'grid';
      grid.dataset.cols = cols;
      grid.style.setProperty('--cols', cols);
      for (const k of page.keys) grid.append(keyElement(k));
      section.append(grid);
      return section;
    }));
    pageIndex = Math.max(0, Math.min(pageIndex, deck.pages.length - 1));
    renderPagesNav();
    requestAnimationFrame(() => scrollToPage(pageIndex, true));
    applyStates();
  }

  function keyElement(k) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'key';
    btn.dataset.id = String(k.id);
    btn.style.setProperty('--bg', safeColor(k.bg, '#2c2c31'));
    btn.style.setProperty('--fg', safeColor(k.fg, '#ffffff'));
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = typeof k.label === 'string' ? k.label : '';
    const live = document.createElement('span');
    live.className = 'live';
    live.innerHTML = '<i></i><span></span>';
    const fx = document.createElement('span');
    fx.className = 'fx';
    btn.append(keyIcon(k.icon), label, live, fx);
    btn.setAttribute('aria-label', label.textContent || 'Botón');
    btn.addEventListener('click', () => press(k, btn));
    keyEls.set(k.id, { k, el: btn });
    return btn;
  }

  function renderPagesNav() {
    const nav = $('#pages');
    const pages = deck?.pages || [];
    nav.classList.toggle('single', pages.length < 2);
    nav.replaceChildren(...pages.map((page, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(i === pageIndex));
      b.textContent = page.name;
      b.addEventListener('click', () => { buzz(6); scrollToPage(i); });
      return b;
    }));
  }

  function scrollToPage(i, instant = false) {
    const deckEl = $('#deck');
    deckEl.scrollTo({ left: i * deckEl.clientWidth, behavior: instant ? 'instant' : 'smooth' });
    setPage(i);
  }

  function setPage(i) {
    if (i === pageIndex && $('#pages [aria-selected="true"]')) return;
    pageIndex = i;
    store.set('page', i);
    $$('#pages button').forEach((b, j) => b.setAttribute('aria-selected', String(j === i)));
    $('#pages [aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  let scrollTimer = 0;
  $('#deck').addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const el = $('#deck');
      const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
      if (i !== pageIndex) setPage(i);
    }, 60);
  }, { passive: true });

  let lastCols = 0;
  addEventListener('resize', () => {
    const cols = effectiveCols();
    if (cols !== lastCols) {
      lastCols = cols;
      for (const grid of $$('.grid')) {
        grid.dataset.cols = cols;
        grid.style.setProperty('--cols', cols);
      }
    }
    scrollToPage(pageIndex, true);
  });

  // ---------------------------------------------------------------- estados (interruptores)

  function applyStates() {
    for (const { k, el } of keyEls.values()) {
      if (!k.st) continue;
      const v = states[k.st];
      el.classList.toggle('on', !!v);
      const timed = typeof v === 'number' && v > 1e12;
      el.classList.toggle('timed', timed);
      el.dataset.since = timed ? String(v + clockOffset) : '';
    }
    tickTimers();
  }

  function fmtClock(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  }

  function tickTimers() {
    for (const { el } of keyEls.values()) {
      if (!el.classList.contains('timed')) continue;
      el.querySelector('.live span').textContent = fmtClock(Date.now() - Number(el.dataset.since));
    }
  }
  setInterval(tickTimers, 1000);

  // ---------------------------------------------------------------- pulsar un botón

  const pending = new Map();

  function setFx(el, kind) {
    const fx = el.querySelector('.fx');
    if (kind === 'busy') fx.innerHTML = '<span class="spin"></span>';
    else fx.replaceChildren(svgIcon(kind === 'ok' ? UI_ICONS.check : UI_ICONS.x));
  }

  function press(k, el) {
    buzz(12);
    if (k.ui === 'page') {
      const i = deck.pages.findIndex((p) => p.id === k.go);
      if (i >= 0) scrollToPage(i);
      else toast(t('pageMissing'), { error: true });
      return;
    }
    if (k.ui === 'tabs') { openTabs(); return; }
    if (k.ui === 'mirror') { openViewer(); return; }
    if (demo) {
      el.classList.remove('done', 'fail');
      setFx(el, 'ok');
      void el.offsetWidth;
      el.classList.add('done');
      setTimeout(() => el.classList.remove('done'), 1300);
      return;
    }
    if (!send({ t: 'press', id: k.id })) return;
    el.classList.remove('done', 'fail');
    setFx(el, 'busy');
    el.classList.add('busy');
    clearTimeout(pending.get(k.id));
    pending.set(k.id, setTimeout(() => {
      pending.delete(k.id);
      el.classList.remove('busy');
      toast(t('noResponse'), { error: true });
    }, 15000));
  }

  function onDone(msg) {
    const entry = keyEls.get(msg.id);
    clearTimeout(pending.get(msg.id));
    pending.delete(msg.id);
    if (!entry) {
      if (msg.msg) toast(msg.msg, { error: !msg.ok });
      return;
    }
    const { el } = entry;
    el.classList.remove('busy', 'done', 'fail');
    void el.offsetWidth;
    if (msg.ok) {
      setFx(el, 'ok');
      el.classList.add('done');
      setTimeout(() => el.classList.remove('done'), 1300);
      if (msg.msg) toast(msg.msg);
      buzz(8);
    } else {
      el.classList.add('fail');
      setTimeout(() => el.classList.remove('fail'), 500);
      toast(msg.msg || t('actionFailed'), { error: true });
      buzz([30, 60, 30]);
    }
  }

  // ================================================================ pestañas

  const tabsSheet = $('#tabs-sheet');

  function hue(text) {
    let h = 0;
    for (const ch of text) h = (h * 31 + ch.codePointAt(0)) % 360;
    return h;
  }

  function openTabs() {
    if (!demo && !send({ t: 'tabs' })) return;
    $('#tab-list').replaceChildren(Object.assign(document.createElement('li'), { className: 'win-title', textContent: t('connecting') }));
    showSheet(tabsSheet);
    if (demo) onTabs(DEMO_TABS);
  }

  function onTabs(msg) {
    const list = $('#tab-list');
    const tabs = Array.isArray(msg.tabs) ? msg.tabs : [];
    if (!tabs.length) {
      list.replaceChildren(Object.assign(document.createElement('li'), { className: 'win-title', textContent: t('noTabs') }));
      return;
    }
    const nodes = [];
    // Aviso de la extensión, p. ej. cuando falta el acceso a los sitios y no hay títulos.
    if (typeof msg.note === 'string' && msg.note) nodes.push(Object.assign(document.createElement('li'), { className: 'tabs-note', textContent: msg.note }));
    let win = 0;
    for (const tab of tabs) {
      if (msg.windows > 1 && tab.win !== win) {
        win = tab.win;
        nodes.push(Object.assign(document.createElement('li'), { className: 'win-title', textContent: `${t('window')} ${win}` }));
      }
      const li = document.createElement('li');
      li.className = `tab-item${tab.active ? ' active' : ''}`;
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'tab-open';
      const title = String(tab.title || tab.host || t('chromePage'));
      const host = String(tab.host || '');
      const avatar = document.createElement('span');
      avatar.className = 'tab-avatar';
      avatar.style.setProperty('--h', hue(host || title));
      avatar.textContent = (host.replace(/^www\./, '') || title).trim().charAt(0) || '·';
      const text = document.createElement('span');
      text.className = 'tab-text';
      const tt = document.createElement('span');
      tt.className = 'tab-title';
      tt.textContent = title;
      const th = document.createElement('span');
      th.className = 'tab-host';
      if (tab.audible || tab.muted) th.append(svgIcon(tab.muted ? UI_ICONS.mute : UI_ICONS.volume));
      th.append(document.createTextNode(host || t(tab.hidden ? 'hiddenSite' : 'chromePage')));
      text.append(tt, th);
      open.append(avatar, text);
      open.addEventListener('click', () => {
        buzz(10);
        if (demo || send({ t: 'focus', tab: tab.id })) tabsSheet.close();
      });
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'tab-close';
      close.setAttribute('aria-label', t('close'));
      close.append(svgIcon(UI_ICONS.x));
      close.addEventListener('click', () => { buzz(10); if (!demo) send({ t: 'close', tab: tab.id }); li.remove(); });
      li.append(open, close);
      nodes.push(li);
    }
    list.replaceChildren(...nodes);
  }

  $('#tabs-refresh').addEventListener('click', () => { buzz(6); if (!demo) send({ t: 'tabs' }); });

  // ================================================================ capturas

  const shots = [];
  let currentShot = null;

  function addShot(blob, name, mime) {
    const shot = { blob, name: name || 'Captura.png', mime, url: URL.createObjectURL(blob), time: new Date() };
    shots.unshift(shot);
    while (shots.length > 12) URL.revokeObjectURL(shots.pop().url);
    $('#open-gallery').hidden = false;
    $('#gallery-count').textContent = String(shots.length);
    openShot(shot);
  }

  function openShot(shot) {
    currentShot = shot;
    $('#shot-img').src = shot.url;
    if (!$('#viewer').hidden) return;
    showSheet($('#shot-sheet'));
  }

  $('#shot-save').addEventListener('click', async () => {
    const shot = currentShot;
    if (!shot) return;
    buzz(10);
    const file = new File([shot.blob], shot.name, { type: shot.mime });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }
    const a = document.createElement('a');
    a.href = shot.url;
    a.download = shot.name;
    document.body.append(a);
    a.click();
    a.remove();
  });

  $('#open-gallery').addEventListener('click', () => {
    const gallery = $('#gallery');
    gallery.replaceChildren(...shots.map((shot) => {
      const b = document.createElement('button');
      b.type = 'button';
      const img = document.createElement('img');
      img.src = shot.url;
      img.alt = '';
      const time = document.createElement('span');
      time.textContent = shot.time.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
      b.append(img, time);
      b.addEventListener('click', () => { $('#gallery-sheet').close(); openShot(shot); });
      return b;
    }));
    showSheet($('#gallery-sheet'));
  });

  // ================================================================ pantalla en vivo

  const viewer = $('#viewer');
  const video = $('#viewer-video');
  const frameImg = $('#viewer-img');
  let mirrorOpen = false;
  let mirrorCall = null;
  let frameUrl = '';

  function viewerWait(text) {
    $('#viewer-wait').hidden = !text;
    $('#viewer-wait-text').textContent = text || '';
  }

  function openViewer() {
    if (!demo && !(conn?.open && connState === 'connected')) { toast(t('notConnected'), { error: true }); return; }
    mirrorOpen = true;
    viewer.hidden = false;
    video.hidden = true;
    frameImg.hidden = true;
    $('#live-text').textContent = t('live');
    $('#viewer-title').textContent = $('#target-title').textContent;
    viewerWait(t('mirrorWait'));
    if (demo) {
      frameImg.src = 'demo-screen.jpg';
      frameImg.hidden = false;
      viewerWait('');
      return;
    }
    send({ t: 'mirror', on: true });
  }

  function closeViewer(notify = true) {
    if (!mirrorOpen) return;
    mirrorOpen = false;
    viewer.hidden = true;
    if (notify) send({ t: 'mirror', on: false });
    try { mirrorCall?.close(); } catch {}
    mirrorCall = null;
    video.srcObject = null;
    frameImg.removeAttribute('src');
    if (frameUrl) URL.revokeObjectURL(frameUrl);
    frameUrl = '';
  }

  $('#viewer-close').addEventListener('click', () => { buzz(8); closeViewer(); });

  function onMirror(msg) {
    if (!mirrorOpen) return;
    if (msg.mode === 'off') {
      closeViewer(false);
      toast(t('mirrorEnded'));
      return;
    }
    if (msg.title) $('#viewer-title').textContent = msg.title;
    $('#live-text').textContent = msg.mode === 'video' ? t('live') : t('preview');
    if (msg.error) viewerWait(msg.error);
  }

  function onFrame(blob) {
    if (!mirrorOpen) return;
    const url = URL.createObjectURL(blob);
    frameImg.onload = () => {
      if (frameUrl && frameUrl !== url) URL.revokeObjectURL(frameUrl);
      frameUrl = url;
    };
    frameImg.src = url;
    frameImg.hidden = false;
    video.hidden = true;
    viewerWait('');
    send({ t: 'frameAck' });
  }

  function onCall(call) {
    // Solo se aceptan llamadas de la computadora con la que hay sesión.
    if (!session || call.peer !== session.id || !mirrorOpen) {
      try { call.close(); } catch {}
      return;
    }
    try { mirrorCall?.close(); } catch {}
    mirrorCall = call;
    call.on('stream', (stream) => {
      video.srcObject = stream;
      video.hidden = false;
      frameImg.hidden = true;
      video.play().catch(() => {});
      viewerWait('');
    });
    call.on('close', () => { if (mirrorCall === call) mirrorCall = null; });
    call.on('error', () => {});
    call.answer();
  }

  // ================================================================ archivos y mensajes en partes

  const partials = new Map();

  function base64ToBytes(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function collect(msg, done) {
    if (typeof msg.d !== 'string' || !Number.isInteger(msg.i) || !Number.isInteger(msg.n) || msg.n < 1 || msg.n > 5000) return;
    const key = `${msg.t}:${msg.id}`;
    let entry = partials.get(key);
    if (!entry) {
      entry = { parts: new Array(msg.n), count: 0, meta: null, at: Date.now() };
      partials.set(key, entry);
    }
    if (msg.i === 0) entry.meta = msg;
    if (entry.parts[msg.i] == null) entry.count++;
    entry.parts[msg.i] = msg.d;
    if (entry.count === msg.n) {
      partials.delete(key);
      done(entry.parts.join(''), entry.meta || msg);
    }
    // Restos de transferencias interrumpidas.
    for (const [k, e] of partials) if (Date.now() - e.at > 60000) partials.delete(k);
  }

  function onPart(msg) {
    collect(msg, (b64) => {
      try { onData(JSON.parse(new TextDecoder().decode(base64ToBytes(b64)))); } catch {}
    });
  }

  function onFile(msg) {
    collect(msg, (b64, meta) => {
      const mime = /^image\/(png|jpeg|webp)$/.test(meta.mime) ? meta.mime : 'application/octet-stream';
      let blob;
      try { blob = new Blob([base64ToBytes(b64)], { type: mime }); } catch { return; }
      if (meta.kind === 'frame') onFrame(blob);
      else if (meta.kind === 'shot') addShot(blob, typeof meta.name === 'string' ? meta.name.replace(/[\\/:*?"<>|]/g, '-').slice(0, 80) : '', mime);
    });
  }

  // ================================================================ hojas inferiores

  function showSheet(sheet) {
    for (const s of $$('dialog[open]')) if (s !== sheet) s.close();
    if (typeof sheet.showModal === 'function') {
      if (!sheet.open) sheet.showModal();
    } else {
      sheet.setAttribute('open', '');
    }
  }

  for (const sheet of $$('dialog.sheet')) {
    sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });
  }
  for (const btn of $$('[data-close]')) btn.addEventListener('click', () => btn.closest('dialog').close());

  // ================================================================ estado de conexión

  let conn = null;
  let peer = null;
  let connState = 'idle';
  let everConnected = false;
  let latency = null;
  let retryTimer = 0;
  let retryDelay = 1200;
  let pingTimer = 0;
  let lastPong = 0;

  const GATE = {
    idle: ['gateIdleTitle', 'gateIdleBody', false, false],
    connecting: ['gateConnectingTitle', 'gateConnectingBody', true, false],
    reconnecting: ['gateConnectingTitle', 'gateConnectingBody', true, false],
    waiting: ['gateWaitingTitle', 'gateWaitingBody', true, false],
    offline: ['gateOfflineTitle', 'gateOfflineBody', true, true],
    denied: ['gateDeniedTitle', 'gateDeniedBody', false, false],
    ended: ['gateEndedTitle', 'gateEndedBody', true, true],
    kicked: ['gateKickedTitle', 'gateKickedBody', false, true],
    unsupported: ['gateUnsupportedTitle', 'gateUnsupportedBody', false, false],
  };
  const BLOCKING = new Set(['idle', 'denied', 'ended', 'kicked', 'unsupported']);

  function setConn(state) {
    connState = state;
    const shown = state === 'connecting' && everConnected ? 'reconnecting' : state;
    app.dataset.conn = shown;
    const labels = { connected: 'connected', connecting: 'connecting', reconnecting: 'reconnecting', waiting: 'reconnecting', offline: 'offline' };
    $('#status-text').textContent = t(labels[shown] || 'offline');

    const ready = state === 'connected' || (everConnected && !BLOCKING.has(state));
    app.classList.toggle('ready', ready);
    const [title, body, spinner, retry] = GATE[state] || GATE.connecting;
    $('#gate-title').textContent = t(title);
    $('#gate-body').textContent = t(body);
    $('#gate-spinner').hidden = !spinner;
    $('#gate-retry').hidden = !retry;
    if (BLOCKING.has(state)) closeViewer(false);
  }

  function setTarget(info) {
    const el = $('#target');
    // Sin acceso a los sitios la extensión envía el aviso en lugar del título.
    if (info && info.access === false) {
      el.classList.add('warn');
      $('#target-title').textContent = String(info.title || '');
      return;
    }
    if (!info || !info.title) {
      el.classList.toggle('warn', !!info && info.ok === false);
      $('#target-title').textContent = info && info.ok === false ? t('restricted') : '';
      return;
    }
    el.classList.toggle('warn', info.ok === false);
    $('#target-title').textContent = info.ok === false ? `${t('restricted')} · ${info.title}` : info.title;
  }

  // ================================================================ conexión (PeerJS)

  function scheduleRetry(fn, delay = retryDelay) {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(fn, delay);
    retryDelay = Math.min(retryDelay * 1.5, 6000);
  }

  // Credenciales de retransmisión: si el Worker no responde, se usa la conexión directa.
  let icePromise = null;
  function getIce() {
    if (!icePromise) {
      icePromise = (async () => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 4000);
        try {
          const res = await fetch(ICE_ENDPOINT, { signal: ctrl.signal, cache: 'no-store' });
          if (!res.ok) throw new Error(String(res.status));
          const data = await res.json();
          if (!Array.isArray(data.iceServers) || !data.iceServers.length) throw new Error('sin servidores');
          setTimeout(() => { icePromise = null; }, ICE_REFRESH_MS);
          return { iceServers: data.iceServers };
        } catch {
          icePromise = null;
          return FALLBACK_ICE;
        } finally {
          clearTimeout(timer);
        }
      })();
    }
    return icePromise;
  }

  let startingPeer = false;
  async function startPeer() {
    if (!session) { setConn('idle'); return; }
    if (typeof Peer === 'undefined' || !window.RTCPeerConnection) { setConn('unsupported'); return; }
    if (peer && !peer.destroyed) {
      if (peer.disconnected) peer.reconnect();
      else if (peer.open) openConn();
      return;
    }
    if (startingPeer) return;
    if (!everConnected) setConn('connecting');
    startingPeer = true;
    const config = await getIce();
    startingPeer = false;
    if (peer && !peer.destroyed) return;
    peer = new Peer({ debug: 0, config });
    const current = peer;
    current.on('open', () => { if (current === peer) openConn(); });
    current.on('call', onCall);
    current.on('disconnected', () => {
      if (current !== peer || current.destroyed) return;
      scheduleRetry(() => { if (!current.destroyed && current.disconnected) current.reconnect(); });
    });
    current.on('error', (err) => {
      if (current !== peer) return;
      switch (err.type) {
        case 'peer-unavailable':
          if (!BLOCKING.has(connState)) setConn('waiting');
          scheduleRetry(openConn);
          break;
        case 'browser-incompatible':
          setConn('unsupported');
          break;
        case 'network':
        case 'server-error':
        case 'socket-error':
        case 'socket-closed':
          if (!conn?.open) setConn('offline');
          scheduleRetry(restartPeer);
          break;
        default:
          scheduleRetry(restartPeer);
      }
    });
  }

  function restartPeer() {
    try { peer?.destroy(); } catch {}
    peer = null;
    startPeer();
  }

  function openConn() {
    clearTimeout(retryTimer);
    if (!session || !peer || peer.destroyed || peer.disconnected || !peer.open) return;
    if (conn) {
      try { conn.removeAllListeners(); conn.close(); } catch {}
    }
    const c = peer.connect(session.id, { serialization: 'json', reliable: true });
    conn = c;
    if (!BLOCKING.has(connState)) setConn(everConnected ? 'reconnecting' : 'connecting');
    const timeout = setTimeout(() => {
      if (c === conn && !c.open) {
        try { c.close(); } catch {}
        if (!BLOCKING.has(connState)) setConn('waiting');
        scheduleRetry(openConn);
      }
    }, 12000);
    c.on('open', () => {
      clearTimeout(timeout);
      c.send({ t: 'hello', k: session.k, name: deviceName(), v: 1 });
    });
    c.on('data', (msg) => { if (c === conn) onData(msg); });
    c.on('close', () => {
      clearTimeout(timeout);
      if (c !== conn) return;
      conn = null;
      stopPing();
      closeViewer(false);
      if (['denied', 'kicked', 'unsupported', 'idle'].includes(connState)) return;
      if (connState !== 'ended') setConn('waiting');
      scheduleRetry(openConn, connState === 'ended' ? 4000 : retryDelay);
    });
    c.on('error', () => {});
  }

  function onData(msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'welcome':
        everConnected = true;
        retryDelay = 1200;
        lastPong = Date.now();
        setConn('connected');
        setTarget(msg.target);
        if (typeof msg.now === 'number') clockOffset = Date.now() - msg.now;
        states = msg.states && typeof msg.states === 'object' ? msg.states : {};
        if (msg.deck) {
          deck = msg.deck;
          store.set('deck', deck);
          renderDeck();
        }
        startPing();
        keepAwake();
        buzz(20);
        if (mirrorOpen) send({ t: 'mirror', on: true });
        break;
      case 'deck':
        if (msg.deck) {
          deck = msg.deck;
          store.set('deck', deck);
          renderDeck();
        }
        break;
      case 'states':
        if (typeof msg.now === 'number') clockOffset = Date.now() - msg.now;
        states = msg.states && typeof msg.states === 'object' ? msg.states : {};
        applyStates();
        break;
      case 'target':
        setTarget(msg);
        break;
      case 'done':
        onDone(msg);
        break;
      case 'tabs':
        onTabs(msg);
        break;
      case 'focused':
        if (msg.ok) toast(t('tabFocused'));
        break;
      case 'mirror':
        onMirror(msg);
        break;
      case 'part':
        onPart(msg);
        break;
      case 'file':
        onFile(msg);
        break;
      case 'pong':
        lastPong = Date.now();
        latency = Math.max(1, Math.round((Date.now() - msg.ts) / 2));
        $('#latency').textContent = `${latency} ms`;
        break;
      case 'denied':
        session = null;
        store.set('session', null);
        setConn('denied');
        closeConn();
        break;
      case 'bye':
        if (msg.reason === 'revoked') {
          session = null;
          store.set('session', null);
          setConn('denied');
          closeConn();
        } else if (msg.reason === 'kicked') {
          setConn('kicked');
          closeConn();
        } else {
          setConn('ended');
        }
        break;
    }
  }

  function closeConn() {
    clearTimeout(retryTimer);
    stopPing();
    const c = conn;
    conn = null;
    try { c?.removeAllListeners(); c?.close(); } catch {}
  }

  function startPing() {
    stopPing();
    pingTimer = setInterval(() => {
      if (!conn?.open) return;
      if (Date.now() - lastPong > 15000) {
        // Conexión colgada: forzar reconexión.
        const c = conn;
        conn = null;
        try { c.close(); } catch {}
        setConn('waiting');
        restartPeer();
        return;
      }
      send({ t: 'ping', ts: Date.now() });
    }, 4000);
  }

  function stopPing() {
    clearInterval(pingTimer);
  }

  let lastOfflineToast = 0;
  const SILENT = new Set(['ping', 'frameAck', 'mirror']);
  function send(msg) {
    if (demo) return true;
    if (conn?.open && connState === 'connected') {
      try { conn.send(msg); return true; } catch {}
    }
    if (!SILENT.has(msg.t) && Date.now() - lastOfflineToast > 3000) {
      lastOfflineToast = Date.now();
      toast(t('notConnected'), { error: true });
    }
    return false;
  }

  // ================================================================ pantalla encendida

  let wakeLock = null;

  async function keepAwake() {
    if (!prefs.wake || !('wakeLock' in navigator) || document.visibilityState !== 'visible' || wakeLock) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch {}
  }

  function releaseAwake() {
    try { wakeLock?.release(); } catch {}
    wakeLock = null;
  }

  // ================================================================ ajustes

  const sheet = $('#settings');

  function applyPrefs() {
    app.classList.toggle('no-labels', !prefs.labels);
  }

  function renderSettings() {
    $('#haptics').checked = prefs.haptics;
    $('#wake').checked = prefs.wake;
    $('#labels').checked = prefs.labels;
    $('#latency').textContent = latency != null ? `${latency} ms` : '—';
  }

  $('#open-settings').addEventListener('click', () => {
    renderSettings();
    showSheet(sheet);
  });
  $('#status-btn').addEventListener('click', () => $('#open-settings').click());

  $('#haptics').addEventListener('change', (e) => { prefs.haptics = e.target.checked; savePrefs(); buzz(10); });
  $('#labels').addEventListener('change', (e) => { prefs.labels = e.target.checked; savePrefs(); applyPrefs(); });
  $('#wake').addEventListener('change', (e) => {
    prefs.wake = e.target.checked;
    savePrefs();
    if (prefs.wake) keepAwake();
    else releaseAwake();
  });
  $('#forget').addEventListener('click', () => {
    store.set('session', null);
    store.set('deck', null);
    session = null;
    closeConn();
    try { peer?.destroy(); } catch {}
    peer = null;
    everConnected = false;
    deck = null;
    renderDeck();
    sheet.close();
    setConn('idle');
  });

  $('#gate-retry').addEventListener('click', () => {
    retryDelay = 1200;
    setConn(everConnected ? 'reconnecting' : 'connecting');
    if (peer && !peer.destroyed && peer.open) openConn();
    else restartPeer();
  });

  // ================================================================ ciclo de vida

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') {
      if (mirrorOpen && !demo) send({ t: 'mirror', on: false });
      return;
    }
    keepAwake();
    if (demo || !session) return;
    if (!conn?.open && !['denied', 'kicked', 'unsupported', 'idle'].includes(connState)) {
      retryDelay = 1200;
      if (peer && !peer.destroyed && peer.open) openConn();
      else restartPeer();
    } else if (mirrorOpen) {
      send({ t: 'mirror', on: true });
    }
  });

  window.addEventListener('pagehide', () => {
    try { conn?.close(); } catch {}
  });

  // ================================================================ demostración

  // Modo demostración (?demo): deck de ejemplo sin computadora, para capturas y pruebas.
  //   &page=1  ·  &sheet=tabs | shot | settings  ·  &viewer
  const DEMO_TABS = {
    windows: 2,
    tabs: [
      { id: 1, title: 'Directo de los viernes — Estudio en vivo', host: 'estudio-en-vivo.app', active: true, win: 1 },
      { id: 2, title: 'Lo-fi para concentrarse 🎧', host: 'musica.example.com', audible: true, win: 1 },
      { id: 3, title: 'Guion del directo — Documento', host: 'notas.example.com', win: 1 },
      { id: 4, title: 'Estadísticas del canal', host: 'estudio-en-vivo.app', win: 1 },
      { id: 5, title: 'Chat del directo', host: 'chat.estudio-en-vivo.app', win: 2 },
      { id: 6, title: 'Tablero del proyecto', host: 'tareas.example.com', win: 2 },
    ],
  };

  async function startDemo() {
    app.classList.add('instant');
    everConnected = true;
    latency = 12;
    setConn('connected');
    setTarget({ title: query.get('title') || 'Directo de los viernes — Estudio en vivo', ok: true });
    try {
      deck = await (await fetch('demo-deck.json', { cache: 'no-store' })).json();
    } catch {
      deck = { cols: 4, pages: [] };
    }
    const now = Date.now();
    states = {};
    for (const page of deck.pages) {
      for (const k of page.keys) {
        if (k.st === 'rec.tab') states[k.st] = now - 83000;
        if (k.st === 'obs.stream') states[k.st] = now - (47 * 60 + 12) * 1000;
        if (k.st === 'obs.scene:Principal' || k.st === 'obs.mute:Mic/Aux') states[k.st] = false;
        if (k.st === 'obs.scene:Pantalla') states[k.st] = true;
      }
    }
    pageIndex = Number(query.get('page')) || 0;
    renderDeck();
    const sheetName = query.get('sheet');
    if (sheetName === 'tabs') openTabs();
    if (sheetName === 'settings') { renderSettings(); showSheet(sheet); }
    if (sheetName === 'shot') {
      try {
        const blob = await (await fetch('demo-screen.jpg')).blob();
        addShot(blob, 'Captura 2026-10-15 20.14.03.png', 'image/jpeg');
      } catch {}
    }
    if (query.has('viewer')) openViewer();
  }

  // ================================================================ inicio

  applyPrefs();
  lastCols = effectiveCols();
  if (demo) {
    startDemo();
  } else {
    if (deck) renderDeck();
    if (session) startPeer();
    else setConn('idle');
  }
})();
