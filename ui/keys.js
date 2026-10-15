// Keyboard shortcuts: every action that can have a key, its default keys, and the pure helpers that
// turn key events into combos, check a combo, and apply the user's changes. No DOM, no Tauri, so it is
// unit tested with Node. renderer.js attaches the code to run for each action id.
//
// A combo is a string such as "Mod+Shift+N" or "F5". "Mod" means Ctrl on Windows and Linux and Cmd on
// macOS, so one saved binding works everywhere. Modifiers always come in the order
// Mod, Ctrl, Meta, Alt, Shift and the key name is last (a letter is upper case).

// `keys` are the defaults; `macKeys`, when present, replace them on macOS.
export const ACTIONS = [
  // ---- Navigation
  { id: 'back', group: 'Navigation', label: 'Back', keys: ['Alt+ArrowLeft'], macKeys: ['Alt+ArrowLeft', 'Mod+['] },
  { id: 'forward', group: 'Navigation', label: 'Forward', keys: ['Alt+ArrowRight'], macKeys: ['Alt+ArrowRight', 'Mod+]'] },
  { id: 'up', group: 'Navigation', label: 'Up one folder', keys: ['Alt+ArrowUp', 'Backspace'], macKeys: ['Alt+ArrowUp', 'Backspace', 'Mod+ArrowUp'] },
  { id: 'refresh', group: 'Navigation', label: 'Refresh', keys: ['F5'] },
  { id: 'address', group: 'Navigation', label: 'Edit the address bar', keys: ['Mod+L'] },
  { id: 'search', group: 'Navigation', label: 'Search this folder', keys: ['Mod+F'] },
  { id: 'focusNext', group: 'Navigation', label: 'Next area (files, second pane, sidebar)', keys: ['F6'] },
  { id: 'focusPrev', group: 'Navigation', label: 'Previous area', keys: ['Shift+F6'] },
  // ---- Pins
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ id: 'pin' + n, group: 'Pins', label: 'Open pin ' + n, keys: ['Mod+' + n] })),
  { id: 'pinCurrent', group: 'Pins', label: 'Pin or unpin this folder', keys: [] },
  // ---- Tabs
  { id: 'newTab', group: 'Tabs', label: 'New tab', keys: ['Mod+T'] },
  { id: 'closeTab', group: 'Tabs', label: 'Close tab', keys: ['Mod+W'] },
  { id: 'nextTab', group: 'Tabs', label: 'Next tab', keys: ['Mod+Tab'], macKeys: ['Ctrl+Tab'] },
  { id: 'prevTab', group: 'Tabs', label: 'Previous tab', keys: ['Mod+Shift+Tab'], macKeys: ['Ctrl+Shift+Tab'] },
  // ---- Files
  { id: 'open', group: 'Files', label: 'Open', keys: ['Enter'], macKeys: ['Enter', 'Mod+ArrowDown'] },
  { id: 'rename', group: 'Files', label: 'Rename', keys: ['F2'] },
  { id: 'delete', group: 'Files', label: 'Delete', keys: ['Delete'], macKeys: ['Delete', 'Mod+Backspace'] },
  { id: 'newFolder', group: 'Files', label: 'New folder', keys: ['Mod+Shift+N'] },
  { id: 'newFile', group: 'Files', label: 'New text file', keys: [] },
  { id: 'duplicate', group: 'Files', label: 'Duplicate', keys: [] },
  { id: 'compress', group: 'Files', label: 'Compress to ZIP', keys: [] },
  { id: 'copyTo', group: 'Files', label: 'Copy to…', keys: [] },
  { id: 'moveTo', group: 'Files', label: 'Move to…', keys: [] },
  { id: 'openWith', group: 'Files', label: 'Open with…', keys: [] },
  { id: 'terminal', group: 'Files', label: 'Open terminal here', keys: [] },
  { id: 'findDuplicates', group: 'Files', label: 'Find duplicate files here', keys: [] },
  { id: 'properties', group: 'Files', label: 'Properties', keys: ['Alt+Enter'], macKeys: ['Alt+Enter', 'Mod+I'] },
  // ---- Clipboard and undo
  { id: 'copy', group: 'Clipboard and undo', label: 'Copy', keys: ['Mod+C'] },
  { id: 'cut', group: 'Clipboard and undo', label: 'Cut', keys: ['Mod+X'] },
  { id: 'paste', group: 'Clipboard and undo', label: 'Paste', keys: ['Mod+V'] },
  { id: 'copyPath', group: 'Clipboard and undo', label: 'Copy path', keys: ['Mod+Shift+C'] },
  { id: 'selectAll', group: 'Clipboard and undo', label: 'Select all', keys: ['Mod+A'] },
  { id: 'undo', group: 'Clipboard and undo', label: 'Undo', keys: ['Mod+Z'] },
  { id: 'redo', group: 'Clipboard and undo', label: 'Redo', keys: ['Mod+Y', 'Mod+Shift+Z'] },
  // ---- View and panes
  { id: 'preview', group: 'View and panes', label: 'Preview pane', keys: ['Alt+P'] },
  { id: 'hidden', group: 'View and panes', label: 'Show hidden items', keys: ['Mod+H'] },
  { id: 'split', group: 'View and panes', label: 'Split view', keys: ['Mod+\\'] },
  { id: 'filter', group: 'View and panes', label: 'Filter bar', keys: ['Mod+Shift+F'] },
  { id: 'toggleView', group: 'View and panes', label: 'Switch between details and icons', keys: [] },
  { id: 'shortcuts', group: 'View and panes', label: 'Keyboard shortcuts', keys: ['F1'] },
];

/** Keys that always work the same way and cannot be changed. {mod} is replaced by Ctrl or Cmd. */
export const FIXED_KEYS = [
  ['Arrow keys', 'Move the selection (file list, second pane) or the highlight (sidebar)'],
  ['Shift + arrow keys', 'Extend the selection in the second pane'],
  ['Home / End', 'Jump to the first or last item'],
  ['Letters', 'Jump to an item by typing the start of its name (file list)'],
  ['Alt + Up / Down', 'Move the highlighted pin in the sidebar'],
  ['Shift+F10 or the Menu key', 'Open the context menu of the highlighted sidebar item'],
  ['{mod} + click, Shift + click', 'Add to the selection, or select a range'],
  ['{mod} + mouse wheel', 'Change the icon size'],
  ['Esc', 'Close a dialog or cancel renaming'],
];

export const actionById = (id) => ACTIONS.find((a) => a.id === id);
export const defaultsOf = (a, mac) => (mac && a.macKeys ? a.macKeys : a.keys);

/** The combos an action responds to: the user's list when they changed it, otherwise the defaults. */
export const effective = (a, overrides, mac) => (overrides && overrides[a.id]) || defaultsOf(a, mac);

const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

/** True when the user changed this action's keys. */
export const isModified = (a, overrides, mac) => !!(overrides && overrides[a.id]) && !sameSet(overrides[a.id], defaultsOf(a, mac));

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'NumLock', 'Dead', 'Unidentified', 'OS']);

/**
 * Turns a key event ({ key, code, ctrlKey, metaKey, altKey, shiftKey }) into a combo,
 * or null while only modifier keys are held.
 */
export function comboOf(ev, mac) {
  let k = ev.key;
  if (!k || MODIFIER_KEYS.has(k)) return null;
  if (k === ' ') k = 'Space';
  if (k === '+') k = 'Plus'; // "+" separates the parts of a combo
  // Shift+1 types "!" and Option+P types a pi sign on a Mac: read the physical key for those
  if (k.length === 1 && !/[A-Za-z0-9]/.test(k) && (ev.altKey || ev.ctrlKey || ev.metaKey)) {
    const m = /^Key([A-Z])$/.exec(ev.code || '') || /^Digit([0-9])$/.exec(ev.code || '');
    if (m) k = m[1];
  }
  if (k.length === 1) k = k.toUpperCase();
  const parts = [];
  if (mac ? ev.metaKey : ev.ctrlKey) parts.push('Mod');
  if (mac && ev.ctrlKey) parts.push('Ctrl');
  if (!mac && ev.metaKey) parts.push('Meta');
  if (ev.altKey) parts.push('Alt');
  if (ev.shiftKey) parts.push('Shift');
  parts.push(k);
  return parts.join('+');
}

const ARROWS = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' };

/** A combo as users should read it: "Ctrl+Shift+N", or "Cmd+Shift+N" on a Mac. */
export function comboLabel(combo, mac) {
  return combo.split('+').map((p) => {
    if (p === 'Mod') return mac ? 'Cmd' : 'Ctrl';
    if (p === 'Alt') return mac ? 'Option' : 'Alt';
    if (p === 'Meta') return 'Win';
    return ARROWS[p] || p;
  }).join('+');
}

/**
 * Returns a message when `combo` cannot be used as a shortcut, or null when it is fine.
 * A key with no modifier is only allowed for keys that are not used for moving around or typing.
 */
export function checkCombo(combo) {
  const parts = combo.split('+');
  const key = parts[parts.length - 1];
  const mods = parts.slice(0, -1);
  if (key === 'Escape') return 'Esc is used to close dialogs.';
  if (key === 'ContextMenu') return 'The Menu key opens context menus.';
  const strong = mods.some((m) => m === 'Mod' || m === 'Ctrl' || m === 'Alt' || m === 'Meta');
  if (strong) return null;
  if (/^F([1-9]|1[0-2])$/.test(key) || ['Delete', 'Enter', 'Backspace', 'Insert'].includes(key)) return null;
  return 'Add Ctrl, Alt or Cmd to that key: plain keys are used for moving around and typing.';
}

/** combo -> action id for everything currently bound. */
export function buildKeymap(overrides, mac) {
  const map = new Map();
  for (const a of ACTIONS) for (const c of effective(a, overrides, mac)) if (!map.has(c)) map.set(c, a.id);
  return map;
}

// Stores `list` for an action, dropping the override when it equals the defaults.
function store(overrides, a, list, mac) {
  if (sameSet(list, defaultsOf(a, mac))) delete overrides[a.id]; else overrides[a.id] = list;
}

/**
 * Adds `combo` to an action. A combo can only belong to one action, so it is taken away from any other
 * action that had it. Returns the new overrides and the action it was taken from (or null).
 */
export function assignCombo(overrides, id, combo, mac) {
  const next = { ...overrides };
  let from = null;
  for (const a of ACTIONS) {
    if (a.id === id) continue;
    const cur = effective(a, next, mac);
    if (cur.includes(combo)) { store(next, a, cur.filter((c) => c !== combo), mac); from = a; }
  }
  const a = actionById(id);
  const mine = effective(a, next, mac);
  if (!mine.includes(combo)) store(next, a, [...mine, combo], mac);
  return { overrides: next, from };
}

/** Removes one combo from an action (the action can end up with no key). */
export function removeCombo(overrides, id, combo, mac) {
  const next = { ...overrides };
  const a = actionById(id);
  store(next, a, effective(a, next, mac).filter((c) => c !== combo), mac);
  return next;
}

/** Puts one action back to its default keys. Another action that took one of those keys loses it. */
export function resetAction(overrides, id, mac) {
  let next = { ...overrides };
  delete next[id];
  for (const c of defaultsOf(actionById(id), mac)) next = assignCombo(next, id, c, mac).overrides;
  return next;
}
