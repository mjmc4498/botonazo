// Botonazo — configuración compartida por el service worker, el popup, el editor y el estudio.

// Página del deck que se abre en el celular (carpeta /remote publicada en GitHub
// Pages). Si la publicas en otra dirección, cámbiala aquí o en Ajustes › Avanzado.
export const REMOTE_URL = 'https://mjmc4498.github.io/botonazo/';

// Prefijo de los identificadores de sesión en el servidor de señalización PeerJS.
export const ID_PREFIX = 'botonazo-';

// Worker de Cloudflare que entrega credenciales temporales del servidor de
// retransmisión (TURN) para redes que bloquean la conexión directa. Botonazo
// comparte el Worker de Presentazo (misma cuenta, mismo límite de consumo); la
// carpeta /cloudflare tiene una copia por si prefieres desplegar uno propio.
// Vacío = solo conexión directa.
export const ICE_ENDPOINT = 'https://mando-turn.mjmc4498.workers.dev/ice';

// Servidores públicos para la conexión directa cuando el Worker no responde.
export const FALLBACK_ICE = {
  iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }, { urls: 'stun:stun.l.google.com:19302' }],
};

export const DEFAULT_SETTINGS = {
  remoteUrl: '',
  followActiveTab: true,
  autoStart: false,
  newCodeEachSession: true,
  showToasts: true,
  shotFormat: 'png',
  shotFlash: true,
  recFormat: 'mp4',
  recQuality: '1080',
  recAudio: true,
  obsEnabled: false,
  obsHost: 'localhost',
  obsPort: 4455,
};

export async function getSettings() {
  const { settings } = await chrome.storage.sync.get('settings');
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

export async function saveSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.sync.set({ settings: next });
  return next;
}

// La contraseña de OBS no se sincroniza con la cuenta de Chrome: se queda en este equipo.
export async function getObsPassword() {
  const { obsPassword } = await chrome.storage.local.get('obsPassword');
  return obsPassword || '';
}

export function buildRemoteUrl(base, peerId, token) {
  const url = new URL(base || REMOTE_URL);
  url.hash = new URLSearchParams({ id: peerId, k: token }).toString();
  return url.toString();
}
