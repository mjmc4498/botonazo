// Botonazo — catálogo de acciones que puede tener un botón del deck.
//
// Cada acción define su nombre, categoría, ícono y color sugeridos, los campos que
// se configuran en el editor (params) y, si es un interruptor, la clave de estado
// que el celular usa para mostrarla encendida (state).
//
// Tipos de campo: text · textarea · url · number · select · bool · combo (atajo de
// teclado) · page (página del deck) · steps (pasos de una macro).

export const CATEGORIES = [
  ['capture', 'Capturas y grabación'],
  ['obs', 'OBS Studio · transmisión'],
  ['tabs', 'Pestañas y ventanas'],
  ['media', 'Multimedia'],
  ['screen', 'Mensajes en pantalla'],
  ['input', 'Teclado y texto'],
  ['page', 'Página'],
  ['web', 'Web y automatización'],
  ['deck', 'Deck'],
];

const SCENE = { key: 'scene', label: 'Escena', type: 'text', list: 'obs-scenes', placeholder: 'Nombre exacto de la escena en OBS', required: true };

export const ACTIONS = {
  // ------------------------------------------------------------ capturas y grabación
  'capture.screenshot': {
    cat: 'capture', name: 'Captura de pantalla', icon: 'capture', color: 'blue',
    desc: 'Captura lo que se ve en la pestaña. Se guarda en Descargas › Botonazo y llega a tu celular para guardarla o compartirla.',
    params: [{ key: 'dest', label: 'Guardar en', type: 'select', def: 'both', options: [['both', 'Computadora y celular'], ['computer', 'Solo la computadora'], ['phone', 'Solo el celular']] }],
  },
  'record.tab': {
    cat: 'capture', name: 'Grabar pestaña', icon: 'record', color: 'red', state: 'rec.tab',
    desc: 'Graba en video la pestaña con su sonido. Pulsa otra vez para detener: el video se guarda en Descargas › Botonazo.',
  },
  'record.screen': {
    cat: 'capture', name: 'Grabar pantalla o ventana', icon: 'screenShare', color: 'red', state: 'rec.screen',
    desc: 'Abre el estudio de Botonazo en la computadora para elegir qué grabar: toda la pantalla, una ventana o una pestaña.',
  },
  mirror: {
    cat: 'capture', name: 'Ver pantalla en el celular', icon: 'cast', color: 'indigo', ui: 'mirror',
    desc: 'Muestra en vivo la pestaña en tu celular.',
  },

  // ------------------------------------------------------------ OBS
  'obs.stream': { cat: 'obs', name: 'Transmitir (iniciar / detener)', icon: 'live', color: 'red', state: 'obs.stream', desc: 'Inicia o detiene la transmisión en OBS Studio.' },
  'obs.record': { cat: 'obs', name: 'Grabar en OBS (iniciar / detener)', icon: 'record', color: 'red', state: 'obs.record' },
  'obs.pause': { cat: 'obs', name: 'Pausar / reanudar grabación de OBS', icon: 'pause', color: 'graphite', state: 'obs.paused' },
  'obs.scene': { cat: 'obs', name: 'Cambiar de escena', icon: 'scene', color: 'purple', params: [SCENE], state: (p) => `obs.scene:${p.scene}` },
  'obs.mute': {
    cat: 'obs', name: 'Silenciar audio de OBS', icon: 'mic', color: 'graphite',
    params: [{ key: 'input', label: 'Fuente de audio', type: 'text', list: 'obs-inputs', placeholder: 'Mic/Aux', required: true }],
    state: (p) => `obs.mute:${p.input}`,
  },
  'obs.source': {
    cat: 'obs', name: 'Mostrar / ocultar fuente', icon: 'eye', color: 'graphite',
    params: [
      { key: 'source', label: 'Fuente', type: 'text', list: 'obs-inputs', placeholder: 'Cámara', required: true },
      { key: 'scene', label: 'Escena', type: 'text', list: 'obs-scenes', placeholder: 'Vacía = la escena actual' },
    ],
    state: (p) => `obs.source:${p.scene || ''}|${p.source}`,
  },
  'obs.replay': { cat: 'obs', name: 'Guardar repetición', icon: 'replay', color: 'graphite', desc: 'Guarda el búfer de repetición de OBS (debe estar activado).' },
  'obs.virtualcam': { cat: 'obs', name: 'Cámara virtual (activar / desactivar)', icon: 'webcam', color: 'graphite', state: 'obs.virtualcam' },

  // ------------------------------------------------------------ pestañas y ventanas
  'tab.switcher': { cat: 'tabs', name: 'Elegir pestaña', icon: 'tabs', color: 'graphite', ui: 'tabs', desc: 'Muestra en el celular todas las pestañas abiertas para saltar a cualquiera.' },
  'tab.next': { cat: 'tabs', name: 'Pestaña siguiente', icon: 'chevronsRight', color: 'graphite' },
  'tab.prev': { cat: 'tabs', name: 'Pestaña anterior', icon: 'chevronsLeft', color: 'graphite' },
  'tab.audible': { cat: 'tabs', name: 'Ir a la pestaña con sonido', icon: 'volume', color: 'graphite' },
  'tab.new': { cat: 'tabs', name: 'Nueva pestaña', icon: 'plus', color: 'graphite', params: [{ key: 'url', label: 'Dirección (opcional)', type: 'url', placeholder: 'https://…' }] },
  'tab.close': { cat: 'tabs', name: 'Cerrar pestaña', icon: 'x', color: 'graphite' },
  'tab.reload': { cat: 'tabs', name: 'Recargar pestaña', icon: 'refresh', color: 'graphite' },
  'tab.duplicate': { cat: 'tabs', name: 'Duplicar pestaña', icon: 'copy', color: 'graphite' },
  'tab.pin': { cat: 'tabs', name: 'Fijar pestaña', icon: 'pin', color: 'graphite', state: 'tab.pinned' },
  'tab.mute': { cat: 'tabs', name: 'Silenciar pestaña', icon: 'mute', color: 'graphite', state: 'tab.muted' },
  'window.next': { cat: 'tabs', name: 'Cambiar de ventana', icon: 'windows', color: 'graphite', desc: 'Pasa a la siguiente ventana de Chrome.' },
  'window.new': { cat: 'tabs', name: 'Nueva ventana', icon: 'window', color: 'graphite' },
  'window.fullscreen': { cat: 'tabs', name: 'Pantalla completa', icon: 'maximize', color: 'graphite', state: 'window.fullscreen' },
  'window.minimize': { cat: 'tabs', name: 'Minimizar ventana', icon: 'minimize', color: 'graphite' },

  // ------------------------------------------------------------ multimedia
  'media.toggle': { cat: 'media', name: 'Reproducir / pausar', icon: 'playPause', color: 'green', desc: 'Controla el video o audio de la pestaña que suena (YouTube, Spotify web, Twitch…).' },
  'media.seek': {
    cat: 'media', name: 'Adelantar / retroceder', icon: 'fastForward', color: 'graphite',
    params: [{ key: 'seconds', label: 'Segundos', type: 'number', def: 10, min: -600, max: 600, hint: 'Usa un número negativo para retroceder.' }],
  },
  'media.volume': {
    cat: 'media', name: 'Volumen', icon: 'volume', color: 'graphite',
    params: [{ key: 'step', label: 'Cambio (%)', type: 'number', def: 10, min: -100, max: 100, hint: 'Negativo para bajar.' }],
  },
  'media.mute': { cat: 'media', name: 'Silenciar video', icon: 'mute', color: 'graphite' },
  'media.speed': {
    cat: 'media', name: 'Velocidad de reproducción', icon: 'speed', color: 'graphite',
    params: [{ key: 'rate', label: 'Velocidad', type: 'select', def: 'cycle', options: [['cycle', 'Alternar (1× · 1,25× · 1,5× · 2×)'], ['0.5', '0,5×'], ['1', '1× normal'], ['1.25', '1,25×'], ['1.5', '1,5×'], ['2', '2×']] }],
  },

  // ------------------------------------------------------------ mensajes en pantalla
  'screen.message': {
    cat: 'screen', name: 'Cartel en pantalla', icon: 'coffee', color: 'orange',
    desc: 'Muestra un cartel encima de la página, ideal para transmisiones («Volvemos pronto»). Pulsa otra vez para quitarlo.',
    params: [
      { key: 'text', label: 'Texto', type: 'textarea', def: 'Volvemos en 5 minutos', required: true },
      { key: 'style', label: 'Estilo', type: 'select', def: 'full', options: [['full', 'Pantalla completa'], ['banner', 'Cartel centrado'], ['lower', 'Barra inferior']] },
    ],
    state: (p) => `screen.message:${p.text}`,
  },
  'screen.black': { cat: 'screen', name: 'Pantalla de privacidad', icon: 'eyeOff', color: 'graphite', state: 'screen.black', desc: 'Cubre la página con una pantalla oscura. Pulsa otra vez para mostrarla.' },
  'screen.toast': {
    cat: 'screen', name: 'Aviso rápido', icon: 'bell', color: 'pink',
    params: [{ key: 'text', label: 'Texto', type: 'text', def: '¡Gracias por acompañarnos!', required: true }],
  },
  'screen.confetti': { cat: 'screen', name: 'Lluvia de confeti', icon: 'sparkles', color: 'pink', desc: 'Celebra en pantalla con confeti durante unos segundos.' },

  // ------------------------------------------------------------ teclado y texto
  'input.keys': {
    cat: 'input', name: 'Atajo de teclado', icon: 'keyboard', color: 'graphite',
    params: [{ key: 'combo', label: 'Combinación', type: 'combo', required: true, hint: 'Haz clic y pulsa la combinación. Funciona con los atajos de la página (YouTube, Meet, Slides…); los del sistema operativo no se pueden simular.' }],
  },
  'input.text': {
    cat: 'input', name: 'Escribir texto', icon: 'type', color: 'teal',
    params: [
      { key: 'text', label: 'Texto', type: 'textarea', required: true, placeholder: '¡Hola a todos!' },
      { key: 'enter', label: 'Pulsar Intro al terminar', type: 'bool', def: false },
    ],
  },
  'input.copy': {
    cat: 'input', name: 'Copiar al portapapeles', icon: 'copy', color: 'graphite',
    params: [{ key: 'text', label: 'Texto', type: 'textarea', required: true, placeholder: 'https://mi-enlace.com' }],
  },

  // ------------------------------------------------------------ página
  'page.scroll': {
    cat: 'page', name: 'Desplazar', icon: 'arrowDown', color: 'graphite',
    params: [{ key: 'dir', label: 'Dirección', type: 'select', def: 'down', options: [['down', 'Bajar'], ['up', 'Subir'], ['top', 'Al inicio'], ['bottom', 'Al final']] }],
  },
  'page.zoom': {
    cat: 'page', name: 'Zoom', icon: 'zoomIn', color: 'graphite',
    params: [{ key: 'dir', label: 'Zoom', type: 'select', def: 'in', options: [['in', 'Acercar'], ['out', 'Alejar'], ['reset', 'Restablecer']] }],
  },
  'page.back': { cat: 'page', name: 'Atrás', icon: 'arrowLeft', color: 'graphite' },
  'page.forward': { cat: 'page', name: 'Adelante', icon: 'arrowRight', color: 'graphite' },

  // ------------------------------------------------------------ web y automatización
  'url.open': {
    cat: 'web', name: 'Abrir sitio web', icon: 'globe', color: 'blue',
    params: [
      { key: 'url', label: 'Dirección', type: 'url', required: true, placeholder: 'https://studio.youtube.com' },
      { key: 'where', label: 'Abrir en', type: 'select', def: 'new', options: [['new', 'Pestaña nueva'], ['current', 'Pestaña actual'], ['window', 'Ventana nueva']] },
    ],
  },
  'web.webhook': {
    cat: 'web', name: 'Webhook (HTTP)', icon: 'zap', color: 'yellow',
    desc: 'Envía una petición a cualquier servicio: Streamer.bot, Home Assistant, Zapier, IFTTT, Discord…',
    params: [
      { key: 'method', label: 'Método', type: 'select', def: 'POST', options: [['POST', 'POST'], ['GET', 'GET'], ['PUT', 'PUT'], ['PATCH', 'PATCH'], ['DELETE', 'DELETE']] },
      { key: 'url', label: 'Dirección', type: 'url', required: true, placeholder: 'https://…' },
      { key: 'body', label: 'Cuerpo (JSON o texto)', type: 'textarea', placeholder: '{"accion": "luces"}' },
      { key: 'headers', label: 'Encabezados', type: 'textarea', placeholder: 'Authorization: Bearer …', hint: 'Uno por línea, con el formato Nombre: valor.' },
    ],
  },

  // ------------------------------------------------------------ deck
  'deck.page': {
    cat: 'deck', name: 'Ir a otra página del deck', icon: 'folder', color: 'graphite', ui: 'page',
    params: [{ key: 'page', label: 'Página', type: 'page', required: true }],
  },
  macro: {
    cat: 'deck', name: 'Macro (varias acciones)', icon: 'sparkles', color: 'purple',
    desc: 'Ejecuta varias acciones seguidas, con pausas opcionales entre ellas.',
    params: [{ key: 'steps', label: 'Pasos', type: 'steps' }],
  },
};

// Nombre corto que se propone como etiqueta del botón.
const SHORT = {
  'capture.screenshot': 'Captura', 'record.tab': 'Grabar pestaña', 'record.screen': 'Grabar pantalla', mirror: 'Ver pantalla',
  'obs.stream': 'En vivo', 'obs.record': 'Grabar', 'obs.pause': 'Pausar', 'obs.scene': 'Escena', 'obs.mute': 'Micrófono',
  'obs.source': 'Fuente', 'obs.replay': 'Repetición', 'obs.virtualcam': 'Cámara virtual',
  'tab.switcher': 'Pestañas', 'tab.next': 'Siguiente', 'tab.prev': 'Anterior', 'tab.audible': 'Ir al sonido', 'tab.new': 'Nueva pestaña',
  'tab.close': 'Cerrar pestaña', 'tab.reload': 'Recargar', 'tab.duplicate': 'Duplicar', 'tab.pin': 'Fijar', 'tab.mute': 'Silenciar',
  'window.next': 'Cambiar ventana', 'window.new': 'Nueva ventana', 'window.fullscreen': 'Pantalla completa', 'window.minimize': 'Minimizar',
  'media.toggle': 'Play / Pausa', 'media.seek': '+10 s', 'media.volume': 'Volumen', 'media.mute': 'Silenciar video', 'media.speed': 'Velocidad',
  'screen.message': 'Cartel', 'screen.black': 'Privacidad', 'screen.toast': 'Aviso', 'screen.confetti': '¡Confeti!',
  'input.keys': 'Atajo', 'input.text': 'Escribir', 'input.copy': 'Copiar',
  'page.scroll': 'Desplazar', 'page.zoom': 'Zoom', 'page.back': 'Atrás', 'page.forward': 'Adelante',
  'url.open': 'Abrir sitio', 'web.webhook': 'Webhook', 'deck.page': 'Página', macro: 'Macro',
};

export const shortLabel = (type) => SHORT[type] || ACTIONS[type]?.name || '';

// Acciones que no pueden ir dentro de una macro (abren algo en el celular).
export const NOT_IN_MACRO = new Set(['mirror', 'tab.switcher', 'deck.page', 'macro']);

export const MAX_MACRO_STEPS = 20;
export const MAX_MACRO_DELAY = 10000;

export function stateKeyFor(action) {
  const def = ACTIONS[action?.type];
  if (!def?.state) return null;
  return typeof def.state === 'function' ? def.state(action) : def.state;
}

// Parámetros con sus valores por defecto.
export function defaultParams(type) {
  const out = { type };
  for (const p of ACTIONS[type]?.params || []) {
    if (p.def !== undefined) out[p.key] = p.def;
    else if (p.type === 'steps') out[p.key] = [];
    else if (p.type === 'bool') out[p.key] = false;
    else out[p.key] = '';
  }
  return out;
}

// Atajo de teclado guardado → texto legible («Ctrl + Shift + M»).
export function comboLabel(combo, mac = false) {
  if (!combo || !combo.key) return '';
  const parts = [];
  if (combo.ctrl) parts.push(mac ? '⌃' : 'Ctrl');
  if (combo.alt) parts.push(mac ? '⌥' : 'Alt');
  if (combo.shift) parts.push(mac ? '⇧' : 'Shift');
  if (combo.meta) parts.push(mac ? '⌘' : 'Win');
  const names = { ' ': 'Espacio', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Escape: 'Esc', Enter: 'Intro', Backspace: '⌫' };
  parts.push(names[combo.key] || (combo.key.length === 1 ? combo.key.toUpperCase() : combo.key));
  return parts.join(mac ? '' : ' + ');
}
