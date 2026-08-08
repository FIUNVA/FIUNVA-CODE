/**
 * RUTA-BOT DELTA-7 — Aplicación principal (estado, simulación, UI)
 * Depende de: graph-data.js, algorithms.js, canvas.js, utils.js
 */
(function (global) {
  'use strict';

  var NODES = global.NODES;
  var ALGO_META = global.ALGO_META;
  var runDijkstra = global.runDijkstra;
  var runPrim = global.runPrim;
  var runKruskal = global.runKruskal;
  var findPathInMST = global.findPathInMST;
  var drawPlant = global.drawPlant;
  var resizeCanvas = global.resizeCanvas;
  var log = global.log;
  var clearLog = global.clearLog;
  var updateClock = global.updateClock;

  var activeAlgo = 'dijkstra';
  var simResult = null;
  var simSteps = [];
  var simIndex = 0;
  var simTimer = null;

  var state = {
    visited: [],
    current: null,
    activeEdge: null,
    optPath: null,
    mstEdges: [],
    distances: {},
    source: null,
    dest: null,
  };

  function selectAlgo(key) {
    activeAlgo = key;
    global.activeAlgo = key;
    var meta = ALGO_META[key];

    document.querySelectorAll('.algo-tab').forEach(function (t) {
      t.classList.toggle('active', t.dataset.algo === key);
      t.setAttribute('aria-pressed', t.dataset.algo === key ? 'true' : 'false');
    });

    var card = document.getElementById('algoCard');
    if (card) card.dataset.theme = meta.theme;
    var acName = document.getElementById('acName');
    var acDesc = document.getElementById('acDesc');
    var acCmplx = document.getElementById('acCmplx');
    if (acName) acName.textContent = meta.name;
    if (acDesc) acDesc.textContent = meta.desc;
    if (acCmplx) acCmplx.textContent = meta.cmplx;

    var runBtn = document.getElementById('runBtn');
    if (runBtn) runBtn.dataset.algo = key;

    updateLegend(key);
    resetSim(false);
  }

  function updateLegend(key) {
    var leg = document.getElementById('legendEl');
    if (!leg) return;
    var isMST = ALGO_META[key].isMST;
    var color = key === 'prim' ? 'var(--purple)' : (key === 'kruskal' ? 'var(--teal)' : 'var(--accent)');
    leg.innerHTML =
      '<div class="leg"><div class="ldot" style="background:#e65100"></div>Origen</div>' +
      '<div class="leg"><div class="ldot" style="background:#c62828"></div>Destino</div>' +
      '<div class="leg"><div class="ldot" style="background:' + color + ';opacity:0.8"></div>Activo</div>' +
      '<div class="leg"><div class="ldot" style="background:#1b7a3e"></div>Visitado</div>' +
      (isMST
        ? '<div class="leg"><div class="lline" style="background:' + color + '"></div>Arista MST</div><div class="leg"><div class="lline" style="background:#b06000"></div>Ruta en MST</div>'
        : '<div class="leg"><div class="lline" style="background:#b06000"></div>Ruta óptima</div>') +
      '<div class="leg"><div class="ldot" style="background:var(--muted);opacity:0.4"></div>Sin visitar</div>';
  }

  function fillSelectors() {
    var src = document.getElementById('srcSel');
    var dst = document.getElementById('dstSel');
    if (!src || !dst) return;
    Object.keys(NODES).forEach(function (key) {
      var label = NODES[key].label.replace('\n', ' ');
      src.add(new Option(label, key));
      dst.add(new Option(label, key));
    });
    src.value = 'ALMACEN';
    dst.value = 'DESPACHO';
    src.addEventListener('change', function () { resetSim(false); });
    dst.addEventListener('change', function () { resetSim(false); });
  }

  function startSim() {
    if (simTimer) return;
    resetSim(false);
    clearLog();

    var source = document.getElementById('srcSel').value;
    var dest = document.getElementById('dstSel').value;
    var algo = activeAlgo;
    var meta = ALGO_META[algo];

    if (!meta.isMST && source === dest) {
      log('⚠ Origen y destino deben ser distintos.', 'le-err');
      return;
    }

    log('🤖 Iniciando ' + meta.name, 'le-info');
    log('   Origen: ' + source + (!meta.isMST ? ' → Destino: ' + dest : ' (MST desde aquí)'), 'le-info');
    log('─'.repeat(36), 'le-info');

    document.getElementById('runBtn').disabled = true;
    document.getElementById('resultBanner').style.display = 'none';

    if (algo === 'dijkstra') simResult = runDijkstra(source, dest);
    else if (algo === 'prim') simResult = runPrim(source);
    else if (algo === 'kruskal') simResult = runKruskal();

    simSteps = simResult.steps;
    simIndex = 0;

    state.source = source;
    state.dest = dest;
    state.visited = [];
    state.optPath = null;
    state.mstEdges = [];
    state.current = null;
    state.activeEdge = null;
    state.distances = {};

    var speed = 1500 - parseInt(document.getElementById('speedSlider').value, 10);
    simTimer = setInterval(tickSim, speed);
  }

  function tickSim() {
    if (simIndex >= simSteps.length) {
      clearInterval(simTimer);
      simTimer = null;
      finishSim();
      return;
    }
    applyStep(simSteps[simIndex], simIndex);
    simIndex++;
  }

  function applyStep(step, i) {
    state.current = step.current;
    state.visited = step.visited || [];
    state.activeEdge = step.edge;
    state.distances = step.dist || {};

    var mSteps = document.getElementById('mSteps');
    var mVisited = document.getElementById('mVisited');
    if (mSteps) mSteps.textContent = i;
    if (mVisited) mVisited.textContent = state.visited.length;

    var algo = activeAlgo;
    var ex = step.extra || {};
    var msg, cls;

    switch (step.action) {
      case 'start':
        msg = '▶ INICIO — ' + (ex.info || '');
        cls = algo === 'kruskal' ? 'le-kruskal' : 'le-mst';
        break;
      case 'visit':
        msg = algo === 'dijkstra'
          ? '→ VISITA: ' + step.current + '  dist=' + (step.dist[step.current] != null ? step.dist[step.current] + 'm' : '∞')
          : '✅ ' + (ex.info || ('AGREGA: ' + step.current));
        cls = algo === 'dijkstra' ? 'le-visit' : (algo === 'prim' ? 'le-mst' : 'le-kruskal');
        break;
      case 'relax':
        msg = algo === 'dijkstra'
          ? '✓ RELAX ' + step.edge[0] + '→' + step.edge[1] + ': ' + (ex.oldDist != null ? ex.oldDist : '∞') + '→' + ex.newDist + 'm'
          : (ex.info || '✓ ' + step.edge[0] + '→' + step.edge[1] + ' (' + (ex.weight || ex.newDist) + 'm)');
        cls = algo === 'dijkstra' ? 'le-relax' : (algo === 'prim' ? 'le-mst' : 'le-kruskal');
        break;
      case 'no_relax':
        msg = '✗ ' + (step.edge ? step.edge[0] + '→' + step.edge[1] + ' ' : '') + (ex.info || 'sin mejora');
        cls = 'le-ignore';
        break;
      case 'pop_ignored':
        msg = '⊘ Ignorado (visitado): ' + step.current;
        cls = 'le-ignore';
        break;
      case 'end':
        msg = '■ Finalizado. ' + (ex.totalMST ? 'MST total: ' + ex.totalMST + 'm  Aristas: ' + ex.edgeCount : '');
        cls = 'le-info';
        break;
      default:
        msg = step.action;
        cls = 'le-info';
    }
    log(msg, cls);

    drawPlant(state, activeAlgo);
  }

  function finishSim() {
    state.current = null;
    state.activeEdge = null;
    state.mstEdges = simResult.mstEdges || [];

    var algo = activeAlgo;
    var isMST = ALGO_META[algo].isMST;

    if (isMST) {
      var source = state.source;
      var dest = state.dest;
      var mstPath = findPathInMST(state.mstEdges, source, dest);
      state.optPath = mstPath;
    } else {
      state.optPath = simResult.path;
    }

    document.getElementById('runBtn').disabled = false;
    drawPlant(state, activeAlgo);
    log('─'.repeat(36), 'le-info');

    if (isMST) {
      var edges = simResult.mstEdges;
      var total = simResult.totalDist;
      var mstPath = state.optPath;
      var agvSpeed = 1.2;

      log('🌐 MST COMPLETO — ' + edges.length + ' aristas, ' + total + 'm', algo === 'prim' ? 'le-mst' : 'le-kruskal');
      edges.forEach(function (e) { log('   ' + e[0] + ' — ' + e[1] + ': ' + e[2] + 'm', 'le-info'); });

      if (mstPath && mstPath.length > 1) {
        var pathString = mstPath.join(' → ');
        log('🟡 RUTA EN MST (' + state.source + ' → ' + state.dest + '): ' + pathString, 'le-path');
        var mEdgesEl = document.getElementById('mEdges');
        if (mEdgesEl) mEdgesEl.textContent = mstPath.length - 1;
        var resultBanner = document.getElementById('resultBanner');
        if (resultBanner) resultBanner.style.display = 'block';
        var rbTitle = document.getElementById('rbTitle');
        var rbPath = document.getElementById('rbPath');
        var rbDist = document.getElementById('rbDist');
        var mDist = document.getElementById('mDist');
        if (rbTitle) rbTitle.textContent = algo === 'prim' ? '🟣 RUTA EN MST — PRIM' : '🟦 RUTA EN MST — KRUSKAL';
        if (rbPath) rbPath.textContent = pathString;
        var pathDist = 0;
        for (var i = 0; i < mstPath.length - 1; i++) {
          var u = mstPath[i], v = mstPath[i + 1];
          var edge = edges.find(function (a) { return (a[0] === u && a[1] === v) || (a[0] === v && a[1] === u); });
          if (edge) pathDist += edge[2];
        }
        var pathTime = (pathDist / agvSpeed).toFixed(1);
        log('⏱  Tiempo AGV (1.2m/s): ' + pathTime + 's', 'le-path');
        if (rbDist) rbDist.innerHTML = 'Distancia en MST: <span>' + pathDist + 'm</span> | Tiempo: ' + pathTime + 's';
        if (mDist) mDist.textContent = pathDist;
      } else {
        var mDistEl = document.getElementById('mDist');
        var mEdgesEl2 = document.getElementById('mEdges');
        var resultBanner2 = document.getElementById('resultBanner');
        var rbTitle2 = document.getElementById('rbTitle');
        var rbPath2 = document.getElementById('rbPath');
        var rbDist2 = document.getElementById('rbDist');
        if (mDistEl) mDistEl.textContent = total;
        if (mEdgesEl2) mEdgesEl2.textContent = edges.length;
        if (resultBanner2) resultBanner2.style.display = 'block';
        if (rbTitle2) rbTitle2.textContent = algo === 'prim' ? '🟣 MST — PRIM' : '🟦 MST — KRUSKAL';
        if (rbPath2) rbPath2.textContent = edges.map(function (e) { return e[0] + '—' + e[1] + '(' + e[2] + 'm)'; }).join(' · ');
        var mstTime = (total / agvSpeed).toFixed(1);
        log('⏱  Tiempo AGV (1.2m/s): ' + mstTime + 's', 'le-path');
        if (rbDist2) rbDist2.innerHTML = 'Costo total MST: <span>' + total + 'm</span> | Tiempo: ' + mstTime + 's';
      }
    } else {
      if (simResult.path && simResult.totalDist != null) {
        var d = simResult.totalDist;
        log('🏁 RUTA ÓPTIMA ENCONTRADA', 'le-path');
        log('📍 ' + simResult.path.join(' → '), 'le-path');
        log('📏 Distancia: ' + d + 'm', 'le-path');
        log('⏱  Tiempo AGV (1.2m/s): ' + (d / 1.2).toFixed(1) + 's', 'le-path');
        var mDistEl2 = document.getElementById('mDist');
        var mEdgesEl3 = document.getElementById('mEdges');
        var resultBanner3 = document.getElementById('resultBanner');
        var rbTitle3 = document.getElementById('rbTitle');
        var rbPath3 = document.getElementById('rbPath');
        var rbDist3 = document.getElementById('rbDist');
        if (mDistEl2) mDistEl2.textContent = d;
        if (mEdgesEl3) mEdgesEl3.textContent = simResult.path.length - 1;
        if (resultBanner3) resultBanner3.style.display = 'block';
        if (rbTitle3) rbTitle3.textContent = '🔵 RUTA ÓPTIMA — DIJKSTRA';
        if (rbPath3) rbPath3.textContent = simResult.path.join(' → ');
        if (rbDist3) rbDist3.innerHTML = 'Distancia: <span>' + d + 'm</span> | Tiempo: ' + (d / 1.2).toFixed(1) + 's';
      } else {
        log('⚠ No existe ruta al destino.', 'le-err');
      }
    }
  }

  function resetSim(clearLogs) {
    if (simTimer) {
      clearInterval(simTimer);
      simTimer = null;
    }
    simResult = null;
    simSteps = [];
    simIndex = 0;
    var runBtn = document.getElementById('runBtn');
    if (runBtn) runBtn.disabled = false;
    var resultBanner = document.getElementById('resultBanner');
    if (resultBanner) resultBanner.style.display = 'none';
    var mSteps = document.getElementById('mSteps');
    var mVisited = document.getElementById('mVisited');
    var mDist = document.getElementById('mDist');
    var mEdges = document.getElementById('mEdges');
    if (mSteps) mSteps.textContent = '0';
    if (mVisited) mVisited.textContent = '0';
    if (mDist) mDist.textContent = '—';
    if (mEdges) mEdges.textContent = '—';
    state = {
      visited: [],
      current: null,
      activeEdge: null,
      optPath: null,
      mstEdges: [],
      distances: {},
      source: document.getElementById('srcSel') ? document.getElementById('srcSel').value : null,
      dest: document.getElementById('dstSel') ? document.getElementById('dstSel').value : null,
    };
    global.state = state;
    if (clearLogs !== false) clearLog();
    drawPlant(state, activeAlgo);
  }

  function init() {
    fillSelectors();
    selectAlgo('dijkstra');
    updateLegend('dijkstra');
    setInterval(updateClock, 1000);
    updateClock();
    window.addEventListener('resize', function () { resizeCanvas(state, activeAlgo); });
    requestAnimationFrame(function () {
      resizeCanvas(state, activeAlgo);
      log('🔧 Sistema RUTA-BOT inicializado.', 'le-info');
      log('📦 Planta DELTA-7: 12 estaciones — 22 conexiones.', 'le-info');
      log('⚡ Selecciona un algoritmo y ejecuta la simulación.', 'le-info');
    });
  }

  global.activeAlgo = activeAlgo;
  global.state = state;
  global.selectAlgo = selectAlgo;
  global.startSim = startSim;
  global.resetSim = resetSim;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
