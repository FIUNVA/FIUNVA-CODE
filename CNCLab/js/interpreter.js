
'use strict';
/* ============================================================
   CNC LATHE (FANUC) G-CODE INTERPRETER — CORE LOGIC
   ============================================================ */
/* ============================================================
   CNC LATHE (FANUC) G-CODE INTERPRETER — CORE LOGIC
   Pure JS, no DOM dependencies, usable in browser or Node.
   ============================================================ */

const ARC_SEGMENTS = 96; // polyline resolution for G02/G03

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
  // The contour itself starts at the FIRST block's own target (not the tool's
  // pre-cycle approach position) — that approach move is handled separately
  // by the caller (it is not part of the finished-part geometry).
  const points = [];
  segments.forEach((seg, i) => {
    const pts = i === 0 ? seg.points.slice(-1) : seg.points.slice(1);
    points.push(...pts);
  });
  return { segments, points, endState: state, warnings };
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
  const profileMaxMag = Math.max(...finishPts.map(p => Math.abs(p.x)));
  const stockMag = profileMaxMag; // the bar is drawn at EXACTLY the max diameter contained in G71 — no invented excess
  const stockX = outwardSign < 0 ? -stockMag : stockMag;
  const stepSigned = outwardSign < 0 ? depth : -depth; // moves FROM stock TOWARD profile (depth is already a radius value per FANUC's G71 spec)
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

    // 3. return to the start reference — a pure Z move at the SAME depth the
    // cut just finished at (the path just cut is now empty, so this can't
    // gouge anything); the next pass then steps over in X from here.
    segments.push({ type: 'rapid', phase: 'rough', pass: passCount,
      points: [{ x: pos.x, z: pos.z }, { x: pos.x, z: zStart }] });
    pos = { x: pos.x, z: zStart };

    cur = Xk;
  }
  // final rapid back to a safe clearance point above stock before next operation
  segments.push({ type: 'rapid', phase: 'rough',
    points: [{ x: pos.x, z: pos.z }, { x: stockX, z: pos.z }] });
  pos = { x: stockX, z: pos.z };

  return { segments, warnings, passCount, endPos: pos, stockMag };
}

/* ---------- Full program interpretation ---------- */
function interpretProgram(text, home) {
  const { blocks, labelMap, warnings: tokWarnings, noSemiLines } = tokenizeProgram(text);
  const warnings = [...tokWarnings];

  // Pre-scan: find all G71/G70 cycle references to mark referenced N-ranges as "profile-only"
  const cycles = []; // {kind, startLine, p, q, cfgWords}
  let pendingG71 = null;
  blocks.forEach((b, idx) => {
    const map = b.map;
    if (map.G && map.G.includes(71)) {
      if (!pendingG71) pendingG71 = { u: null, r: null, p: null, q: null, uf: null, wf: null, line: b.line, startIdx: idx };
      const isBoundsLine = (map.P && map.P.length) || (map.Q && map.Q.length);
      if (isBoundsLine) {
        if (map.U && map.U.length) pendingG71.uf = map.U[0];
        if (map.W && map.W.length) pendingG71.wf = map.W[0];
        if (map.P && map.P.length) pendingG71.p = map.P[0];
        if (map.Q && map.Q.length) pendingG71.q = map.Q[0];
      } else {
        if (map.U && map.U.length) pendingG71.u = map.U[0];
        if (map.R && map.R.length) pendingG71.r = map.R[0];
      }
      if (pendingG71.p !== null && pendingG71.q !== null) {
        cycles.push({ kind: 'G71', cfg: pendingG71, atIdx: idx });
        pendingG71 = null;
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
    if (map.G && map.G.includes(71)) {
      const c = cycles[cycleCursor] && cycles[cycleCursor].atIdx === idx ? cycles[cycleCursor] : cycles.find(cc => cc.atIdx === idx);
      if (c && c.kind === 'G71' && !c.invalid && !c.done) {
        c.done = true;
        const sub = resolveSubProfile(blocks, c.startIdx, c.endIdx, { x: state.x, z: state.z, motionG: 1, f: state.f, s: state.s });
        warnings.push(...sub.warnings);
        if (!state._profileCache) state._profileCache = {};
        state._profileCache[`${c.cfg.p}-${c.cfg.q}`] = sub;
        const outwardSign = Math.sign(state.x) || -1;
        const rough = expandG71({ u: c.cfg.u, r: c.cfg.r, uf: c.cfg.uf || 0, wf: c.cfg.wf || 0, line: c.cfg.line },
          sub.points, { x: state.x, z: state.z }, outwardSign);
        warnings.push(...rough.warnings);
        const sDir0 = state.spindleDir || 'cw';
        for (const seg of rough.segments) timeline.push({ kind: 'move', segment: seg, line: c.cfg.line, phase: 'rough', spindleDir: sDir0 });
        if (rough.endPos) { state.x = rough.endPos.x; state.z = rough.endPos.z; }
        state.motionG = 0;
        if (rough.stockMag) state._g71StockMag = rough.stockMag;
      }
      return; // G71 param-only lines produce no direct motion of their own
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
        // rapid to the profile's start point first (real machine does this before finishing)
        const sDir1 = state.spindleDir || 'cw';
        timeline.push({ kind: 'move', line: c.cfg.line, phase: 'finish', spindleDir: sDir1,
          segment: { type: 'rapid', points: [{ x: state.x, z: state.z }, { x: sub.points[0].x, z: sub.points[0].z }] } });
        // segments[0]'s own "from" is the cycle's original reference position, already
        // covered by the lead-in rapid above — replay only the remaining segments.
        for (const seg of sub.segments.slice(1)) {
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

  return { blocks, labelMap, timeline, warnings, finalState: state, g71StockMag: state._g71StockMag, noSemiLines };
}

/* ---------- Bounds / stock sizing ---------- */
function computeBounds(timeline) {
  let maxAbsX = 0, minZ = 0, maxZ = 0, extremeSign = -1;
  let maxZFeed = 0, minZFeed = 0; // feed-only extent: what the material itself actually spans,
  // excluding transient rapid clearance moves (e.g. a "G00 Z1" retract during
  // facing) that shouldn't be mistaken for real stock/part boundaries.
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
  }
  if (!any) { maxAbsX = 20; minZ = -50; maxZ = 0; maxZFeed = 0; minZFeed = -50; }
  return { maxAbsX, minZ, maxZ, extremeSign, maxZFeed, minZFeed };
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
    resolveSubProfile, offsetProfile, expandG71, interpretProgram, computeBounds, runInterpreter,
  };
}

