
'use strict';
/* ============================================================
   CNC LATHE (FANUC) G-CODE INTERPRETER — CORE LOGIC
   ============================================================ */
/* ============================================================
   CNC LATHE (FANUC) G-CODE INTERPRETER — CORE LOGIC
   Pure JS, no DOM dependencies, usable in browser or Node.
   ============================================================ */

const ARC_SEGMENTS = 96; // polyline resolution for G02/G03

// Width of the grooving/parting insert, in mm. Fanuc's G75 has no tool-geometry word, so a
// cycle that plunges without a Z would cut a zero-width slit that the heightmap cannot show
// (it can only sample the material AT the tool's Z). The simulator therefore assumes this
// width and sweeps the whole band; the glosario states the approximation.
const GROOVE_TOOL_WIDTH = 3;
/* Radius of the pip ("tetón") a parting cycle leaves behind when it stops EXACTLY on the axis.
   A real parting insert has a nose radius, so a cut that ends at X0 cannot reach a mathematical
   point at the centre of rotation: a small core of material survives, and the bar is left
   attached by it. That is why practice parts PAST the axis (X-1.5 and beyond) instead of
   stopping on it. The simulator does not model the tool's nose geometry, so this is a single
   representative radius standing in for it — enough to show the defect, small enough that the
   separation still reads as complete. A cycle that overshoots the axis leaves no pip. */
const PART_OFF_PIP = 0.4;

/* ---------- Tokenizer ---------- */
// Letters whose value is a physical dimension in FANUC's "decimal point
// programming": written WITH a decimal point the number is plain mm; written
// WITHOUT one it's read in the machine's least input increment (thousandths
// of a millimeter here), i.e. a bare "X100" means X0.100, not X100.
const DIMENSIONAL_LETTERS = new Set(['X', 'Z', 'U', 'W', 'R', 'F']);

function tokenizeLine(rawLine) {
  const warnings = [];
  let line = rawLine.replace(/\(.*?\)/g, ' '); // strip (comments)
  line = line.split('%')[0].trim();
  if (!line) return { words: [], warnings, missingSemicolon: false };

  const hasSemicolon = /;\s*$/.test(line);
  line = line.replace(/;+\s*$/, '').trim();
  if (!line) return { words: [], warnings, missingSemicolon: false };
  if (!hasSemicolon) {
    // A block with no end-of-block marker is not valid FANUC syntax — the
    // whole line is ignored rather than guessed at.
    return { words: [], warnings, missingSemicolon: true };
  }

  const words = [];
  const re = /([A-Za-z])\s*([-+]?[0-9.]+)/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    const letter = m[1].toUpperCase();
    const numStr = m[2];
    let val = parseFloat(numStr);
    if (Number.isNaN(val)) {
      warnings.push(`valor no numérico tras '${letter}'`);
      continue;
    }
    // flag stray extra decimal points (e.g. "-18.5.") — parseFloat already
    // gracefully truncates at the first invalid char, we just note it.
    if ((numStr.match(/\./g) || []).length > 1) {
      warnings.push(`se ignoró un punto decimal adicional en '${letter}${numStr}' (interpretado como ${letter}${val})`);
    }
    if (DIMENSIONAL_LETTERS.has(letter) && !numStr.includes('.')) {
      const scaled = val / 1000;
      warnings.push(`'${letter}${numStr}' sin punto decimal — interpretado en milésimas de mm (${letter}${scaled})`);
      val = scaled;
    }
    words.push({ letter, value: val });
  }
  return { words, warnings, missingSemicolon: false };
}

function wordsToMap(words) {
  const map = {};
  for (const w of words) {
    if (!map[w.letter]) map[w.letter] = [];
    map[w.letter].push(w.value);
  }
  return map;
}

/* ---------- Pass 1: tokenize all lines, build N-label map ---------- */
function tokenizeProgram(text) {
  const rawLines = text.split(/\r?\n/);
  const blocks = [];
  const labelMap = {};
  const warnings = [];
  const noSemiLines = [];

  rawLines.forEach((raw, idx) => {
    const { words, warnings: w, missingSemicolon } = tokenizeLine(raw);
    w.forEach(msg => warnings.push({ line: idx, message: msg }));
    if (missingSemicolon) noSemiLines.push(idx);
    const map = wordsToMap(words);
    const block = { line: idx, raw, words, map, skip: false };
    if (map.N && map.N.length) {
      labelMap[map.N[0]] = blocks.length;
    }
    blocks.push(block);
  });

  return { blocks, labelMap, warnings, noSemiLines };
}

/* ---------- Geometry helpers ---------- */
function resolveArcPoints(x0, z0, x1, z1, r, cw) {
  // World plane: (z = horizontal, x = vertical) — standard lathe X-Z view.
  const dx = x1 - x0, dz = z1 - z0;
  const d = Math.hypot(dx, dz);
  if (d < 1e-9) return { points: [{ x: x0, z: z0 }], ok: true, degenerate: true };
  const absR = Math.abs(r);
  let h = absR * absR - (d / 2) * (d / 2);
  let degenerate = false;
  if (h < 0) { h = 0; degenerate = true; } // R too small for chord -> clamp to semicircle
  const m = Math.sqrt(h);
  const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
  const ux = dx / d, uz = dz / d;
  // perpendicular candidates
  const px = -uz, pz = ux;
  const c1 = { x: mx + px * m, z: mz + pz * m };
  const c2 = { x: mx - px * m, z: mz - pz * m };

  function sweep(c) {
    const a0 = Math.atan2(x0 - c.x, z0 - c.z);
    const a1 = Math.atan2(x1 - c.x, z1 - c.z);
    let diff = a1 - a0;
    // normalize based on direction: cw => angle should decrease (in this atan2(x,z) frame,
    // increasing angle corresponds to CCW sweep visually consistent with G03)
    if (cw) {
      while (diff > 0) diff -= 2 * Math.PI;
    } else {
      while (diff < 0) diff += 2 * Math.PI;
    }
    return { a0, a1: a0 + diff, diff };
  }

  const s1 = sweep(c1), s2 = sweep(c2);
  // Positive-R convention (Fanuc): choose the minor arc (<=180°)
  const chosen = Math.abs(s1.diff) <= Math.abs(s2.diff) ? { c: c1, s: s1 } : { c: c2, s: s2 };

  const pts = [];
  // Enough segments that even a small arc stays visibly smooth and lands
  // exactly on its endpoints; short arcs previously got too few points and
  // read as a broken or faceted corner.
  const n = Math.max(16, Math.round(ARC_SEGMENTS * Math.min(1, Math.abs(chosen.s.diff) / Math.PI)));
  for (let i = 0; i <= n; i++) {
    const a = chosen.s.a0 + (chosen.s.diff * i) / n;
    pts.push({ x: chosen.c.x + absR * Math.sin(a), z: chosen.c.z + absR * Math.cos(a) });
  }
  // ensure exact endpoints
  pts[0] = { x: x0, z: z0 };
  pts[pts.length - 1] = { x: x1, z: z1 };
  return { points: pts, center: chosen.c, ok: true, degenerate };
}

/* ---------- Resolve a single motion block given current state ---------- */
function resolveMotionBlock(block, state) {
  const map = block.map;
  const hasG = !!map.G;
  let gVal = hasG ? map.G[0] : null;

  if (hasG && [0, 1, 2, 3].includes(gVal)) {
    state.motionG = gVal;
  }
  const activeG = hasG && [0, 1, 2, 3].includes(gVal) ? gVal : state.motionG;

  if (map.F && map.F.length) state.f = map.F[0];
  if (map.S && map.S.length) state.s = map.S[0];

  const x0 = state.x, z0 = state.z;
  let x1 = x0, z1 = z0;
  // X (and incremental U) are programmed in DIAMETER per standard FANUC lathe
  // convention — convert to true radius immediately so all downstream geometry
  // (arcs, offsets, distances) works in real physical space.
  if (map.X && map.X.length) x1 = map.X[0] / 2;
  else if (map.U && map.U.length) x1 = x0 + map.U[0] / 2;
  if (map.Z && map.Z.length) z1 = map.Z[0];
  else if (map.W && map.W.length) z1 = z0 + map.W[0];

  const moved = (x1 !== x0) || (z1 !== z0);
  if (!moved || activeG === null) {
    return { segment: null, warnings: [] };
  }

  const warnings = [];
  let segment = null;
  if (activeG === 0) {
    segment = { type: 'rapid', from: { x: x0, z: z0 }, to: { x: x1, z: z1 },
      points: [{ x: x0, z: z0 }, { x: x1, z: z1 }], line: block.line, f: state.f, s: state.s };
  } else if (activeG === 1) {
    segment = { type: 'feed', from: { x: x0, z: z0 }, to: { x: x1, z: z1 },
      points: [{ x: x0, z: z0 }, { x: x1, z: z1 }], line: block.line, f: state.f, s: state.s };
  } else if (activeG === 2 || activeG === 3) {
    const r = (map.R && map.R.length) ? map.R[0] : null;
    if (r === null) {
      warnings.push({ line: block.line, message: 'G02/G03 sin radio R — se interpreta como línea recta' });
      segment = { type: 'feed', from: { x: x0, z: z0 }, to: { x: x1, z: z1 },
        points: [{ x: x0, z: z0 }, { x: x1, z: z1 }], line: block.line, f: state.f, s: state.s };
    } else {
      const cw = activeG === 2;
      const arc = resolveArcPoints(x0, z0, x1, z1, r, cw);
      if (arc.degenerate) warnings.push({ line: block.line, message: 'Radio de arco menor que la cuerda — geometría aproximada' });
      segment = { type: 'feed', arc: true, from: { x: x0, z: z0 }, to: { x: x1, z: z1 },
        points: arc.points, center: arc.center, r: Math.abs(r), cw, line: block.line, f: state.f, s: state.s };
    }
  }

  state.x = x1; state.z = z1;
  return { segment, warnings };
}

/* ---------- Resolve a sub-profile (blocks between N=P and N=Q) ---------- */
function resolveSubProfile(blocks, startIdx, endIdx, initialState) {
  const state = { ...initialState };
  const segments = [];
  const warnings = [];
  for (let i = startIdx; i <= endIdx; i++) {
    const b = blocks[i];
    const { segment, warnings: w } = resolveMotionBlock(b, state);
    warnings.push(...w);
    if (segment) segments.push(segment);
  }
  // The contour itself starts at the first CUTTING block's own target (not the
  // tool's pre-cycle approach position) — that approach move is handled
  // separately by the caller (it is not part of the finished-part geometry).
  // Taking the first *segment's* target was not enough on its own: a profile that
  // opens with a positioning move (the Ej. 3's "N1 G00 Z-74.") made that rapid's
  // target the contour's first point, which drags the approach DIAMETER into the
  // profile and from there into the stock size — the preceding "G00 X51." then
  // drew the bar at Ø51 around a part that maxes out at Ø50. A rapid only
  // POSITIONS, so leading rapids are not contour and are skipped.
  const firstCut = Math.max(0, segments.findIndex(seg => seg.type === 'feed'));
  const points = [];
  segments.forEach((seg, i) => {
    if (i < firstCut) return;
    points.push(...(i === firstCut ? seg.points.slice(-1) : seg.points.slice(1)));
  });
  return { segments, points, endState: state, warnings, firstCut };
}

/* ---------- Outward-normal contour offset (finishing allowance) ---------- */
function offsetProfile(points, outwardSign, allowU, allowW) {
  // allowU applies along the local X-facing (radial/OD) component,
  // allowW applies along the local Z-facing (shoulder/face) component.
  const n = points.length;
  if (n < 2) return points.map(p => ({ ...p }));
  const segN = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dz = points[i + 1].z - points[i].z;
    const len = Math.hypot(dx, dz) || 1;
    let nx = -dz / len, nz = dx / len; // perpendicular
    // orient outward: outward reference is purely radial (sign(x),0)
    const refX = outwardSign;
    if (nx * refX < 0) { nx = -nx; nz = -nz; }
    segN.push({ nx, nz });
  }
  const out = points.map(p => ({ x: p.x, z: p.z }));
  for (let i = 0; i < n; i++) {
    let nx, nz;
    if (i === 0) { nx = segN[0].nx; nz = segN[0].nz; }
    else if (i === n - 1) { nx = segN[n - 2].nx; nz = segN[n - 2].nz; }
    else {
      nx = (segN[i - 1].nx + segN[i].nx); nz = (segN[i - 1].nz + segN[i].nz);
      const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    }
    out[i].x = points[i].x + nx * allowU;
    out[i].z = points[i].z + nz * allowW;
  }
  return out;
}

/* ---------- Sign-aware "shallower of" clamp ---------- */
function clampToward(outwardSign, a, b) {
  // Returns whichever of a,b represents LESS material removed (closer to raw
  // stock, i.e. larger magnitude on the outwardSign side) — a rough pass may
  // never cut past what the finish contour allows at a given Z.
  return outwardSign < 0 ? Math.min(a, b) : Math.max(a, b);
}

/* Interpolate the offset-profile's x at an arbitrary index-fraction is not needed —
   we walk pass boundaries using the profile's own vertex list directly. */

/* ---------- Expand a G71 roughing cycle into concrete pass segments ---------- */
function findCrossingZ(finishPts, targetMag) {
  // FANUC Type I requires a monotonic contour, so the profile's magnitude
  // never decreases while walking from finishPts[0] toward the end. Returns
  // the Z where that magnitude first reaches targetMag — i.e. how far a flat
  // pass at this depth can travel before it would violate the finish
  // contour. If it never reaches targetMag, the pass runs the full length.
  for (let i = 0; i < finishPts.length - 1; i++) {
    const magA = Math.abs(finishPts[i].x), magB = Math.abs(finishPts[i + 1].x);
    const lo = Math.min(magA, magB), hi = Math.max(magA, magB);
    if (targetMag >= lo - 1e-9 && targetMag <= hi + 1e-9) {
      if (Math.abs(magB - magA) < 1e-9) return finishPts[i].z;
      const t = (targetMag - magA) / (magB - magA);
      return finishPts[i].z + t * (finishPts[i + 1].z - finishPts[i].z);
    }
  }
  return finishPts[finishPts.length - 1].z;
}

function expandG71(cfg, profilePoints, startState, outwardSign) {
  const { u: depth, r: retract, uf: allowU, wf: allowW } = cfg;
  const segments = [];
  const warnings = [];
  if (!depth || depth <= 0) {
    warnings.push({ line: cfg.line, message: 'G71 sin profundidad de pasada (U) válida — ciclo omitido' });
    return { segments, warnings, passCount: 0 };
  }
  // The raw stock size is NOT the tool's clearance position when G71 happens
  // to be called (that's just wherever the preceding facing routine left it,
  // often an oversized safety value) — it's derived purely from what the G71
  // cycle itself is machining: the finish contour's own largest diameter,
  // plus a modest allowance so there's real material left to rough away.
  const finishPts = offsetProfile(profilePoints, outwardSign, allowU || 0, allowW || 0);
  // Two different diameters, and conflating them is what put 0.5 mm on the readout.
  // `stockMag` is the finish contour PLUS the allowance: how much material the
  // roughing has to take before G70, and where the tool retracts to, so it has to
  // keep the allowance. `partMag` is the bar the program actually specifies — the
  // raw profile's largest diameter — and is what the drawing and the readout report.
  const partMag = Math.max(...profilePoints.map(p => Math.abs(p.x)));
  const profileMaxMag = Math.max(...finishPts.map(p => Math.abs(p.x)));
  const stockMag = profileMaxMag;
  const stockX = outwardSign < 0 ? -stockMag : stockMag;
  const stepSigned = outwardSign < 0 ? depth : -depth; // moves FROM stock TOWARD profile (depth is already a radius value per FANUC's G71 spec)
  const rr = retract || 0.5;
  const minFinishMag = Math.min(...finishPts.map(p => Math.abs(p.x)));
  const zStart = finishPts[0].z;

  const maxPasses = 200;
  let cur = stockX;
  let passCount = 0;
  let pos = { x: startState.x, z: startState.z }; // the tool's REAL position when G71 fires

  for (let k = 0; k < maxPasses; k++) {
    const Xk = cur + stepSigned;
    // A pass still removes material while its (unclamped) depth is beyond the
    // shallowest point the profile requires AND hasn't crossed past the axis
    // to the opposite side — a profile that reaches exactly X0 (a pointed
    // tip) makes minFinishMag 0, and without this sign check the loop would
    // never naturally stop: it would keep "cutting" through the centerline
    // and out the other side until the pass-count safety cap kicked in.
    const cutsSomething = Math.abs(Xk) > minFinishMag + 1e-6 && Math.sign(Xk) === outwardSign;
    if (!cutsSomething) break;
    passCount++;

    // A real Type I roughing pass is a PURE horizontal cut at this one depth —
    // it never hugs the profile's tapers/arcs (that's what G70 is for). It
    // simply runs from the face out to wherever the contour would otherwise
    // be violated, producing a stepped ("staircase") result.
    const zStop = findCrossingZ(finishPts, Math.abs(Xk));

    // 1. advance to this pass's depth — a pure X move, at whatever Z the
    // previous pass's return left the tool (zStart, after the first pass)
    if (Math.abs(pos.x - Xk) > 1e-9) {
      segments.push({ type: 'rapid', phase: 'rough', pass: passCount,
        points: [{ x: pos.x, z: pos.z }, { x: Xk, z: pos.z }] });
      pos = { x: Xk, z: pos.z };
    }
    // ensure Z is at the start reference before cutting (pure Z move; only
    // needed before the very first pass, every later pass already returns here)
    if (Math.abs(pos.z - zStart) > 1e-9) {
      segments.push({ type: 'rapid', phase: 'rough', pass: passCount,
        points: [{ x: pos.x, z: pos.z }, { x: pos.x, z: zStart }] });
      pos = { x: pos.x, z: zStart };
    }

    // 2. flat horizontal feed cut, constant X, straight to zStop
    segments.push({ type: 'feed', phase: 'rough', pass: passCount,
      points: [{ x: Xk, z: zStart }, { x: Xk, z: zStop }] });
    pos = { x: Xk, z: zStop };

    // 3. FANUC G71 retracts R in the X AXIS, against the direction of infeed, and
    // only then travels back in Z. Returning in Z at the same depth would slide the
    // tool along the surface the pass just cut.
    const xRet = Xk + outwardSign * rr;
    segments.push({ type: 'rapid', phase: 'rough', pass: passCount,
      points: [{ x: Xk, z: zStop }, { x: xRet, z: zStop }] });
    pos = { x: xRet, z: zStop };

    // 4. return to the start reference, now clear of the material
    segments.push({ type: 'rapid', phase: 'rough', pass: passCount,
      points: [{ ...pos }, { x: pos.x, z: zStart }] });
    pos = { x: pos.x, z: zStart };

    cur = Xk;
  }
  // final rapid back to a safe clearance point above stock before next operation
  segments.push({ type: 'rapid', phase: 'rough',
    points: [{ x: pos.x, z: pos.z }, { x: stockX, z: pos.z }] });
  pos = { x: stockX, z: pos.z };

  return { segments, warnings, passCount, endPos: pos, stockMag, partMag };
}

/* ---------- Expand a G72 (transversal / facing) roughing cycle ---------- */
function maxMagOverBand(pts, zLo, zHi) {
  // Largest profile magnitude over the band [zLo, zHi] — the contour radius a facing
  // pass must respect across the whole Z strip it owns. Returns null when the band
  // misses the contour entirely, so the caller can skip the pass rather than cut to
  // an arbitrary depth. Each segment is clipped to the band (not just sampled at its
  // endpoints), since a long taper can cross a whole band without a vertex inside it.
  const lo = Math.min(zLo, zHi), hi = Math.max(zLo, zHi);
  let m = 0, hit = false;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (Math.max(a.z, b.z) < lo - 1e-9 || Math.min(a.z, b.z) > hi + 1e-9) continue;
    const dz = b.z - a.z;
    let t0 = 0, t1 = 1;
    if (Math.abs(dz) >= 1e-12) {
      const ta = (lo - a.z) / dz, tb = (hi - a.z) / dz;
      t0 = Math.max(0, Math.min(ta, tb));
      t1 = Math.min(1, Math.max(ta, tb));
    }
    // |x| varies linearly along a segment, so its max over the clip is at an end.
    for (const t of [t0, t1]) {
      m = Math.max(m, Math.abs(a.x + t * (b.x - a.x)));
      hit = true;
    }
  }
  return hit ? m : null;
}
function expandG72(cfg, profilePoints, startState, outwardSign) {
  const { w: depth, r: retract, uf: allowU, wf: allowW } = cfg;
  const segments = [], warnings = [];
  if (!depth || depth <= 0) {
    warnings.push({ line: cfg.line, message: 'G72 sin profundidad de pasada (W) válida — ciclo omitido' });
    return { segments, warnings, passCount: 0 };
  }
  const finishPts = offsetProfile(profilePoints, outwardSign, allowU || 0, allowW || 0);
  // See expandG71: stockMag keeps the allowance (what the facing passes must clear),
  // partMag is the real bar diameter the program specifies.
  const partMag = Math.max(...profilePoints.map(p => Math.abs(p.x)));
  const stockMag = Math.max(...finishPts.map(p => Math.abs(p.x)));
  const stockX = outwardSign * stockMag;
  const clearX = outwardSign * Math.max(stockMag, Math.abs(startState.x));
  const zMin = Math.min(...finishPts.map(p => p.z));
  const zTop = Math.min(startState.z, Math.max(...finishPts.map(p => p.z)));
  const rr = retract || 0.5;
  let pos = { x: startState.x, z: startState.z };
  let passCount = 0;
  for (let k = 1; k < 400; k++) {
    let zk = zTop - depth * k;
    const last = zk <= zMin + 1e-6;
    if (last) zk = zMin;
    const stopMag = maxMagOverBand(finishPts, zk, Math.min(zk + depth, zTop));
    if (stopMag !== null && stopMag < stockMag - 1e-6) {
      passCount++;
      const stopX = outwardSign * stopMag;
      if (Math.abs(pos.x - clearX) > 1e-9) { segments.push({ type: 'rapid', phase: 'rough', pass: passCount, points: [{ ...pos }, { x: clearX, z: pos.z }] }); pos = { x: clearX, z: pos.z }; }
      segments.push({ type: 'rapid', phase: 'rough', pass: passCount, points: [{ ...pos }, { x: clearX, z: zk }] });
      // A facing pass at Z=zk owns the whole Z strip [zk, zk+depth] it stepped over:
      // that strip is the tread of the resulting G72 staircase, and the wall between
      // consecutive treads sits exactly on the pass's own Z.
      segments.push({ type: 'feed', phase: 'rough', pass: passCount,
        zBand: { lo: zk, hi: Math.min(zk + depth, zTop), mag: stopMag },
        points: [{ x: clearX, z: zk }, { x: stopX, z: zk }] });
      // FANUC G72 retracts R in the Z AXIS (the mirror image of G71, which retracts
      // in X): the pass steps in Z and cuts radially in X, so the tool has to lift
      // clear of the material in Z — back over the strip the previous pass already
      // cleared — before it can travel back in X. Moving both axes at once would
      // drag the insert through uncut stock; returning in Z first at the cut depth
      // would drag it along the surface it just machined.
      const zBack = zk + rr;
      segments.push({ type: 'rapid', phase: 'rough', pass: passCount, points: [{ x: stopX, z: zk }, { x: stopX, z: zBack }] });
      segments.push({ type: 'rapid', phase: 'rough', pass: passCount, points: [{ x: stopX, z: zBack }, { x: clearX, z: zBack }] });
      pos = { x: clearX, z: zBack };
    }
    if (last) break;
  }
  segments.push({ type: 'rapid', phase: 'rough', points: [{ ...pos }, { x: clearX, z: zTop }] });
  pos = { x: clearX, z: zTop };
  return { segments, warnings, passCount, endPos: pos, stockMag, partMag };
}

/* ---------- Expand a G75 (grooving / parting-off) cycle ---------- */
/* G75 is a fixed canned cycle for grooving and parting-off. It does not use
   a profile (N-P..N-Q) like G71/G72; it runs entirely within the two blocks
   where it is programmed. The first block provides the retract amount R.
   The second block provides X (target diameter/radius), Z (target Z), P
   (increment per peck, in microns unless decimal point is present), and F
   (feed). The cycle performs repeated pecking in X toward the target, with
   a rapid retract of R after each peck, returning to the start Z. If Z
   differs from the start Z, each peck advances in Z as well (axial groove). */
function expandG75(cfg, startState) {
  const { r: retract, x: targetX, z: targetZ, p: incRaw, f: feed, line } = cfg;
  const segments = [];
  const warnings = [];

  if (incRaw === undefined || incRaw === null || incRaw <= 0) {
    warnings.push({ line, message: 'G75 sin incremento de pasada (P) válido — ciclo omitido' });
    return { segments, warnings, passCount: 0, endPos: startState };
  }
  if (targetX === undefined || targetX === null) {
    warnings.push({ line, message: 'G75 sin X ni U (profundidad del ciclo) — ciclo omitido' });
    return { segments, warnings, passCount: 0, endPos: startState };
  }

  // P is in microns (per Fanuc spec for G75) unless written with a decimal point.
  // The tokenizer does NOT scale P (it's not in DIMENSIONAL_LETTERS), so a bare
  // "P1500" arrives as 1500. We treat values >= 100 without a decimal point as microns.
  // Since we can't know if the original had a decimal point here, we use the
  // conventional heuristic: if the value is >= 100 it's almost certainly microns.
  const inc = incRaw >= 100 ? incRaw / 1000 : incRaw; // mm per peck
  const retractDist = retract || 0.5; // mm, default 0.5 if not given

  const startX = startState.x;
  const startZ = startState.z;
  const endX = targetX; // already radius (tokenizer divides X by 2)
  const endZ = targetZ !== undefined ? targetZ : startZ;
  // No Z in the cycle block: the cycle plunges at ONE Z, so the cut takes the width of the
  // insert (see GROOVE_TOOL_WIDTH). With a Z it is an axial/ramped groove and the ordinary
  // slanted feed already removes the whole band it sweeps.
  const radialPlunge = Math.abs(endZ - startZ) < 1e-9;
  const width = radialPlunge ? GROOVE_TOOL_WIDTH : 0;
  // Cutting to (or past) the axis severs the bar. Flagged because the heightmap otherwise
  // reads a constant-Z feed that reaches the axis as a facing and clears EVERYTHING from
  // that Z forward — which deletes the whole part instead of cutting it off.
  //
  // Two DIFFERENT questions, previously conflated in one test, and the difference is visible:
  //   partsBar   — the cycle REACHES the axis, so it severs the bar. A target past the axis
  //                (X-1.5) is negative as a radius and must count too, or an overtraveling
  //                parting cycle would be mistaken for a facing and delete the part.
  //   stopsAtAxis— the cycle STOPS on the axis, which is what leaves the pip behind. An
  //                overtraveling cycle cuts clean through and leaves no pip.
  const partsBar = endX <= 0.15;
  const stopsAtAxis = Math.abs(endX) <= 0.15;
  const pip = partsBar && stopsAtAxis;

  const direction = Math.sign(endX - startX) || -1; // typically negative (toward center)
  let curX = startX;
  let passCount = 0;
  const maxPasses = 500; // safety cap

  let pos = { x: startX, z: startZ };

  while (true) {
    if (passCount >= maxPasses) {
      warnings.push({ line, message: 'G75: límite de pasadas alcanzado — ciclo truncado' });
      break;
    }
    passCount++;

    // Next peck depth: advance by inc, but clamp to endX so we always reach the target
    let nextX = curX + direction * inc;
    if (direction < 0 ? nextX < endX : nextX > endX) nextX = endX;

    // 1. Feed cut to peck depth at current Z (this IS the cutting feed)
    // For radial grooves (Z constant), this cuts in X.
    // For axial grooves (Z changes), this is a diagonal feed.
    const feedTargetZ = endZ;
    // The pip belongs to the ONE peck that actually reaches the axis. The earlier pecks only
    // shave the stub down to their own depth, so marking them would draw the pip from the
    // first pass and hide the very progression the cycle is meant to show.
    const reachesAxis = Math.abs(nextX - endX) < 1e-9;
    segments.push({
      type: 'feed', phase: 'groove', pass: passCount,
      points: [{ x: pos.x, z: pos.z }, { x: nextX, z: feedTargetZ }],
      f: feed, s: startState.s,
      partOff: partsBar, width, pip: pip && reachesAxis,
    });
    pos = { x: nextX, z: feedTargetZ };

    // If we've reached the target, do the retract/return and stop after this peck
    if (reachesAxis) {
      // 2. Rapid retract R in X (opposite to cut direction)
      const retractX = nextX - direction * retractDist;
      segments.push({
        type: 'rapid', phase: 'groove', pass: passCount,
        points: [{ x: pos.x, z: pos.z }, { x: retractX, z: pos.z }]
      });
      pos = { x: retractX, z: pos.z };

      // 3. Rapid return to start Z (clear of the groove)
      if (Math.abs(pos.z - startZ) > 1e-9) {
        segments.push({
          type: 'rapid', phase: 'groove', pass: passCount,
          points: [{ x: pos.x, z: pos.z }, { x: pos.x, z: startZ }]
        });
        pos = { x: pos.x, z: startZ };
      }
      break;
    }

    // 2. Rapid retract R in X (opposite to cut direction)
    const retractX = nextX - direction * retractDist;
    segments.push({
      type: 'rapid', phase: 'groove', pass: passCount,
      points: [{ x: pos.x, z: pos.z }, { x: retractX, z: pos.z }]
    });
    pos = { x: retractX, z: pos.z };

    // 3. Rapid return to start Z (clear of the groove)
    if (Math.abs(pos.z - startZ) > 1e-9) {
      segments.push({
        type: 'rapid', phase: 'groove', pass: passCount,
        points: [{ x: pos.x, z: pos.z }, { x: pos.x, z: startZ }]
      });
      pos = { x: pos.x, z: startZ };
    }

    curX = nextX;
  }

  // Final move: rapid back to start X (safe clearance)
  if (Math.abs(pos.x - startX) > 1e-9) {
    segments.push({
      type: 'rapid', phase: 'groove',
      points: [{ x: pos.x, z: pos.z }, { x: startX, z: startZ }]
    });
    pos = { x: startX, z: startZ };
  }

  // partOffZ travels to the renderer, which needs it to draw the stub of bar standing on the
  // chuck side of the cut: without that stub there is nothing for the cycle to sever.
  return { segments, warnings, passCount, endPos: pos, partOffZ: partsBar ? endZ : undefined };
}

/* ---------- Expand a G76 (multi-pass threading) cycle ---------- */
/* G76 performs multi-pass threading. It uses two blocks:
   Block 1: G76 P(n)(r)(a) Q(minDepth) R(finishAllowance)
     - P: 6 digits: nn = finish passes (01-99), rr = chamfer angle/amount (00=none), aa = tool angle (60=metric, 55=Whitworth, etc.)
     - Q: minimum cut depth (microns) for first pass
     - R: finish allowance (mm) reserved for final passes
   Block 2: G76 X/U Z/W R(taper) P(threadHeight) Q(firstCut) F(lead)
     - X/U: target minor diameter (radius after tokenizer)
     - Z/W: thread length endpoint
     - R: taper (radius difference over thread length); 0 = straight
     - P: thread height (microns) = total radial depth of thread
     - Q: first pass depth (microns) — overrides block 1 Q if present
     - F: thread lead (pitch for single-start)
   The cycle generates a series of passes:
     - Roughing passes: decreasing depth per sqrt progression until (threadHeight - finishAllowance)
     - Finish passes: 'n' passes at full threadHeight
   Each pass is a synchronized feed (G32-equivalent) from thread start Z to end Z.
   Chamfer (rr) adds an exit taper at the end of each pass. */
function expandG76(cfg, startState) {
  const {
    // Block 1 params
    pRaw: pBlock1, qRaw: qBlock1, r: finishAllowance,
    // Block 2 params
    x: targetX, z: targetZ, rTaper, pRaw2: pThreadHeight, qRaw2: qFirstCut, f: lead,
    line
  } = cfg;

  const segments = [];
  const warnings = [];

  // Parse P block 1: nn rr aa (6 digits)
  let finishPasses = 2, chamferAmount = 0, toolAngle = 60;
  if (pBlock1 !== undefined && pBlock1 !== null) {
    const pStr = String(Math.round(pBlock1)).padStart(6, '0');
    finishPasses = parseInt(pStr.slice(0, 2), 10) || 2;
    const chamferDigits = parseInt(pStr.slice(2, 4), 10) || 0;
    chamferAmount = chamferDigits * 0.1; // Fanuc: 0.1° units (or distance if 45° assumed)
    toolAngle = parseInt(pStr.slice(4, 6), 10) || 60;
  }

  // Depths in microns -> mm
  const threadHeight = (pThreadHeight || 0) / 1000; // mm
  // Q(dmin) is the first cut depth AND the floor of the progression; the block-2 value
  // overrides the block-1 one. It used to be parsed into a `minDepth` nobody read, which
  // also let a Q-less cycle reach the sqrt loop and grind out 100 zero-depth passes.
  const qDepth = (qFirstCut !== undefined && qFirstCut !== null) ? qFirstCut : qBlock1;
  const minDepth = (qDepth || 0) / 1000; // mm
  const firstCutDepth = minDepth;
  const finishAllow = finishAllowance || 0; // mm
  const taper = rTaper || 0; // radius difference over thread length

  if (threadHeight <= 0) {
    warnings.push({ line, message: 'G76 sin altura de hilo (P bloque 2) válida — ciclo omitido' });
    return { segments, warnings, passCount: 0, endPos: startState };
  }
  if (lead <= 0) {
    warnings.push({ line, message: 'G76 sin paso de rosca (F) válido — ciclo omitido' });
    return { segments, warnings, passCount: 0, endPos: startState };
  }
  if (firstCutDepth <= 0) {
    warnings.push({ line, message: 'G76 sin profundidad mínima de pasada (Q) válida — ciclo omitido' });
    return { segments, warnings, passCount: 0, endPos: startState };
  }

  const startX = startState.x;
  const startZ = startState.z;
  const endX = targetX !== undefined ? targetX : startX; // radius
  const endZ = targetZ !== undefined ? targetZ : startZ;
  const threadLength = Math.abs(endZ - startZ);
  const directionZ = endZ > startZ ? 1 : -1;

  // Calculate pass depths: roughing (sqrt progression) + finish passes
  const roughTargetDepth = threadHeight - finishAllow;
  const passDepths = [];

  if (firstCutDepth > 0) {
    passDepths.push(firstCutDepth);
  }

  // Roughing passes: sqrt progression
  // Fanuc standard: depth_k = firstCut * sqrt(k) capped at roughTargetDepth
  let k = passDepths.length + 1;
  while (true) {
    const depth = firstCutDepth * Math.sqrt(k);
    if (depth >= roughTargetDepth - 1e-6) break;
    passDepths.push(depth);
    k++;
    if (passDepths.length > 100) break; // safety
  }

  // Finish passes at full thread height
  for (let i = 0; i < finishPasses; i++) {
    passDepths.push(threadHeight);
  }

  // Thread start position: approach in X to just outside major diameter.
  // endX is the block-2 X already halved to a radius — the ROOT radius — so the crest sits
  // one thread height above it. This binding must exist: the descriptor attached to every
  // pass carries majorR to the renderer, and reading it as an assumed global threw a
  // ReferenceError that aborted the whole G76 cycle.
  const majorR = endX + threadHeight;
  const approachX = majorR + 2; // 2mm clearance

  let pos = { x: startX, z: startZ };
  let passCount = 0;

  // Rapid to approach position
  if (Math.abs(pos.x - approachX) > 1e-9) {
    segments.push({
      type: 'rapid', phase: 'thread', pass: 0,
      points: [{ x: pos.x, z: pos.z }, { x: approachX, z: pos.z }]
    });
    pos = { x: approachX, z: pos.z };
  }
  if (Math.abs(pos.z - startZ) > 1e-9) {
    segments.push({
      type: 'rapid', phase: 'thread', pass: 0,
      points: [{ x: pos.x, z: pos.z }, { x: pos.x, z: startZ }]
    });
    pos = { x: pos.x, z: startZ };
  }

  // Each threading pass
  for (const depth of passDepths) {
    passCount++;
    const passX = majorR - depth; // current X for this pass (radius)

    // Rapid to pass X at start Z
    if (Math.abs(pos.x - passX) > 1e-9) {
      segments.push({
        type: 'rapid', phase: 'thread', pass: passCount,
        points: [{ x: pos.x, z: pos.z }, { x: passX, z: startZ }]
      });
      pos = { x: passX, z: startZ };
    }

    // Synchronized feed (G32-equivalent): Z moves, X follows taper
    // For taper: X changes linearly from passX at startZ to (passX + taper*directionZ) at endZ
    const passEndX = passX + taper * directionZ;

    // Chamfer: if chamferAmount > 0, extend the pass beyond endZ by chamfer distance
    // Chamfer is typically 45°, so Z extension = X extension = chamferAmount
    let feedEndZ = endZ;
    let feedEndX = passEndX;
    if (chamferAmount > 0) {
      // Chamfer in degrees -> distance. For 45°, Z extension = chamferAmount
      // We'll treat chamferAmount as mm of Z extension at 45°
      const chamferDist = chamferAmount; // simplified: 0.1° units -> mm at 45°
      feedEndZ = endZ + directionZ * chamferDist;
      feedEndX = passEndX + directionZ * chamferDist;
    }

    segments.push({
      type: 'feed', phase: 'thread', pass: passCount,
      points: [{ x: pos.x, z: pos.z }, { x: feedEndX, z: feedEndZ }],
      f: lead, // F is lead (mm/rev) in threading
      s: startState.s,
      thread: {
        lead, angle: toolAngle, chamfer: chamferAmount,
        pass: passCount, total: passDepths.length,
        depth, threadHeight,
        // Authoritative geometry for the renderer. The renderer must not try to
        // reconstruct these from per-pass segments: a pass's start X is that PASS's
        // radius (majorR minus its own depth), not the thread's root radius, so
        // anchoring the profile on it produced a fake taper from one end to the other.
        majorR,               // crest radius  = minorR + threadHeight
        minorR: endX,         // root radius   = the G76 block-2 X (a radius already)
        threadStartZ: startZ, // where the threading passes begin
        threadEndZ: feedEndZ, // where they end (already includes the exit chamfer)
        taper,                // radial change over the thread length (R)
      }
    });
    pos = { x: feedEndX, z: feedEndZ };

    // Rapid retract in X (clear the thread)
    const retractX = passX + 2; // 2mm clearance
    segments.push({
      type: 'rapid', phase: 'thread', pass: passCount,
      points: [{ x: pos.x, z: pos.z }, { x: retractX, z: pos.z }]
    });
    pos = { x: retractX, z: pos.z };

    // Rapid return to start Z
    if (Math.abs(pos.z - startZ) > 1e-9) {
      segments.push({
        type: 'rapid', phase: 'thread', pass: passCount,
        points: [{ x: pos.x, z: pos.z }, { x: pos.x, z: startZ }]
      });
      pos = { x: pos.x, z: startZ };
    }
  }

  // Final rapid to safe position
  if (Math.abs(pos.x - approachX) > 1e-9) {
    segments.push({
      type: 'rapid', phase: 'thread',
      points: [{ x: pos.x, z: pos.z }, { x: approachX, z: startZ }]
    });
    pos = { x: approachX, z: startZ };
  }

  return { segments, warnings, passCount, endPos: pos };
}

/* ---------- Full program interpretation ---------- */
function interpretProgram(text, home) {
  const { blocks, labelMap, warnings: tokWarnings, noSemiLines } = tokenizeProgram(text);
  const warnings = [...tokWarnings];

  // Pre-scan: find all G71/G70 cycle references to mark referenced N-ranges as "profile-only"
  const cycles = []; // {kind, startLine, p, q, cfgWords}
  const pending = {};
  blocks.forEach((b, idx) => {
    const map = b.map;
    for (const code of [71, 72]) {
      if (!(map.G && map.G.includes(code))) continue;
      const kind = 'G' + code;
      if (!pending[kind]) pending[kind] = { u: null, w: null, r: null, p: null, q: null, uf: null, wf: null, line: b.line, startIdx: idx };
      const pc = pending[kind];
      const isBoundsLine = (map.P && map.P.length) || (map.Q && map.Q.length);
      if (isBoundsLine) {
        if (map.U && map.U.length) pc.uf = map.U[0];
        if (map.W && map.W.length) pc.wf = map.W[0];
        if (map.P && map.P.length) pc.p = map.P[0];
        if (map.Q && map.Q.length) pc.q = map.Q[0];
      } else {
        if (map.U && map.U.length) pc.u = map.U[0];
        if (map.W && map.W.length) pc.w = map.W[0];
        if (map.R && map.R.length) pc.r = map.R[0];
      }
      if (pc.p !== null && pc.q !== null) {
        cycles.push({ kind, cfg: pc, atIdx: idx });
        pending[kind] = null;
      }
    }
    if (map.G && map.G.includes(70) && map.P && map.Q) {
      cycles.push({ kind: 'G70', cfg: { p: map.P[0], q: map.Q[0], line: b.line }, atIdx: idx });
    }
  });

  // mark skip ranges (N..P to N..Q) so the main walk doesn't execute them twice
  for (const c of cycles) {
    const startIdx = labelMap[c.cfg.p];
    const endIdx = labelMap[c.cfg.q];
    if (startIdx === undefined || endIdx === undefined) {
      warnings.push({ line: c.cfg.line, message: `${c.kind}: no se encontraron las etiquetas N${c.cfg.p}/N${c.cfg.q}` });
      c.invalid = true;
      continue;
    }
    c.startIdx = startIdx; c.endIdx = endIdx;
    for (let i = startIdx; i <= endIdx; i++) blocks[i].skip = true;
  }
  // also never execute the raw G71-parameter-only lines twice / as generic motion (they carry no XZ anyway)

  const state = { x: 0, z: 0, motionG: null, f: 0, s: 0, t: null, spindle: 'off', spindleDir: null, coolant: 'off',
    _homeX: home ? home.x : 0, _homeZ: home ? home.z : 0 };
  const timeline = []; // ordered events: {kind:'move', segment} | {kind:'spindle'|'coolant'|'tool'|'end', ..., line}
  let cycleCursor = 0;

  blocks.forEach((b, idx) => {
    if (b.skip) return;
    const map = b.map;

    // Non-motion state changes
    if (map.T && map.T.length) {
      state.t = map.T[0];
      timeline.push({ kind: 'tool', tool: state.t, line: b.line });
    }
    if (map.M && map.M.length) {
      for (const mv of map.M) {
        if (mv === 3) { state.spindle = 'on'; state.spindleDir = 'cw'; timeline.push({ kind: 'spindle', state: 'on', dir: 'cw', line: b.line }); }
        else if (mv === 4) { state.spindle = 'on'; state.spindleDir = 'ccw'; timeline.push({ kind: 'spindle', state: 'on', dir: 'ccw', line: b.line }); }
        else if (mv === 5) { state.spindle = 'off'; timeline.push({ kind: 'spindle', state: 'off', line: b.line }); }
        else if (mv === 8) { state.coolant = 'on'; timeline.push({ kind: 'coolant', state: 'on', line: b.line }); }
        else if (mv === 9) { state.coolant = 'off'; timeline.push({ kind: 'coolant', state: 'off', line: b.line }); }
        else if (mv === 30 || mv === 2) { timeline.push({ kind: 'end', line: b.line }); }
      }
    }

    // G71 cycle trigger
    if (map.G && (map.G.includes(71) || map.G.includes(72))) {
      const c = cycles.find(cc => cc.atIdx === idx && (cc.kind === 'G71' || cc.kind === 'G72'));
      if (c && !c.invalid && !c.done) {
        c.done = true;
        const sub = resolveSubProfile(blocks, c.startIdx, c.endIdx, { x: state.x, z: state.z, motionG: 1, f: state.f, s: state.s });
        warnings.push(...sub.warnings);
        if (!state._profileCache) state._profileCache = {};
        state._profileCache[`${c.cfg.p}-${c.cfg.q}`] = sub;
        const outwardSign = Math.sign(state.x) || -1;
        const ccfg = { u: c.cfg.u, w: c.cfg.w, r: c.cfg.r, uf: c.cfg.uf || 0, wf: c.cfg.wf || 0, line: c.cfg.line };
        const rough = c.kind === 'G72'
          ? expandG72(ccfg, sub.points, { x: state.x, z: state.z }, outwardSign)
          : expandG71(ccfg, sub.points, { x: state.x, z: state.z }, outwardSign);
        state._cycleKind = c.kind;
        warnings.push(...rough.warnings);
        const sDir0 = state.spindleDir || 'cw';
        for (const seg of rough.segments) timeline.push({ kind: 'move', segment: seg, line: c.cfg.line, phase: 'rough', spindleDir: sDir0 });
        if (rough.endPos) { state.x = rough.endPos.x; state.z = rough.endPos.z; }
        state.motionG = 0;
        if (rough.partMag) state._cycleStockMag = rough.partMag;
      }
      return; // G71 param-only lines produce no direct motion of their own
    }

    // G75 cycle trigger — two-block canned cycle: first block stores R,
    // second block (with X/Z/P/F) fires the groove/parting cycle.
    if (map.G && map.G.includes(75)) {
      if (map.R && map.R.length && !(map.X || map.U || map.Z || map.W || map.P)) {
        // First block: only R (retract amount)
        state._g75cfg = { r: map.R[0], line: b.line };
        return;
      }
      if ((map.X || map.U || map.Z || map.W) && map.P && map.P.length) {
        // Second block: X/Z target, P increment, F feed
        const cfg = { ...state._g75cfg, line: b.line };
        if (map.X && map.X.length) cfg.x = map.X[0] / 2; // X is diameter -> radius
        else if (map.U && map.U.length) cfg.x = state.x + map.U[0] / 2;
        if (map.Z && map.Z.length) cfg.z = map.Z[0];
        else if (map.W && map.W.length) cfg.z = state.z + map.W[0];
        cfg.p = map.P[0]; // P in microns (tokenizer does not scale P)
        if (map.F && map.F.length) cfg.f = map.F[0];
        const rough = expandG75(cfg, { x: state.x, z: state.z, f: state.f, s: state.s });
        warnings.push(...rough.warnings);
        const sDir0 = state.spindleDir || 'cw';
        for (const seg of rough.segments) timeline.push({ kind: 'move', segment: seg, line: b.line, phase: 'groove', spindleDir: sDir0 });
        if (rough.endPos) { state.x = rough.endPos.x; state.z = rough.endPos.z; }
        state.motionG = 0;
        state._g75cfg = null;
        // Only the FIRST cut counts as the separation: it is the one that frees the piece.
        if (rough.partOffZ !== undefined && state._partOffZ === undefined) state._partOffZ = rough.partOffZ;
        return;
      }
      warnings.push({ line: b.line, message: 'G75: bloque no reconocido — el ciclo necesita un bloque con R (retroceso) y otro con X o Z, P (incremento) y F' });
      return;
    }

    // G76 cycle trigger — two-block threading cycle: first block stores P/Q/R,
    // second block (with X/Z/R/P/Q/F) fires the threading passes.
    if (map.G && map.G.includes(76)) {
      const hasAxis = map.X || map.U || map.Z || map.W;
      if (!hasAxis && map.P && map.P.length && !(map.F && map.F.length)) {
        // First block: P (nn rr aa), Q (min depth), R (finish allowance). Fanuc's first
        // block ALWAYS carries Q and R, so the only things that tell it apart from the
        // threading block are the absence of an axis word and of F. Excluding Q/R/F here
        // made "G76 P020060 Q100 R0.02;" fall through unrecognised, silently losing the
        // finish allowance and the nn/rr/aa triple.
        state._g76cfg = {
          pRaw: map.P[0],
          qRaw: map.Q ? map.Q[0] : undefined,
          r: map.R ? map.R[0] : undefined,
          line: b.line
        };
        return;
      }
      if (hasAxis && map.P && map.P.length && map.F && map.F.length) {
        // Second block: X/U Z/W R(taper) P(threadHeight) Q(firstCut) F(lead)
        const cfg = { ...state._g76cfg, line: b.line };
        if (map.X && map.X.length) cfg.x = map.X[0] / 2;
        else if (map.U && map.U.length) cfg.x = state.x + map.U[0] / 2;
        if (map.Z && map.Z.length) cfg.z = map.Z[0];
        else if (map.W && map.W.length) cfg.z = state.z + map.W[0];
        if (map.R && map.R.length) cfg.rTaper = map.R[0];
        cfg.pRaw2 = map.P[0]; // thread height in microns
        if (map.Q && map.Q.length) cfg.qRaw2 = map.Q[0];
        cfg.f = map.F[0]; // lead (pitch)
        const rough = expandG76(cfg, { x: state.x, z: state.z, f: state.f, s: state.s });
        warnings.push(...rough.warnings);
        const sDir0 = state.spindleDir || 'cw';
        for (const seg of rough.segments) timeline.push({ kind: 'move', segment: seg, line: b.line, phase: 'thread', spindleDir: sDir0 });
        if (rough.endPos) { state.x = rough.endPos.x; state.z = rough.endPos.z; }
        state.motionG = 0;
        state._g76cfg = null;
        return;
      }
      warnings.push({ line: b.line, message: 'G76: bloque no reconocido — se esperan dos bloques, el primero con P/Q/R y el segundo con X o Z, P y F' });
      return;
    }

    // G70 cycle trigger
    if (map.G && map.G.includes(70) && map.P && map.Q) {
      const c = cycles.find(cc => cc.atIdx === idx);
      if (c && !c.invalid) {
        const key = `${c.cfg.p}-${c.cfg.q}`;
        // The contour's own reference position (for blocks that omit X or Z, like N1
        // omitting Z) is fixed at whatever position the cycle was first defined from —
        // reuse it if this P/Q range was already resolved (typically by a prior G71).
        const cached = state._profileCache && state._profileCache[key];
        const sub = cached || resolveSubProfile(blocks, c.startIdx, c.endIdx, { x: state.x, z: state.z, motionG: 1, f: state.f, s: state.s });
        if (!cached) warnings.push(...sub.warnings);
        if (!state._profileCache) state._profileCache = {};
        state._profileCache[key] = sub;
        // The lead-in rapid has to end exactly where the first REPLAYED segment
        // starts (a real machine positions there before finishing). Taking
        // sub.points[0] is only right when the profile opens with a
        // cutting block; with leading positioning moves (the Ej. 3's "N1 G00 Z-74.")
        // points[0] is the first feed's TARGET, so the rapid stopped 0.5 mm short of
        // where the replay began — which also stacked P1 and P2 on the same spot.
        // Every segment before the first feed is positioning, and its own end is
        // exactly where the replay resumes.
        const sDir1 = state.spindleDir || 'cw';
        const skip = Math.max(1, sub.firstCut || 0);
        const leadSeg = sub.segments[skip - 1];
        if (leadSeg) {
          const leadTo = leadSeg.points[leadSeg.points.length - 1];
          timeline.push({ kind: 'move', line: c.cfg.line, phase: 'finish', spindleDir: sDir1,
            segment: { type: 'rapid', points: [{ x: state.x, z: state.z }, leadTo] } });
        }
        for (const seg of sub.segments.slice(skip)) {
          timeline.push({ kind: 'move', segment: { ...seg, phase: 'finish' }, line: seg.line, phase: 'finish', spindleDir: sDir1 });
        }
        state.x = sub.endState.x; state.z = sub.endState.z; state.motionG = sub.endState.motionG;
      }
      return;
    }

    // G28 — return to reference point
    if (map.G && map.G.includes(28)) {
      const hasU = map.U && map.U.length;
      const hasW = map.W && map.W.length;
      const hasX = map.X && map.X.length;
      const hasZ = map.Z && map.Z.length;
      const interX = hasX ? map.X[0] / 2 : (hasU ? state.x + map.U[0] / 2 : state.x);
      const interZ = hasZ ? map.Z[0] : (hasW ? state.z + map.W[0] : state.z);
      const from = { x: state.x, z: state.z };
      const inter = { x: interX, z: interZ };
      const home = { x: (hasX || hasU) ? state._homeX : state.x, z: (hasZ || hasW) ? state._homeZ : state.z };
      const pts = [from];
      if (inter.x !== from.x || inter.z !== from.z) pts.push(inter);
      pts.push(home);
      timeline.push({ kind: 'move', line: b.line, phase: 'retract', spindleDir: state.spindleDir || 'cw',
        segment: { type: 'rapid', points: pts } });
      state.x = home.x; state.z = home.z; state.motionG = 0;
      return;
    }

    // Generic motion block
    const { segment, warnings: w } = resolveMotionBlock(b, state);
    warnings.push(...w.map(ww => ({ line: b.line, message: ww.message || ww })));
    if (segment) timeline.push({ kind: 'move', segment, line: b.line, phase: 'general', spindleDir: state.spindleDir || 'cw' });
  });

  // Coherence check: the standard convention pairs M03 (tool below centerline)
  // with negative X, and M04 (tool above) with positive X. A program mixing
  // them would cut on the opposite side from the one the spindle direction
  // implies, so flag it rather than silently drawing something misleading.
  const firstMove = timeline.find(ev => ev.kind === 'move' && ev.segment.type === 'feed');
  if (firstMove) {
    let sx = 0;
    for (const p of firstMove.segment.points) { if (Math.abs(p.x) > 1e-6) { sx = p.x < 0 ? -1 : 1; break; } }
    const dir = firstMove.spindleDir;
    if (sx !== 0 && dir === 'cw' && sx > 0) {
      warnings.push({ message: 'M03 (herramienta abajo) normalmente se programa con valores de X negativos; este programa usa X positivo.' });
    } else if (sx !== 0 && dir === 'ccw' && sx < 0) {
      warnings.push({ message: 'M04 (herramienta arriba) normalmente se programa con valores de X positivos; este programa usa X negativo.' });
    }
  }

  // partOffZ is undefined unless the program severed the bar with a G75 that reached the axis;
  // computeViewBox uses it to place the stub of bar the cut is made through.
  return { blocks, labelMap, timeline, warnings, finalState: state, cycleStockMag: state._cycleStockMag, cycleKind: state._cycleKind || null, partOffZ: state._partOffZ, noSemiLines };
}

/* ---------- Bounds / stock sizing ---------- */
function computeBounds(timeline) {
  let maxAbsX = 0, minZ = 0, maxZ = 0, extremeSign = -1;
  let maxZFeed = 0, minZFeed = 0; // feed-only extent: what the material itself actually spans,
  // excluding transient rapid clearance moves (e.g. a "G00 Z1" retract during
  // facing) that shouldn't be mistaken for real stock/part boundaries.
  let maxAbsXCut = 0; // the same idea on the X side, taken from each feed move's TARGET:
  // a rapid only POSITIONS the tool, so a "G00 X51." approach is not the stock diameter,
  // and neither is the approach point a facing pass starts from. Unlike the Z extents
  // this one includes the roughing passes, so the bar is never thinner than anything
  // the program cuts into.
  let any = false;
  for (const ev of timeline) {
    if (ev.kind !== 'move') continue;
    if (ev.phase === 'retract') continue;
    for (const p of ev.segment.points) {
      any = true;
      if (Math.abs(p.x) > maxAbsX) { maxAbsX = Math.abs(p.x); extremeSign = p.x < 0 ? -1 : 1; }
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
      if (ev.segment.type === 'feed' && ev.phase !== 'rough') {
        // The rough passes intentionally stop short by the W allowance, which
        // would otherwise nudge the visual "face" a fraction of a mm past
        // true Z0 — only the facing/general cuts and the final G70 contour
        // (the real, finished geometry) should define where the material
        // visually starts and ends.
        maxZFeed = Math.max(maxZFeed, p.z);
        minZFeed = Math.min(minZFeed, p.z);
      }
    }
    if (ev.segment.type === 'feed' && ev.segment.to) {
      const toMag = Math.abs(ev.segment.to.x);
      if (toMag > maxAbsXCut) maxAbsXCut = toMag;
    }
  }
  if (!any) { maxAbsX = 20; minZ = -50; maxZ = 0; maxZFeed = 0; minZFeed = -50; maxAbsXCut = 0; }
  return { maxAbsX, minZ, maxZ, extremeSign, maxZFeed, minZFeed, maxAbsXCut };
}

/* ---------- Two-pass driver: resolves a sensible "home"/reference point
   from the geometry itself, then re-interprets with it available for G28 ---------- */
function runInterpreter(text) {
  const pass1 = interpretProgram(text, null);
  const b1 = computeBounds(pass1.timeline);
  const outwardSign = b1.extremeSign;
  const homeX = outwardSign * (b1.maxAbsX * 1.35 + 20);
  const homeZ = Math.max(b1.maxZ, 0) + Math.max(20, (b1.maxZ - b1.minZ) * 0.25 + 15);
  const home = { x: homeX, z: homeZ };
  const pass2 = interpretProgram(text, home);
  const bounds = computeBounds(pass2.timeline);
  return { ...pass2, bounds, home, outwardSign };
}

if (typeof module !== 'undefined') {
  module.exports = {
    tokenizeLine, tokenizeProgram, resolveArcPoints, resolveMotionBlock,
    resolveSubProfile, offsetProfile, expandG71, expandG72, interpretProgram, computeBounds, runInterpreter,
  };
}

