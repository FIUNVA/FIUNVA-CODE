/* =========================================================================
   Motor de derivacion: A/B/C a partir del grafo libre + ecuaciones + TF/SS/PZ
   ========================================================================= */
function buildIndexMap(rn) {
  var m = new Map();
  rn.forEach(function(n, i) { m.set(n.id, i); });
  return m;
}
function buildGraphA(rn, idx) {
  var n = rn.length;
  var A = zeros(2 * n, 2 * n);
  for (var i = 0; i < n; i++) A[2 * i][2 * i + 1] = 1;
  function applyLink(aId, bId, value, isSpring) {
    var ia = idx.has(aId) ? idx.get(aId) : -1;
    var ib = idx.has(bId) ? idx.get(bId) : -1;
    var col = isSpring ? 0 : 1;
    if (ia !== -1) {
      var Ma = (typeof effectiveInertiaForNode === 'function') ? effectiveInertiaForNode(rn[ia]) : Math.max(rn[ia].mass, 0.001);
      A[2 * ia + 1][2 * ia + col] += -value / Ma;
      if (ib !== -1) A[2 * ia + 1][2 * ib + col] += value / Ma;
    }
    if (ib !== -1) {
      var Mb = (typeof effectiveInertiaForNode === 'function') ? effectiveInertiaForNode(rn[ib]) : Math.max(rn[ib].mass, 0.001);
      A[2 * ib + 1][2 * ib + col] += -value / Mb;
      if (ia !== -1) A[2 * ib + 1][2 * ia + col] += value / Mb;
    }
  }
  state.springs.forEach(function(s) { applyLink(s.a, s.b, s.k, true); });
  state.dampers.forEach(function(d) { applyLink(d.a, d.b, d.val, false); });
  return A;
}
function buildForceColumn(rn, idx, nodeId) {
  var n = rn.length;
  var col = new Array(2 * n).fill(0);
  if (idx.has(nodeId)) {
    var i = idx.get(nodeId);
    var inertia = (typeof effectiveInertiaForNode === 'function') ? effectiveInertiaForNode(rn[i]) : Math.max(rn[i].mass, 0.001);
    col[2 * i + 1] = 1 / Math.max(inertia, 0.001);
  }
  return col;
}
function buildOutputRow(rn, idx, nodeId, type) {
  var n = rn.length;
  var row = new Array(2 * n).fill(0);
  if (idx.has(nodeId)) { var i = idx.get(nodeId); row[2 * i + (type === 'vel' ? 1 : 0)] = 1; }
  return row;
}

function computeAll() {
  if (state.mode === 'pend') return computeAllPend();
  var rn = realNodes();
  var idx = buildIndexMap(rn);
  var A = buildGraphA(rn, idx);
  var forces = (typeof effectiveForces === 'function' ? effectiveForces() : state.forces).slice();
  var tfInputId = state.tfInputForceId;
  if (tfInputId === null || !forces.some(function(f){return f.id===tfInputId;})) {
    tfInputId = forces.length ? forces[0].id : null;
  }
  var result = { A: A, rn: rn, idx: idx, forces: forces, tfInputId: tfInputId };
  if (state.outputNodeId === null || !idx.has(state.outputNodeId)) {
    state.outputNodeId = rn.length ? rn[0].id : null;
  }
  if (tfInputId !== null && state.outputNodeId !== null) {
    var inForce = forces.find(function(f){ return f.id === tfInputId; });
    var inNodeId = inForce ? inForce.nodeId : null;
    var Bcol = buildForceColumn(rn, idx, inNodeId);
    var Crow = buildOutputRow(rn, idx, state.outputNodeId, state.outputType);
    var tf = stateSpaceToTF(A, Bcol, Crow, 0);
    result.tf = tf; result.Bcol = Bcol; result.Crow = Crow;
    result.ccf = controllableCanonical(tf.num, tf.den);
    result.ocf = observableCanonical(tf.num, tf.den);
    result.poles = findRoots(tf.den);
    result.zeros = findRoots(tf.num);
  }
  return result;
}

function computeAllPend() {
  var links = state.links;
  var forces = state.forces.slice();
  var tfInputId = state.tfInputForceId;
  if (tfInputId === null || !forces.some(function(f){ return f.id === tfInputId; })) {
    tfInputId = forces.length ? forces[0].id : null;
  }
  if (state.outputNodeId === null || !links.some(function(l){ return l.id === state.outputNodeId; })) {
    state.outputNodeId = links.length ? links[0].id : null;
  }
  var result = { A: null, rn: links, idx: null, forces: forces, tfInputId: tfInputId, isPend: true };
  if (links.length === 0) return result;
  var linkForce = tfInputId ? forces.find(function(f){ return f.id === tfInputId; }) : null;
  var inputLinkId = linkForce ? linkForce.nodeId : (links.length ? links[0].id : null);
  var sys = pendulumBuildLinear(links, inputLinkId);
  if (!sys) return result;
  var N = sys.N;
  var Crow = new Array(2 * N).fill(0);
  var outIdx = -1;
  for (var i = 0; i < N; i++) if (links[i].id === state.outputNodeId) { outIdx = i; break; }
  if (outIdx >= 0) Crow[state.outputType === 'vel' ? (N + outIdx) : outIdx] = 1;
  result.A = sys.A;
  result.Bcol = sys.Bcol;
  result.Crow = Crow;
  result.N = N;
  result.pendSys = sys;
  if (state.outputNodeId !== null && inputLinkId !== null) {
    var tf = stateSpaceToTF(sys.A, sys.Bcol, Crow, 0);
    result.tf = tf;
    result.ccf = controllableCanonical(tf.num, tf.den);
    result.ocf = observableCanonical(tf.num, tf.den);
    result.poles = findRoots(tf.den);
    result.zeros = findRoots(tf.num);
  }
  return result;
}
function _allForces() { return (typeof effectiveForces === 'function') ? effectiveForces() : state.forces; }
function getForceNode(forceId) { var a = _allForces(); for (var i=0;i<a.length;i++) if (a[i].id===forceId) return a[i].nodeId; return null; }
function getForce(forceId) { var a = _allForces(); for (var i=0;i<a.length;i++) if (a[i].id===forceId) return a[i]; return null; }

function buildEquationsHTML() {
  if (state.mode === 'pend') return buildPendEquationsHTML();
  var U = UNITS[state.mode];
  var rn = realNodes();
  if (!rn.length) return '<div class="empty-hint">Agrega al menos una masa/inercia al espacio de trabajo.</div>';
  var forcesAll = (typeof effectiveForces === 'function') ? effectiveForces() : state.forces;
  var html = '';
  rn.forEach(function(node, i) {
    var kSelf = 0, bSelf = 0;
    var crossK = {}, crossB = {};
    state.springs.forEach(function(s) {
      if (s.a === node.id || s.b === node.id) {
        kSelf += s.k;
        var other = s.a === node.id ? s.b : s.a;
        var on = getNode(other);
        if (on && !on.isWall) crossK[other] = (crossK[other] || 0) + s.k;
      }
    });
    state.dampers.forEach(function(d) {
      if (d.a === node.id || d.b === node.id) {
        bSelf += d.val;
        var other = d.a === node.id ? d.b : d.a;
        var on = getNode(other);
        if (on && !on.isWall) crossB[other] = (crossB[other] || 0) + d.val;
      }
    });
    var xi = U.pos + (i + 1), vi = xi + "'", ai = xi + "''";
    var lhs = U.massSym + (i + 1) + String.fromCharCode(183) + ai;
    if (Math.abs(bSelf) > 1e-9) lhs += ' + ' + fmtNum(bSelf) + String.fromCharCode(183) + vi;
    if (Math.abs(kSelf) > 1e-9) lhs += ' + ' + fmtNum(kSelf) + String.fromCharCode(183) + xi;
    Object.keys(crossB).forEach(function(otherId) {
      var oj = rn.findIndex(function(nn){ return nn.id === otherId; });
      lhs += ' ' + String.fromCharCode(8722) + ' ' + fmtNum(crossB[otherId]) + String.fromCharCode(183) + U.pos + (oj + 1) + "'";
    });
    Object.keys(crossK).forEach(function(otherId) {
      var oj = rn.findIndex(function(nn){ return nn.id === otherId; });
      lhs += ' ' + String.fromCharCode(8722) + ' ' + fmtNum(crossK[otherId]) + String.fromCharCode(183) + U.pos + (oj + 1);
    });
    var rhsForces = forcesAll.filter(function(f){ return f.nodeId === node.id; }).map(function(f){ return f.symbol; });
    var rhs = rhsForces.length ? rhsForces.join(' + ') : '0';
    html += '<div class="eq-block">' + lhs + ' = ' + rhs + '</div>';
  });
  return html;
}

function buildPendEquationsHTML() {
  var links = state.links;
  if (!links.length) return '<div class="empty-hint">Agrega al menos un eslabon para el pendulo.</div>';
  var mu = pendulumMu(links);
  var html = '';
  var forcesByLink = {};
  state.forces.forEach(function(f) { (forcesByLink[f.nodeId] = forcesByLink[f.nodeId] || []).push(f.symbol); });
  for (var i = 0; i < links.length; i++) {
    var Li = links[i].L, mi = links[i].mass, bi = links[i].b || 0;
    var lhs = fmtNum(mi * Li * Li) + String.fromCharCode(183) + String.fromCharCode(952) + (i+1) + "''";
    // coupling: for point-mass model, off-diagonal M_il(0) = L_i L_l mu_max(i,l)
    for (var l = 0; l < links.length; l++) {
      if (l === i) continue;
      var Ail = Li * links[l].L * mu[Math.max(i, l)];
      if (Ail < 1e-9) continue;
      lhs += ' + ' + fmtNum(Ail) + String.fromCharCode(183) + String.fromCharCode(952) + (l+1) + "''";
    }
    // damping: joint i (base) and joint i+1
    var bii = 0, bimm = 0, bipp = 0;
    bii += bi;
    if (i + 1 < links.length) bii += links[i+1].b || 0;
    if (i > 0) bimm = links[i].b || 0;
    if (i + 1 < links.length) bipp = links[i+1].b || 0;
    if (bii > 1e-9) lhs += ' + ' + fmtNum(bii) + String.fromCharCode(183) + String.fromCharCode(952) + (i+1) + "'";
    if (bimm > 1e-9) lhs += ' ' + String.fromCharCode(8722) + ' ' + fmtNum(bimm) + String.fromCharCode(183) + String.fromCharCode(952) + (i) + "'";
    if (bipp > 1e-9) lhs += ' ' + String.fromCharCode(8722) + ' ' + fmtNum(bipp) + String.fromCharCode(183) + String.fromCharCode(952) + (i+2) + "'";
    // gravity linearized
    var K = GRAVITY * Li * mu[i];
    if (K > 1e-9) lhs += ' + ' + fmtNum(K) + String.fromCharCode(183) + String.fromCharCode(952) + (i+1);
    var rhs = (forcesByLink[links[i].id] || []).join(' + ') || '0';
    html += '<div class="eq-block">' + lhs + ' = ' + rhs + '</div>';
  }
  html += '<div class="eq-note">Modelo de masa puntual en el extremo, linealizado en ' + String.fromCharCode(952) + ' = 0. La simulacion temporal usa las ecuaciones no lineales completas (Lagrange).</div>';
  return html;
}

var ssForm = 'phys';

function stabilityBadge(poles) {
  if (!poles.length) return '';
  var maxRe = Math.max.apply(null, poles.map(function(p){return p.re;}));
  if (maxRe > 1e-6) return '<div class="badge unstable">&#9650; Inestable</div>';
  if (Math.abs(maxRe) <= 1e-6) return '<div class="badge marginal">&#9679; Marginalmente estable</div>';
  return '<div class="badge stable">&#10003; Estable</div>';
}

function ioSelectorsHTML(res) {
  var U = UNITS[state.mode];
  var opts = res.forces.map(function(f) {
    var sel = (f.id === res.tfInputId) ? ' selected' : '';
    var target = getNode(f.nodeId) || getLink(f.nodeId);
    var nodeLabel = target ? target.label : '?';
    return '<option value="' + f.id + '"' + sel + '>' + f.symbol + ' &mdash; ' + nodeLabel + '</option>';
  }).join('');
  var outOpts = res.rn.map(function(n) {
    var sel = (n.id === state.outputNodeId) ? ' selected' : '';
    return '<option value="' + n.id + '"' + sel + '>' + n.label + '</option>';
  }).join('');
  var typeOpts = '<option value="pos"' + (state.outputType === 'pos' ? ' selected' : '') + '>Posicion (' + U.pos + ')</option>' +
    '<option value="vel"' + (state.outputType === 'vel' ? ' selected' : '') + '>Velocidad (' + U.velVar + ')</option>';
  return '<div class="io-row">' +
    '<div class="field-row"><label>Entrada</label><select id="tfInputSelect">' + opts + '</select></div>' +
    '<div class="field-row"><label>Salida &mdash; elemento</label><select id="outputNodeSelect">' + outOpts + '</select></div>' +
    '<div class="field-row"><label>Salida &mdash; variable</label><select id="outputTypeSelect">' + typeOpts + '</select></div>' +
    '</div>';
}

function renderTF(res) {
  var U = UNITS[state.mode];
  var el = document.getElementById('tabTf');
  if (!res.forces.length || !res.rn.length) {
    el.innerHTML = '<div class="empty-hint">Agrega una masa/inercia y una fuerza para calcular la funcion de transferencia.</div>';
    return;
  }
  var html = ioSelectorsHTML(res);
  html += stabilityBadge(res.poles);
  var outNode = getNode(state.outputNodeId);
  var outVar = (state.outputType === 'vel' ? U.velVar : U.pos) + '(s)';
  var f = getForce(res.tfInputId);
  html += '<div class="tf-lead">G(s) = ' + outVar + ' / ' + f.symbol.replace('(t)', '(s)') + '</div>';
  html += '<div class="tf-frac"><div class="num">' + formatPoly(res.tf.num) + '</div><div class="den">' + formatPoly(res.tf.den) + '</div></div>';
  html += '<div class="eq-note">Denominador monico de grado ' + (res.tf.den.length - 1) + '.</div>';
  html += stepMetricsHTML(res);
  el.innerHTML = html;
}

function stateVectorList(res) {
  var U = UNITS[state.mode];
  if (res.isPend) {
    var N = res.N;
    var parts = [];
    for (var i = 0; i < N; i++) parts.push('z' + (i+1) + ' = ' + String.fromCharCode(952) + (i+1) + '(t)');
    for (var j = 0; j < N; j++) parts.push('z' + (N+j+1) + ' = ' + String.fromCharCode(952) + (j+1) + "'(t)");
    return parts.join('<br>');
  }
  return res.rn.map(function(n, i) {
    return 'z' + (2*i+1) + ' = ' + U.pos + (i+1) + '(t)   ,   z' + (2*i+2) + ' = ' + U.pos + (i+1) + "'(t)";
  }).join('<br>');
}

function renderStateSpace(res) {
  var el = document.getElementById('tabSs');
  if (!res.forces.length || !res.rn.length) {
    el.innerHTML = '<div class="empty-hint">Agrega una masa/inercia y una fuerza para construir el modelo.</div>';
    return;
  }
  var html = '<div class="subtab-row">' +
    '<button data-ss="phys" class="' + (ssForm === 'phys' ? 'active' : '') + '">Variables fisicas</button>' +
    '<button data-ss="ccf" class="' + (ssForm === 'ccf' ? 'active' : '') + '">Controlable</button>' +
    '<button data-ss="ocf" class="' + (ssForm === 'ocf' ? 'active' : '') + '">Observable</button>' +
    '</div>';
  var A, B, C, D, note;
  if (ssForm === 'phys') {
    A = res.A; B = res.Bcol.map(function(v){return [v];}); C = [res.Crow]; D = [[0]];
    note = '<div class="state-def">Vector de estado:<br>' + stateVectorList(res) + '</div>';
  } else if (ssForm === 'ccf') {
    A = res.ccf.A; B = res.ccf.B; C = res.ccf.C; D = res.ccf.D;
    note = '<div class="state-def">Variables de fase (sin significado fisico directo).</div>';
  } else {
    A = res.ocf.A; B = res.ocf.B; C = res.ocf.C; D = res.ocf.D;
    note = '<div class="state-def">Forma dual observable (variables de fase).</div>';
  }
  html += '<div class="matrix-label">A</div><div class="matrix-wrap">' + fmtMatrixHTML(A) + '</div>';
  html += '<div class="matrix-label">B</div><div class="matrix-wrap">' + fmtMatrixHTML(B) + '</div>';
  html += '<div class="matrix-label">C</div><div class="matrix-wrap">' + fmtMatrixHTML(C) + '</div>';
  html += '<div class="matrix-label">D</div><div class="matrix-wrap">' + fmtMatrixHTML(D) + '</div>';
  html += note + '<div class="eq-note">z&#775; = A&middot;z + B&middot;u &nbsp; y = C&middot;z + D&middot;u</div>';
  el.innerHTML = html;
}

function polesZerosSVG(poles, zeros) {
  var all = poles.concat(zeros);
  var maxMag = 1;
  all.forEach(function(p){ maxMag = Math.max(maxMag, Math.abs(p.re), Math.abs(p.im)); });
  maxMag *= 1.25;
  var W = 320, H = 200, cx = W/2, cy = H/2;
  function sx(re) { return cx + (re / maxMag) * (W/2 - 24); }
  function sy(im) { return cy - (im / maxMag) * (H/2 - 20); }
  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;background:var(--panel-3);border:1px solid var(--edge);border-radius:8px;">';
  s += '<line x1="0" y1="' + cy + '" x2="' + W + '" y2="' + cy + '" stroke="var(--edge)" stroke-width="1"/>';
  s += '<line x1="' + cx + '" y1="0" x2="' + cx + '" y2="' + H + '" stroke="var(--edge)" stroke-width="1"/>';
  poles.forEach(function(p) {
    var x = sx(p.re), y = sy(p.im);
    s += '<line x1="' + (x-5) + '" y1="' + (y-5) + '" x2="' + (x+5) + '" y2="' + (y+5) + '" stroke="var(--red)" stroke-width="2"/>';
    s += '<line x1="' + (x-5) + '" y1="' + (y+5) + '" x2="' + (x+5) + '" y2="' + (y-5) + '" stroke="var(--red)" stroke-width="2"/>';
  });
  zeros.forEach(function(z) {
    var x = sx(z.re), y = sy(z.im);
    s += '<circle cx="' + x + '" cy="' + y + '" r="5.5" fill="none" stroke="var(--c-mass)" stroke-width="2"/>';
  });
  s += '</svg>';
  return s;
}

function renderPolesZeros(res) {
  var el = document.getElementById('tabPz');
  if (!res.forces.length || !res.rn.length) {
    el.innerHTML = '<div class="empty-hint">Agrega una masa/inercia y una fuerza para calcular polos y ceros.</div>';
    return;
  }
  var html = stabilityBadge(res.poles);
  html += '<div class="analysis-graph" data-graph-source="pz-graph" data-graph-title="Polos y ceros">' + polesZerosSVG(res.poles, res.zeros) + '</div>';
  html += '<div class="matrix-label">Polos</div><div class="pz-list">';
  res.poles.forEach(function(p, i) { html += '<div class="row"><span>p' + (i+1) + '</span><span>' + formatComplex(p) + '</span></div>'; });
  html += '</div><div class="matrix-label">Ceros</div><div class="pz-list">';
  if (!res.zeros.length) html += '<div class="row"><span>Sin ceros finitos</span></div>';
  res.zeros.forEach(function(z, i) { html += '<div class="row"><span>z' + (i+1) + '</span><span>' + formatComplex(z) + '</span></div>'; });
  html += '</div>';
  el.innerHTML = html;
}

/* =========================================================================
   Diagrama de Bode (magnitud y fase vs frecuencia)
   ========================================================================= */
function computeBodePoints(num, den, wMin, wMax, N) {
  var pts = [];
  var logMin = Math.log10(wMin), logMax = Math.log10(wMax);
  for (var i = 0; i <= N; i++) {
    var logw = logMin + (logMax - logMin) * (i / N);
    var w = Math.pow(10, logw);
    var s = { re: 0, im: w };
    var numV = polyEvalComplex(num, s), denV = polyEvalComplex(den, s);
    var Gv = cDiv(numV, denV);
    var mag = cAbs(Gv);
    var magDb = 20 * Math.log10(Math.max(mag, 1e-12));
    var phaseDeg = Math.atan2(Gv.im, Gv.re) * 180 / Math.PI;
    pts.push({ w: w, magDb: magDb, phaseDeg: phaseDeg });
  }
  for (var j = 1; j < pts.length; j++) {
    while (pts[j].phaseDeg - pts[j-1].phaseDeg > 180) pts[j].phaseDeg -= 360;
    while (pts[j].phaseDeg - pts[j-1].phaseDeg < -180) pts[j].phaseDeg += 360;
  }
  return pts;
}
function bodeFreqRange(poles, zeros) {
  var mags = poles.concat(zeros).map(function(p) { return cAbs(p); }).filter(function(m) { return m > 1e-6; });
  var lo = 0.05, hi = 200;
  if (mags.length) {
    lo = Math.min.apply(null, mags) / 50;
    hi = Math.max.apply(null, mags) * 50;
  }
  lo = Math.max(0.001, Math.min(lo, 0.1));
  hi = Math.min(100000, Math.max(hi, 10));
  return { lo: lo, hi: hi };
}
function supNum(n) {
  var SUP = { '-':'\u207B','0':'\u2070','1':'\u00B9','2':'\u00B2','3':'\u00B3','4':'\u2074','5':'\u2075','6':'\u2076','7':'\u2077','8':'\u2078','9':'\u2079' };
  return String(n).split('').map(function(c){ return SUP[c] || c; }).join('');
}
function bodeChartSVG(pts, field, unit, W, H) {
  var padL = 46, padR = 16, padT = 14, padB = 24;
  var plotW = W - padL - padR, plotH = H - padT - padB;
  var vals = pts.map(function(p) { return p[field]; });
  var vMin = Math.min.apply(null, vals), vMax = Math.max.apply(null, vals);
  if (Math.abs(vMax - vMin) < 1e-6) { vMax += 1; vMin -= 1; }
  var margin = (vMax - vMin) * 0.1;
  vMax += margin; vMin -= margin;
  var logMin = Math.log10(pts[0].w), logMax = Math.log10(pts[pts.length-1].w);
  function sx(w) { return padL + ((Math.log10(w) - logMin) / (logMax - logMin)) * plotW; }
  function sy(v) { return padT + plotH - ((v - vMin) / (vMax - vMin)) * plotH; }
  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block;">';
  s += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="var(--bg-grid)"/>';
  var decades = [];
  for (var d = Math.floor(logMin); d <= Math.ceil(logMax); d++) decades.push(d);
  decades.forEach(function(d) {
    var w = Math.pow(10, d);
    if (w < pts[0].w || w > pts[pts.length-1].w) return;
    var xx = sx(w);
    s += '<line x1="' + xx + '" y1="' + padT + '" x2="' + xx + '" y2="' + (padT+plotH) + '" stroke="var(--edge-soft)" stroke-width="1"/>';
    s += '<text x="' + xx + '" y="' + (H-6) + '" text-anchor="middle" fill="var(--ink-faint)" font-family="monospace" font-size="9.5">10' + supNum(d) + '</text>';
  });
  if (vMin < 0 && vMax > 0) { var y0 = sy(0); s += '<line x1="' + padL + '" y1="' + y0 + '" x2="' + (padL+plotW) + '" y2="' + y0 + '" stroke="var(--edge)" stroke-width="1.3"/>'; }
  s += '<text x="4" y="' + (padT+9) + '" fill="var(--ink-faint)" font-family="monospace" font-size="9">' + fmtNum(vMax,1) + unit + '</text>';
  s += '<text x="4" y="' + (padT+plotH-2) + '" fill="var(--ink-faint)" font-family="monospace" font-size="9">' + fmtNum(vMin,1) + unit + '</text>';
  var poly = pts.map(function(p) { return sx(p.w) + ',' + sy(p[field]); }).join(' ');
  s += '<polyline points="' + poly + '" fill="none" stroke="var(--c-mass)" stroke-width="2.2"/>';
  s += '</svg>';
  return s;
}
function renderBode(res) {
  var el = document.getElementById('tabBode');
  if (!res.forces.length || !res.rn.length || !res.tf) {
    el.innerHTML = '<div class="empty-hint">Agrega una masa/inercia y una fuerza para calcular la respuesta en frecuencia.</div>';
    return;
  }
  var range = bodeFreqRange(res.poles, res.zeros);
  var pts = computeBodePoints(res.tf.num, res.tf.den, range.lo, range.hi, 220);
  var html = '<div class="matrix-label">Magnitud (dB)</div>';
  html += '<div class="analysis-graph" data-graph-source="bode-mag-graph" data-graph-title="Bode: magnitud">' + bodeChartSVG(pts, 'magDb', '', 1000, 190) + '</div>';
  html += '<div class="matrix-label" style="margin-top:14px;">Fase (grados)</div>';
  html += '<div class="analysis-graph" data-graph-source="bode-phase-graph" data-graph-title="Bode: fase">' + bodeChartSVG(pts, 'phaseDeg', String.fromCharCode(176), 1000, 190) + '</div>';
  html += '<div class="eq-note">Eje horizontal: frecuencia en rad/s, escala logaritmica de ' + fmtNum(range.lo,3) + ' a ' + fmtNum(range.hi,0) + ' rad/s.</div>';
  el.innerHTML = html;
}

/* =========================================================================
   Metricas de respuesta al escalon
   ========================================================================= */
function computeStepMetrics(res) {
  if (!res.tf) return null;
  var poles = res.poles, den = res.tf.den, num = res.tf.num;
  var stable = poles.every(function(p) { return p.re < -1e-6; });
  var denAt0 = den[den.length-1], numAt0 = num[num.length-1];
  var hasIntegrator = Math.abs(denAt0) < 1e-9;
  var yssAnalytic = hasIntegrator ? null : numAt0 / denAt0;

  var minAbsRe = Infinity;
  poles.forEach(function(p) { if (p.re < -1e-9) minAbsRe = Math.min(minAbsRe, Math.abs(p.re)); });
  var duration = (stable && isFinite(minAbsRe)) ? Math.min(90, Math.max(6, 8 / minAbsRe)) : 20;

  var n = res.A.length;
  var x = new Array(n).fill(0);
  var steps = 2500;
  var h = duration / steps;
  var uFuncs = [function() { return 1; }];
  var Bcols = [res.Bcol];
  var samples = [];
  var t = 0;
  for (var i = 0; i < steps; i++) { x = rk4Step(res.A, Bcols, uFuncs, t, x, h); t += h; samples.push({ t: t, y: dotv(res.Crow, x) }); }

  var yFinalSim = samples.length ? samples[samples.length-1].y : 0;
  var yss = (yssAnalytic !== null && isFinite(yssAnalytic)) ? yssAnalytic : yFinalSim;

  var peak = samples[0] || { t: 0, y: 0 };
  samples.forEach(function(s) { if (Math.abs(s.y) > Math.abs(peak.y)) peak = s; });
  var overshootPct = (Math.abs(yss) > 1e-9) ? ((peak.y - yss) / Math.abs(yss)) * 100 : null;

  var t10 = null, t90 = null;
  var target10 = 0.1 * yss, target90 = 0.9 * yss;
  for (var k = 0; k < samples.length; k++) {
    if (t10 === null && Math.abs(samples[k].y) >= Math.abs(target10)) t10 = samples[k].t;
    if (t90 === null && Math.abs(samples[k].y) >= Math.abs(target90)) { t90 = samples[k].t; break; }
  }

  var band = Math.max(0.02 * Math.abs(yss), 1e-6);
  var settleT = 0;
  for (var k2 = samples.length - 1; k2 >= 0; k2--) {
    if (Math.abs(samples[k2].y - yss) > band) { settleT = (k2+1 < samples.length) ? samples[k2+1].t : samples[k2].t; break; }
  }

  return {
    stable: stable, hasIntegrator: hasIntegrator, yss: yss,
    overshootPct: overshootPct, peakTime: peak.t,
    riseTime: (t10 !== null && t90 !== null) ? (t90 - t10) : null,
    settlingTime: settleT, duration: duration
  };
}
function stepMetricsHTML(res) {
  var m = computeStepMetrics(res);
  if (!m) return '';
  var U = UNITS[state.mode];
  var outUnit = state.outputType === 'vel' ? U.velUnit : U.posUnit;
  var rows = '';
  if (!m.stable) {
    rows += '<div class="row"><span>Aviso</span><span>Sistema inestable o marginal: metricas clasicas no aplicables</span></div>';
  } else {
    rows += '<div class="row"><span>Valor final (escalon unitario)</span><span>' + fmtNum(m.yss,4) + ' ' + outUnit + '</span></div>';
    rows += '<div class="row"><span>Sobreimpulso</span><span>' + (m.overshootPct !== null ? fmtNum(Math.max(m.overshootPct,0),2) + '%' : 'N/A') + '</span></div>';
    rows += '<div class="row"><span>Tiempo de pico</span><span>' + fmtNum(m.peakTime,3) + ' s</span></div>';
    rows += '<div class="row"><span>Tiempo de subida (10-90%)</span><span>' + (m.riseTime !== null ? fmtNum(m.riseTime,3) + ' s' : 'N/A') + '</span></div>';
    rows += '<div class="row"><span>Tiempo de asentamiento (&plusmn;2%)</span><span>' + fmtNum(m.settlingTime,3) + ' s</span></div>';
  }
  return '<div class="matrix-label">Metricas de respuesta al escalon</div><div class="pz-list">' + rows + '</div>' +
    '<div class="eq-note">Calculadas con una entrada escalon unitario aplicada en la misma entrada/salida seleccionadas arriba, independientemente de la forma de onda configurada para la simulacion.</div>';
}

var lastResults = null;
function renderResults() {
  var res = computeAll();
  lastResults = res;
  document.getElementById('tabEq').innerHTML = buildEquationsHTML() + '<div class="eq-note">Ecuaciones de Newton (2a ley) para cada elemento, generadas a partir de la topologia actual.</div>';
  renderTF(res);
  renderStateSpace(res);
  renderPolesZeros(res);
  renderBode(res);
  renderPhase(res);
  if (typeof syncGraphViewer === 'function') syncGraphViewer();
  return res;
}

/* =========================================================================
   Retrato de fase (theta vs theta') para cada eslabon del pendulo.
   Se alimenta desde simUI.phaseBuf; si esta vacio, se ejecuta una
   simulacion auxiliar corta a partir de las condiciones iniciales.
   ========================================================================= */
function renderPhase(res) {
  var el = document.getElementById('tabPhase');
  if (!el) return;
  if (state.mode !== 'pend' || !state.links.length) {
    el.innerHTML = '<div class="empty-hint">El retrato de fase esta disponible en el modo Pendulo. Agrega eslabones para verlo.</div>';
    return;
  }
  var links = state.links;
  var N = links.length;
  // Buffer preferente: samples de la simulacion en curso
  var series = [];
  if (simUI && simUI.pendSamples && simUI.pendSamples.length > 4) {
    for (var i = 0; i < N; i++) {
      series.push(simUI.pendSamples.map(function(s){ return { th: s.z[i], om: s.z[N + i] }; }));
    }
  } else {
    // Simulacion auxiliar rapida desde las condiciones iniciales
    var z0 = new Array(2 * N).fill(0);
    for (var i2 = 0; i2 < N; i2++) { z0[i2] = links[i2].theta0 || 0; z0[N + i2] = links[i2].omega0 || 0; }
    var z = z0.slice();
    var series0 = [];
    for (var k = 0; k < N; k++) series0.push([]);
    var steps = 1500, dt = 0.008;
    var tauZero = function() { var t = new Array(N).fill(0); return t; };
    for (var s2 = 0; s2 < steps; s2++) {
      for (var kk = 0; kk < N; kk++) series0[kk].push({ th: z[kk], om: z[N+kk] });
      z = pendulumStep(links, z, tauZero, s2*dt, dt);
    }
    series = series0;
  }
  var COLORS = ['var(--c-mass)','var(--c-force)','var(--c-spring)','var(--c-damper)','var(--c-wall)'];
  var W = 460, H = 320, padL = 42, padB = 30, padT = 16, padR = 14;
  var plotW = W - padL - padR, plotH = H - padT - padB;
  var thMax = 0.5, omMax = 0.5;
  series.forEach(function(seq) { seq.forEach(function(p) { thMax = Math.max(thMax, Math.abs(p.th)); omMax = Math.max(omMax, Math.abs(p.om)); }); });
  thMax *= 1.15; omMax *= 1.15;
  function sx(v) { return padL + (v + thMax) / (2 * thMax) * plotW; }
  function sy(v) { return padT + plotH - (v + omMax) / (2 * omMax) * plotH; }
  var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block;background:var(--bg-grid);border:1px solid var(--edge);border-radius:8px;">';
  svg += '<line x1="' + padL + '" y1="' + sy(0) + '" x2="' + (padL+plotW) + '" y2="' + sy(0) + '" stroke="var(--edge)" stroke-width="1"/>';
  svg += '<line x1="' + sx(0) + '" y1="' + padT + '" x2="' + sx(0) + '" y2="' + (padT+plotH) + '" stroke="var(--edge)" stroke-width="1"/>';
  svg += '<text x="' + (padL+plotW-4) + '" y="' + (sy(0)-4) + '" text-anchor="end" fill="var(--ink-faint)" font-family="monospace" font-size="10">' + String.fromCharCode(952) + ' [rad]</text>';
  svg += '<text x="' + (sx(0)+4) + '" y="' + (padT+10) + '" fill="var(--ink-faint)" font-family="monospace" font-size="10">' + String.fromCharCode(952) + "' [rad/s]</text>";
  svg += '<text x="' + padL + '" y="' + (padT+plotH+18) + '" fill="var(--ink-faint)" font-family="monospace" font-size="9.5">-' + fmtNum(thMax,2) + '</text>';
  svg += '<text x="' + (padL+plotW) + '" y="' + (padT+plotH+18) + '" text-anchor="end" fill="var(--ink-faint)" font-family="monospace" font-size="9.5">+' + fmtNum(thMax,2) + '</text>';
  svg += '<text x="4" y="' + (padT+8) + '" fill="var(--ink-faint)" font-family="monospace" font-size="9.5">+' + fmtNum(omMax,2) + '</text>';
  svg += '<text x="4" y="' + (padT+plotH) + '" fill="var(--ink-faint)" font-family="monospace" font-size="9.5">-' + fmtNum(omMax,2) + '</text>';
  series.forEach(function(seq, i) {
    if (seq.length < 2) return;
    var pts = seq.map(function(p) { return sx(p.th) + ',' + sy(p.om); }).join(' ');
    svg += '<polyline points="' + pts + '" fill="none" stroke="' + COLORS[i % COLORS.length] + '" stroke-width="1.6" opacity="0.9"/>';
    var last = seq[seq.length-1];
    svg += '<circle cx="' + sx(last.th) + '" cy="' + sy(last.om) + '" r="3.5" fill="' + COLORS[i % COLORS.length] + '"/>';
  });
  svg += '</svg>';
  var legend = '<div class="scope-legend" style="margin-top:10px;">';
  links.forEach(function(l, i) { legend += '<span><span class="swatch" style="background:' + COLORS[i % COLORS.length] + '"></span>' + l.label + ' (' + String.fromCharCode(952) + ' vs ' + String.fromCharCode(952) + "')</span>"; });
  legend += '</div>';
  var note = '<div class="eq-note">Retrato de fase generado a partir de la simulacion no lineal (Lagrange). Presiona Simular para actualizar con la respuesta forzada; en reposo se usa una simulacion auxiliar desde las condiciones iniciales.</div>';
  el.innerHTML = '<div class="analysis-graph" data-graph-source="phase-graph" data-graph-title="Retrato de fase">' + svg + '</div>' + legend + note;
}
