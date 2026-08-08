/**
 * RUTA-BOT DELTA-7 — Renderizado del canvas (mapa de planta)
 * Depende de: graph-data.js (NODES, EDGES_RAW), estado global activeAlgo y ALGO_META
 */
(function (global) {
  'use strict';

  var NODES = global.NODES;
  var EDGES_RAW = global.EDGES_RAW;
  var ALGO_META = global.ALGO_META;

  var ALGO_COLORS = {
    dijkstra: { active: '#1565c0', visited: '#1b7a3e', path: '#b06000', mst: '#b06000' },
    prim:     { active: '#5b21b6', visited: '#1b7a3e', path: '#b06000', mst: '#5b21b6' },
    kruskal:  { active: '#0d7377', visited: '#1b7a3e', path: '#b06000', mst: '#0d7377' },
  };

  var canvas = null;
  var ctx = null;

  function getCanvas() {
    if (!canvas) canvas = document.getElementById('plantCanvas');
    return canvas;
  }
  function getCtx() {
    if (!ctx && getCanvas()) ctx = canvas.getContext('2d');
    return ctx;
  }

  function npos(key, c) {
    c = c || getCanvas();
    if (!c || !c._w) return { x: 0, y: 0 };
    var node = NODES[key];
    if (!node) return { x: 0, y: 0 };
    return {
      x: node.x * (c._w || c.width),
      y: node.y * (c._h || c.height),
    };
  }

  function roundRect(ctx, x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  }

  function drawPlant(st, activeAlgo) {
    var c = getCanvas();
    var ctx = getCtx();
    if (!c || !ctx || !c._w) return;
    var W = c._w, H = c._h;
    ctx.clearRect(0, 0, W, H);

    var algo = activeAlgo || global.activeAlgo;
    var col = ALGO_COLORS[algo] || ALGO_COLORS.dijkstra;
    var isMST = ALGO_META[algo] && ALGO_META[algo].isMST;

    // Zonas sutiles bajo nodos
    Object.keys(NODES).forEach(function (key) {
      var pos = npos(key, c);
      var grad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, 50);
      grad.addColorStop(0, 'rgba(21,101,192,0.04)');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(pos.x - 55, pos.y - 55, 110, 110);
    });

    // Aristas
    EDGES_RAW.forEach(function (e) {
      var u = e[0], v = e[1], w = e[2];
      var pu = npos(u, c), pv = npos(v, c);

      var isOptPath = st.optPath && st.optPath.some(function (n, i) {
        if (i >= st.optPath.length - 1) return false;
        return (st.optPath[i] === u && st.optPath[i + 1] === v) || (st.optPath[i] === v && st.optPath[i + 1] === u);
      });
      var isMstEdge = (st.mstEdges || []).some(function (a) { return (a[0] === u && a[1] === v) || (a[0] === v && a[1] === u); });
      var isActive = st.activeEdge && ((st.activeEdge[0] === u && st.activeEdge[1] === v) || (st.activeEdge[0] === v && st.activeEdge[1] === u));

      ctx.beginPath();
      ctx.moveTo(pu.x, pu.y);
      ctx.lineTo(pv.x, pv.y);

      if (isOptPath) {
        ctx.strokeStyle = '#b06000';
        ctx.lineWidth = 4;
        ctx.globalAlpha = 0.85;
        ctx.setLineDash([]);
      } else if (isMstEdge && isMST) {
        ctx.strokeStyle = col.mst;
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.7;
        ctx.setLineDash([]);
      } else if (isActive) {
        ctx.strokeStyle = col.active;
        ctx.lineWidth = 2.5;
        ctx.globalAlpha = 0.9;
        ctx.setLineDash([6, 4]);
      } else {
        ctx.strokeStyle = '#b8c8df';
        ctx.lineWidth = 1.2;
        ctx.globalAlpha = 0.6;
        ctx.setLineDash([]);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);

      var mx = (pu.x + pv.x) / 2, my = (pu.y + pv.y) / 2;
      var lblColor = isOptPath ? '#b06000' : (isMstEdge ? col.mst : (isActive ? col.active : '#7a96b8'));
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(mx - 14, my - 11, 28, 16);
      ctx.fillStyle = lblColor;
      ctx.font = '700 11px "Share Tech Mono"';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(w + 'm', mx, my);
    });

    // Nodos
    Object.keys(NODES).forEach(function (key) {
      var node = NODES[key];
      var pos = npos(key, c);
      var isSrc = st.source === key;
      var isDst = st.dest === key;
      var isCur = st.current === key;
      var isVis = (st.visited || []).indexOf(key) !== -1;
      var isPath = st.optPath && st.optPath.indexOf(key) !== -1;
      var isMstNode = (st.mstEdges || []).some(function (e) { return e[0] === key || e[1] === key; });

      var fillColor, strokeColor, sz, labelColor;
      if (isSrc) {
        fillColor = '#e65100'; strokeColor = '#bf360c'; sz = 24; labelColor = '#fff';
      } else if (isDst) {
        fillColor = '#c62828'; strokeColor = '#8e0000'; sz = 24; labelColor = '#fff';
      } else if (isCur) {
        fillColor = col.active; strokeColor = 'rgba(0,0,0,0.2)'; sz = 22; labelColor = '#fff';
      } else if (isPath) {
        fillColor = '#b06000'; strokeColor = '#7a4000'; sz = 20; labelColor = '#fff';
      } else if (isMstNode && isMST) {
        fillColor = '#b06000'; strokeColor = '#7a4000'; sz = 18; labelColor = '#fff';
      } else if (isVis) {
        fillColor = '#1b7a3e'; strokeColor = '#0f4a25'; sz = 18; labelColor = '#fff';
      } else {
        fillColor = '#e2e8f2'; strokeColor = '#b8c8df'; sz = 15; labelColor = '#2a4a72';
      }

      // Anillo de pulso para nodo actual (Dijkstra, Prim y Kruskal)
      if (isCur) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, sz + 10, 0, Math.PI * 2);
        ctx.strokeStyle = col.active;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.25;
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, sz + 5, 0, Math.PI * 2);
        ctx.strokeStyle = col.active;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.4;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      ctx.shadowColor = (isSrc || isDst) ? 'rgba(0,0,0,0.3)' : (isCur ? col.active + '80' : 'rgba(0,0,0,0.1)');
      ctx.shadowBlur = isCur ? 16 : 6;

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, sz, 0, Math.PI * 2);
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = isCur ? 2.5 : 1.5;
      ctx.stroke();

      var lines = node.label.split('\n');
      ctx.fillStyle = labelColor;
      ctx.font = '600 ' + (sz > 15 ? 10.5 : 9) + 'px "DM Sans"';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      lines.forEach(function (line, li) {
        ctx.fillText(line, pos.x, pos.y + (li - (lines.length - 1) / 2) * 9);
      });

      // Badge de distancia/costo (Dijkstra: dist; Prim: key; Kruskal: peso incidente)
      var d = st.distances && st.distances[key];
      if (d !== null && d !== undefined && d !== '') {
        var badgeY = pos.y + sz + 4;
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.strokeStyle = isPath || isMstNode ? '#b06000' : col.active;
        ctx.lineWidth = 1;
        ctx.beginPath();
        roundRect(ctx, pos.x - 16, badgeY, 32, 13, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = isPath || isMstNode ? '#b06000' : col.active;
        ctx.font = '700 8px "Share Tech Mono"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(d) + 'm', pos.x, badgeY + 6.5);
      }
    });

    // Emoji robot en nodo actual (unificado para los 3 algoritmos)
    if (st.current && NODES[st.current]) {
      var rpos = npos(st.current, c);
      ctx.font = '16px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('🤖', rpos.x, rpos.y - 26);
    }

    ctx.textBaseline = 'alphabetic';
  }

  function resizeCanvas(state, activeAlgo) {
    var c = getCanvas();
    if (!c) return;
    var r = c.getBoundingClientRect();
    var ratio = typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;
    c.width = r.width * ratio;
    c.height = r.height * ratio;
    var ctx = getCtx();
    if (ctx) ctx.scale(ratio, ratio);
    c._w = r.width;
    c._h = r.height;
    if (state && global.drawPlant) global.drawPlant(state, activeAlgo);
  }

  global.npos = npos;
  global.ALGO_COLORS = ALGO_COLORS;
  global.drawPlant = drawPlant;
  global.resizeCanvas = resizeCanvas;
})(typeof window !== 'undefined' ? window : this);
