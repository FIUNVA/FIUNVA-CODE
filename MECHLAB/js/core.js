'use strict';
function zeros(n, m) { m = m === undefined ? n : m; const M = []; for (let i = 0; i < n; i++) M.push(new Array(m).fill(0)); return M; }
function identity(n) { const M = zeros(n, n); for (let i = 0; i < n; i++) M[i][i] = 1; return M; }
function matMul(A, B) { const n = A.length, k = B.length, m = B[0].length; const R = zeros(n, m); for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { let s = 0; for (let p = 0; p < k; p++) s += A[i][p] * B[p][j]; R[i][j] = s; } return R; }
function matAdd(A, B, sB) { sB = sB === undefined ? 1 : sB; const n = A.length, m = A[0].length; const R = zeros(n, m); for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) R[i][j] = A[i][j] + sB * B[i][j]; return R; }
function trace(A) { let s = 0; for (let i = 0; i < A.length; i++) s += A[i][i]; return s; }
function matVec(A, v) { const n = A.length, m = v.length; const r = new Array(n).fill(0); for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < m; j++) s += A[i][j] * v[j]; r[i] = s; } return r; }
function dotv(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }

function faddeevLeVerrier(A) {
  const n = A.length;
  if (n === 0) return { den: [1], Mk: [] };
  let Mprev = identity(n);
  const Mk = [Mprev];
  const c = new Array(n + 1);
  c[n] = 1;
  c[n - 1] = -trace(matMul(A, Mprev));
  for (let k = 2; k <= n; k++) {
    const Mnew = matAdd(matMul(A, Mprev), identity(n), c[n - k + 1]);
    Mk.push(Mnew);
    c[n - k] = -(1 / k) * trace(matMul(A, Mnew));
    Mprev = Mnew;
  }
  const den = c.slice().reverse();
  return { den: den, Mk: Mk };
}
function stateSpaceToTF(A, B, C, D) {
  const n = A.length;
  D = D || 0;
  if (n === 0) return { num: [D], den: [1] };
  const fl = faddeevLeVerrier(A);
  const den = fl.den, Mk = fl.Mk;
  const num = Mk.map(function(M) { return dotv(C, matVec(M, B)); });
  let numFull = num.slice();
  if (D !== 0) {
    numFull = [0].concat(num);
    for (let i = 0; i < den.length; i++) numFull[i] += D * den[i];
  }
  return { num: numFull, den: den };
}
function trimLeadingZeros(coeffs, eps) {
  eps = eps === undefined ? 1e-9 : eps;
  let i = 0;
  while (i < coeffs.length - 1 && Math.abs(coeffs[i]) < eps) i++;
  return coeffs.slice(i);
}
function polyEvalComplex(coeffs, z) {
  let re = 0, im = 0;
  for (let i = 0; i < coeffs.length; i++) {
    const nre = re * z.re - im * z.im + coeffs[i];
    const nim = re * z.im + im * z.re;
    re = nre; im = nim;
  }
  return { re: re, im: im };
}
function cSub(a, b) { return { re: a.re - b.re, im: a.im - b.im }; }
function cMul(a, b) { return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }; }
function cDiv(a, b) { const d = b.re * b.re + b.im * b.im; if (d < 1e-18) return { re: 0, im: 0 }; return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }; }
function cAbs(a) { return Math.sqrt(a.re * a.re + a.im * a.im); }
function findRoots(coeffsIn, maxIter) {
  maxIter = maxIter || 250;
  let coeffs = trimLeadingZeros(coeffsIn.slice());
  const n = coeffs.length - 1;
  if (n <= 0) return [];
  const lead = coeffs[0];
  coeffs = coeffs.map(function(c) { return c / lead; });
  if (n === 1) return [{ re: -coeffs[1], im: 0 }];
  let roots = [];
  const base = { re: 0.4, im: 0.9 };
  let p = { re: 1, im: 0 };
  for (let i = 0; i < n; i++) { roots.push(p); p = cMul(p, base); }
  for (let iter = 0; iter < maxIter; iter++) {
    let maxDelta = 0;
    const newRoots = roots.slice();
    for (let i = 0; i < n; i++) {
      let denom = { re: 1, im: 0 };
      for (let j = 0; j < n; j++) { if (j === i) continue; denom = cMul(denom, cSub(roots[i], roots[j])); }
      const num = polyEvalComplex(coeffs, roots[i]);
      const delta = cDiv(num, denom);
      newRoots[i] = cSub(roots[i], delta);
      maxDelta = Math.max(maxDelta, cAbs(delta));
    }
    roots = newRoots;
    if (maxDelta < 1e-12) break;
  }
  return roots.map(function(r) { return Math.abs(r.im) < 1e-6 ? { re: r.re, im: 0 } : r; });
}
function controllableCanonical(num, den) {
  const n = den.length - 1;
  const a = den.slice(1);
  const A = zeros(n, n);
  for (let i = 0; i < n - 1; i++) A[i][i + 1] = 1;
  for (let j = 0; j < n; j++) A[n - 1][j] = -a[n - 1 - j];
  const B = zeros(n, 1);
  B[n - 1][0] = 1;
  const b = num.slice();
  const C = [b.slice().reverse()];
  return { A: A, B: B, C: C, D: [[0]] };
}
function observableCanonical(num, den) {
  const ccf = controllableCanonical(num, den);
  const n = ccf.A.length;
  const A = zeros(n, n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) A[i][j] = ccf.A[j][i];
  const B = zeros(n, 1);
  for (let i = 0; i < n; i++) B[i][0] = ccf.C[0][i];
  const C = [new Array(n).fill(0)];
  C[0][n - 1] = 1;
  return { A: A, B: B, C: C, D: [[0]] };
}
function rk4Step(A, Bcols, uFuncs, t, x, dt) {
  const n = x.length;
  function deriv(tt, xx) {
    let dx = matVec(A, xx);
    for (let k = 0; k < Bcols.length; k++) { const u = uFuncs[k](tt); for (let i = 0; i < n; i++) dx[i] += Bcols[k][i] * u; }
    return dx;
  }
  const k1 = deriv(t, x);
  const x2 = x.map(function(v, i) { return v + (dt / 2) * k1[i]; });
  const k2 = deriv(t + dt / 2, x2);
  const x3 = x.map(function(v, i) { return v + (dt / 2) * k2[i]; });
  const k3 = deriv(t + dt / 2, x3);
  const x4 = x.map(function(v, i) { return v + dt * k3[i]; });
  const k4 = deriv(t + dt, x4);
  return x.map(function(v, i) { return v + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]); });
}

/* =========================================================================
   Formato numerico
   ========================================================================= */
function fmtNum(v, dp) {
  dp = dp === undefined ? 3 : dp;
  if (Math.abs(v) < 1e-9) return '0';
  var r = Math.round(v * Math.pow(10, dp)) / Math.pow(10, dp);
  if (Math.abs(r - Math.round(r)) < 1e-9) return String(Math.round(r));
  return r.toFixed(dp).replace(/0+$/, '').replace(/\.$/, '');
}
function formatPoly(coeffsDesc, s) {
  s = s || 's';
  var n = coeffsDesc.length - 1;
  var parts = [];
  for (var i = 0; i < coeffsDesc.length; i++) {
    var power = n - i;
    var c = coeffsDesc[i];
    if (Math.abs(c) < 1e-9) continue;
    var abs = Math.abs(c);
    var sign = c < 0 ? String.fromCharCode(8722) : (parts.length ? '+' : '');
    var term;
    if (power === 0) term = fmtNum(abs);
    else if (power === 1) term = (Math.abs(abs - 1) < 1e-9 ? '' : fmtNum(abs) + String.fromCharCode(183)) + s;
    else term = (Math.abs(abs - 1) < 1e-9 ? '' : fmtNum(abs) + String.fromCharCode(183)) + s + '<sup>' + power + '</sup>';
    parts.push((sign ? sign + ' ' : '') + term);
  }
  if (!parts.length) return '0';
  return parts.join(' ');
}
function formatComplex(z) {
  if (Math.abs(z.im) < 1e-6) return fmtNum(z.re, 3);
  var sign = z.im < 0 ? String.fromCharCode(8722) : '+';
  return fmtNum(z.re, 3) + ' ' + sign + ' ' + fmtNum(Math.abs(z.im), 3) + 'j';
}
function fmtMatrixHTML(M) {
  var rows = M.map(function(row) {
    return '<tr>' + row.map(function(v){ return '<td>' + fmtNum(v, 3) + '</td>'; }).join('') + '</tr>';
  }).join('');
  return '<div class="bracket"><table class="matrix">' + rows + '</table></div>';
}

/* =========================================================================
   Solucionador lineal denso (eliminacion Gauss con pivoteo parcial)
   ========================================================================= */
function solveLinear(Ain, bin) {
  var n = Ain.length;
  var M = [];
  for (var i = 0; i < n; i++) { var r = Ain[i].slice(); r.push(bin[i]); M.push(r); }
  for (var col = 0; col < n; col++) {
    var piv = col, best = Math.abs(M[col][col]);
    for (var r2 = col + 1; r2 < n; r2++) {
      var v = Math.abs(M[r2][col]);
      if (v > best) { best = v; piv = r2; }
    }
    if (best < 1e-12) throw new Error('Matriz singular');
    if (piv !== col) { var tmp = M[col]; M[col] = M[piv]; M[piv] = tmp; }
    var pv = M[col][col];
    for (var j = col; j <= n; j++) M[col][j] /= pv;
    for (var r3 = 0; r3 < n; r3++) {
      if (r3 === col) continue;
      var f = M[r3][col];
      if (Math.abs(f) < 1e-15) continue;
      for (var jj = col; jj <= n; jj++) M[r3][jj] -= f * M[col][jj];
    }
  }
  var x = new Array(n);
  for (var k = 0; k < n; k++) x[k] = M[k][n];
  return x;
}
function invertMatrix(A) {
  var n = A.length;
  var Inv = zeros(n, n);
  for (var col = 0; col < n; col++) {
    var e = new Array(n).fill(0); e[col] = 1;
    var x = solveLinear(A, e);
    for (var r = 0; r < n; r++) Inv[r][col] = x[r];
  }
  return Inv;
}
