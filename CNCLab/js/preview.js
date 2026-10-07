/* ============================================================
   LIVE PREVIEW (static) — redrawn on every edit
   ============================================================ */
let lastResult = null;
let lastVb = null;

/* Collects ONE descriptor per G76 threading cycle.
   The interpreter already attaches the authoritative geometry to every threading pass
   (see expandG76), so the renderer must never re-derive a cycle's extents from the
   passes themselves: a pass's own X is THAT PASS's radius (majorR minus its depth),
   not the thread's root radius, which is what made the earlier taper interpolation
   slant the whole thread. */
function collectThreadDefs(result) {
  const defs = [];
  for (const ev of result.timeline) {
    if (ev.kind !== 'move' || ev.phase !== 'thread' || ev.segment.type !== 'feed') continue;
    const th = ev.segment.thread;
    if (!th || !(th.lead > 0) || !(th.threadHeight > 0)) continue;
    const dup = defs.some(d => Math.abs(d.threadStartZ - th.threadStartZ) < 1e-6
      && Math.abs(d.majorR - th.majorR) < 1e-6
      && Math.abs(d.lead - th.lead) < 1e-9);
    if (!dup) defs.push(th);
  }
  return defs;
}

/* Helper: convert machine points to display points for a given spindle direction.
   Display convention: M03 (CW) = tool BELOW centerline -> positive x in display;
   M04 (CCW) = tool ABOVE -> negative x. The stored coordinate already carries the
   programmed sign (negative X for M03, positive for M04), so taking its magnitude
   and re-applying the display sign is what puts each side where it belongs —
   multiplying the stored sign by the spindle sign double-counts it and lands M03
   on the wrong side. */
function toDisplayPoints(pts, spindleDir) {
  const s = displaySign(spindleDir);
  return pts.map(p => ({ x: s * Math.abs(p.x), z: p.z }));
}

function renderStaticPreview(result) {
  const vb = computeViewBox(result.bounds, result.cycleStockMag, result);
  lastVb = vb;
  const world = buildBaseScene(vb);
  const SC = scaleOf(vb);

  // final material silhouette from every feed move in the whole program
  const hm = makeHeightmap(vb, heightmapSamples(vb));
  const rapidPts = [];
  const roughPts = [];
  const finishPts = [];
  const generalPts = [];
  const groovePts = [];
  const threadPts = [];

  for (const ev of result.timeline) {
    if (ev.kind !== 'move' || ev.phase === 'retract') continue;
    const seg = ev.segment;
    // Every trace stays on the half where the tool actually is: the drawing is a
    // half-section, and the M03/M04 sign picks which half that is. Only the filled
    // silhouette is a full body of revolution (and it is always symmetric).
    const dPts = toDisplayPoints(seg.points, ev.spindleDir);
    if (seg.type === 'feed') {
      // Threading passes are synchronized feeds, not contouring sweeps: running them
      // through the heightmap here min'd the whole band down to one cylinder at the
      // pass radius and erased the crests. The thread is applied afterwards from its
      // cycle descriptor instead (see threadDefs below).
      if (ev.phase !== 'thread') applyFeedToHeightmap(hm, seg);
      if (ev.phase === 'rough') roughPts.push(dPts);
      else if (ev.phase === 'finish') finishPts.push(dPts);
      else if (ev.phase === 'groove') groovePts.push(dPts);
      else if (ev.phase === 'thread') threadPts.push(dPts);
      else generalPts.push(dPts);
    } else {
      rapidPts.push(dPts);
    }
  }

  // Cut the real ISO thread form into the material, at full programmed depth.
  const threadDefs = collectThreadDefs(result);
  for (const th of threadDefs) applyThreadToHeightmap(hm, th, th.threadHeight);

  const fillEl = svgEl('path', { id: 'materialFillEl', class: 'materialFill' + (showFill ? '' : ' noFill'), 'stroke-width': SC.thin, d: heightmapToSilhouettePath(hm) });
  world.appendChild(fillEl);

  const tracesGroup = svgEl('g', { id: 'tracesGroup' });
  tracesGroup.style.display = showTraces ? '' : 'none';
  for (const pts of roughPts) tracesGroup.appendChild(svgEl('path', { class: 'previewRough', 'stroke-width': SC.thin, 'stroke-dasharray': `${SC.u * 1.6} ${SC.u * 1.2}`, d: pathFromPoints(pts) }));
  for (const pts of groovePts) tracesGroup.appendChild(svgEl('path', { class: 'previewGroove', 'stroke-width': SC.thin, 'stroke-dasharray': `${SC.u * 1.6} ${SC.u * 1.2}`, d: pathFromPoints(pts) }));
  for (const pts of rapidPts) tracesGroup.appendChild(svgEl('path', { class: 'previewRapid', 'stroke-width': SC.thin, d: pathFromPoints(pts) }));
  for (const pts of generalPts) tracesGroup.appendChild(svgEl('path', { class: 'previewFeed', 'stroke-width': SC.normal, d: pathFromPoints(pts) }));
  for (const pts of finishPts) tracesGroup.appendChild(svgEl('path', { class: 'previewFinish', 'stroke-width': SC.normal, d: pathFromPoints(pts) }));
  for (const pts of threadPts) tracesGroup.appendChild(svgEl('path', { class: 'previewThread', 'stroke-width': SC.normal, d: pathFromPoints(pts) }));
  
  // Transverse hatch, drawn over the now-threaded silhouette. These are what make it
  // read as a screw rather than a row of notches: crest-to-crest lines (dark) and
  // root-to-root lines (light grey), each crossing the full diameter at half a pitch.
  // The static preview is the FINISHED cycle, so the hatch carries its final weight.
  if (threadDefs.length) {
    const helixGroup = svgEl('g', { id: 'threadHelixGroup' });
    for (const th of threadDefs) {
      // stroke-width is inherited, so one value per family weights the whole hatch.
      const crestG = svgEl('g', { 'stroke-width': threadHelixStroke(SC, 1, 'crest') });
      const rootG = svgEl('g', { 'stroke-width': threadHelixStroke(SC, 1, 'root') });
      for (const line of buildThreadHelixPaths(th, vb)) {
        const d = `M ${line.z1.toFixed(3)} ${line.y1.toFixed(3)} L ${line.z2.toFixed(3)} ${line.y2.toFixed(3)}`;
        (line.cls === 'threadHelicalCrest' ? crestG : rootG).appendChild(svgEl('path', { class: line.cls, d }));
      }
      helixGroup.appendChild(crestG);
      helixGroup.appendChild(rootG);
    }
    world.appendChild(helixGroup);
  }

  // keep the datum symbol on top of the part rather than buried under it
  const pzNode = world.querySelector('#partZeroGroup');
  if (pzNode) world.appendChild(pzNode);

  renderDimensionOverlay(world, result, vb);
  renderContourPoints(world, result, vb);
}

function renderDims(result, vb) {
  const roughPasses = new Set();
  let finishCount = 0;
  for (const ev of result.timeline) {
    if (ev.kind === 'move' && ev.phase === 'rough' && ev.segment.pass) roughPasses.add(ev.segment.pass);
    if (ev.kind === 'move' && ev.phase === 'finish') finishCount++;
  }
  el.dims.innerHTML = `
    <span>DIÁMETRO BARRA: <b>${(vb.stockMag * 2).toFixed(1)} mm</b></span>
    <span>LONGITUD BARRA: <b>${vb.stockLen.toFixed(1)} mm</b></span>
    <span>PASADAS DE DESBASTE: <b>${roughPasses.size || 0}</b></span>
    <span>BLOQUES DE PROGRAMA: <b>${result.blocks.length}</b></span>
  `;
  el.passHint.textContent = roughPasses.size ? `${result.cycleKind || 'G71'}: ${roughPasses.size} pasadas · G70: contorno final` : '';
}

function updateSpindleTag(dir) {
  el.spindleTag.textContent = dir === 'ccw' ? 'M04 arriba' : 'M03 abajo';
}

function updateReadouts(state) {
  const gNames = { 0: 'G00', 1: 'G01', 2: 'G02', 3: 'G03' };
  el.roModalG.textContent = state.motionG !== null ? gNames[state.motionG] || ('G' + state.motionG) : '—';
  el.roX.textContent = (state.x * 2).toFixed(3);
  el.roZ.textContent = state.z.toFixed(3);
  el.roF.textContent = state.f.toFixed(3);
  el.roS.textContent = Math.round(state.s);
  el.roT.textContent = state.t !== null ? String(state.t).padStart(4, '0') : '—';
  el.ledSpindle.classList.toggle('on', state.spindle === 'on');
  const dot = el.ledSpindle.querySelector('.dot');
  dot.classList.toggle('spinning', state.spindle === 'on');
  el.ledCoolant.classList.toggle('on', state.coolant === 'on');
  el.coolantTag.textContent = state.coolant === 'on' ? 'ON' : 'OFF';
  updateSpindleTag(state.spindleDir);
}

