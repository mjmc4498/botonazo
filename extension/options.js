// Botonazo — editor del deck y ajustes.

import { REMOTE_URL, SITE_ACCESS, getObsPassword, getSettings, hasSiteAccess, requestSiteAccess, saveSettings } from './config.js';
import { ACTIONS, CATEGORIES, MAX_MACRO_DELAY, MAX_MACRO_STEPS, NOT_IN_MACRO, comboLabel, defaultParams, shortLabel } from './actions.js';
import { COLORS, LIMITS, TEMPLATES, defaultDeck, getDeck, normalizeDeck, pageFromTemplate, saveDeck, uid } from './deck.js';
import { ICONS, ICON_GROUPS } from './lib/icons.js';
import { ObsClient, obsErrorText } from './lib/obs.js';
import { applyI18n, t } from './lib/i18n.js';

applyI18n();

const $ = (id) => document.getElementById(id);
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

// Crea un elemento. `html` solo se usa con íconos del propio paquete.
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked' || k === 'maxLength' || k === 'disabled') node[k] = v;
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const child of children.flat()) if (child != null && child !== false) node.append(child);
  return node;
}

const svg = (paths) => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
const UI = {
  up: svg('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  down: svg('<path d="M12 5v14M6 13l6 6 6-6"/>'),
  left: svg('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
  right: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>'),
  copy: svg('<rect x="8" y="8" width="14" height="14" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  x: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
};

let settings = await getSettings();
let deck = await getDeck();
let lastSaved = JSON.stringify(deck);
let selPage = deck.pages[0].id;
let selKey = null;
let iconMode = null;
let iconQuery = '';

const currentPage = () => deck.pages.find((p) => p.id === selPage) || deck.pages[0];
const currentKey = () => currentPage().keys.find((k) => k.id === selKey) || null;

// ---------------------------------------------------------------- guardado

let savedTimer = 0;
function flashSaved() {
  $('saved').classList.add('on');
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => $('saved').classList.remove('on'), 1200);
}

let saveTimer = 0;
function commit({ grid = true, pages = false } = {}) {
  if (grid) renderGrid();
  if (pages) renderPages();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const saved = await saveDeck(deck);
    lastSaved = JSON.stringify(saved);
    flashSaved();
  }, 300);
}

function toast(text) {
  const box = $('saved');
  box.textContent = text;
  flashSaved();
  setTimeout(() => { box.textContent = t('saved'); }, 1500);
}

// ---------------------------------------------------------------- botones (vista previa)

function iconNode(icon) {
  if (icon.startsWith('ico:')) {
    const wrap = document.createElement('span');
    wrap.innerHTML = svg(ICONS[icon.slice(4)] || ICONS.zap);
    return wrap.firstChild;
  }
  return el('span', { class: 'emoji', text: icon });
}

function keyVisual(key, tag = 'button') {
  const [bg, fg] = COLORS[key.color] || COLORS.graphite;
  const node = el(tag, { class: 'key', style: `--bg:${bg};--fg:${fg}` });
  if (tag === 'button') node.type = 'button';
  node.append(iconNode(key.icon), el('span', { class: 'k-label', text: key.label }));
  if (ACTIONS[key.action.type]?.state) node.append(el('i', { class: 'badge', title: t('toggleBadge') }));
  return node;
}

// ---------------------------------------------------------------- páginas

function renderPages() {
  const nav = $('pages');
  const chips = deck.pages.map((p) => {
    const chip = el('button', {
      type: 'button',
      text: p.name,
      'aria-current': String(p.id === selPage),
      onclick: () => {
        selPage = p.id;
        selKey = null;
        render();
      },
    });
    chip.addEventListener('dragover', (e) => {
      if (!drag || p.id === selPage) return;
      e.preventDefault();
      chip.classList.add('drop');
    });
    chip.addEventListener('dragleave', () => chip.classList.remove('drop'));
    chip.addEventListener('drop', (e) => {
      if (!drag) return;
      e.preventDefault();
      chip.classList.remove('drop');
      moveKey(drag, p.id, p.keys.length);
    });
    return chip;
  });
  const add = el('button', { type: 'button', class: 'add-page', title: t('addPage'), 'aria-label': t('addPage'), html: UI.plus, onclick: () => addPage('vacia') });
  nav.replaceChildren(...chips, deck.pages.length < LIMITS.pages ? add : null);
  // Solo se desplaza la fila de páginas (scrollIntoView movería toda la ventana).
  const current = nav.querySelector('[aria-current="true"]');
  if (current) {
    const left = current.offsetLeft - nav.offsetLeft;
    if (left < nav.scrollLeft || left + current.offsetWidth > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = left - 12;
  }
}

function addPage(template) {
  if (deck.pages.length >= LIMITS.pages) {
    toast(t('limitPages', [String(LIMITS.pages)]));
    return;
  }
  const page = pageFromTemplate(template);
  const names = new Set(deck.pages.map((p) => p.name));
  let name = page.name;
  for (let n = 2; names.has(name); n++) name = `${page.name} ${n}`;
  page.name = name;
  deck.pages.push(page);
  selPage = page.id;
  selKey = null;
  commit({ grid: false });
  render();
  if (template === 'vacia') $('page-name')?.select();
}

// ---------------------------------------------------------------- cuadrícula

let drag = null;

function clearDrop() {
  for (const n of document.querySelectorAll('.drop-before, .drop-after')) n.classList.remove('drop-before', 'drop-after');
}

function renderGrid() {
  const grid = $('grid');
  const page = currentPage();
  grid.dataset.cols = deck.cols;
  grid.style.setProperty('--cols', deck.cols);
  const keys = page.keys.map((key, index) => {
    const node = keyVisual(key);
    node.classList.toggle('sel', key.id === selKey);
    node.draggable = true;
    node.title = ACTIONS[key.action.type]?.name || '';
    node.addEventListener('click', () => {
      selKey = key.id;
      iconMode = null;
      renderGrid();
      renderInspector();
    });
    node.addEventListener('dragstart', (e) => {
      drag = key.id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', key.id);
      requestAnimationFrame(() => node.classList.add('dragging'));
    });
    node.addEventListener('dragend', () => {
      drag = null;
      clearDrop();
      node.classList.remove('dragging');
      for (const chip of document.querySelectorAll('.ph-pages .drop')) chip.classList.remove('drop');
    });
    node.addEventListener('dragover', (e) => {
      if (!drag) return;
      e.preventDefault();
      e.stopPropagation();
      const r = node.getBoundingClientRect();
      const after = e.clientX > r.left + r.width / 2;
      clearDrop();
      node.classList.add(after ? 'drop-after' : 'drop-before');
    });
    node.addEventListener('drop', (e) => {
      if (!drag) return;
      e.preventDefault();
      e.stopPropagation();
      const after = node.classList.contains('drop-after');
      moveKey(drag, page.id, index + (after ? 1 : 0));
    });
    return node;
  });
  const add = page.keys.length < LIMITS.keys
    ? el('button', { type: 'button', class: 'key add', title: t('addKey'), 'aria-label': t('addKey'), html: UI.plus, onclick: addKey })
    : null;
  grid.replaceChildren(...keys, add);
}

$('grid').addEventListener('dragover', (e) => { if (drag) e.preventDefault(); });
$('grid').addEventListener('drop', (e) => {
  if (!drag) return;
  e.preventDefault();
  moveKey(drag, selPage, currentPage().keys.length);
});

function locate(id) {
  for (const page of deck.pages) {
    const index = page.keys.findIndex((k) => k.id === id);
    if (index !== -1) return { page, index };
  }
  return null;
}

function moveKey(id, toPageId, toIndex) {
  const from = locate(id);
  const to = deck.pages.find((p) => p.id === toPageId);
  if (!from || !to) return;
  if (from.page !== to && to.keys.length >= LIMITS.keys) {
    toast(t('limitKeys', [String(LIMITS.keys)]));
    return;
  }
  const [key] = from.page.keys.splice(from.index, 1);
  let index = toIndex;
  if (from.page === to && from.index < index) index--;
  to.keys.splice(Math.max(0, Math.min(index, to.keys.length)), 0, key);
  if (from.page !== to) toast(t('movedTo', [to.name]));
  drag = null;
  commit({ grid: false });
  render();
}

function addKey() {
  const page = currentPage();
  if (page.keys.length >= LIMITS.keys) return;
  const type = 'capture.screenshot';
  const def = ACTIONS[type];
  const key = { id: uid(), label: shortLabel(type), icon: `ico:${def.icon}`, color: def.color, action: defaultParams(type) };
  page.keys.push(key);
  selKey = key.id;
  iconMode = null;
  commit();
  renderInspector();
  $('f-action')?.focus();
}

// ---------------------------------------------------------------- campos de parámetros

const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function isValidUrl(value) {
  try { return /^https?:$/.test(new URL(value).protocol); } catch { return false; }
}

function actionSelect(value, { macro = false } = {}) {
  const select = el('select');
  for (const [cat, name] of CATEGORIES) {
    const group = el('optgroup', { label: name });
    for (const [type, def] of Object.entries(ACTIONS)) {
      if (def.cat !== cat || (macro && NOT_IN_MACRO.has(type))) continue;
      group.append(el('option', { value: type, text: def.name }));
    }
    if (group.children.length) select.append(group);
  }
  select.value = value;
  return select;
}

function comboField(value, onChange) {
  let combo = value;
  const text = el('span', { class: 'combo-text' });
  const clear = el('button', { type: 'button', class: 'btn icon small', title: t('clear'), 'aria-label': t('clear'), html: UI.x });
  const box = el('div', { class: 'combo', tabindex: '0', role: 'button', 'aria-label': t('comboListen') }, text, clear);
  const show = (listening = false) => {
    box.classList.toggle('listening', listening);
    text.classList.toggle('empty', !combo && !listening);
    text.textContent = listening ? t('comboListen') : combo ? comboLabel(combo, isMac) : t('comboEmpty');
    clear.hidden = !combo || listening;
  };
  box.addEventListener('focus', () => show(true));
  box.addEventListener('blur', () => show(false));
  box.addEventListener('click', () => box.focus());
  box.addEventListener('keydown', (e) => {
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Fn'].includes(e.key)) return;
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) return;
    e.preventDefault();
    e.stopPropagation();
    const key = e.key.length === 1 && (e.altKey || e.ctrlKey) && /^Key[A-Z]$/.test(e.code) ? e.code.slice(3).toLowerCase() : e.key;
    combo = { key, code: e.code, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey };
    onChange(combo);
    box.blur();
  });
  clear.addEventListener('click', (e) => {
    e.stopPropagation();
    combo = null;
    onChange(null);
    show(false);
  });
  show(false);
  return box;
}

// Editor de un parámetro. `onChange(valor, {structural})` guarda el cambio.
function paramField(p, action, onChange) {
  const value = action[p.key];
  // El atajo usa un div: un <label> que envuelve botones dispararía clics de más.
  const wrap = el(p.type === 'combo' ? 'div' : 'label', { class: 'field' });
  const title = el('span', { text: p.label });
  let control;
  let hint = p.hint ? el('span', { class: 'hint', text: p.hint }) : null;
  const req = el('span', { class: 'hint req' });

  const validate = (v) => {
    let msg = '';
    if (p.required && (v == null || v === '')) msg = t('required');
    else if (p.type === 'url' && v && !isValidUrl(v)) msg = t('invalidUrl');
    wrap.classList.toggle('invalid', !!msg);
    req.textContent = msg;
    req.hidden = !msg;
  };

  switch (p.type) {
    case 'text':
    case 'url':
      control = el('input', { type: 'text', value: value ?? '', placeholder: p.placeholder, spellcheck: 'false', list: p.list, inputmode: p.type === 'url' ? 'url' : null });
      control.addEventListener('input', () => { onChange(control.value.trim() === '' ? '' : control.value); validate(control.value.trim()); });
      break;
    case 'textarea':
      control = el('textarea', { rows: '3', placeholder: p.placeholder, maxlength: String(LIMITS.text) });
      control.value = value ?? '';
      control.addEventListener('input', () => { onChange(control.value); validate(control.value); });
      break;
    case 'number':
      control = el('input', { type: 'number', value: value ?? p.def ?? 0, min: p.min, max: p.max, step: '1' });
      control.addEventListener('input', () => onChange(Number(control.value) || 0));
      break;
    case 'select':
      control = el('select');
      for (const [v, label] of p.options) control.append(el('option', { value: v, text: label }));
      control.value = value ?? p.def;
      control.addEventListener('change', () => onChange(control.value));
      break;
    case 'bool': {
      control = el('input', { type: 'checkbox', class: 'switch', checked: !!value });
      control.addEventListener('change', () => onChange(control.checked));
      wrap.className = 'field-row';
      wrap.append(el('span', { class: 'field-label', text: p.label }), control);
      return wrap;
    }
    case 'combo':
      control = comboField(value, (combo) => { onChange(combo); validate(combo); });
      break;
    case 'page': {
      control = el('select');
      const others = deck.pages.filter((pg) => pg.id !== selPage);
      control.append(el('option', { value: '', text: others.length ? t('choosePage') : t('noOtherPages'), disabled: true }));
      for (const pg of others) control.append(el('option', { value: pg.id, text: pg.name }));
      control.value = others.some((pg) => pg.id === value) ? value : '';
      control.addEventListener('change', () => { onChange(control.value); validate(control.value); });
      break;
    }
    case 'steps':
      return stepsEditor(action, onChange);
  }
  wrap.append(title, control);
  if (hint) wrap.append(hint);
  wrap.append(req);
  validate(typeof value === 'string' ? value.trim() : value);
  return wrap;
}

function paramsEditor(action, onChange) {
  const def = ACTIONS[action.type];
  const box = el('div', { class: 'params' });
  for (const p of def.params || []) {
    box.append(paramField(p, action, (v, opts) => {
      if (p.type !== 'steps') action[p.key] = v;
      onChange(opts);
    }));
  }
  return box;
}

function stepsEditor(action, onChange) {
  const box = el('div', { class: 'field' });
  box.append(el('span', { text: t('macroSteps') }));
  const list = el('div', { class: 'steps-list' });
  box.append(list);

  const draw = () => {
    list.replaceChildren(...action.steps.map((step, i) => {
      const select = actionSelect(step.type, { macro: true });
      select.addEventListener('change', () => {
        action.steps[i] = { ...defaultParams(select.value), delay: step.delay || 0 };
        onChange();
        draw();
      });
      const move = (dir) => {
        const j = i + dir;
        if (j < 0 || j >= action.steps.length) return;
        [action.steps[i], action.steps[j]] = [action.steps[j], action.steps[i]];
        onChange();
        draw();
      };
      const head = el('div', { class: 'step-head' },
        el('span', { class: 'num', text: String(i + 1) }),
        select,
        el('button', { type: 'button', class: 'btn icon small', title: t('moveUp'), 'aria-label': t('moveUp'), html: UI.up, disabled: i === 0, onclick: () => move(-1) }),
        el('button', { type: 'button', class: 'btn icon small', title: t('moveDown'), 'aria-label': t('moveDown'), html: UI.down, disabled: i === action.steps.length - 1, onclick: () => move(1) }),
        el('button', { type: 'button', class: 'btn icon small danger', title: t('remove'), 'aria-label': t('remove'), html: UI.trash, onclick: () => { action.steps.splice(i, 1); onChange(); draw(); } }),
      );
      const delay = el('input', { type: 'number', min: '0', max: String(MAX_MACRO_DELAY), step: '100', value: step.delay || 0 });
      delay.addEventListener('input', () => { step.delay = Math.max(0, Math.min(MAX_MACRO_DELAY, Number(delay.value) || 0)); onChange(); });
      return el('div', { class: 'step' },
        head,
        ACTIONS[step.type].params?.length ? paramsEditor(step, () => onChange()) : null,
        el('label', { class: 'step-delay' }, el('span', { text: t('stepDelay') }), delay, el('span', { text: 'ms' })),
      );
    }));
  };
  draw();

  const add = el('button', { type: 'button', class: 'btn small', html: UI.plus });
  add.append(el('span', { text: t('addStep') }));
  add.addEventListener('click', () => {
    if (action.steps.length >= MAX_MACRO_STEPS) return toast(t('limitSteps', [String(MAX_MACRO_STEPS)]));
    action.steps.push({ ...defaultParams('tab.next'), delay: action.steps.length ? 300 : 0 });
    onChange();
    draw();
  });
  box.append(el('div', {}, add));
  return box;
}

// ---------------------------------------------------------------- ícono y color

const EMOJIS = ['🎬', '🎮', '🔴', '📸', '🎥', '🎙️', '🎵', '🎧', '📺', '🖥️', '💻', '🌐', '☕', '🍿', '🔥', '⭐', '❤️', '💜', '👋', '👏', '🎉', '🚀', '💬', '🔔', '📌', '🔒', '⚡', '🎯', '🏆', '💡', '✅', '❌', '⏸️', '▶️', '⏭️', '🔇', '🔊', '😂', '😎', '🤖'];

function iconPicker(key) {
  const mode = iconMode || (key.icon.startsWith('ico:') ? 'icons' : 'emoji');
  const box = el('div', { class: 'field' });
  const seg = el('div', { class: 'segmented' },
    ...[['icons', t('icons')], ['emoji', t('emoji')]].map(([v, label]) => el('button', {
      type: 'button', text: label, 'aria-pressed': String(v === mode),
      onclick: () => { iconMode = v; renderInspector(); },
    })));
  box.append(el('div', { class: 'icon-tabs' }, el('span', { text: t('fieldIcon') }), seg));

  const grid = el('div', { class: 'icon-grid' });
  const pick = (icon) => {
    key.icon = icon;
    commit();
    updateHead();
    for (const b of grid.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.icon === icon));
  };

  if (mode === 'icons') {
    const search = el('input', { type: 'search', class: 'icon-search', placeholder: t('iconSearch'), value: iconQuery });
    const draw = () => {
      const q = fold(iconQuery.trim());
      const nodes = [];
      for (const [group, icons] of ICON_GROUPS) {
        const matches = Object.entries(icons).filter(([name, words]) => !q || fold(`${name} ${words}`).includes(q));
        if (!matches.length) continue;
        if (!q) nodes.push(el('h4', { text: group }));
        for (const [name, words] of matches) {
          nodes.push(el('button', {
            type: 'button', title: words, 'aria-label': words, 'data-icon': `ico:${name}`,
            'aria-pressed': String(key.icon === `ico:${name}`), html: svg(ICONS[name]),
            onclick: () => pick(`ico:${name}`),
          }));
        }
      }
      if (!nodes.length) nodes.push(el('h4', { text: t('iconNone') }));
      grid.replaceChildren(...nodes);
    };
    search.addEventListener('input', () => { iconQuery = search.value; draw(); });
    draw();
    box.append(search, grid);
  } else {
    const input = el('input', { type: 'text', placeholder: t('emojiPlaceholder'), value: key.icon.startsWith('ico:') ? '' : key.icon });
    input.addEventListener('input', () => {
      const text = [...input.value.trim()].slice(0, 4).join('');
      if (text) pick(text);
    });
    grid.replaceChildren(...EMOJIS.map((e) => el('button', { type: 'button', text: e, 'data-icon': e, 'aria-pressed': String(key.icon === e), onclick: () => { input.value = e; pick(e); } })));
    box.append(input, grid);
  }
  return box;
}

function colorPicker(key) {
  const row = el('div', { class: 'colors', role: 'radiogroup' });
  for (const [name, [bg, , label]] of Object.entries(COLORS)) {
    row.append(el('button', {
      type: 'button', style: `--sw:${bg}`, title: label, 'aria-label': label, 'data-color': name, 'aria-pressed': String(key.color === name),
      onclick: () => {
        key.color = name;
        commit();
        updateHead();
        for (const b of row.children) b.setAttribute('aria-pressed', String(b.dataset.color === name));
      },
    }));
  }
  return el('div', { class: 'field' }, el('span', { text: t('fieldColor') }), row);
}

// ---------------------------------------------------------------- inspector

function updateHead() {
  const key = currentKey();
  const head = document.querySelector('.insp-head');
  if (!key || !head) return;
  head.querySelector('.key').replaceWith(keyVisual(key, 'div'));
  head.querySelector('h3').textContent = key.label || shortLabel(key.action.type);
}

function changeType(key, type) {
  const old = ACTIONS[key.action.type];
  const def = ACTIONS[type];
  if (!key.label || key.label === shortLabel(key.action.type)) key.label = shortLabel(type);
  if (key.icon === `ico:${old.icon}`) key.icon = `ico:${def.icon}`;
  if (key.color === old.color) key.color = def.color;
  key.action = defaultParams(type);
  iconMode = null;
  commit();
  renderInspector();
}

function keyInspector(key) {
  const def = ACTIONS[key.action.type];
  const head = el('div', { class: 'insp-head' },
    keyVisual(key, 'div'),
    el('div', {}, el('div', { class: 'insp-kicker', text: t('inspKey') }), el('h3', { text: key.label || shortLabel(key.action.type) })));

  const label = el('input', { type: 'text', id: 'f-label', value: key.label, maxLength: LIMITS.label, placeholder: shortLabel(key.action.type) });
  label.addEventListener('input', () => { key.label = label.value; commit(); updateHead(); });

  const action = actionSelect(key.action.type);
  action.id = 'f-action';
  action.addEventListener('change', () => changeType(key, action.value));

  const params = paramsEditor(key.action, () => commit());

  const others = deck.pages.filter((p) => p.id !== selPage);
  const moveTo = el('select', { 'aria-label': t('moveToPage') },
    el('option', { value: '', text: t('moveToPage') }),
    ...others.map((p) => el('option', { value: p.id, text: p.name })));
  moveTo.hidden = !others.length;
  moveTo.addEventListener('change', () => {
    if (!moveTo.value) return;
    const target = moveTo.value;
    moveKey(key.id, target, deck.pages.find((p) => p.id === target).keys.length);
  });

  const del = el('button', { type: 'button', class: 'btn danger', html: UI.trash });
  const delLabel = el('span', { text: t('deleteKey') });
  del.append(delLabel);
  let confirmTimer = 0;
  del.addEventListener('click', () => {
    if (!del.classList.contains('confirm')) {
      del.classList.add('confirm');
      delLabel.textContent = t('confirm');
      confirmTimer = setTimeout(() => { del.classList.remove('confirm'); delLabel.textContent = t('deleteKey'); }, 3000);
      return;
    }
    clearTimeout(confirmTimer);
    const page = currentPage();
    page.keys = page.keys.filter((k) => k.id !== key.id);
    selKey = null;
    commit();
    renderInspector();
  });

  const dup = el('button', { type: 'button', class: 'btn', html: UI.copy, onclick: () => {
    const page = currentPage();
    if (page.keys.length >= LIMITS.keys) return toast(t('limitKeys', [String(LIMITS.keys)]));
    const copy = JSON.parse(JSON.stringify(key));
    copy.id = uid();
    page.keys.splice(page.keys.indexOf(key) + 1, 0, copy);
    selKey = copy.id;
    commit();
    renderInspector();
  } });
  dup.append(el('span', { text: t('duplicate') }));

  return [
    head,
    el('label', { class: 'field' }, el('span', { text: t('fieldLabel') }), label),
    el('label', { class: 'field' }, el('span', { text: t('fieldAction') }), action),
    def.desc ? el('p', { class: 'desc', text: def.desc }) : null,
    def.params?.length ? params : null,
    iconPicker(key),
    colorPicker(key),
    el('div', { class: 'insp-actions' }, dup, moveTo, el('span', { class: 'spacer' }), del),
  ];
}

function pageInspector(page) {
  const index = deck.pages.indexOf(page);
  const name = el('input', { type: 'text', id: 'page-name', value: page.name, maxLength: LIMITS.pageName });
  name.addEventListener('input', () => {
    page.name = name.value.trim() || page.name;
    commit({ grid: false, pages: true });
  });
  const move = (dir) => {
    const j = index + dir;
    if (j < 0 || j >= deck.pages.length) return;
    [deck.pages[index], deck.pages[j]] = [deck.pages[j], deck.pages[index]];
    commit({ grid: false });
    render();
  };
  const del = el('button', { type: 'button', class: 'btn danger', html: UI.trash, disabled: deck.pages.length < 2 });
  const delLabel = el('span', { text: t('deletePage') });
  del.append(delLabel);
  del.addEventListener('click', () => {
    if (!del.classList.contains('confirm')) {
      del.classList.add('confirm');
      delLabel.textContent = t('confirm');
      setTimeout(() => { del.classList.remove('confirm'); delLabel.textContent = t('deletePage'); }, 3000);
      return;
    }
    deck.pages.splice(index, 1);
    selPage = deck.pages[Math.max(0, index - 1)].id;
    commit({ grid: false });
    render();
  });
  const dup = el('button', { type: 'button', class: 'btn', html: UI.copy, disabled: deck.pages.length >= LIMITS.pages });
  dup.append(el('span', { text: t('duplicatePage') }));
  dup.addEventListener('click', () => {
    const copy = JSON.parse(JSON.stringify(page));
    copy.id = uid();
    copy.name = `${page.name} (2)`.slice(0, LIMITS.pageName);
    for (const k of copy.keys) k.id = uid();
    deck.pages.splice(index + 1, 0, copy);
    selPage = copy.id;
    commit({ grid: false });
    render();
  });
  return [
    el('div', {}, el('div', { class: 'insp-kicker', text: t('inspPage') }), el('h3', { class: 'page-title', text: page.name })),
    el('label', { class: 'field' }, el('span', { text: t('pageName') }), name),
    el('p', { class: 'insp-empty', text: t('pageHint', [String(page.keys.length), String(LIMITS.keys)]) }),
    el('div', { class: 'insp-actions' },
      el('button', { type: 'button', class: 'btn icon', title: t('moveLeft'), 'aria-label': t('moveLeft'), html: UI.left, disabled: index === 0, onclick: () => move(-1) }),
      el('button', { type: 'button', class: 'btn icon', title: t('moveRight'), 'aria-label': t('moveRight'), html: UI.right, disabled: index === deck.pages.length - 1, onclick: () => move(1) }),
      dup,
      el('span', { class: 'spacer' }),
      del),
  ];
}

function renderInspector() {
  const key = currentKey();
  $('inspector').replaceChildren(...(key ? keyInspector(key) : pageInspector(currentPage())).filter(Boolean));
}

function renderTools() {
  for (const btn of $('cols').querySelectorAll('button')) btn.setAttribute('aria-pressed', String(Number(btn.dataset.value) === deck.cols));
}

function render() {
  renderTools();
  renderPages();
  renderGrid();
  renderInspector();
}

// ---------------------------------------------------------------- herramientas del deck

$('cols').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-value]');
  if (!btn) return;
  deck.cols = Number(btn.dataset.value);
  renderTools();
  commit();
});

const addPageSelect = $('add-page');
addPageSelect.append(el('option', { value: '', text: t('addPage'), disabled: true, selected: true }));
for (const [name, tpl] of Object.entries(TEMPLATES)) addPageSelect.append(el('option', { value: name, text: tpl.title }));
addPageSelect.addEventListener('change', () => {
  if (addPageSelect.value) addPage(addPageSelect.value);
  addPageSelect.value = '';
});

$('export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ app: 'Botonazo', ...deck }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  el('a', { href: url, download: 'botonazo-deck.json' }).click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
});

$('import').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data?.pages)) throw new Error('formato');
    if (!confirm(t('importConfirm'))) return;
    deck = normalizeDeck(data);
    selPage = deck.pages[0].id;
    selKey = null;
    commit({ grid: false });
    render();
    toast(t('imported'));
  } catch {
    alert(t('importError'));
  }
});

$('reset-deck').addEventListener('click', () => {
  if (!confirm(t('resetConfirm'))) return;
  deck = defaultDeck();
  selPage = deck.pages[0].id;
  selKey = null;
  commit({ grid: false });
  render();
});

// Cambios hechos desde otra ventana del editor.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.deck && JSON.stringify(changes.deck.newValue) !== lastSaved) {
    deck = normalizeDeck(changes.deck.newValue);
    lastSaved = JSON.stringify(deck);
    if (!deck.pages.some((p) => p.id === selPage)) selPage = deck.pages[0].id;
    if (!currentKey()) selKey = null;
    render();
  }
  if (area === 'sync' && changes.settings) getSettings().then((s) => { settings = s; renderSettings(); });
});

// ---------------------------------------------------------------- ajustes

const manifest = chrome.runtime.getManifest();
$('version').textContent = manifest.version;
$('privacy').href = new URL('privacy.html', REMOTE_URL).toString();
$('remoteUrl').placeholder = REMOTE_URL;

chrome.commands?.getAll?.().then((commands) => {
  const cmd = commands.find((c) => c.name === '_execute_action');
  $('shortcut').textContent = cmd?.shortcut || t('shortcutNone');
});

async function save(patch) {
  settings = await saveSettings(patch);
  renderSettings();
  flashSaved();
}

const CHOICES = ['shotFormat', 'recFormat', 'recQuality'];
const SWITCHES = ['shotFlash', 'recAudio', 'obsEnabled', 'followActiveTab', 'showToasts', 'newCodeEachSession', 'autoStart'];

for (const id of CHOICES) {
  $(id).addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-value]');
    if (btn) save({ [id]: btn.dataset.value });
  });
}
for (const id of SWITCHES) $(id).addEventListener('change', (e) => save({ [id]: e.target.checked }));

function renderSettings() {
  for (const id of CHOICES) {
    for (const btn of $(id).querySelectorAll('button[data-value]')) btn.setAttribute('aria-pressed', String(btn.dataset.value === String(settings[id])));
  }
  for (const id of SWITCHES) $(id).checked = !!settings[id];
  if (document.activeElement !== $('remoteUrl')) $('remoteUrl').value = settings.remoteUrl;
  if (document.activeElement !== $('obsHost')) $('obsHost').value = settings.obsHost;
  if (document.activeElement !== $('obsPort')) $('obsPort').value = settings.obsPort;
  $('obs-fields').classList.toggle('disabled', !settings.obsEnabled);
}

// ---------- OBS

$('obsPassword').value = await getObsPassword();
$('obsHost').addEventListener('change', (e) => save({ obsHost: e.target.value.trim() || 'localhost' }));
$('obsPort').addEventListener('change', (e) => {
  const port = Math.round(Number(e.target.value));
  save({ obsPort: port > 0 && port < 65536 ? port : 4455 });
});
$('obsPassword').addEventListener('change', async (e) => {
  await chrome.storage.local.set({ obsPassword: e.target.value });
  flashSaved();
});

function fillList(id, values) {
  $(id).replaceChildren(...values.map((v) => el('option', { value: v })));
}

async function testObs({ quiet = false } = {}) {
  const msg = $('obsMsg');
  msg.className = 'field-msg';
  if (!quiet) msg.textContent = t('obsTesting');
  const client = new ObsClient({ host: settings.obsHost, port: settings.obsPort, password: $('obsPassword').value });
  try {
    await client.connect();
    const [scenes, inputs, version] = await Promise.all([
      client.call('GetSceneList'),
      client.call('GetInputList'),
      client.call('GetVersion').catch(() => ({})),
    ]);
    const sceneNames = [...(scenes.scenes || [])].sort((a, b) => b.sceneIndex - a.sceneIndex).map((s) => s.sceneName);
    const inputNames = (inputs.inputs || []).map((i) => i.inputName);
    fillList('obs-scenes', sceneNames);
    fillList('obs-inputs', inputNames);
    msg.classList.add('ok');
    msg.textContent = t('obsOk', [version.obsVersion || '', String(sceneNames.length), String(inputNames.length)]);
  } catch (err) {
    if (quiet) return;
    msg.classList.add('error');
    msg.textContent = obsErrorText(err);
  } finally {
    client.close();
  }
}

$('obsTest').addEventListener('click', async () => {
  await chrome.storage.local.set({ obsPassword: $('obsPassword').value });
  testObs();
});

// ---------- acceso a los sitios

async function renderAccess() {
  const granted = await hasSiteAccess();
  $('acceso').classList.toggle('granted', granted);
  for (const node of document.querySelectorAll('[data-access="state"]')) {
    node.dataset.tone = granted ? 'ok' : 'warn';
    node.querySelector('span').textContent = t(granted ? 'siteAccessOn' : 'siteAccessOff');
  }
  for (const node of document.querySelectorAll('[data-access="sub"]')) node.textContent = t(granted ? 'siteAccessOnSub' : 'siteAccessOffSub');
  for (const node of document.querySelectorAll('[data-access="grant"]')) node.hidden = granted;
  for (const node of document.querySelectorAll('[data-access="remove"]')) node.hidden = !granted;
}

for (const btn of document.querySelectorAll('[data-access="grant"]')) {
  btn.addEventListener('click', async () => {
    if (!(await requestSiteAccess())) toast(t('siteAccessDenied'));
    renderAccess();
  });
}
document.querySelector('[data-access="remove"]').addEventListener('click', async () => {
  await chrome.permissions.remove(SITE_ACCESS);
  renderAccess();
});
chrome.permissions.onAdded.addListener(renderAccess);
chrome.permissions.onRemoved.addListener(renderAccess);

// ---------- avanzado

$('remoteUrlSave').addEventListener('click', async () => {
  const msg = $('remoteUrlMsg');
  const value = $('remoteUrl').value.trim();
  msg.classList.remove('error');
  if (!value) {
    await save({ remoteUrl: '' });
    msg.textContent = t('remoteUrlDefault');
    return;
  }
  try {
    const url = new URL(value);
    // http solo se admite en la red local (pruebas antes de publicar).
    const local = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)|\.local$/.test(url.hostname);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw new Error('https');
    await save({ remoteUrl: url.toString() });
    msg.textContent = t('remoteUrlSaved');
  } catch {
    msg.classList.add('error');
    msg.textContent = t('remoteUrlInvalid');
  }
});

let confirmReset = false;
$('resetCode').addEventListener('click', async () => {
  const btn = $('resetCode');
  if (!confirmReset) {
    confirmReset = true;
    btn.textContent = t('newCodeConfirm');
    setTimeout(() => { confirmReset = false; btn.textContent = t('newCode'); }, 3000);
    return;
  }
  confirmReset = false;
  await chrome.runtime.sendMessage({ to: 'sw', type: 'session:reset' });
  btn.textContent = t('newCodeDone');
  setTimeout(() => { btn.textContent = t('newCode'); }, 2000);
});

// ---------------------------------------------------------------- inicio

renderSettings();
renderAccess();
render();
if (settings.obsEnabled) testObs({ quiet: true });
if (['#deck', '#obs', '#acceso'].includes(location.hash)) {
  requestAnimationFrame(() => document.querySelector(location.hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}
