/**
 * RUTA-BOT DELTA-7 — Datos del grafo (planta industrial)
 * Nodos y aristas para el simulador de algoritmos.
 */
(function (global) {
  'use strict';

  const NODES = {
    'ALMACEN':    { label: 'Almacén\nCentral',    icon: '📦', x: 0.07, y: 0.50 },
    'CNC-1':      { label: 'CNC\nMáq.1',          icon: '⚙️',  x: 0.22, y: 0.18 },
    'CNC-2':      { label: 'CNC\nMáq.2',          icon: '⚙️',  x: 0.22, y: 0.82 },
    'ENSAMBLE-A': { label: 'Ensamble\nÁrea A',    icon: '🔩', x: 0.40, y: 0.12 },
    'ENSAMBLE-B': { label: 'Ensamble\nÁrea B',    icon: '🔩', x: 0.40, y: 0.50 },
    'ENSAMBLE-C': { label: 'Ensamble\nÁrea C',    icon: '🔩', x: 0.40, y: 0.88 },
    'SOLDADURA':  { label: 'Soldadura\nRobótica', icon: '🔥', x: 0.57, y: 0.28 },
    'PINTURA':    { label: 'Cabina\nPintura',     icon: '🎨', x: 0.57, y: 0.72 },
    'QA':         { label: 'Control\nCalidad',    icon: '🔬', x: 0.73, y: 0.18 },
    'EMPAQUE':    { label: 'Empaque\nFinal',      icon: '📫', x: 0.73, y: 0.62 },
    'DESPACHO':   { label: 'Despacho\nLogística', icon: '🚚', x: 0.89, y: 0.38 },
    'CARGA':      { label: 'Estación\nCarga',     icon: '🔋', x: 0.89, y: 0.78 },
  };

  const EDGES_RAW = [
    ['ALMACEN', 'CNC-1', 18],    ['ALMACEN', 'CNC-2', 18],    ['ALMACEN', 'ENSAMBLE-B', 32],
    ['CNC-1', 'ENSAMBLE-A', 22], ['CNC-1', 'ENSAMBLE-B', 25],
    ['CNC-2', 'ENSAMBLE-B', 25], ['CNC-2', 'ENSAMBLE-C', 22],
    ['ENSAMBLE-A', 'SOLDADURA', 20], ['ENSAMBLE-A', 'ENSAMBLE-B', 18],
    ['ENSAMBLE-B', 'SOLDADURA', 24], ['ENSAMBLE-B', 'PINTURA', 24], ['ENSAMBLE-B', 'ENSAMBLE-C', 18],
    ['ENSAMBLE-C', 'PINTURA', 20],
    ['SOLDADURA', 'QA', 28],     ['SOLDADURA', 'EMPAQUE', 30],
    ['PINTURA', 'EMPAQUE', 28],  ['PINTURA', 'QA', 35],
    ['QA', 'EMPAQUE', 18],       ['QA', 'DESPACHO', 22],
    ['EMPAQUE', 'DESPACHO', 20], ['EMPAQUE', 'CARGA', 22],
    ['DESPACHO', 'CARGA', 25],
  ];

  function buildGraph() {
    const g = {};
    Object.keys(NODES).forEach(function (n) { g[n] = []; });
    EDGES_RAW.forEach(function (edge) {
      var u = edge[0], v = edge[1], w = edge[2];
      g[u].push([v, w]);
      g[v].push([u, w]);
    });
    return g;
  }

  var GRAPH = buildGraph();

  global.NODES = NODES;
  global.EDGES_RAW = EDGES_RAW;
  global.GRAPH = GRAPH;
})(typeof window !== 'undefined' ? window : this);
