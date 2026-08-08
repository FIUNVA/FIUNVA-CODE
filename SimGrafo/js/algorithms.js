/**
 * RUTA-BOT DELTA-7 — Algoritmos: Dijkstra, Prim, Kruskal
 * Depende de: graph-data.js (GRAPH, NODES, EDGES_RAW)
 */
(function (global) {
  'use strict';

  var GRAPH = global.GRAPH;
  var NODES = global.NODES;
  var EDGES_RAW = global.EDGES_RAW;

  var ALGO_META = {
    dijkstra: {
      name: 'Dijkstra — Camino Más Corto',
      desc: 'Encuentra la ruta de menor costo desde un origen a un destino usando una cola de prioridad. Explora nodos en orden creciente de distancia acumulada.',
      cmplx: 'Tiempo: O((V+E) log V)  |  Espacio: O(V)',
      theme: 'dijkstra',
      isMST: false,
    },
    prim: {
      name: 'Prim — Árbol Parcial Mínimo',
      desc: 'Construye el Árbol de Expansión Mínima (MST) creciendo desde un nodo inicial. Siempre agrega la arista de menor peso que conecta un nuevo nodo al árbol actual.',
      cmplx: 'Tiempo: O(E log V)  |  Espacio: O(V)',
      theme: 'prim',
      isMST: true,
    },
    kruskal: {
      name: 'Kruskal — Árbol Máximo/Mínimo Coste',
      desc: 'Construye el MST ordenando TODAS las aristas por peso y agregando las más baratas que no formen ciclos. Usa Union-Find para detección de ciclos eficiente.',
      cmplx: 'Tiempo: O(E log E)  |  Espacio: O(V)',
      theme: 'kruskal',
      isMST: true,
    },
  };

  function runDijkstra(source, dest) {
    var dist = {}, prev = {}, visited = new Set();
    Object.keys(GRAPH).forEach(function (n) { dist[n] = Infinity; prev[n] = null; });
    dist[source] = 0;
    var pq = [[0, source]];
    var steps = [];

    function snap(action, current, edge, extra) {
      extra = extra || {};
      steps.push({ action: action, current: current, edge: edge, dist: Object.assign({}, dist), visited: Array.from(visited), extra: extra });
    }

    snap('start', null, null);

    while (pq.length) {
      pq.sort(function (a, b) { return a[0] - b[0]; });
      var item = pq.shift();
      var d = item[0], u = item[1];
      if (visited.has(u)) { snap('pop_ignored', u, null); continue; }
      visited.add(u);
      snap('visit', u, null);
      GRAPH[u].forEach(function (adj) {
        var v = adj[0], w = adj[1];
        var c = dist[u] + w, old = dist[v];
        if (c < dist[v]) {
          dist[v] = c; prev[v] = u; pq.push([c, v]);
          snap('relax', u, [u, v], { newDist: c, oldDist: old === Infinity ? null : old });
        } else {
          snap('no_relax', u, [u, v], { candidate: c, oldDist: old === Infinity ? null : old });
        }
      });
    }
    snap('end', null, null);

    var path = [], c = dest;
    while (c) { path.unshift(c); c = prev[c]; }
    var validPath = path[0] === source ? path : null;
    var total = dist[dest] === Infinity ? null : dist[dest];

    return { steps: steps, path: validPath, totalDist: total, dist: dist, mstEdges: null };
  }

  function runPrim(source) {
    var inMST = new Set();
    var key = {};
    var parent = {};
    var mstEdges = [];
    var steps = [];

    Object.keys(GRAPH).forEach(function (n) { key[n] = Infinity; parent[n] = null; });
    key[source] = 0;

    var pq = Object.keys(GRAPH).map(function (n) { return [key[n], n]; });
    function distSnap() {
      var o = {};
      Object.keys(key).forEach(function (k) { o[k] = key[k] === Infinity ? null : key[k]; });
      return o;
    }
    function snap(action, current, edge, extra) {
      extra = extra || {};
      steps.push({ action: action, current: current, edge: edge, dist: distSnap(), visited: Array.from(inMST), extra: extra });
    }

    snap('start', source, null, { info: 'Inicializando Prim desde ' + source });

    while (pq.length) {
      pq.sort(function (a, b) { return a[0] - b[0]; });
      var item = pq.shift();
      var w = item[0], u = item[1];
      if (inMST.has(u)) { snap('pop_ignored', u, null); continue; }

      inMST.add(u);
      if (parent[u] !== null) {
        mstEdges.push([parent[u], u, w]);
        snap('visit', u, [parent[u], u], { weight: w, info: 'Agrega arista ' + parent[u] + '→' + u + ' (' + w + 'm) al MST' });
      } else {
        snap('visit', u, null, { info: 'Nodo inicial: ' + u });
      }

      GRAPH[u].forEach(function (adj) {
        var v = adj[0], edgeW = adj[1];
        if (!inMST.has(v) && edgeW < key[v]) {
          var old = key[v];
          key[v] = edgeW; parent[v] = u;
          pq = pq.map(function (p) { return p[1] === v ? [edgeW, v] : p; });
          snap('relax', u, [u, v], { newDist: edgeW, oldDist: old === Infinity ? null : old, info: 'Actualiza clave de ' + v + ': ' + (old === Infinity ? '∞' : old) + '→' + edgeW + 'm' });
        } else if (!inMST.has(v)) {
          snap('no_relax', u, [u, v], { candidate: edgeW, oldDist: key[v] === Infinity ? null : key[v] });
        }
      });
    }

    var totalMST = mstEdges.reduce(function (s, e) { return s + e[2]; }, 0);
    snap('end', null, null, { totalMST: totalMST, edgeCount: mstEdges.length });

    return { steps: steps, mstEdges: mstEdges, totalDist: totalMST, path: null, dist: key };
  }

  function runKruskal() {
    var parent = {}, rank = {};
    Object.keys(NODES).forEach(function (n) { parent[n] = n; rank[n] = 0; });
    function find(x) { return parent[x] === x ? x : (parent[x] = find(parent[x])); }
    function union(a, b) {
      var ra = find(a), rb = find(b);
      if (ra === rb) return false;
      if (rank[ra] < rank[rb]) parent[ra] = rb;
      else if (rank[ra] > rank[rb]) parent[rb] = ra;
      else { parent[rb] = ra; rank[ra]++; }
      return true;
    }

    var sortedEdges = EDGES_RAW.slice().sort(function (a, b) { return a[2] - b[2]; });
    var mstEdges = [];
    var steps = [];
    var addedNodes = new Set();

    function distSnap() {
      var d = {};
      Object.keys(NODES).forEach(function (n) { d[n] = null; });
      mstEdges.forEach(function (e) {
        var u = e[0], v = e[1], w = e[2];
        d[u] = (d[u] || 0) + w;
        d[v] = (d[v] || 0) + w;
      });
      return d;
    }

    steps.push({ action: 'start', current: null, edge: null, dist: distSnap(), visited: [], extra: { info: 'Kruskal: ordenando aristas por peso' } });

    for (var i = 0; i < sortedEdges.length; i++) {
      var e = sortedEdges[i];
      var u = e[0], v = e[1], w = e[2];
      function addSnap(action, extra) {
        extra = extra || {};
        steps.push({ action: action, current: u, edge: [u, v], dist: distSnap(), visited: Array.from(addedNodes), extra: Object.assign({ weight: w }, extra) });
      }
      if (union(u, v)) {
        mstEdges.push([u, v, w]);
        addedNodes.add(u); addedNodes.add(v);
        addSnap('relax', { info: '✓ Arista ' + u + '—' + v + ' (' + w + 'm) AGREGADA al MST', newDist: w, oldDist: null });
        if (mstEdges.length === Object.keys(NODES).length - 1) break;
      } else {
        addSnap('no_relax', { info: '✗ Arista ' + u + '—' + v + ' (' + w + 'm) forma ciclo — RECHAZADA', candidate: w });
      }
    }

    var totalMST = mstEdges.reduce(function (s, e) { return s + e[2]; }, 0);
    steps.push({
      action: 'end', current: null, edge: null, dist: distSnap(), visited: Array.from(addedNodes),
      extra: { totalMST: totalMST, edgeCount: mstEdges.length, info: 'MST completo: ' + mstEdges.length + ' aristas, ' + totalMST + 'm total' },
    });

    return { steps: steps, mstEdges: mstEdges, totalDist: totalMST, path: null, dist: {} };
  }

  function findPathInMST(mstEdges, source, dest) {
    if (!mstEdges || mstEdges.length === 0) return null;
    var mstGraph = {};
    mstEdges.forEach(function (e) {
      var u = e[0], v = e[1], w = e[2];
      if (!mstGraph[u]) mstGraph[u] = [];
      if (!mstGraph[v]) mstGraph[v] = [];
      mstGraph[u].push([v, w]);
      mstGraph[v].push([u, w]);
    });
    var visited = new Set();
    var queue = [{ node: source, path: [source] }];
    visited.add(source);
    while (queue.length > 0) {
      var item = queue.shift();
      var node = item.node, path = item.path;
      if (node === dest) return path;
      if (mstGraph[node]) {
        mstGraph[node].forEach(function (adj) {
          var neighbor = adj[0];
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push({ node: neighbor, path: path.concat(neighbor) });
          }
        });
      }
    }
    return null;
  }

  global.ALGO_META = ALGO_META;
  global.runDijkstra = runDijkstra;
  global.runPrim = runPrim;
  global.runKruskal = runKruskal;
  global.findPathInMST = findPathInMST;
})(typeof window !== 'undefined' ? window : this);
