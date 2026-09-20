/* ============================================================
   DOM REFERENCES
   ============================================================ */
const el = {
  input: document.getElementById('gcodeInput'),
  highlight: document.getElementById('codeHighlight'),
  lineNumbers: document.getElementById('lineNumbers'),
  logPanel: document.getElementById('logPanel'),
  svg: document.getElementById('mainSvg'),
  dims: document.getElementById('dimsReadout'),
  passHint: document.getElementById('passHint'),
  chkDims: document.getElementById('chkDims'),
  chkAxes: document.getElementById('chkAxes'),
  chkTraces: document.getElementById('chkTraces'),
  chkFill: document.getElementById('chkFill'),
  chkPartZero: document.getElementById('chkPartZero'),
  chkGrid: document.getElementById('chkGrid'),
  chkLightBg: document.getElementById('chkLightBg'),
  chkChuck: document.getElementById('chkChuck'),
  chkBar: document.getElementById('chkBar'),
  chkContourPts: document.getElementById('chkContourPts'),
  viewMenu: document.getElementById('viewMenu'),
  btnViewMenu: document.getElementById('btnViewMenu'),
  roModalG: document.getElementById('roModalG'),
  roX: document.getElementById('roX'),
  roZ: document.getElementById('roZ'),
  roF: document.getElementById('roF'),
  roS: document.getElementById('roS'),
  roT: document.getElementById('roT'),
  ledSpindle: document.getElementById('ledSpindle'),
  spindleTag: document.getElementById('spindleTag'),
  ledCoolant: document.getElementById('ledCoolant'),
  coolantTag: document.getElementById('coolantTag'),
  btnPlay: document.getElementById('btnPlay'),
  btnPause: document.getElementById('btnPause'),
  btnStep: document.getElementById('btnStep'),
  btnStepBack: document.getElementById('btnStepBack'),
  btnReset: document.getElementById('btnReset'),
  btnHome: document.getElementById('btnHome'),
  btnToggleEditor: document.getElementById('btnToggleEditor'),
  btnSaveFile: document.getElementById('btnSaveFile'),
  btnLoadFile: document.getElementById('btnLoadFile'),
  fileLoadInput: document.getElementById('fileLoadInput'),
  examplesMenu: document.getElementById('examplesMenu'),
  btnExamplesMenu: document.getElementById('btnExamplesMenu'),
  examplesDropdown: document.getElementById('examplesDropdown'),
  stage: document.getElementById('stage'),
  drawerBackdrop: document.getElementById('drawerBackdrop'),
  viewport: document.getElementById('viewport'),
  speedSlider: document.getElementById('speedSlider'),
  speedVal: document.getElementById('speedVal'),
  progressBar: document.getElementById('progressBar'),
};

const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs) {
  const e = document.createElementNS(SVG_NS, tag);
  if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

