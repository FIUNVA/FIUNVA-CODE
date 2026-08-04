/* =========================================================================
   Modelo de datos (grafo libre): nodos, resortes, amortiguadores, fuerzas
   ========================================================================= */
var UNITS = {
  trans: { massSym:'M', massUnit:'kg', kUnit:'N/m', bUnit:'N' + String.fromCharCode(183) + 's/m',
    fUnit:'N', pos:'x', posUnit:'m', velVar:"x'", velUnit:'m/s', fSym:'f', wallLabel:'Pared',
    nodeName:'Masa', addNodeLabel:'Masa', addForceLabel:'Fuerza', accelVar:"x''" },
  rot: { massSym:'J', massUnit:'kg' + String.fromCharCode(183) + 'm' + String.fromCharCode(178), kUnit:'N' + String.fromCharCode(183) + 'm/rad',
    bUnit:'N' + String.fromCharCode(183) + 'm' + String.fromCharCode(183) + 's/rad',
    fUnit:'N' + String.fromCharCode(183) + 'm', pos: String.fromCharCode(952), posUnit:'rad',
    velVar: String.fromCharCode(952)+"'", velUnit:'rad/s', fSym:'T', wallLabel:'Soporte fijo',
    nodeName:'Inercia', addNodeLabel:'Inercia', addForceLabel:'Torque', accelVar: String.fromCharCode(952)+"''" },
  pend: { massSym:'m', massUnit:'kg', kUnit:'N' + String.fromCharCode(183) + 'm/rad',
    bUnit:'N' + String.fromCharCode(183) + 'm' + String.fromCharCode(183) + 's/rad',
    fUnit:'N' + String.fromCharCode(183) + 'm', pos: String.fromCharCode(952), posUnit:'rad',
    velVar: String.fromCharCode(952) + "'", velUnit:'rad/s', fSym:'T', wallLabel:'Pivote fijo',
    nodeName:'Eslabon', addNodeLabel:'Eslabon', addForceLabel:'Torque', accelVar: String.fromCharCode(952) + "''" }
};

var idSeq = 1;
function nextId(prefix) { return prefix + (idSeq++); }

var state = {
  mode: 'trans',
  nodes: [],     // {id, isWall, x, y, size, mass, label}
  springs: [],   // {id, k, a, b, x?,y? not needed - endpoints derived from nodes}
  dampers: [],   // {id, b, a, b_node}  -- note: field for damping value is 'val' to avoid clash
  forces: [],    // {id, nodeId, symbol, wave, amp, freq, phase}
  links: [],     // {id, L, mass, b, theta0, omega0, label}  -- solo modo pendulo
  outputNodeId: null,
  outputType: 'pos',
  tfInputForceId: null,
  selected: null,
  pending: null
};

function getNode(id) { for (var i = 0; i < state.nodes.length; i++) if (state.nodes[i].id === id) return state.nodes[i]; return null; }
function getLink(id) { for (var i = 0; i < state.links.length; i++) if (state.links[i].id === id) return state.links[i]; return null; }
function getNodeOrLink(id) { return getNode(id) || getLink(id); }
function realNodes() { return state.nodes.filter(function(n){ return !n.isWall; }); }
function nodeCountByType(isWall) { return state.nodes.filter(function(n){ return n.isWall === isWall; }).length; }

function autoLabel(isWall) {
  var U = UNITS[state.mode];
  if (isWall) return U.wallLabel;
  return U.massSym + (nodeCountByType(false) + 1);
}

function addLink(L, mass, b) {
  var lk = { id: nextId('lk'), L: (L == null ? 1 : L), mass: (mass == null ? 1 : mass),
    b: (b == null ? 0.05 : b), theta0: 0.35, omega0: 0,
    label: String.fromCharCode(952) + (state.links.length + 1) };
  state.links.push(lk);
  if (state.outputNodeId === null) state.outputNodeId = lk.id;
  return lk;
}
function addMassNode(x, y) {
  var n = { id: nextId('n'), isWall: false, x: x, y: y, size: 1, mass: 1, label: autoLabel(false) };
  if (state.mode === 'rot') { n.eccMass = 0; n.eccRadius = 0; n.eccPhase = 0; }
  state.nodes.push(n);
  return n;
}
function addWallNode(x, y) {
  var n = { id: nextId('n'), isWall: true, x: x, y: y, size: 1, mass: 0, label: UNITS[state.mode].wallLabel,
    wallType: 'rect', width: 200, height: 60, points: null };
  if (typeof recomputeRectPoints === 'function') recomputeRectPoints(n);
  state.nodes.push(n);
  return n;
}
function addWallNodeSized(x, y, w, h) {
  var n = addWallNode(x, y);
  n.width = w; n.height = h;
  if (typeof recomputeRectPoints === 'function') recomputeRectPoints(n);
  return n;
}
function addDrumNode(x, y) {
  var n = { id: nextId('n'), isWall: false, x: x, y: y, size: 1, kind: 'drum',
    mass: 8, width: 260, height: 200,
    J: 0.5, eccMass: 0.6, eccRadius: 0.25, omega: 2 * Math.PI * 1.0, phase: 0,
    label: 'Cuadro' + (state.nodes.filter(function(nn){return nn.kind==='drum';}).length + 1) };
  state.nodes.push(n);
  return n;
}

function effectiveInertiaForNode(n) {
  if (!n || n.isWall) return 0.05;
  var base = Math.max(n.mass || 0.05, 0.05);
  if (state.mode === 'rot') {
    var eccMass = Math.max(0, n.eccMass || 0);
    var eccRadius = Math.max(0, n.eccRadius || 0);
    return Math.max(0.05, base + eccMass * eccRadius * eccRadius);
  }
  return base;
}
function addSpring(aId, bId, aAnchor, bAnchor) {
  var s = { id: nextId('sp'), k: 1, a: aId, b: bId, aAnchor: aAnchor || null, bAnchor: bAnchor || null,
    L0: null, Lmin: null, Lmax: null };
  state.springs.push(s);
  if (typeof initLinkRestLength === 'function') initLinkRestLength(s);
  return s;
}
function addDamper(aId, bId, aAnchor, bAnchor) {
  var d = { id: nextId('dp'), val: 0.5, a: aId, b: bId, aAnchor: aAnchor || null, bAnchor: bAnchor || null,
    isFriction: false, L0: null, Lmin: null, Lmax: null };
  state.dampers.push(d);
  if (typeof initLinkRestLength === 'function') initLinkRestLength(d);
  return d;
}
function addForce(nodeId) {
  var U = UNITS[state.mode];
  var f = { id: nextId('f'), nodeId: nodeId, symbol: U.fSym + (state.forces.length + 1) + '(t)', wave: 'step', amp: 1, freq: 0.5, phase: 0 };
  state.forces.push(f);
  if (state.outputNodeId === null) { state.outputNodeId = nodeId; }
  return f;
}
function deleteComponent(type, id) {
  if (type === 'node') {
    state.nodes = state.nodes.filter(function(n){ return n.id !== id; });
    state.springs = state.springs.filter(function(s){ return s.a !== id && s.b !== id; });
    state.dampers = state.dampers.filter(function(d){ return d.a !== id && d.b !== id; });
    state.forces = state.forces.filter(function(f){ return f.nodeId !== id; });
    if (state.outputNodeId === id) {
      var rn = realNodes();
      state.outputNodeId = rn.length ? rn[0].id : null;
    }
  } else if (type === 'link') {
    state.links = state.links.filter(function(l){ return l.id !== id; });
    state.forces = state.forces.filter(function(f){ return f.nodeId !== id; });
    if (state.outputNodeId === id) state.outputNodeId = state.links.length ? state.links[0].id : null;
  } else if (type === 'spring') {
    state.springs = state.springs.filter(function(s){ return s.id !== id; });
  } else if (type === 'damper') {
    state.dampers = state.dampers.filter(function(d){ return d.id !== id; });
  } else if (type === 'force') {
    state.forces = state.forces.filter(function(f){ return f.id !== id; });
    if (state.tfInputForceId === id) state.tfInputForceId = null;
  }
}

function clearAll() {
  state.nodes = []; state.springs = []; state.dampers = []; state.forces = []; state.links = [];
  state.outputNodeId = null; state.outputType = 'pos'; state.tfInputForceId = null;
}

/* =========================================================================
   Guardar / cargar proyecto (JSON) + exportar diagrama
   ========================================================================= */
function recomputeIdSeq() {
  var maxNum = 0;
  state.nodes.concat(state.springs, state.dampers, state.forces, state.links).forEach(function(o) {
    var m = /(\d+)$/.exec(o.id);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
  });
  idSeq = maxNum + 1;
}
function projectSnapshotObj() {
  return {
    mechlabVersion: 2,
    mode: state.mode,
    nodes: state.nodes, springs: state.springs, dampers: state.dampers, forces: state.forces,
    links: state.links,
    outputNodeId: state.outputNodeId, outputType: state.outputType, tfInputForceId: state.tfInputForceId
  };
}
function downloadTextFile(filename, text, mime) {
  var blob = new Blob([text], { type: mime || 'text/plain' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
}
function saveProjectToFile() {
  var data = JSON.stringify(projectSnapshotObj(), null, 2);
  var ts = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
  downloadTextFile('mechlab-' + ts + '.json', data, 'application/json');
}
function applyProjectObj(obj) {
  if (!obj || !obj.nodes) return false;
  state.mode = (obj.mode === 'rot' || obj.mode === 'pend') ? obj.mode : 'trans';
  state.nodes = obj.nodes || [];
  state.springs = obj.springs || [];
  state.dampers = obj.dampers || [];
  state.forces = obj.forces || [];
  state.links = obj.links || [];
  // Compat: purga fuerzas auto-generadas de drums de proyectos antiguos.
  state.forces = state.forces.filter(function(f) { return !f.isDrumForce; });
  // Compat: rehidrata L0/Lmin/Lmax si el proyecto es previo a esta version.
  if (typeof initLinkRestLength === 'function') {
    state.springs.forEach(initLinkRestLength);
    state.dampers.forEach(initLinkRestLength);
  }
  state.outputNodeId = obj.outputNodeId || null;
  state.outputType = obj.outputType === 'vel' ? 'vel' : 'pos';
  state.tfInputForceId = obj.tfInputForceId || null;
  state.selected = null; state.pending = null;
  recomputeIdSeq();
  return true;
}
function loadProjectFromFile(file) {
  var reader = new FileReader();
  reader.onload = function() {
    try {
      var obj = JSON.parse(reader.result);
      if (!applyProjectObj(obj)) { alert('El archivo no tiene un formato de proyecto MECHLAB valido.'); return; }
      closePopover();
      syncModeButtons(); updateModeLabels();
      ssForm = 'phys';
      resetView();
      updateAutoFriction(); updateAutoDrumForces();
      renderCanvas(); renderResults(); simReset();
      undoStack = []; redoStack = []; updateUndoRedoButtons();
    } catch (err) {
      alert('No se pudo leer el archivo: formato JSON invalido.');
    }
  };
  reader.readAsText(file);
}
function exportDiagramPNG() {
  var svgEl = document.getElementById('workSvg');
  var clone = svgEl.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(view.w));
  clone.setAttribute('height', String(view.h));
  var COLOR_MAP = {
    '--c-mass': '#5fc0dd', '--c-mass-dim': 'rgba(95,192,221,0.16)',
    '--c-wall': '#9fb0c2', '--c-wall-dim': 'rgba(159,176,194,0.16)',
    '--c-spring': '#6fcf97', '--c-damper': '#b58cf2', '--c-force': '#f2a154',
    '--ink': '#e4eef5', '--ink-dim': '#87a2b8', '--ink-faint': '#4f6478',
    '--edge': '#1d3b58', '--edge-soft': 'rgba(87,184,214,0.18)',
    '--panel': '#0f2036', '--panel-2': '#122a46', '--panel-3': '#0d1f34',
    '--bg-grid': '#0c1826', '--red': '#e8637a', '--green': '#6fcf97'
  };
  var svgStr = new XMLSerializer().serializeToString(clone);
  svgStr = svgStr.replace(/var\((--[a-zA-Z0-9-]+)\)/g, function(m, name) { return COLOR_MAP[name] || '#ffffff'; });
  svgStr = svgStr.replace(/(<svg[^>]*>)/, '$1<rect x="' + view.x + '" y="' + view.y + '" width="' + view.w + '" height="' + view.h + '" fill="#0c1826"/>');
  var blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var img = new Image();
  img.onload = function() {
    var scaleFactor = 2;
    var canvas = document.createElement('canvas');
    canvas.width = view.w * scaleFactor; canvas.height = view.h * scaleFactor;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    canvas.toBlob(function(pngBlob) {
      var pngUrl = URL.createObjectURL(pngBlob);
      var a = document.createElement('a');
      a.href = pngUrl; a.download = 'mechlab-diagrama.png';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function() { URL.revokeObjectURL(pngUrl); }, 1000);
    });
  };
  img.onerror = function() { alert('No se pudo generar la imagen. Intenta de nuevo.'); URL.revokeObjectURL(url); };
  img.src = url;
}

/* =========================================================================
   Deshacer / rehacer
   ========================================================================= */
var undoStack = [], redoStack = [];
var UNDO_LIMIT = 60;
function snapshotStateJSON() { return JSON.stringify(projectSnapshotObj()); }
function pushUndo() {
  undoStack.push(snapshotStateJSON());
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  redoStack = [];
  updateUndoRedoButtons();
}
function restoreFromJSON(json) {
  var obj = JSON.parse(json);
  applyProjectObj(obj);
  closePopover();
  syncModeButtons(); updateModeLabels();
  renderCanvas(); renderResults(); simReset();
}
function doUndo() {
  if (!undoStack.length) return;
  redoStack.push(snapshotStateJSON());
  var snap = undoStack.pop();
  restoreFromJSON(snap);
  updateUndoRedoButtons();
}
function doRedo() {
  if (!redoStack.length) return;
  undoStack.push(snapshotStateJSON());
  var snap = redoStack.pop();
  restoreFromJSON(snap);
  updateUndoRedoButtons();
}
function updateUndoRedoButtons() {
  var ub = document.getElementById('undoBtn'), rb = document.getElementById('redoBtn');
  if (ub) ub.disabled = undoStack.length === 0;
  if (rb) rb.disabled = redoStack.length === 0;
}

var ANCH_TOP = { edge: 0, t: 0.5 }, ANCH_RIGHT = { edge: 1, t: 0.5 }, ANCH_BOTTOM = { edge: 2, t: 0.5 }, ANCH_LEFT = { edge: 3, t: 0.5 };

function resetSystem(mode) {
  state.mode = mode || state.mode;
  clearAll();
  if (state.mode === 'pend') {
    var lk = addLink(1.2, 1, 0.05);
    lk.theta0 = 0.5;
    state.outputNodeId = lk.id; state.outputType = 'pos';
    simReset && simReset();
    return;
  }
  var n1 = addMassNode(500, 400);
  var n2 = addMassNode(820, 400);
  var w1 = addWallNodeSized(160, 400, 60, 260);
  if (state.mode === 'rot') { n1.eccMass = 1; n1.eccRadius = 0.35; n2.eccMass = 1; n2.eccRadius = 0.35; }
  addSpring(w1.id, n1.id, null, ANCH_LEFT).k = 2;
  addDamper(w1.id, n1.id, null, ANCH_LEFT).val = 0.5;
  addSpring(n1.id, n2.id, ANCH_RIGHT, ANCH_LEFT).k = 1;
  addDamper(n1.id, n2.id, ANCH_RIGHT, ANCH_LEFT).val = 0.2;
  var f = addForce(n2.id);
  f.amp = 1; f.wave = 'step';
  state.outputNodeId = n2.id; state.outputType = 'pos';
  simReset();
}

var PRESETS = {
  trans_single: { mode:'trans', label:'Traslacional - masa simple amortiguada', build:function(){
    clearAll();
    var w = addWallNodeSized(200, 400, 60, 260), m1 = addMassNode(620, 400);
    addSpring(w.id, m1.id, null, ANCH_LEFT).k = 2; addDamper(w.id, m1.id, null, ANCH_LEFT).val = 0.8;
    var f = addForce(m1.id); f.amp = 1; f.wave = 'step';
    state.outputNodeId = m1.id; state.outputType = 'pos';
  }},
  trans_chain2: { mode:'trans', label:'Traslacional - cadena de 2 masas', build:function(){ resetSystem('trans'); }},
  trans_chain3: { mode:'trans', label:'Traslacional - cadena de 3 masas (2 paredes)', build:function(){
    clearAll();
    var w1 = addWallNodeSized(80, 400, 60, 280), m1 = addMassNode(400, 400), m2 = addMassNode(680, 400), m3 = addMassNode(960, 400), w2 = addWallNodeSized(1280, 400, 60, 280);
    addSpring(w1.id, m1.id, null, ANCH_LEFT).k = 1;
    addSpring(m1.id, m2.id, ANCH_RIGHT, ANCH_LEFT).k = 1; addDamper(m1.id, m2.id, ANCH_RIGHT, ANCH_LEFT).val = 0.3;
    addSpring(m2.id, m3.id, ANCH_RIGHT, ANCH_LEFT).k = 1; addDamper(m2.id, m3.id, ANCH_RIGHT, ANCH_LEFT).val = 0.3;
    addSpring(m3.id, w2.id, ANCH_RIGHT, null).k = 1;
    m2.mass = 2;
    var f = addForce(m2.id); f.wave = 'sine'; f.amp = 2; f.freq = 0.4;
    state.outputNodeId = m3.id; state.outputType = 'pos';
  }},
  trans_star: { mode:'trans', label:'Traslacional - una masa central con tres ramas', build:function(){
    clearAll();
    var c = addMassNode(680, 440), a = addMassNode(360, 440), b = addMassNode(680, 720), w = addWallNodeSized(1040, 440, 60, 220);
    addSpring(c.id, a.id, ANCH_LEFT, ANCH_RIGHT).k = 2; addDamper(c.id, a.id, ANCH_LEFT, ANCH_RIGHT).val = 0.3;
    addSpring(c.id, b.id, ANCH_BOTTOM, ANCH_TOP).k = 3;
    addSpring(c.id, w.id, ANCH_RIGHT, null).k = 1;
    var f = addForce(c.id); f.wave = 'step'; f.amp = 1.5;
    state.outputNodeId = a.id; state.outputType = 'pos';
  }},
  rot_single: { mode:'rot', label:'Rotacional - inercia simple con friccion', build:function(){
    clearAll();
    var w = addWallNodeSized(200, 400, 60, 260), j1 = addMassNode(620, 400);
    j1.eccMass = 1; j1.eccRadius = 0.35;
    addSpring(w.id, j1.id).k = 1; addDamper(w.id, j1.id).val = 1;
    var f = addForce(j1.id); f.amp = 1; f.wave = 'step';
    state.outputNodeId = j1.id; state.outputType = 'pos';
  }},
  rot_chain2: { mode:'rot', label:'Rotacional - cadena de 2 inercias', build:function(){
    clearAll();
    var j1 = addMassNode(400, 400), j2 = addMassNode(720, 400), w = addWallNodeSized(1040, 400, 60, 260);
    j1.eccMass = 1; j1.eccRadius = 0.35;
    j2.eccMass = 1; j2.eccRadius = 0.35;
    addSpring(j1.id, j2.id).k = 1; addDamper(j1.id, j2.id).val = 1;
    addDamper(j2.id, w.id).val = 1;
    var f = addForce(j1.id); f.amp = 1; f.wave = 'step';
    state.outputNodeId = j2.id; state.outputType = 'pos';
  }},
  wash_machine: { mode:'trans', label:'Traslacional - Lavadora (cuadro con excentrica)', build:function(){
    clearAll();
    var wl = addWallNodeSized(200, 500, 60, 460);
    var wr = addWallNodeSized(1200, 500, 60, 460);
    var wb = addWallNodeSized(700, 820, 900, 60);
    var drum = addDrumNode(700, 500);
    drum.mass = 8; drum.eccMass = 0.6; drum.eccRadius = 0.25; drum.omega = 2 * Math.PI * 1.2; drum.phase = 0;
    addSpring(wl.id, drum.id, null, ANCH_LEFT).k = 4;
    addDamper(wl.id, drum.id, null, ANCH_LEFT).val = 0.6;
    addSpring(wr.id, drum.id, null, ANCH_RIGHT).k = 4;
    addDamper(wr.id, drum.id, null, ANCH_RIGHT).val = 0.6;
    addSpring(wb.id, drum.id, null, ANCH_BOTTOM).k = 5;
    addDamper(wb.id, drum.id, null, ANCH_BOTTOM).val = 0.7;
    state.outputNodeId = drum.id; state.outputType = 'pos';
  }},
  pend_simple: { mode:'pend', label:'Pendulo - simple (1 eslabon)', build:function(){
    clearAll();
    var l1 = addLink(1.2, 1, 0.05); l1.theta0 = 0.5;
    state.outputNodeId = l1.id; state.outputType = 'pos';
  }},
  pend_double: { mode:'pend', label:'Pendulo - doble (2 eslabones)', build:function(){
    clearAll();
    var l1 = addLink(1.0, 1, 0.02); l1.theta0 = 0.6;
    var l2 = addLink(0.8, 0.7, 0.02); l2.theta0 = -0.3;
    state.outputNodeId = l2.id; state.outputType = 'pos';
  }},
  pend_triple: { mode:'pend', label:'Pendulo - triple (3 eslabones)', build:function(){
    clearAll();
    var l1 = addLink(0.9, 1, 0.02); l1.theta0 = 0.4;
    var l2 = addLink(0.7, 0.7, 0.02); l2.theta0 = -0.2;
    var l3 = addLink(0.5, 0.5, 0.02); l3.theta0 = 0.1;
    state.outputNodeId = l3.id; state.outputType = 'pos';
  }},
  pend_quad: { mode:'pend', label:'Pendulo - cuadruple (4 eslabones)', build:function(){
    clearAll();
    var l1 = addLink(0.9, 1, 0.02); l1.theta0 = 0.4;
    var l2 = addLink(0.7, 0.8, 0.02); l2.theta0 = -0.2;
    var l3 = addLink(0.6, 0.6, 0.02); l3.theta0 = 0.15;
    var l4 = addLink(0.5, 0.4, 0.02); l4.theta0 = -0.1;
    state.outputNodeId = l4.id; state.outputType = 'pos';
  }},
  pend_forced: { mode:'pend', label:'Pendulo - simple forzado (torque senoidal)', build:function(){
    clearAll();
    var l1 = addLink(1.0, 1, 0.15); l1.theta0 = 0;
    var f = addForce(l1.id); f.wave = 'sine'; f.amp = 3; f.freq = 0.5;
    state.outputNodeId = l1.id; state.outputType = 'pos';
  }}
};
