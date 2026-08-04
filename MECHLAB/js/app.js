var BASE_W = 1400, BASE_H = 900, VIEW_ASPECT = BASE_W / BASE_H;
var GRID_SIZE = 40;
function snapToGrid(pt) { return { x: Math.round(pt.x / GRID_SIZE) * GRID_SIZE, y: Math.round(pt.y / GRID_SIZE) * GRID_SIZE }; }
var view = { x: 0, y: 0, w: BASE_W, h: BASE_H };
function applyViewBox() {
  document.getElementById('workSvg').setAttribute('viewBox', view.x + ' ' + view.y + ' ' + view.w + ' ' + view.h);
}
function clientToSvgPoint(clientX, clientY) {
  var rect = document.getElementById('workSvg').getBoundingClientRect();
  var relX = (clientX - rect.left) / rect.width, relY = (clientY - rect.top) / rect.height;
  return { x: view.x + relX * view.w, y: view.y + relY * view.h };
}
function onCanvasWheel(e) {
  e.preventDefault();
  var rect = document.getElementById('workSvg').getBoundingClientRect();
  var relX = (e.clientX - rect.left) / rect.width, relY = (e.clientY - rect.top) / rect.height;
  var pxBefore = view.x + relX * view.w, pyBefore = view.y + relY * view.h;
  var factor = e.deltaY > 0 ? 1.12 : (1 / 1.12);
  var newW = Math.max(260, Math.min(4200, view.w * factor));
  var newH = newW / VIEW_ASPECT;
  view.x = pxBefore - relX * newW;
  view.y = pyBefore - relY * newH;
  view.w = newW; view.h = newH;
  applyViewBox();
}
function resetView() { view.x = 0; view.y = 0; view.w = BASE_W; view.h = BASE_H; applyViewBox(); }

function svgScale() {
  var rect = document.getElementById('workSvg').getBoundingClientRect();
  return { sx: view.w / rect.width, sy: view.h / rect.height };
}
function defaultPlacement() {
  var count = state.nodes.length;
  var col = count % 5, row = Math.floor(count / 5);
  var cx = view.x + view.w / 2, cy = view.y + view.h / 2;
  return { x: cx - 220 + col * 180, y: cy - 120 + row * 160 };
}
function updateHintBar(text, active) {
  var hb = document.getElementById('hintBar');
  hb.classList.toggle('active', !!active);
  hb.innerHTML = '<span class="pill">' + text + '</span>';
}
function defaultHintText() { return 'Arrastra para mover' + String.fromCharCode(183) + ' doble clic para configurar'; }

function startPending(type) {
  if (state.pending && state.pending.type === type) { cancelPending(); return; }
  state.pending = { type: type, first: null };
  Object.keys(PALETTE_BTN_IDS).forEach(function(k) { document.getElementById(PALETTE_BTN_IDS[k]).classList.toggle('active', k === type); });
  var U = UNITS[state.mode];
  var target = state.mode === 'pend' ? 'eslabon' : U.nodeName.toLowerCase();
  var msg = (type === 'force') ? ('Selecciona el ' + target + ' donde aplicar el ' + (U.fSym === 'f' ? 'fuerza' : 'torque')) : 'Selecciona el primer elemento a conectar';
  updateHintBar(msg, true);
  state.selected = null;
  renderCanvas();
}
function cancelPending() {
  state.pending = null;
  Object.keys(PALETTE_BTN_IDS).forEach(function(k) { document.getElementById(PALETTE_BTN_IDS[k]).classList.remove('active'); });
  updateHintBar(defaultHintText(), false);
  state.selected = null;
  renderCanvas();
}

function handleComponentPick(type, id, clientX, clientY) {
  if (state.pending.type === 'force') {
    if (type === 'link') {
      pushUndo();
      var f2 = addForce(id);
      cancelPending();
      renderCanvas(); renderResults();
      openPopover('force', f2.id, clientX, clientY);
      return;
    }
    if (type !== 'node') return;
    var n = getNode(id);
    if (n.isWall) { updateHintBar('Selecciona una masa/inercia, no una pared', true); return; }
    pushUndo();
    var f = addForce(id);
    cancelPending();
    renderCanvas(); renderResults();
    openPopover('force', f.id, clientX, clientY);
    return;
  }
  if (type !== 'node') return;
  if (state.pending.first === null) {
    state.pending.first = id;
    state.pending.firstClickPos = clientToSvgPoint(clientX, clientY);
    state.selected = { type: 'node', id: id };
    updateHintBar('Selecciona el segundo elemento (Esc para cancelar)', true);
    renderCanvas();
    return;
  }
  if (id === state.pending.first) return;
  var firstNode = getNode(state.pending.first), secondNode = getNode(id);
  var aAnchor = null, bAnchor = null;
  if (firstNode && nodeHasBoundaryShape(firstNode)) {
    var nearA = nearestPointOnShape(firstNode, state.pending.firstClickPos);
    if (nearA) aAnchor = { edge: nearA.edge, t: nearA.t };
  }
  if (secondNode && nodeHasBoundaryShape(secondNode)) {
    var clickPos2 = clientToSvgPoint(clientX, clientY);
    var nearB = nearestPointOnShape(secondNode, clickPos2);
    if (nearB) bAnchor = { edge: nearB.edge, t: nearB.t };
  }
  pushUndo();
  var link = (state.pending.type === 'spring') ? addSpring(state.pending.first, id, aAnchor, bAnchor) : addDamper(state.pending.first, id, aAnchor, bAnchor);
  var linkType = state.pending.type;
  cancelPending();
  renderCanvas(); renderResults();
  openPopover(linkType, link.id, clientX, clientY);
}

function onSvgMouseDown(e) {
  if (state.pending) return;
  if (e.button !== undefined && e.button !== 0) return;
  if (e.target.closest('[data-role="delete"]')) return;
  var endpointTarget = e.target.closest('[data-role="endpoint"]');
  if (endpointTarget) {
    var lk = endpointTarget.getAttribute('data-link-kind'), lid = endpointTarget.getAttribute('data-link-id'), end = endpointTarget.getAttribute('data-end');
    var link = (lk === 'spring' ? state.springs : state.dampers).find(function(x) { return x.id === lid; });
    if (!link) return;
    var otherNodeId = end === 'a' ? link.b : link.a;
    var otherAnchor = end === 'a' ? link.bAnchor : link.aAnchor;
    var otherNode = getNode(otherNodeId);
    if (!otherNode) return;
    var fixedPt = otherAnchor ? anchorWorldPoint(otherNode, otherAnchor) : { x: otherNode.x, y: otherNode.y };
    var startPt = clientToSvgPoint(e.clientX, e.clientY);
    dragState = { mode: 'reattach', linkKind: lk, linkId: lid, end: end, otherNodeId: otherNodeId, startClientX: e.clientX, startClientY: e.clientY, moved: false };
    reattachPreview = { fixedX: fixedPt.x, fixedY: fixedPt.y, curX: startPt.x, curY: startPt.y, candidateId: null };
    e.preventDefault();
    return;
  }
  var resizeTarget = e.target.closest('[data-role="resize"]');
  if (resizeTarget) {
    var g = e.target.closest('.comp');
    var id = g.getAttribute('data-comp-id');
    var n = getNode(id);
    if (!n) return;
    dragState = { mode: 'resize', nodeId: id, startClientX: e.clientX, startClientY: e.clientY, startSize: n.size, startW: n.width, startH: n.height, moved: false };
    e.preventDefault();
    return;
  }
  var compTarget = e.target.closest('.comp[data-comp-type="node"]');
  if (compTarget) {
    var id2 = compTarget.getAttribute('data-comp-id');
    var n2 = getNode(id2);
    if (!n2) return;
    dragState = { mode: 'move', nodeId: id2, startClientX: e.clientX, startClientY: e.clientY, lastClientX: e.clientX, lastClientY: e.clientY, startNodeX: n2.x, startNodeY: n2.y, moved: false };
    e.preventDefault();
    return;
  }
  if (e.target.closest('.comp')) return;
  dragState = { mode: 'pan', startClientX: e.clientX, startClientY: e.clientY, startViewX: view.x, startViewY: view.y, moved: false };
  e.preventDefault();
}
function onWindowMouseMove(e) {
  if (!dragState) return;
  var scale = svgScale();
  var dxPix = e.clientX - dragState.startClientX, dyPix = e.clientY - dragState.startClientY;
  if ((Math.abs(dxPix) > 3 || Math.abs(dyPix) > 3) && !dragState.moved) {
    dragState.moved = true;
    if (dragState.mode === 'move' || dragState.mode === 'resize' || dragState.mode === 'reattach') pushUndo();
  }
  if (!dragState.moved) return;
  if (dragState.mode === 'move') {
    var n = getNode(dragState.nodeId); if (!n) return;
    var incDx = e.clientX - dragState.lastClientX, incDy = e.clientY - dragState.lastClientY;
    dragState.lastClientX = e.clientX; dragState.lastClientY = e.clientY;
    n.x = Math.max(-6000, Math.min(6000, n.x + incDx * scale.sx));
    n.y = Math.max(-6000, Math.min(6000, n.y + incDy * scale.sy));
    if (n.isWall) {
      state.nodes.forEach(function(mn) { if (!mn.isWall) resolveWallCollisions(mn); });
    } else {
      resolveWallCollisions(n);
    }
    updateAutoFriction(); updateAutoDrumForces();
    renderCanvas();
  } else if (dragState.mode === 'resize') {
    var n2 = getNode(dragState.nodeId); if (!n2) return;
    if (n2.isWall && (n2.wallType === 'rect')) {
      var dW = dxPix * scale.sx * 2, dH = dyPix * scale.sy * 2;
      n2.width = Math.max(40, dragState.startW + dW);
      n2.height = Math.max(24, dragState.startH + dH);
      recomputeRectPoints(n2);
      state.nodes.forEach(function(mn) { if (!mn.isWall) resolveWallCollisions(mn); });
      updateAutoFriction(); updateAutoDrumForces();
    } else if (n2.kind === 'drum') {
      var dWd = dxPix * scale.sx * 2, dHd = dyPix * scale.sy * 2;
      n2.width = Math.max(80, dragState.startW + dWd);
      n2.height = Math.max(60, dragState.startH + dHd);
      updateAutoFriction(); updateAutoDrumForces();
    } else {
      var deltaMag = ((dxPix + dyPix) / 2) * scale.sx;
      n2.size = Math.max(0.4, Math.min(3, dragState.startSize + deltaMag / 60));
    }
    renderCanvas();
  } else if (dragState.mode === 'pan') {
    view.x = dragState.startViewX - dxPix * scale.sx;
    view.y = dragState.startViewY - dyPix * scale.sy;
    applyViewBox();
  } else if (dragState.mode === 'reattach') {
    var pt = clientToSvgPoint(e.clientX, e.clientY);
    reattachPreview.curX = pt.x; reattachPreview.curY = pt.y;
    var candidate = findNodeNear(pt);
    reattachPreview.candidateId = (candidate && candidate.id !== dragState.otherNodeId) ? candidate.id : null;
    renderCanvas();
  }
}
function onWindowMouseUp(e) {
  if (dragState && dragState.mode === 'reattach') {
    if (dragState.moved) {
      var pt = clientToSvgPoint(e.clientX, e.clientY);
      var target = findNodeNear(pt);
      if (target && target.id !== dragState.otherNodeId) {
        var link = (dragState.linkKind === 'spring' ? state.springs : state.dampers).find(function(x) { return x.id === dragState.linkId; });
        if (link) {
          var near = nodeHasBoundaryShape(target) ? nearestPointOnShape(target, pt) : null;
          var anchor = near ? { edge: near.edge, t: near.t } : null;
          if (dragState.end === 'a') { link.a = target.id; link.aAnchor = anchor; }
          else { link.b = target.id; link.bAnchor = anchor; }
        }
      }
      renderResults();
    }
    reattachPreview = null;
    justDragged = true;
    setTimeout(function() { justDragged = false; }, 0);
    dragState = null;
    renderCanvas();
    return;
  }
  if (dragState && dragState.moved) {
    justDragged = true;
    setTimeout(function() { justDragged = false; }, 0);
  }
  dragState = null;
}
function onSvgClick(e) {
  if (justDragged) { justDragged = false; return; }
  if (state.pending && state.pending.type === 'trace-poly') {
    var pt = snapToGrid(clientToSvgPoint(e.clientX, e.clientY));
    var pts = state.pending.points;
    if (pts.length >= 3) {
      var first = pts[0];
      var closeThreshold = 16 * svgScale().sx;
      if (Math.hypot(pt.x - first.x, pt.y - first.y) < closeThreshold) { finishTracePoly(); return; }
    }
    pts.push(pt);
    renderCanvas();
    return;
  }
  var delTarget = e.target.closest('[data-role="delete"]');
  if (delTarget) {
    var dtype = delTarget.getAttribute('data-comp-type'), did = delTarget.getAttribute('data-comp-id');
    var wasOpenForThis = openPopoverInfo && openPopoverInfo.type === dtype && openPopoverInfo.id === did;
    pushUndo();
    deleteComponent(dtype, did);
    if (wasOpenForThis) closePopover(); else { state.selected = null; renderCanvas(); }
    renderResults();
    return;
  }
  var compTarget = e.target.closest('.comp[data-comp-type]');
  if (state.pending) {
    if (compTarget) handleComponentPick(compTarget.getAttribute('data-comp-type'), compTarget.getAttribute('data-comp-id'), e.clientX, e.clientY);
    else cancelPending();
    return;
  }
  if (compTarget) {
    var ctype = compTarget.getAttribute('data-comp-type'), cid = compTarget.getAttribute('data-comp-id');
    var now = Date.now();
    var key = ctype + ':' + cid;
    if (lastClickKey === key && (now - lastClickTime) < 420) {
      lastClickKey = null; lastClickTime = 0;
      openPopover(ctype, cid, e.clientX, e.clientY);
      return;
    }
    lastClickKey = key; lastClickTime = now;
    state.selected = { type: ctype, id: cid };
    renderCanvas();
  } else if (state.selected) {
    state.selected = null;
    renderCanvas();
  }
}
function onSvgDblClick(e) {
  if (state.pending && state.pending.type === 'trace-poly') { finishTracePoly(); return; }
  if (state.pending) return;
  var compTarget = e.target.closest('.comp[data-comp-type]');
  if (!compTarget) return;
  openPopover(compTarget.getAttribute('data-comp-type'), compTarget.getAttribute('data-comp-id'), e.clientX, e.clientY);
}

/* =========================================================================
   Cableado de eventos + inicializacion
   ========================================================================= */
function updateModeLabels() {
  var U = UNITS[state.mode];
  document.getElementById('addMassLabel').textContent = U.addNodeLabel;
  document.getElementById('addForceLabel').textContent = U.addForceLabel;
  document.getElementById('legendMass').textContent = U.nodeName;
  document.getElementById('legendForce').textContent = U.addForceLabel;
  var isPend = state.mode === 'pend';
  var byId = function(id) { return document.getElementById(id); };
  var toggle = function(id, show) { var el = byId(id); if (el) el.style.display = show ? '' : 'none'; };
  toggle('addMassBtn', !isPend);
  toggle('addWallBtn', !isPend);
  toggle('addSpringBtn', !isPend);
  toggle('addDamperBtn', !isPend);
  toggle('addLinkBtn', isPend);
  toggle('addDrumBtn', state.mode === 'trans');
  // Pestana "Fase" solo en modo pendulo
  var phaseTabBtn = document.querySelector('.tabs button[data-tab="phase"]');
  if (phaseTabBtn) phaseTabBtn.style.display = isPend ? '' : 'none';
  // La leyenda inferior de tipos: en pendulo mostramos solo lo relevante
  var legendStrip = document.querySelector('.legend-strip');
  if (legendStrip) legendStrip.style.display = isPend ? 'none' : '';
}
function syncModeButtons() {
  document.querySelectorAll('#modeSwitch button').forEach(function(b) { b.classList.toggle('active', b.dataset.mode === state.mode); });
}

function wirePopoverLayer() {
  var layer = document.getElementById('popoverLayer');
  layer.addEventListener('input', function(e) {
    var t = e.target;
    if (!t.dataset.pf || !openPopoverInfo) return;
    applyPopoverField(openPopoverInfo.type, openPopoverInfo.id, t.dataset.pf, t.value);
    renderCanvas(); renderResults();
  });
  layer.addEventListener('change', function(e) {
    var t = e.target;
    if (!t.dataset.pf || !openPopoverInfo) return;
    applyPopoverField(openPopoverInfo.type, openPopoverInfo.id, t.dataset.pf, t.value);
    renderCanvas(); renderResults();
  });
  layer.addEventListener('click', function(e) {
    if (e.target.id === 'popoverCloseX') { closePopover(); return; }
    if (e.target.id === 'retraceBtn' && openPopoverInfo) {
      var wallId = openPopoverInfo.id;
      closePopover();
      pushUndo();
      startTracePoly(wallId);
      return;
    }
    if (e.target.id === 'popoverDeleteBtn' && openPopoverInfo) {
      pushUndo();
      deleteComponent(openPopoverInfo.type, openPopoverInfo.id);
      closePopover();
      renderResults();
      return;
    }
  });
}

function wireCanvas() {
  var svg = document.getElementById('workSvg');
  svg.addEventListener('mousedown', onSvgMouseDown);
  window.addEventListener('mousemove', onWindowMouseMove);
  window.addEventListener('mouseup', onWindowMouseUp);
  svg.addEventListener('click', onSvgClick);
  svg.addEventListener('dblclick', onSvgDblClick);
  document.getElementById('canvasWrap').addEventListener('wheel', onCanvasWheel, { passive: false });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { if (graphViewerState.open) closeGraphViewer(); if (state.pending) cancelPending(); if (openPopoverInfo) closePopover(); }
    if (e.key === 'Enter' && state.pending && state.pending.type === 'trace-poly') finishTracePoly();

    var tag = document.activeElement ? document.activeElement.tagName : '';
    var typing = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';

    if ((e.ctrlKey || e.metaKey) && !typing) {
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        if (e.shiftKey) doRedo(); else doUndo();
        return;
      }
      if (e.key === 'y' || e.key === 'Y') { e.preventDefault(); doRedo(); return; }
    }
    if (typing) return;

    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selected) {
      e.preventDefault();
      pushUndo();
      var wasOpen = openPopoverInfo && openPopoverInfo.type === state.selected.type && openPopoverInfo.id === state.selected.id;
      deleteComponent(state.selected.type, state.selected.id);
      if (wasOpen) closePopover(); else { state.selected = null; renderCanvas(); }
      renderResults();
      return;
    }
    if (state.selected && state.selected.type === 'node' && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      var n = getNode(state.selected.id);
      if (!n) return;
      pushUndo();
      var step = e.shiftKey ? GRID_SIZE : GRID_SIZE / 4;
      if (e.key === 'ArrowUp') n.y -= step;
      if (e.key === 'ArrowDown') n.y += step;
      if (e.key === 'ArrowLeft') n.x -= step;
      if (e.key === 'ArrowRight') n.x += step;
      if (n.isWall) { state.nodes.forEach(function(mn) { if (!mn.isWall) resolveWallCollisions(mn); }); }
      else { resolveWallCollisions(n); }
      updateAutoFriction(); updateAutoDrumForces();
      renderCanvas();
    }
  });
  document.addEventListener('mousedown', function(e) {
    if (openPopoverInfo) {
      var box = document.getElementById('popoverBox');
      if (box && !box.contains(e.target)) closePopover();
    }
  });
}

function wirePalette() {
  document.getElementById('addMassBtn').addEventListener('click', function() {
    pushUndo();
    var p = defaultPlacement();
    addMassNode(p.x, p.y);
    updateAutoFriction(); updateAutoDrumForces();
    renderCanvas(); renderResults();
  });
  document.getElementById('addWallBtn').addEventListener('click', function() {
    pushUndo();
    var p = defaultPlacement();
    addWallNode(p.x, p.y);
    updateAutoFriction(); updateAutoDrumForces();
    renderCanvas(); renderResults();
  });
  document.getElementById('addSpringBtn').addEventListener('click', function() { startPending('spring'); });
  document.getElementById('addDamperBtn').addEventListener('click', function() { startPending('damper'); });
  document.getElementById('addForceBtn').addEventListener('click', function() { startPending('force'); });
  var db = document.getElementById('addDrumBtn');
  if (db) db.addEventListener('click', function() {
    pushUndo();
    var p = defaultPlacement();
    addDrumNode(p.x, p.y);
    updateAutoFriction(); updateAutoDrumForces();
    updateAutoDrumForces();
    renderCanvas(); renderResults();
  });
  var lb = document.getElementById('addLinkBtn');
  if (lb) lb.addEventListener('click', function() {
    pushUndo();
    addLink();
    renderCanvas(); renderResults(); simReset();
  });
}

function wireTopbar() {
  var modeBtns = document.querySelectorAll('#modeSwitch button');
  modeBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      if (btn.classList.contains('active')) return;
      pushUndo();
      resetSystem(btn.dataset.mode);
      syncModeButtons(); updateModeLabels();
      ssForm = 'phys';
      resetView();
      updateAutoFriction(); updateAutoDrumForces();
      renderCanvas(); renderResults();
      document.getElementById('presetSelect').value = '';
    });
  });
  document.getElementById('resetAllBtn').addEventListener('click', function() {
    pushUndo();
    resetSystem(state.mode);
    syncModeButtons(); updateModeLabels();
    resetView();
    updateAutoFriction(); updateAutoDrumForces();
    renderCanvas(); renderResults();
    document.getElementById('presetSelect').value = '';
  });
  var presetSelect = document.getElementById('presetSelect');
  Object.keys(PRESETS).forEach(function(key) {
    var opt = document.createElement('option');
    opt.value = key; opt.textContent = PRESETS[key].label;
    presetSelect.appendChild(opt);
  });
  presetSelect.addEventListener('change', function() {
    var key = presetSelect.value;
    if (!key) return;
    pushUndo();
    state.mode = PRESETS[key].mode;
    PRESETS[key].build();
    syncModeButtons(); updateModeLabels();
    ssForm = 'phys';
    resetView();
    updateAutoFriction(); updateAutoDrumForces();
    renderCanvas(); renderResults(); simReset();
  });
  document.getElementById('undoBtn').addEventListener('click', doUndo);
  document.getElementById('redoBtn').addEventListener('click', doRedo);
  document.getElementById('saveBtn').addEventListener('click', saveProjectToFile);
  document.getElementById('loadBtn').addEventListener('click', function() {
    document.getElementById('loadFileInput').click();
  });
  document.getElementById('loadFileInput').addEventListener('change', function(e) {
    var file = e.target.files && e.target.files[0];
    if (file) loadProjectFromFile(file);
    e.target.value = '';
  });
  document.getElementById('exportPngBtn').addEventListener('click', exportDiagramPNG);
  document.getElementById('analysisToggleBtn').addEventListener('click', function() {
    document.getElementById('drawer').classList.toggle('open');
  });
  document.getElementById('drawerCloseBtn').addEventListener('click', function() {
    document.getElementById('drawer').classList.remove('open');
  });
}

var graphViewerState = {
  open: false,
  sourceId: null,
  title: '',
  dragging: false,
  dragX: 0,
  dragY: 0,
  windows: {},
  minimized: false
};
function graphViewerEl() { return document.getElementById('graphViewer'); }
function graphViewerShell() { return document.getElementById('graphViewerShell'); }
function graphViewerBody() { return document.getElementById('graphViewerBody'); }
function graphViewerTitleEl() { return document.getElementById('graphViewerTitle'); }

function defaultGraphWindowState(sourceId) {
  return { left: 28, top: 28, width: 820, height: 620, minimized: false };
}

function currentGraphWindowState() {
  if (!graphViewerState.sourceId) return null;
  if (!graphViewerState.windows[graphViewerState.sourceId]) {
    graphViewerState.windows[graphViewerState.sourceId] = defaultGraphWindowState(graphViewerState.sourceId);
  }
  return graphViewerState.windows[graphViewerState.sourceId];
}

function saveCurrentGraphWindowState() {
  var shell = graphViewerShell();
  var state = currentGraphWindowState();
  if (!shell || !state) return;
  state.left = Math.max(0, shell.offsetLeft || state.left || 0);
  state.top = Math.max(0, shell.offsetTop || state.top || 0);
  if (!graphViewerState.minimized) {
    state.width = Math.max(360, shell.offsetWidth || state.width || 820);
    state.height = Math.max(180, shell.offsetHeight || state.height || 620);
  }
  state.minimized = !!graphViewerState.minimized;
}

function applyGraphWindowState() {
  var shell = graphViewerShell();
  var state = currentGraphWindowState();
  var host = document.querySelector('.main');
  if (!shell || !state || !host) return;
  var hostRect = host.getBoundingClientRect();
  var width = Math.min(state.width, Math.max(360, hostRect.width - 20));
  var height = graphViewerState.minimized ? shell.offsetHeight || 0 : Math.min(state.height, Math.max(220, hostRect.height - 20));
  shell.style.left = Math.max(0, Math.min(state.left, Math.max(0, hostRect.width - width))) + 'px';
  shell.style.top = Math.max(0, Math.min(state.top, Math.max(0, hostRect.height - height))) + 'px';
  shell.style.width = width + 'px';
  if (!graphViewerState.minimized) shell.style.height = height + 'px';
  shell.classList.toggle('collapsed', !!graphViewerState.minimized);
}

function syncGraphViewerPosition() {
  if (!graphViewerState.open) return;
  applyGraphWindowState();
}

function renderBodeViewer(kind) {
  var body = graphViewerBody();
  if (!body || !lastResults || !lastResults.tf) return;
  var range = bodeFreqRange(lastResults.poles, lastResults.zeros);
  var pts = computeBodePoints(lastResults.tf.num, lastResults.tf.den, range.lo, range.hi, 320);
  var title = kind === 'phase' ? 'Bode · Fase' : 'Bode · Magnitud';
  var magWrap = '<div class="analysis-graph" data-graph-source="bode-mag-graph" data-graph-title="Bode"><div class="matrix-label">Magnitud (dB)</div><div class="bode-svg-wrap"><svg id="graphViewerBodeMag" viewBox="0 0 1200 260" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg"></svg></div></div>';
  var phaseWrap = '<div class="analysis-graph" data-graph-source="bode-phase-graph" data-graph-title="Bode"><div class="matrix-label">Fase (grados)</div><div class="bode-svg-wrap"><svg id="graphViewerBodePhase" viewBox="0 0 1200 260" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg"></svg></div></div>';
  body.innerHTML = '<div class="bode-viewer-stack">' + magWrap + phaseWrap + '<div class="scope-readout" id="graphViewerBodeReadout"></div></div>';
  graphViewerState.title = title;
  var magSvg = document.getElementById('graphViewerBodeMag');
  var phaseSvg = document.getElementById('graphViewerBodePhase');
  if (magSvg) renderBodeViewerChart(magSvg, pts, 'magDb', '', range, 'bode-mag');
  if (phaseSvg) renderBodeViewerChart(phaseSvg, pts, 'phaseDeg', '°', range, 'bode-phase');
  var readout = document.getElementById('graphViewerBodeReadout');
  if (readout) {
    if (graphViewerState.bodeCursorActive && graphViewerState.bodeCursorW) {
      var magVal = bodeValueAtW(pts, 'magDb', graphViewerState.bodeCursorW);
      var phaseVal = bodeValueAtW(pts, 'phaseDeg', graphViewerState.bodeCursorW);
      var cursorFreqHz = graphViewerState.bodeCursorW / (2 * Math.PI);
      var cursorRpm = cursorFreqHz * 60;
      readout.innerHTML = '<div class="scope-readout-head">Cursor · ω = ' + fmtNum(graphViewerState.bodeCursorW, 4) + ' rad/s</div>'
        + '<div class="scope-readout-row"><span>Frecuencia</span><span style="color:var(--c-force)">' + fmtNum(cursorFreqHz, 4) + ' Hz</span></div>'
        + '<div class="scope-readout-row"><span>Velocidad</span><span style="color:var(--c-spring)">' + fmtNum(cursorRpm, 4) + ' RPM</span></div>'
        + '<div class="scope-readout-row"><span>Magnitud</span><span style="color:var(--c-mass)">' + fmtNum(magVal, 4) + ' dB</span></div>'
        + '<div class="scope-readout-row"><span>Fase</span><span style="color:var(--c-force)">' + fmtNum(phaseVal, 4) + '°</span></div>';
    } else {
      readout.innerHTML = '<div class="scope-readout-empty">Haz click o arrastra sobre cualquiera de las dos curvas para fijar la frecuencia.</div>';
    }
  }
  attachBodeViewerPointer(magSvg, pts, range, 'magDb');
  attachBodeViewerPointer(phaseSvg, pts, range, 'phaseDeg');
}

function bodeValueAtW(pts, field, w) {
  if (!pts || !pts.length) return 0;
  if (w <= pts[0].w) return pts[0][field];
  if (w >= pts[pts.length - 1].w) return pts[pts.length - 1][field];
  var i = 0;
  while (i < pts.length - 1 && pts[i + 1].w < w) i++;
  var p0 = pts[i], p1 = pts[i + 1];
  var x0 = Math.log10(p0.w), x1 = Math.log10(p1.w), x = Math.log10(w);
  var a = (x - x0) / Math.max(1e-9, x1 - x0);
  return p0[field] + (p1[field] - p0[field]) * a;
}

function bodeCursorUnits(w) {
  var hz = w / (2 * Math.PI);
  return { w: w, hz: hz, rpm: hz * 60 };
}

function renderBodeViewerChart(svg, pts, field, unit, range, cursorKey) {
  if (!svg) return;
  var W = 1200, H = 260, padL = 58, padR = 20, padT = 16, padB = 30;
  var plotW = W - padL - padR, plotH = H - padT - padB;
  var vals = pts.map(function(p) { return p[field]; });
  var vMin = Math.min.apply(null, vals), vMax = Math.max.apply(null, vals);
  if (Math.abs(vMax - vMin) < 1e-6) { vMax += 1; vMin -= 1; }
  var margin = (vMax - vMin) * 0.1;
  vMax += margin; vMin -= margin;
  function sx(w) { return padL + ((Math.log10(w) - Math.log10(range.lo)) / (Math.log10(range.hi) - Math.log10(range.lo))) * plotW; }
  function sy(v) { return padT + plotH - ((v - vMin) / (vMax - vMin)) * plotH; }
  var timeTicks = [];
  for (var d = Math.floor(Math.log10(range.lo)); d <= Math.ceil(Math.log10(range.hi)); d++) timeTicks.push(Math.pow(10, d));
  var svgStr = '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="var(--bg-grid)"/>';
  timeTicks.forEach(function(w) {
    if (w < range.lo || w > range.hi) return;
    var xx = sx(w);
    svgStr += '<line x1="' + xx + '" y1="' + padT + '" x2="' + xx + '" y2="' + (padT + plotH) + '" stroke="var(--edge-soft)" stroke-width="1"/>';
    svgStr += '<text x="' + xx + '" y="' + (H - 6) + '" text-anchor="middle" fill="var(--ink-faint)" font-family="monospace" font-size="9.5">10' + supNum(Math.round(Math.log10(w))) + '</text>';
  });
  if (vMin < 0 && vMax > 0) {
    var y0 = sy(0);
    svgStr += '<line x1="' + padL + '" y1="' + y0 + '" x2="' + (padL + plotW) + '" y2="' + y0 + '" stroke="var(--edge)" stroke-width="1.3"/>';
  }
  svgStr += '<polyline points="' + pts.map(function(p){ return sx(p.w) + ',' + sy(p[field]); }).join(' ') + '" fill="none" stroke="var(--c-mass)" stroke-width="2.2"/>';
  if (graphViewerState.bodeCursorActive && graphViewerState.bodeCursorW) {
    var cx = sx(graphViewerState.bodeCursorW);
    var cy = sy(bodeValueAtW(pts, field, graphViewerState.bodeCursorW));
    svgStr += '<line x1="' + cx + '" y1="' + padT + '" x2="' + cx + '" y2="' + (padT + plotH) + '" stroke="var(--c-force)" stroke-width="1.4" stroke-dasharray="5 4"/>';
    svgStr += '<circle cx="' + cx + '" cy="' + cy + '" r="3.6" fill="var(--c-force)" stroke="var(--panel)" stroke-width="1"/>';
  }
  svgStr += '<text x="4" y="' + (padT + 9) + '" fill="var(--ink-faint)" font-family="monospace" font-size="9">' + fmtNum(vMax, 1) + unit + '</text>';
  svgStr += '<text x="4" y="' + (padT + plotH - 2) + '" fill="var(--ink-faint)" font-family="monospace" font-size="9">' + fmtNum(vMin, 1) + unit + '</text>';
  svg.innerHTML = svgStr;
  svg.__bodeMeta = { W: W, H: H, padL: padL, padT: padT, plotW: plotW, plotH: plotH, vMin: vMin, vMax: vMax, range: range, field: field, unit: unit, pts: pts, cursorKey: cursorKey };
}

function attachBodeViewerPointer(svg, pts, range, field) {
  if (!svg || svg.dataset.bodePointerWired === '1') return;
  svg.dataset.bodePointerWired = '1';
  function setCursor(e) {
    var meta = svg.__bodeMeta;
    if (!meta) return;
    var rect = svg.getBoundingClientRect();
    var relX = (e.clientX - rect.left) / Math.max(1, rect.width);
    var w = meta.range.lo * Math.pow(meta.range.hi / meta.range.lo, Math.max(0, Math.min(1, relX)));
    graphViewerState.bodeCursorW = w;
    graphViewerState.bodeCursorActive = true;
    syncGraphViewer();
  }
  svg.addEventListener('pointerdown', function(e) {
    if (e.button !== 0) return;
    setCursor(e);
    try { svg.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });
  svg.addEventListener('pointermove', function(e) { if (e.buttons) setCursor(e); });
}

function syncGraphViewer() {
  if (!graphViewerState.open) return;
  var body = graphViewerBody();
  var title = graphViewerTitleEl();
  if (!body) return;
  if (graphViewerState.sourceId === 'scope-graph' && typeof renderScopeView === 'function') {
    body.innerHTML = '<div class="scope-layout">'
      + '<div class="scope-plot analysis-graph" data-graph-source="scope-graph" data-graph-title="Simulación">'
      + '<div class="scope-svg-wrap"><svg id="graphViewerScopeSvg" viewBox="0 0 1360 460" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg"></svg></div>'
      + '</div>'
      + '<div class="scope-side">'
      + '<div class="scope-side-title">Señales</div>'
      + '<div class="scope-checklist" id="graphViewerScopeChecklist"></div>'
      + '<div class="scope-legend-hint">Discontinuas = entradas · Continuas = salidas</div>'
      + '</div>'
      + '</div>'
      + '<div class="scope-readout" id="graphViewerScopeReadout"></div>';
    renderScopeView({ svgId: 'graphViewerScopeSvg', checklistId: 'graphViewerScopeChecklist', readoutId: 'graphViewerScopeReadout', width: 1360, height: 460, expanded: true });
    if (title) title.textContent = graphViewerState.title || 'Gráfica ampliada';
    syncGraphViewerPosition();
    return;
  }
  if (graphViewerState.sourceId === 'bode-mag-graph' || graphViewerState.sourceId === 'bode-phase-graph') {
    renderBodeViewer(graphViewerState.sourceId === 'bode-phase-graph' ? 'phase' : 'mag');
    if (title) title.textContent = graphViewerState.title || 'Bode';
    syncGraphViewerPosition();
    return;
  }
  var source = document.querySelector('[data-graph-source="' + graphViewerState.sourceId + '"]');
  if (!source) return;
  body.innerHTML = source.innerHTML;
  if (title) title.textContent = graphViewerState.title || 'Gráfica ampliada';
  syncGraphViewerPosition();
}

function openGraphViewer(sourceEl) {
  var viewer = graphViewerEl();
  if (!viewer || !sourceEl) return;
  graphViewerState.open = true;
  graphViewerState.sourceId = sourceEl.getAttribute('data-graph-source');
  graphViewerState.title = sourceEl.getAttribute('data-graph-title') || 'Gráfica ampliada';
  graphViewerState.minimized = false;
  viewer.hidden = false;
  viewer.classList.add('open');
  syncGraphViewer();
}

function closeGraphViewer() {
  var viewer = graphViewerEl();
  if (!viewer) return;
  saveCurrentGraphWindowState();
  graphViewerState.open = false;
  graphViewerState.sourceId = null;
  graphViewerState.title = '';
  graphViewerState.dragging = false;
  graphViewerState.minimized = false;
  viewer.classList.remove('open');
  viewer.hidden = true;
}

function toggleGraphViewerMinimize() {
  if (!graphViewerState.open) return;
  var wasMinimized = !!graphViewerState.minimized;
  graphViewerState.minimized = !wasMinimized;
  if (graphViewerState.minimized) saveCurrentGraphWindowState();
  else {
    var state = currentGraphWindowState();
    if (state) state.minimized = false;
  }
  syncGraphViewerPosition();
  syncGraphViewer();
}

function wireGraphViewer() {
  var drawer = document.getElementById('drawer');
  function openFromEvent(e) {
    var graph = e.target && e.target.closest ? e.target.closest('[data-graph-source]') : null;
    if (!graph) return;
    openGraphViewer(graph);
  }
  if (drawer) {
    drawer.addEventListener('pointerup', function(e) {
      if (e.button !== undefined && e.button !== 0) return;
      openFromEvent(e);
    });
    drawer.addEventListener('click', function(e) {
      openFromEvent(e);
    });
  }
  var viewer = graphViewerEl();
  var shell = graphViewerShell();
  var handle = document.getElementById('graphViewerHandle');
  var closeBtn = document.getElementById('graphViewerCloseBtn');
  var minimizeBtn = document.getElementById('graphViewerMinimizeBtn');
  if (shell) {
    shell.addEventListener('click', function(e) {
      var closeTarget = e.target && e.target.closest ? e.target.closest('#graphViewerCloseBtn') : null;
      if (closeTarget) {
        e.preventDefault();
        closeGraphViewer();
        return;
      }
      var minimizeTarget = e.target && e.target.closest ? e.target.closest('#graphViewerMinimizeBtn') : null;
      if (minimizeTarget) {
        e.preventDefault();
        toggleGraphViewerMinimize();
      }
    });
  } else {
    if (closeBtn) closeBtn.addEventListener('click', closeGraphViewer);
    if (minimizeBtn) minimizeBtn.addEventListener('click', toggleGraphViewerMinimize);
  }
  if (viewer) {
    viewer.addEventListener('click', function(e) {
      if (e.target === viewer) closeGraphViewer();
    });
  }
  if (handle && shell) {
    handle.addEventListener('pointerdown', function(e) {
      if (e.button !== 0) return;
      if (e.target && e.target.closest && e.target.closest('.graph-viewer-actions')) return;
      if (graphViewerState.minimized) return;
      graphViewerState.dragging = true;
      graphViewerState.dragX = e.clientX;
      graphViewerState.dragY = e.clientY;
      graphViewerState.left = shell.offsetLeft;
      graphViewerState.top = shell.offsetTop;
      shell.style.right = 'auto';
      shell.style.bottom = 'auto';
      if (handle.setPointerCapture) handle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    handle.addEventListener('pointermove', function(e) {
      if (!graphViewerState.dragging) return;
      var host = document.querySelector('.main');
      if (!host) return;
      var hostRect = host.getBoundingClientRect();
      var shellRect = shell.getBoundingClientRect();
      var dx = e.clientX - graphViewerState.dragX;
      var dy = e.clientY - graphViewerState.dragY;
      graphViewerState.left += dx;
      graphViewerState.top += dy;
      graphViewerState.dragX = e.clientX;
      graphViewerState.dragY = e.clientY;
      var maxLeft = Math.max(0, hostRect.width - shellRect.width);
      var maxTop = Math.max(0, hostRect.height - shellRect.height);
      graphViewerState.left = Math.max(0, Math.min(graphViewerState.left, maxLeft));
      graphViewerState.top = Math.max(0, Math.min(graphViewerState.top, maxTop));
      shell.style.left = graphViewerState.left + 'px';
      shell.style.top = graphViewerState.top + 'px';
      saveCurrentGraphWindowState();
    });
    handle.addEventListener('pointerup', function(e) {
      graphViewerState.dragging = false;
      saveCurrentGraphWindowState();
      if (handle.releasePointerCapture) {
        try { handle.releasePointerCapture(e.pointerId); } catch (err) {}
      }
    });
    handle.addEventListener('pointercancel', function() { graphViewerState.dragging = false; });
  }
  window.addEventListener('resize', function() { if (graphViewerState.open) syncGraphViewerPosition(); });
  if (window.ResizeObserver && !graphViewerState._ro) {
    graphViewerState._ro = new ResizeObserver(function() {
      if (graphViewerState.open) saveCurrentGraphWindowState();
    });
    if (shell) graphViewerState._ro.observe(shell);
  }
}

function wireTabsAndSubtabs() {
  var tabButtons = document.querySelectorAll('.tabs button');
  tabButtons.forEach(function(btn) {
    btn.addEventListener('click', function() {
      tabButtons.forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(function(c) { c.classList.remove('active'); });
      var name = btn.dataset.tab.charAt(0).toUpperCase() + btn.dataset.tab.slice(1);
      document.getElementById('tab' + name).classList.add('active');
    });
  });
  document.getElementById('tabSs').addEventListener('click', function(e) {
    if (e.target.dataset.ss) { ssForm = e.target.dataset.ss; renderStateSpace(lastResults); }
  });
  document.getElementById('tabTf').addEventListener('change', function(e) {
    var t = e.target;
    if (t.id === 'tfInputSelect') { state.tfInputForceId = t.value; renderResults(); }
    else if (t.id === 'outputNodeSelect') { state.outputNodeId = t.value; renderResults(); renderScope(); }
    else if (t.id === 'outputTypeSelect') { state.outputType = t.value; renderResults(); renderScope(); }
  });
  if (typeof bindScopeChecklist === 'function') bindScopeChecklist(document.getElementById('scopeChecklist'));
}

function wireTransport() {
  document.getElementById('playBtn').addEventListener('click', function() {
    if (simUI.running) {
      simPauseInternal();
      var btn = document.getElementById('playBtn');
      btn.textContent = '\u25B6 Reanudar'; btn.classList.remove('playing');
    } else simStart();
  });
  document.getElementById('stopBtn').addEventListener('click', simReset);
  document.getElementById('resetViewBtn').addEventListener('click', resetView);
  var dur = document.getElementById('durInput');
  dur.addEventListener('input', function() { simUI.duration = Math.max(1, parseFloat(dur.value) || 10); renderScope(); });
  var spd = document.getElementById('speedInput');
  spd.addEventListener('input', function() { simUI.speed = Math.max(0.05, parseFloat(spd.value) || 1); });
}

function init() {
  resetSystem('trans');
  updateModeLabels();
  applyViewBox();
  renderCanvas();
  renderResults();
  simReset();
  wireCanvas();
  wirePopoverLayer();
  wirePalette();
  wireTopbar();
  wireGraphViewer();
  wireTabsAndSubtabs();
  wireTransport();
  updateUndoRedoButtons();
}
init();
