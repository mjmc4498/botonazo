// Botonazo — cliente mínimo de OBS WebSocket 5 (incluido en OBS Studio 28 o posterior).
// Protocolo: https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md

const OP = { HELLO: 0, IDENTIFY: 1, IDENTIFIED: 2, EVENT: 5, REQUEST: 6, RESPONSE: 7 };
// Escenas, entradas, salidas y elementos de escena.
const SUBSCRIPTIONS = (1 << 2) | (1 << 3) | (1 << 6) | (1 << 7);

async function sha256Base64(text) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

export class ObsError extends Error {
  constructor(message, code = 0) {
    super(message);
    this.code = code;
  }
}

export class ObsClient {
  constructor({ host = 'localhost', port = 4455, password = '' } = {}) {
    this.url = `ws://${host}:${port}`;
    this.password = password;
    this.ws = null;
    this.connected = false;
    this.pending = new Map();
    this.listeners = new Map();
    this.seq = 0;
  }

  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
    return () => this.listeners.get(type)?.delete(fn);
  }

  emit(type, data) {
    for (const fn of this.listeners.get(type) || []) {
      try { fn(data); } catch (err) { console.debug('[Botonazo] OBS', err); }
    }
  }

  // Resuelve cuando OBS confirma la identificación. Errores: 'unreachable', 'auth', 'timeout'.
  connect(timeout = 4000) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) {
          try { this.ws?.close(); } catch {}
          reject(err);
        } else {
          resolve(this);
        }
      };
      const timer = setTimeout(() => done(new ObsError('timeout')), timeout);
      let ws;
      try {
        ws = new WebSocket(this.url, 'obswebsocket.json');
      } catch {
        done(new ObsError('unreachable'));
        return;
      }
      this.ws = ws;
      ws.onmessage = async (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }
        const { op, d } = msg || {};
        if (op === OP.HELLO) {
          const identify = { rpcVersion: 1, eventSubscriptions: SUBSCRIPTIONS };
          if (d.authentication) {
            if (!this.password) { done(new ObsError('auth')); return; }
            const secret = await sha256Base64(this.password + d.authentication.salt);
            identify.authentication = await sha256Base64(secret + d.authentication.challenge);
          }
          ws.send(JSON.stringify({ op: OP.IDENTIFY, d: identify }));
        } else if (op === OP.IDENTIFIED) {
          this.connected = true;
          done();
        } else if (op === OP.RESPONSE) {
          const entry = this.pending.get(d.requestId);
          if (!entry) return;
          this.pending.delete(d.requestId);
          clearTimeout(entry.timer);
          if (d.requestStatus?.result) entry.resolve(d.responseData || {});
          else entry.reject(new ObsError(d.requestStatus?.comment || 'Error de OBS', d.requestStatus?.code || 0));
        } else if (op === OP.EVENT) {
          this.emit(d.eventType, d.eventData || {});
        }
      };
      ws.onclose = (event) => {
        const wasConnected = this.connected;
        this.connected = false;
        for (const entry of this.pending.values()) {
          clearTimeout(entry.timer);
          entry.reject(new ObsError('closed'));
        }
        this.pending.clear();
        // 4009: contraseña incorrecta.
        done(new ObsError(event.code === 4009 ? 'auth' : 'unreachable'));
        if (wasConnected) this.emit('close', { code: event.code });
      };
      ws.onerror = () => {};
    });
  }

  call(requestType, requestData = {}, timeout = 5000) {
    if (!this.connected || this.ws?.readyState !== WebSocket.OPEN) return Promise.reject(new ObsError('closed'));
    const requestId = `b${++this.seq}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new ObsError('timeout'));
      }, timeout);
      this.pending.set(requestId, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ op: OP.REQUEST, d: { requestType, requestId, requestData } }));
    });
  }

  close() {
    this.connected = false;
    try { this.ws?.close(1000); } catch {}
    this.ws = null;
  }
}

// Mensajes en español para los errores más comunes.
export function obsErrorText(err, subject = '') {
  const code = err?.code || 0;
  switch (err?.message) {
    case 'unreachable': return 'No se encontró OBS. Ábrelo y activa Herramientas › Ajustes del servidor WebSocket.';
    case 'auth': return 'La contraseña de OBS no es correcta. Revísala en Ajustes › OBS.';
    case 'timeout': return 'OBS no respondió a tiempo.';
    case 'closed': return 'Se perdió la conexión con OBS.';
    case 'disabled': return 'Activa OBS en los ajustes de Botonazo.';
  }
  if (code === 600) return subject ? `No existe «${subject}» en OBS.` : 'No se encontró en OBS.';
  if (code === 501) return 'Esa salida de OBS no está activa.';
  if (code === 500) return 'Esa salida de OBS ya está activa.';
  return err?.message || 'Error de OBS';
}
