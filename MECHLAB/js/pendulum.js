/* =========================================================================
   Modo Pendulo: dinamica multi-eslabon (masa puntual en el extremo).

   Convencion: theta_i es el angulo del eslabon i medido desde la vertical
   hacia abajo, positivo en sentido antihorario. El pivote raiz es fijo.
   Cada eslabon i tiene: L_i (longitud), mass_i (masa concentrada en el
   extremo), b_i (amortiguamiento del articulo entre eslabon i-1 y i;
   el articulo 0 conecta el pivote fijo con el eslabon 0).

   Ecuacion: M(theta) * theta.. + h(theta, theta.) + B * theta. + G(theta) = tau

   Linealizacion en theta = 0, theta. = 0:
     M0_{kl} = L_k * L_l * mu_max(k,l)     con mu_j = sum_{i>=j} mass_i
     K0_{ii} = g * L_i * mu_i               (diagonal)
     B0 tridiagonal a partir de b_i
   ========================================================================= */
'use strict';
var GRAVITY = 9.81;
var PEND_PIVOT = { x: 700, y: 200 };

function pendulumMu(links) {
  var N = links.length;
  var mu = new Array(N);
  if (N === 0) return mu;
  mu[N - 1] = Math.max(links[N - 1].mass, 1e-6);
  for (var i = N - 2; i >= 0; i--) mu[i] = mu[i + 1] + Math.max(links[i].mass, 1e-6);
  return mu;
}
function pendulumMassMatrix(links, thetas, mu) {
  var N = links.length;
  var M = zeros(N, N);
  for (var k = 0; k < N; k++) for (var l = 0; l < N; l++) {
    var Akl = links[k].L * links[l].L * mu[Math.max(k, l)];
    M[k][l] = Akl * Math.cos(thetas[k] - thetas[l]);
  }
  return M;
}
function pendulumDampingMatrix(links) {
  var N = links.length;
  var B = zeros(N, N);
  for (var i = 0; i < N; i++) {
    var bi = Math.max(0, links[i].b || 0);
    if (bi <= 0) continue;
    B[i][i] += bi;
    if (i > 0) {
      B[i - 1][i - 1] += bi;
      B[i][i - 1] -= bi;
      B[i - 1][i] -= bi;
    }
  }
  return B;
}
function pendulumGravityDiag(links, mu) {
  var N = links.length;
  var K = zeros(N, N);
  for (var i = 0; i < N; i++) K[i][i] = GRAVITY * links[i].L * mu[i];
  return K;
}

function pendulumBuildLinear(links, inputLinkId) {
  var N = links.length;
  if (N === 0) return null;
  var mu = pendulumMu(links);
  var M0 = pendulumMassMatrix(links, new Array(N).fill(0), mu);
  var K0 = pendulumGravityDiag(links, mu);
  var B0 = pendulumDampingMatrix(links);
  var M0inv;
  try { M0inv = invertMatrix(M0); }
  catch (e) { return null; }
  var MinvK = matMul(M0inv, K0);
  var MinvB = matMul(M0inv, B0);
  var A = zeros(2 * N, 2 * N);
  for (var i = 0; i < N; i++) A[i][N + i] = 1;
  for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
    A[N + r][c] = -MinvK[r][c];
    A[N + r][N + c] = -MinvB[r][c];
  }
  var Bcol = new Array(2 * N).fill(0);
  var idx = -1;
  if (inputLinkId != null) for (var k = 0; k < N; k++) if (links[k].id === inputLinkId) { idx = k; break; }
  if (idx !== -1) for (var kk = 0; kk < N; kk++) Bcol[N + kk] = M0inv[kk][idx];
  return { A: A, Bcol: Bcol, M0: M0, K0: K0, B0: B0, M0inv: M0inv, mu: mu, N: N, inputIdx: idx };
}

function pendulumDeriv(links, z, tau) {
  var N = links.length;
  var thetas = z.slice(0, N), omegas = z.slice(N, 2 * N);
  var mu = pendulumMu(links);
  var M = pendulumMassMatrix(links, thetas, mu);
  var B = pendulumDampingMatrix(links);
  var rhs = new Array(N);
  for (var i = 0; i < N; i++) {
    var s = (tau[i] || 0) - GRAVITY * links[i].L * mu[i] * Math.sin(thetas[i]);
    for (var l = 0; l < N; l++) {
      var Ail = links[i].L * links[l].L * mu[Math.max(i, l)];
      s -= Ail * Math.sin(thetas[i] - thetas[l]) * omegas[l] * omegas[l];
    }
    for (var j = 0; j < N; j++) s -= B[i][j] * omegas[j];
    rhs[i] = s;
  }
  var alpha;
  try { alpha = solveLinear(M, rhs); } catch (e) { alpha = new Array(N).fill(0); }
  return omegas.concat(alpha);
}
function pendulumStep(links, z, tauFn, t, dt) {
  var k1 = pendulumDeriv(links, z, tauFn(t));
  var z2 = z.map(function(v, i) { return v + dt / 2 * k1[i]; });
  var k2 = pendulumDeriv(links, z2, tauFn(t + dt / 2));
  var z3 = z.map(function(v, i) { return v + dt / 2 * k2[i]; });
  var k3 = pendulumDeriv(links, z3, tauFn(t + dt / 2));
  var z4 = z.map(function(v, i) { return v + dt * k3[i]; });
  var k4 = pendulumDeriv(links, z4, tauFn(t + dt));
  return z.map(function(v, i) { return v + dt / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]); });
}

/* Posicion cartesiana del extremo (bob) de cada eslabon, dada la lista de
   angulos actuales. Pivote raiz en PEND_PIVOT. Devuelve arreglo de puntos
   con index 0 = pivote, 1..N = extremos de cada eslabon. */
function pendulumBobPositions(links, thetas) {
  var pts = [{ x: PEND_PIVOT.x, y: PEND_PIVOT.y }];
  var x = PEND_PIVOT.x, y = PEND_PIVOT.y;
  for (var i = 0; i < links.length; i++) {
    var Lpx = links[i].L * 180; // 3x la escala visual anterior
    x += Lpx * Math.sin(thetas[i]);
    y += Lpx * Math.cos(thetas[i]);
    pts.push({ x: x, y: y });
  }
  return pts;
}