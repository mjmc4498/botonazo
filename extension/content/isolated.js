// Botonazo — script de contenido (mundo aislado).
// · Dibuja la capa visual: carteles, pantalla de privacidad, avisos, destello y confeti.
// · Envía atajos y texto al marco con el foco (o al iframe correspondiente).
// · Desplaza la página.

(() => {
  'use strict';

  const previous = window.__botonazo;
  if (previous && previous.alive()) return;
  try { previous?.destroy(); } catch {}

  const isTop = window === window.top;
  const alive = () => { try { return !!chrome.runtime?.id; } catch { return false; } };

  // ------------------------------------------------------------ puente con el mundo principal

  function toMain(cmd) {
    document.dispatchEvent(new CustomEvent('botonazo:cmd', { detail: JSON.stringify(cmd) }));
  }

  // ------------------------------------------------------------ iframes de otro origen

  function isFrame(el) {
    return !!el && (el.tagName === 'IFRAME' || el.tagName === 'FRAME');
  }

  function sameOriginDoc(frame) {
    try { return frame.contentDocument || null; } catch { return null; }
  }

  function crossOriginFocusFrame() {
    let doc = document;
    for (let depth = 0; depth < 12; depth++) {
      let el = doc.activeElement;
      while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
      if (!isFrame(el)) return null;
      const inner = sameOriginDoc(el);
      if (!inner) return el;
      doc = inner;
    }
    return null;
  }

  // La sonda es de un solo uso: el iframe la reporta al service worker, que así
  // conoce su frameId y le entrega la orden directamente.
  function routeToFrame(frame, cmd) {
    const win = frame.contentWindow;
    if (!win) return;
    const nonce = crypto.randomUUID();
    win.postMessage({ botonazoProbe: nonce }, '*');
    chrome.runtime.sendMessage({ to: 'sw', type: 'frame:route', nonce, cmd }).catch(() => {});
  }

  const onProbe = (event) => {
    const data = event.data;
    if (isTop || event.source !== window.parent || !data || typeof data.botonazoProbe !== 'string') return;
    chrome.runtime.sendMessage({ to: 'sw', type: 'frame:hello', nonce: data.botonazoProbe }).catch(() => {});
  };
  window.addEventListener('message', onProbe, true);

  function routeKeys(cmd) {
    const frame = crossOriginFocusFrame();
    if (frame) routeToFrame(frame, cmd);
    else toMain(cmd);
  }

  // ------------------------------------------------------------ desplazamiento

  function scroller() {
    const root = document.scrollingElement || document.documentElement;
    if (root.scrollHeight > innerHeight + 8) return null;
    // Páginas con su propio contenedor desplazable (Gmail, Notion, Slack…).
    let best = null;
    let bestArea = 0;
    for (const el of document.querySelectorAll('main, [role="main"], div, section, article')) {
      if (el.scrollHeight <= el.clientHeight + 8) continue;
      const style = getComputedStyle(el);
      if (!/(auto|scroll)/.test(style.overflowY)) continue;
      const r = el.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > bestArea) { best = el; bestArea = area; }
    }
    return best;
  }

  function scroll(dir) {
    const el = scroller();
    const target = el || window;
    const h = el ? el.clientHeight : innerHeight;
    if (dir === 'top') target.scrollTo({ top: 0, behavior: 'smooth' });
    else if (dir === 'bottom') target.scrollTo({ top: (el || document.documentElement).scrollHeight, behavior: 'smooth' });
    else target.scrollBy({ top: (dir === 'up' ? -1 : 1) * h * 0.8, behavior: 'smooth' });
  }

  // ------------------------------------------------------------ capa visual

  const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

  const EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9.9 4.2A9.1 9.1 0 0 1 12 4c6.5 0 10 8 10 8a13.2 13.2 0 0 1-1.7 2.7"/><path d="M14.1 14.2a3 3 0 1 1-4.2-4.2"/><path d="M17.5 17.5A10 10 0 0 1 12 20c-6.5 0-10-8-10-8a18.4 18.4 0 0 1 5.1-5.9"/><path d="m2 2 20 20"/></svg>';

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .layer { position: fixed; inset: 0; pointer-events: none; font-family: ${FONT}; -webkit-font-smoothing: antialiased; }

    .flash { position: absolute; inset: 0; background: #fff; opacity: 0; }
    .flash.on { animation: flash .45s ease-out; }
    @keyframes flash { from { opacity: .75; } to { opacity: 0; } }

    .black {
      position: absolute; inset: 0; display: grid; place-items: center; background: #050506; color: rgba(255,255,255,.28);
      opacity: 0; transition: opacity .3s ease; pointer-events: none;
    }
    .black.on { opacity: 1; pointer-events: auto; }
    .black div { display: flex; flex-direction: column; align-items: center; gap: 14px; font-size: 15px; font-weight: 500; letter-spacing: .02em; }
    .black svg { width: 44px; height: 44px; }

    .msg { position: absolute; inset: 0; opacity: 0; transition: opacity .35s ease; pointer-events: none; }
    .msg.on { opacity: 1; pointer-events: auto; }
    .msg .text { white-space: pre-wrap; overflow-wrap: anywhere; }

    .msg:not(.full) .dots, .msg.full .bar { display: none; }
    .msg.full {
      display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 6vmin;
      background: radial-gradient(80vmax 60vmax at 80% 110%, rgba(255,159,10,.28), transparent 60%),
                  radial-gradient(70vmax 50vmax at 10% -10%, rgba(94,92,230,.30), transparent 60%), rgba(8,8,10,.94);
      backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); color: #fff; text-align: center;
    }
    .msg.full .text { max-width: 18ch; font-size: clamp(36px, 8vmin, 120px); font-weight: 800; letter-spacing: -.04em; line-height: 1.02; }
    .msg.full .dots { display: flex; justify-content: center; gap: 12px; margin-top: 5vmin; }
    .msg.full .dots i { width: 12px; height: 12px; border-radius: 50%; background: #FF9F0A; animation: dot 1.4s ease-in-out infinite; }
    .msg.full .dots i:nth-child(2) { animation-delay: .2s; }
    .msg.full .dots i:nth-child(3) { animation-delay: .4s; }
    @keyframes dot { 0%, 80%, 100% { transform: scale(.6); opacity: .4; } 40% { transform: scale(1); opacity: 1; } }

    .msg.banner { display: grid; place-items: center; background: rgba(0,0,0,.35); }
    .msg.banner .card {
      max-width: min(80vw, 900px); padding: 4vmin 6vmin; border-radius: 28px; text-align: center;
      background: rgba(18,18,20,.92); color: #fff; box-shadow: 0 30px 80px rgba(0,0,0,.45), inset 0 0 0 1px rgba(255,255,255,.08);
      transform: scale(.96); transition: transform .35s cubic-bezier(.2,.8,.2,1);
    }
    .msg.banner.on .card { transform: none; }
    .msg.banner .text { font-size: clamp(26px, 5vmin, 72px); font-weight: 750; letter-spacing: -.035em; line-height: 1.08; }
    .msg.banner .bar { width: 64px; height: 6px; margin: 0 auto 3vmin; border-radius: 3px; background: #FF9F0A; }

    .msg.lower { pointer-events: none !important; }
    .msg.lower .card {
      position: absolute; left: 4vw; bottom: 6vh; display: flex; align-items: stretch; max-width: 70vw;
      border-radius: 14px; overflow: hidden; color: #111114; background: #fff;
      box-shadow: 0 22px 60px rgba(0,0,0,.45), 0 0 0 1px rgba(0,0,0,.06); transform: translateX(-24px); transition: transform .4s cubic-bezier(.2,.8,.2,1);
    }
    .msg.lower.on .card { transform: none; }
    .msg.lower .bar { flex: none; width: 14px; background: linear-gradient(#FFC24D, #FF7A00); }
    .msg.lower .text { padding: 2.4vmin 3.2vmin; font-size: clamp(18px, 3.2vmin, 44px); font-weight: 750; letter-spacing: -.025em; line-height: 1.15; }

    .toast {
      position: absolute; left: 50%; bottom: 36px; display: flex; align-items: center; gap: 10px;
      padding: 11px 18px 11px 14px; border-radius: 999px; max-width: min(90vw, 560px);
      background: rgba(20,20,22,.92); color: #fff; backdrop-filter: blur(14px);
      font: 500 14px/1.25 ${FONT}; letter-spacing: -.01em; box-shadow: 0 10px 30px rgba(0,0,0,.25), inset 0 0 0 1px rgba(255,255,255,.08);
      opacity: 0; transform: translate(-50%, 12px); transition: opacity .25s ease, transform .25s ease;
    }
    .toast.on { opacity: 1; transform: translate(-50%, 0); }
    .toast i { flex: none; width: 8px; height: 8px; border-radius: 50%; background: #FF9F0A; box-shadow: 0 0 0 4px rgba(255,159,10,.22); }
    .toast span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .toast.big { top: 6vh; bottom: auto; gap: 16px; padding: 18px 30px 18px 22px; font-size: clamp(18px, 2.6vmin, 30px); font-weight: 700; transform: translate(-50%, -16px); }
    .toast.big.on { transform: translate(-50%, 0); }
    .toast.big i { width: 14px; height: 14px; }
    .toast.big span { white-space: normal; }

    canvas.confetti { position: absolute; inset: 0; width: 100%; height: 100%; }
  `;

  class Overlay {
    constructor() {
      this.host = null;
      this.timers = {};
      this.black = false;
      this.message = null;
      this.raf = 0;
      this.onFullscreen = () => this.raise();
    }

    build() {
      const host = document.createElement('botonazo-overlay');
      host.setAttribute('popover', 'manual');
      const style = {
        position: 'fixed', inset: '0', width: '100vw', height: '100vh', 'max-width': 'none', 'max-height': 'none',
        margin: '0', padding: '0', border: '0', background: 'transparent', 'pointer-events': 'none',
        'z-index': '2147483647', overflow: 'visible', display: 'block', opacity: '1', visibility: 'visible',
        transform: 'none', filter: 'none', contain: 'strict', 'color-scheme': 'normal',
      };
      for (const [k, v] of Object.entries(style)) host.style.setProperty(k, v, 'important');
      const root = host.attachShadow({ mode: 'closed' });
      root.innerHTML = `<style>${CSS}</style>
        <div class="layer">
          <div class="msg"><div class="card"><div class="bar"></div><div class="text"></div></div><div class="dots"><i></i><i></i><i></i></div></div>
          <div class="black"><div>${EYE_OFF}<span>Contenido oculto</span></div></div>
          <canvas class="confetti"></canvas>
          <div class="flash"></div>
          <div class="toast"><i></i><span></span></div>
        </div>`;
      const guard = document.createElement('style');
      guard.textContent = 'botonazo-overlay::backdrop{display:none!important}';
      host.appendChild(guard);
      this.el = {
        layer: root.querySelector('.layer'),
        msg: root.querySelector('.msg'),
        text: root.querySelector('.msg .text'),
        black: root.querySelector('.black'),
        confetti: root.querySelector('.confetti'),
        flash: root.querySelector('.flash'),
        toast: root.querySelector('.toast'),
      };
      this.host = host;
      document.addEventListener('fullscreenchange', this.onFullscreen, true);
    }

    ensure() {
      if (!this.host) this.build();
      if (!this.host.isConnected) {
        document.documentElement.appendChild(this.host);
        this.raise();
      }
    }

    // Lleva la capa a la "top layer" para que quede encima incluso en pantalla completa.
    raise() {
      const host = this.host;
      if (!host?.isConnected) return;
      try {
        if (host.matches(':popover-open')) host.hidePopover();
        host.showPopover();
      } catch {
        const fs = document.fullscreenElement;
        const parent = fs && !isFrame(fs) && fs.tagName !== 'VIDEO' ? fs : document.documentElement;
        if (host.parentNode !== parent) parent.appendChild(host);
      }
    }

    // La capa intercepta clics solo mientras un cartel o la privacidad están visibles.
    syncPointer() {
      const blocking = this.black || (this.message && this.message.style !== 'lower');
      this.host.style.setProperty('pointer-events', blocking ? 'auto' : 'none', 'important');
    }

    state() {
      return { black: this.black, message: this.message?.text || null };
    }

    toast(text, big = false) {
      this.ensure();
      const t = this.el.toast;
      t.classList.toggle('big', big);
      t.querySelector('span').textContent = text;
      t.classList.remove('on');
      void t.offsetWidth;
      t.classList.add('on');
      clearTimeout(this.timers.toast);
      this.timers.toast = setTimeout(() => t.classList.remove('on'), big ? 4200 : 2600);
    }

    flash() {
      this.ensure();
      const f = this.el.flash;
      f.classList.remove('on');
      void f.offsetWidth;
      f.classList.add('on');
    }

    toggleBlack() {
      this.ensure();
      this.black = !this.black;
      this.el.black.classList.toggle('on', this.black);
      this.syncPointer();
      this.raise();
    }

    toggleMessage(text, style) {
      this.ensure();
      const same = this.message && this.message.text === text && this.message.style === style;
      if (same || (this.message && !text)) {
        this.message = null;
        this.el.msg.classList.remove('on');
      } else {
        this.message = { text, style };
        this.el.msg.className = `msg ${style}`;
        this.el.text.textContent = text;
        void this.el.msg.offsetWidth;
        this.el.msg.classList.add('on');
      }
      this.syncPointer();
      this.raise();
    }

    confetti() {
      this.ensure();
      const canvas = this.el.confetti;
      const dpr = devicePixelRatio || 1;
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      const colors = ['#FF9F0A', '#FF375F', '#5E5CE6', '#30D158', '#0A84FF', '#FFD60A', '#BF5AF2', '#FFFFFF'];
      const pieces = Array.from({ length: Math.min(260, Math.round(innerWidth / 5)) }, (_, i) => {
        const fromLeft = i % 2 === 0;
        const angle = (fromLeft ? -60 : -120) * (Math.PI / 180) + (Math.random() - 0.5) * 0.9;
        const speed = 9 + Math.random() * 11;
        return {
          x: fromLeft ? -10 : innerWidth + 10,
          y: innerHeight * (0.55 + Math.random() * 0.3),
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          w: 6 + Math.random() * 7,
          h: 8 + Math.random() * 10,
          r: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.35,
          c: colors[i % colors.length],
        };
      });
      const start = performance.now();
      cancelAnimationFrame(this.raf);
      const frame = (now) => {
        const t = now - start;
        ctx.clearRect(0, 0, innerWidth, innerHeight);
        for (const p of pieces) {
          p.vy += 0.32;
          p.vx *= 0.99;
          p.x += p.vx;
          p.y += p.vy;
          p.r += p.vr;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.r);
          ctx.globalAlpha = Math.max(0, Math.min(1, (4200 - t) / 800));
          ctx.fillStyle = p.c;
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
          ctx.restore();
        }
        if (t < 4200) this.raf = requestAnimationFrame(frame);
        else ctx.clearRect(0, 0, innerWidth, innerHeight);
      };
      this.raf = requestAnimationFrame(frame);
    }

    reset() {
      if (!this.host) return;
      this.black = false;
      this.message = null;
      this.el.black.classList.remove('on');
      this.el.msg.classList.remove('on');
      this.syncPointer();
    }

    destroy() {
      cancelAnimationFrame(this.raf);
      for (const timer of Object.values(this.timers)) clearTimeout(timer);
      document.removeEventListener('fullscreenchange', this.onFullscreen, true);
      this.host?.remove();
      this.host = null;
    }
  }

  const overlay = isTop ? new Overlay() : null;

  // ------------------------------------------------------------ órdenes

  function handleTop(cmd) {
    switch (cmd.t) {
      case 'combo':
      case 'text':
        routeKeys(cmd);
        break;
      case 'scroll':
        scroll(cmd.dir);
        break;
      case 'toast':
        overlay.toast(String(cmd.text || ''), !!cmd.big);
        break;
      case 'flash':
        overlay.flash();
        break;
      case 'black':
        overlay.toggleBlack();
        break;
      case 'message':
        overlay.toggleMessage(String(cmd.text || '').slice(0, 2000), ['full', 'banner', 'lower'].includes(cmd.style) ? cmd.style : 'full');
        break;
      case 'confetti':
        overlay.confetti();
        break;
      case 'reset':
        overlay.reset();
        break;
    }
    return { ok: true, overlay: overlay.state() };
  }

  // Órdenes que el service worker entrega directamente a este iframe.
  function handleRouted(cmd) {
    if (cmd.t === 'combo' || cmd.t === 'text') routeKeys(cmd);
    return { ok: true };
  }

  const onMessage = (msg, _sender, sendResponse) => {
    const cmd = msg?.botonazo;
    if (!cmd || typeof cmd !== 'object') return;
    try {
      sendResponse(msg.routed ? handleRouted(cmd) : isTop ? handleTop(cmd) : { ok: false });
    } catch (err) {
      console.debug('[Botonazo]', err);
      sendResponse({ ok: false });
    }
  };

  chrome.runtime.onMessage.addListener(onMessage);

  window.__botonazo = {
    alive,
    destroy() {
      chrome.runtime.onMessage.removeListener(onMessage);
      window.removeEventListener('message', onProbe, true);
      overlay?.destroy();
    },
  };
})();
