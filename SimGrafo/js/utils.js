/**
 * RUTA-BOT DELTA-7 — Utilidades: log, reloj
 */
(function (global) {
  'use strict';

  function log(msg, cls) {
    cls = cls || 'le-info';
    var p = document.getElementById('logEl');
    if (!p) return;
    var d = document.createElement('div');
    d.className = 'le ' + cls;
    d.textContent = msg;
    p.appendChild(d);
    p.scrollTop = p.scrollHeight;
  }

  function clearLog() {
    var p = document.getElementById('logEl');
    if (p) p.innerHTML = '';
  }

  function updateClock() {
    var el = document.getElementById('clockEl');
    if (!el) return;
    el.textContent = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  }

  global.log = log;
  global.clearLog = clearLog;
  global.updateClock = updateClock;
})(typeof window !== 'undefined' ? window : this);
