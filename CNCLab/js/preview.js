/* ============================================================
   LIVE PREVIEW (static) — redrawn on every edit
   ============================================================ */
let lastResult = null;
let lastVb = null;

function renderStaticPreview(result) {
  const vb = computeViewBox(result.bounds, result.g71StockMag);
  lastVb = vb;
  const world = buildBaseScene(vb);
  const SC = scaleOf(vb);

  // final material silhouette from every feed move in the whole program
  const hm = makeHeightmap(vb, heightmapSamples(vb));
  const rapidPts = [];
  const roughPts = [];
  const finishPts = [];
  const generalPts = [];

  for (const ev of result.timeline) {
    if (ev.kind !== 'move' || ev.phase === 'retract') continue;
    const seg = ev.segment;
    // Only the finished-part silhouette (below, via the heightmap) is a full
    // body of revolution; the pass/rapid trace lines show only the side the
    // tool actually travels on, per the active M03/M04 convention.
    const dPts = toDisplayPoints(seg.points, ev.spindleDir);
    if (seg.type === 'feed') {
      applyFeedToHeightmap(hm, seg.points);
      if (ev.phase === 'rough') roughPts.push(dPts);
      else if (ev.phase === 'finish') finishPts.push(dPts);
      else generalPts.push(dPts);
    } else {
      rapidPts.push(dPts);
    }
  }

  const fillEl = svgEl('path', { id: 'materialFillEl', class: 'materialFill' + (showFill ? '' : ' noFill'), 'stroke-width': SC.thin, d: heightmapToSilhouettePath(hm) });
  world.appendChild(fillEl);

  const tracesGroup = svgEl('g', { id: 'tracesGroup' });
  tracesGroup.style.display = showTraces ? '' : 'none';
  for (const pts of roughPts) tracesGroup.appendChild(svgEl('path', { class: 'previewRough', 'stroke-width': SC.thin, 'stroke-dasharray': `${SC.u * 1.6} ${SC.u * 1.2}`, d: pathFromPoints(pts) }));
  for (const pts of rapidPts) tracesGroup.appendChild(svgEl('path', { class: 'previewRapid', 'stroke-width': SC.thin, d: pathFromPoints(pts) }));
  for (const pts of generalPts) tracesGroup.appendChild(svgEl('path', { class: 'previewFeed', 'stroke-width': SC.normal, d: pathFromPoints(pts) }));
  for (const pts of finishPts) tracesGroup.appendChild(svgEl('path', { class: 'previewFinish', 'stroke-width': SC.normal, d: pathFromPoints(pts) }));
  world.appendChild(tracesGroup);
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
  el.passHint.textContent = roughPasses.size ? `G71: ${roughPasses.size} pasadas · G70: contorno final` : '';
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

