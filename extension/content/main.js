// Botonazo — script en el "mundo principal" de la página.
// Emite atajos de teclado y escribe texto: muchas apps web (YouTube, Meet, Slides…)
// leen keyCode/which, propiedades que solo pueden definirse desde la propia página.
// Recibe órdenes del script aislado mediante el evento "botonazo:cmd".

(() => {
  'use strict';

  const VERSION = 1;
  const SLOT = Symbol.for('botonazo.main');
  const previous = window[SLOT];
  if (previous && previous.version >= VERSION) return;
  if (previous) document.removeEventListener('botonazo:cmd', previous.listener, true);

  const NAMED = {
    ArrowLeft: ['ArrowLeft', 37], ArrowUp: ['ArrowUp', 38], ArrowRight: ['ArrowRight', 39], ArrowDown: ['ArrowDown', 40],
    PageUp: ['PageUp', 33], PageDown: ['PageDown', 34], Home: ['Home', 36], End: ['End', 35],
    Enter: ['Enter', 13], Escape: ['Escape', 27], Backspace: ['Backspace', 8], Tab: ['Tab', 9],
    Delete: ['Delete', 46], Insert: ['Insert', 45], ' ': ['Space', 32],
  };
  for (let i = 1; i <= 12; i++) NAMED[`F${i}`] = [`F${i}`, 111 + i];

  const PUNCT = {
    Semicolon: 186, Equal: 187, Comma: 188, Minus: 189, Period: 190, Slash: 191, Backquote: 192,
    BracketLeft: 219, Backslash: 220, BracketRight: 221, Quote: 222, IntlBackslash: 226,
  };

  function keyCodeFromCode(code) {
    if (/^Key[A-Z]$/.test(code)) return code.charCodeAt(3);
    if (/^Digit[0-9]$/.test(code)) return code.charCodeAt(5);
    if (/^Numpad[0-9]$/.test(code)) return 96 + Number(code.slice(6));
    return PUNCT[code] || 0;
  }

  function keyInfo(key, code = '') {
    if (NAMED[key]) {
      const [c, keyCode] = NAMED[key];
      return { key, code: c, keyCode, charCode: key === ' ' ? 32 : key === 'Enter' ? 13 : 0 };
    }
    const upper = key.toUpperCase();
    const letter = /^[a-z]$/i.test(key);
    const digit = /^[0-9]$/.test(key);
    const derived = letter ? `Key${upper}` : digit ? `Digit${key}` : '';
    const finalCode = code || derived;
    return {
      key,
      code: finalCode,
      keyCode: keyCodeFromCode(finalCode) || (letter ? upper.charCodeAt(0) : digit ? key.charCodeAt(0) : 0),
      charCode: key.length <= 2 ? key.codePointAt(0) || 0 : 0,
    };
  }

  // ------------------------------------------------------------ foco

  // Elemento que recibiría una pulsación real: baja por iframes del mismo origen y
  // por shadow roots siguiendo document.activeElement.
  function deepFocus() {
    let doc = document;
    for (let depth = 0; depth < 12; depth++) {
      let el = doc.activeElement;
      while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
      if (el && (el.tagName === 'IFRAME' || el.tagName === 'FRAME')) {
        let inner = null;
        try { inner = el.contentDocument; } catch {}
        if (inner) { doc = inner; continue; }
      }
      if (!el || el === doc.documentElement) return doc.body || doc.documentElement;
      return el;
    }
    return document.body || document.documentElement;
  }

  // ------------------------------------------------------------ eventos

  function fireKey(target, type, info, mods = {}) {
    const doc = target.ownerDocument || target;
    const view = doc.defaultView || window;
    const Ctor = view.KeyboardEvent || KeyboardEvent;
    const ev = new Ctor(type, {
      key: info.key,
      code: info.code,
      bubbles: true,
      cancelable: true,
      composed: true,
      view,
      ctrlKey: !!mods.ctrl,
      shiftKey: !!mods.shift,
      altKey: !!mods.alt,
      metaKey: !!mods.meta,
    });
    const keyCode = type === 'keypress' ? info.charCode : info.keyCode;
    Object.defineProperties(ev, {
      keyCode: { get: () => keyCode },
      which: { get: () => keyCode },
      charCode: { get: () => (type === 'keypress' ? info.charCode : 0) },
    });
    return target.dispatchEvent(ev);
  }

  // Devuelve true si ningún manejador canceló la tecla.
  function press(target, info, mods = {}) {
    const ok = fireKey(target, 'keydown', info, mods);
    if (ok && info.charCode && !mods.ctrl && !mods.meta && !mods.alt) fireKey(target, 'keypress', info, mods);
    fireKey(target, 'keyup', info, mods);
    return ok;
  }

  // ------------------------------------------------------------ edición de texto

  const TEXT_INPUTS = /^(text|search|email|url|tel|password|number|)$/i;

  function isEditable(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    if (el.tagName === 'TEXTAREA') return !el.readOnly && !el.disabled;
    if (el.tagName === 'INPUT') return TEXT_INPUTS.test(el.type) && !el.readOnly && !el.disabled;
    return false;
  }

  function insertText(el, text) {
    const doc = el.ownerDocument;
    let done = false;
    try { done = doc.execCommand('insertText', false, text); } catch {}
    if (done) return;
    if (typeof el.setRangeText === 'function') {
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? start;
      el.setRangeText(text, start, end, 'end');
      el.dispatchEvent(new (doc.defaultView.InputEvent)('input', { bubbles: true, inputType: 'insertText', data: text }));
    }
  }

  // Simula la acción por defecto de las teclas básicas (los eventos sintéticos no la ejecutan).
  function defaultAction(el, key) {
    const doc = el.ownerDocument || document;
    const view = doc.defaultView || window;
    if (isEditable(el)) {
      switch (key) {
        case 'Backspace': doc.execCommand('delete'); return;
        case 'Delete': doc.execCommand('forwardDelete'); return;
        case 'Enter':
          if (el.tagName === 'INPUT') { try { el.form?.requestSubmit(); } catch {} }
          else if (el.tagName === 'TEXTAREA') insertText(el, '\n');
          else doc.execCommand('insertParagraph');
          return;
        case ' ': insertText(el, ' '); return;
        case 'Escape': el.blur(); return;
      }
      return;
    }
    const h = view.innerHeight;
    switch (key) {
      case 'Enter':
        if (el.matches?.('a[href],button,[role="button"],input[type="submit"],input[type="button"],summary')) el.click();
        break;
      case ' ':
        if (el.matches?.('button,[role="button"],input[type="checkbox"],input[type="radio"],summary')) el.click();
        else view.scrollBy({ top: h * 0.85, behavior: 'smooth' });
        break;
      case 'ArrowDown': view.scrollBy({ top: 60, behavior: 'smooth' }); break;
      case 'ArrowUp': view.scrollBy({ top: -60, behavior: 'smooth' }); break;
      case 'PageDown': view.scrollBy({ top: h * 0.85, behavior: 'smooth' }); break;
      case 'PageUp': view.scrollBy({ top: -h * 0.85, behavior: 'smooth' }); break;
      case 'Home': view.scrollTo({ top: 0, behavior: 'smooth' }); break;
      case 'End': view.scrollTo({ top: doc.documentElement.scrollHeight, behavior: 'smooth' }); break;
    }
  }

  // ------------------------------------------------------------ órdenes

  function combo(c) {
    const el = deepFocus();
    const mods = { ctrl: c.ctrl, shift: c.shift, alt: c.alt, meta: c.meta };
    const info = keyInfo(c.key, c.code);
    const ok = press(el, info, mods);
    const plain = !c.ctrl && !c.alt && !c.meta;
    if (ok && plain) {
      if (isEditable(el) && info.key.length <= 2 && !NAMED[info.key]) insertText(el, info.key);
      else defaultAction(el, info.key);
    }
  }

  function typeText(text, enter) {
    const chars = [...text];
    const el = deepFocus();
    if (chars.length > 64 && isEditable(el)) {
      insertText(el, text);
    } else {
      for (const ch of chars) {
        const target = deepFocus();
        if (ch === '\n') {
          if (press(target, keyInfo('Enter'))) defaultAction(target, 'Enter');
          continue;
        }
        const info = keyInfo(ch);
        const ok = fireKey(target, 'keydown', info);
        const ok2 = ok && fireKey(target, 'keypress', info);
        if (ok && ok2 && isEditable(target)) insertText(target, ch);
        fireKey(target, 'keyup', info);
      }
    }
    if (enter) {
      const target = deepFocus();
      if (press(target, keyInfo('Enter'))) defaultAction(target, 'Enter');
    }
  }

  function run(cmd) {
    switch (cmd.t) {
      case 'combo':
        if (cmd.combo?.key) combo(cmd.combo);
        break;
      case 'text':
        typeText(String(cmd.s || ''), !!cmd.enter);
        break;
    }
  }

  const listener = (event) => {
    let cmd;
    try { cmd = JSON.parse(event.detail); } catch { return; }
    if (!cmd || typeof cmd !== 'object') return;
    try { run(cmd); } catch (err) { console.debug('[Botonazo]', err); }
  };

  document.addEventListener('botonazo:cmd', listener, true);
  window[SLOT] = { version: VERSION, listener };
})();
