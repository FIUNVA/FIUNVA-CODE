/* ============================================================
   PROGRAM TABS (browser-style, up to 4 open programs)
   ------------------------------------------------------------
   Only the selected tab's program lives in the textarea, so it is
   the one displayed, parsed and simulated. The other tabs keep
   their text (and scroll position) in memory until selected.
   ============================================================ */
const MAX_TABS = 4;

const tabsState = {
  items: [],      // { id, code, scroll }
  activeId: null,
  seq: 0,
};

const tabsBar = document.getElementById('progTabs');
const tabsAddBtn = document.getElementById('btnAddTab');

function tabLabel(code) {
  const m = String(code || '').match(/^\s*O\s*(\d+)/im);
  if (m) return 'O' + m[1];
  const firstComment = String(code || '').match(/\(([^)]{1,14})\)/);
  if (firstComment) return firstComment[1].trim().toUpperCase();
  return 'PROGRAMA';
}

function activeTab() {
  return tabsState.items.find((t) => t.id === tabsState.activeId) || null;
}

function storeActiveTab() {
  const t = activeTab();
  if (!t) return;
  t.code = el.input.value;
  t.scroll = el.input.scrollTop;
}

function renderTabs() {
  tabsBar.innerHTML = '';
  tabsState.items.forEach((t) => {
    const tab = document.createElement('div');
    tab.className = 'progTab' + (t.id === tabsState.activeId ? ' active' : '');
    tab.title = 'Programa ' + tabLabel(t.id === tabsState.activeId ? el.input.value : t.code);

    const name = document.createElement('span');
    name.className = 'tabName';
    name.textContent = tabLabel(t.id === tabsState.activeId ? el.input.value : t.code);
    tab.appendChild(name);

    if (tabsState.items.length > 1) {
      const close = document.createElement('button');
      close.className = 'tabClose';
      close.type = 'button';
      close.textContent = '×';
      close.title = 'Cerrar pestaña';
      close.addEventListener('click', (e) => {
        e.stopPropagation();
        closeTab(t.id);
      });
      tab.appendChild(close);
    }

    tab.addEventListener('click', () => selectTab(t.id));
    tabsBar.appendChild(tab);
  });
  tabsAddBtn.disabled = tabsState.items.length >= MAX_TABS;
  tabsAddBtn.title = tabsAddBtn.disabled
    ? 'Máximo ' + MAX_TABS + ' programas abiertos'
    : 'Nueva pestaña de programa';
}

function applyActiveTabToEditor() {
  const t = activeTab();
  if (!t) return;
  el.input.value = t.code;
  if (sim.prepared || sim.playing) resetSimState();
  renderHighlight();
  reparseAndRender();
  el.input.scrollTop = t.scroll || 0;
  el.highlight.scrollTop = el.input.scrollTop;
  el.lineNumbers.scrollTop = el.input.scrollTop;
}

function selectTab(id) {
  if (id === tabsState.activeId) return;
  storeActiveTab();
  tabsState.activeId = id;
  applyActiveTabToEditor();
  renderTabs();
}

function addTab(code) {
  if (tabsState.items.length >= MAX_TABS) return;
  storeActiveTab();
  const t = { id: ++tabsState.seq, code: code != null ? code : NEW_PROGRAM_TEMPLATE, scroll: 0 };
  tabsState.items.push(t);
  tabsState.activeId = t.id;
  applyActiveTabToEditor();
  renderTabs();
}

function closeTab(id) {
  if (tabsState.items.length <= 1) return;
  const idx = tabsState.items.findIndex((t) => t.id === id);
  if (idx === -1) return;
  tabsState.items.splice(idx, 1);
  if (tabsState.activeId === id) {
    const next = tabsState.items[Math.min(idx, tabsState.items.length - 1)];
    tabsState.activeId = next.id;
    applyActiveTabToEditor();
  }
  renderTabs();
}

const NEW_PROGRAM_TEMPLATE = [
  'O0001 (NUEVO PROGRAMA);',
  'G21 G40 G99;',
  'M03 S800;',
  'G00 X50. Z2.;',
  'M30;',
  '',
].join('\n');

tabsAddBtn.addEventListener('click', () => addTab());

/* Keep the tab label in sync with whatever the editor shows: every code
   change path (typing, ejemplos, cargar archivo) calls renderHighlight(). */
(function hookTabLabelSync() {
  const original = window.renderHighlight;
  let lastLabel = null;
  window.renderHighlight = function () {
    original.apply(this, arguments);
    const label = tabLabel(el.input.value);
    if (label !== lastLabel) {
      lastLabel = label;
      renderTabs();
    }
  };
})();

/* First tab holds whatever the app booted with (DEFAULT_PROGRAM). */
tabsState.items.push({ id: ++tabsState.seq, code: el.input.value, scroll: 0 });
tabsState.activeId = tabsState.seq;
renderTabs();
