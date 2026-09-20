/* ============================================================
   SIMULATION / ANIMATION ENGINE
   ============================================================ */
const sim = {
  playing: false,
  prepared: false,
  steps: [],
  stepIndex: 0,
  stepElapsed: 0,
  elapsedBefore: 0,
  totalDuration: 1,
  speed: 2,
  lastTime: 0,
  vb: null,
  hm: null,
  world: null,
  groups: {},
  tempPath: null,
  marker: null,
  materialEl: null,
};

function buildToolMarker() {
  const r = Math.max(sim.SC.u * 3.2, 1.0);
  const g = svgEl('g', { class: 'toolMarker' });
  // Local space: insert tip sits at the origin (the cutting point); the holder
  // extends toward local +Y. Default orientation = M03/CW = tool held BELOW the
  // part, holder extending downward, insert biting upward into the material.
  g.appendChild(svgEl('rect', { class: 'tHolder', x: -r * 0.42, y: r * 0.55, width: r * 0.84, height: r * 1.7, rx: r * 0.1 }));
  g.appendChild(svgEl('polygon', { class: 'tInsert', points: `${-r * 0.62},${r * 0.75} ${r * 0.62},${r * 0.75} 0,0` }));
  g.appendChild(svgEl('circle', { class: 'tTip', r: r * 0.14, cx: 0, cy: 0 }));
  return g;
}
function positionMarker(p, spindleDir) {
  if (!sim.marker) return;
  const dp = displayPoint(p, spindleDir || sim.lastSpindleDir || 'cw');
  sim.lastSpindleDir = spindleDir || sim.lastSpindleDir || 'cw';
  const flip = displaySign(sim.lastSpindleDir) < 0 ? -1 : 1;
  sim.marker.setAttribute('transform', `translate(${dp.z},${dp.x}) scale(1,${flip})`);
}

function buildSimScene() {
  const vb = computeViewBox(lastResult.bounds, lastResult.g71StockMag);
  sim.vb = vb;
  sim.SC = scaleOf(vb);
  sim.world = buildBaseScene(vb);
  sim.hm = makeHeightmap(vb, heightmapSamples(vb));
  sim.materialEl = svgEl('path', { id: 'materialFillEl', class: 'materialFill' + (showFill ? '' : ' noFill'), 'stroke-width': sim.SC.thin, d: heightmapToSilhouettePath(sim.hm) });
  sim.world.appendChild(sim.materialEl);
  const tracesGroup = svgEl('g', { id: 'tracesGroup' });
  tracesGroup.style.display = showTraces ? '' : 'none';
  sim.groups = { rough: svgEl('g'), rapid: svgEl('g'), general: svgEl('g'), finish: svgEl('g') };
  tracesGroup.appendChild(sim.groups.rough);
  tracesGroup.appendChild(sim.groups.rapid);
  tracesGroup.appendChild(sim.groups.general);
  tracesGroup.appendChild(sim.groups.finish);
  // the "in progress" trace shows only the active (M03/M04) side while animating
  sim.tempPathTop = svgEl('path', { class: 'previewFeed', 'stroke-width': sim.SC.normal });
  sim.tempPathBottom = svgEl('path', { class: 'previewFeed', 'stroke-width': sim.SC.normal, style: 'display:none' });
  tracesGroup.appendChild(sim.tempPathTop);
  tracesGroup.appendChild(sim.tempPathBottom);
  sim.world.appendChild(tracesGroup);
  const pzNodeSim = sim.world.querySelector('#partZeroGroup');
  if (pzNodeSim) sim.world.appendChild(pzNodeSim);
  sim.marker = buildToolMarker();
  sim.world.appendChild(sim.marker);
  renderDimensionOverlay(sim.world, lastResult, vb);
  renderContourPoints(sim.world, lastResult, vb);
  el.ledSpindle.classList.remove('on');
  el.ledCoolant.classList.remove('on');
  sim.toolEnabled = false;
  sim.marker.classList.add('disabled');
  updateSpindleTag('cw');
  if (lastResult.home) positionMarker(lastResult.home, 'cw');
  renderDims(lastResult, vb);
}

function prepareSimulation() {
  if (!lastResult) return false;
  buildSimScene();

  sim.steps = [];
  for (const ev of lastResult.timeline) {
    if (ev.kind === 'move') {
      const pts = ev.segment.points;
      let length = 0;
      for (let i = 0; i < pts.length - 1; i++) length += Math.hypot(pts[i + 1].z - pts[i].z, pts[i + 1].x - pts[i].x);
      const speedRef = ev.segment.type === 'rapid' ? 260 : 40;
      const duration = Math.max(60, (length / speedRef) * 1000);
      sim.steps.push({ kind: 'move', seg: ev.segment, phase: ev.phase, line: ev.line, duration, spindleDir: ev.spindleDir || 'cw' });
    } else {
      sim.steps.push({ kind: 'instant', ev, duration: 40 });
    }
  }
  sim.totalDuration = sim.steps.reduce((a, s) => a + s.duration, 1);
  sim.stepIndex = 0; sim.stepElapsed = 0; sim.elapsedBefore = 0;
  sim.prepared = true;
  activeLine = -1;
  updateProgress();
  return true;
}

// Stepping backward can't simply "undo" a finalized cut (the material
// heightmap only ever shrinks), so it replays the whole sequence from
// scratch up to the target step — cheap for a program this size, and the
// only fully reliable way to get an exact, correct earlier state.
function jumpToStep(targetIndex) {
  if (!sim.prepared) return;
  targetIndex = Math.max(0, Math.min(targetIndex, sim.steps.length));
  buildSimScene();
  sim.stepElapsed = 0; sim.elapsedBefore = 0;
  for (let i = 0; i < targetIndex; i++) {
    const step = sim.steps[i];
    if (step.kind === 'instant') { applyInstant(step.ev); sim.elapsedBefore += step.duration; }
    else {
      if (step.line !== undefined) { activeLine = step.line; }
      finalizeStep(step);
      sim.elapsedBefore += step.duration;
    }
  }
  sim.stepIndex = targetIndex;
  renderHighlight();
  scrollActiveLineIntoView();
  updateProgress();
}

function polylineAtFraction(points, t) {
  const lens = [0];
  for (let i = 0; i < points.length - 1; i++) lens.push(lens[i] + Math.hypot(points[i + 1].z - points[i].z, points[i + 1].x - points[i].x));
  const total = lens[lens.length - 1] || 1e-6;
  const target = Math.max(0, Math.min(1, t)) * total;
  let i = 0;
  while (i < lens.length - 2 && lens[i + 1] < target) i++;
  const segLen = (lens[i + 1] - lens[i]) || 1e-6;
  const localT = (target - lens[i]) / segLen;
  const a = points[i], b = points[Math.min(i + 1, points.length - 1)];
  const p = { z: a.z + (b.z - a.z) * localT, x: a.x + (b.x - a.x) * localT };
  return { point: p, subPoints: points.slice(0, i + 1).concat([p]) };
}

function applyInstant(ev) {
  if (ev.kind === 'spindle') {
    el.ledSpindle.classList.toggle('on', ev.state === 'on');
    el.ledSpindle.querySelector('.dot').classList.toggle('spinning', ev.state === 'on');
    if (ev.dir) updateSpindleTag(ev.dir);
  } else if (ev.kind === 'coolant') {
    el.ledCoolant.classList.toggle('on', ev.state === 'on');
    el.coolantTag.textContent = ev.state === 'on' ? 'ON' : 'OFF';
  } else if (ev.kind === 'tool') {
    el.roT.textContent = String(ev.tool).padStart(4, '0');
    if (!sim.toolEnabled) { sim.toolEnabled = true; sim.marker.classList.remove('disabled'); }
  }
  if (ev.line !== undefined) { activeLine = ev.line; renderHighlight(); scrollActiveLineIntoView(); }
}

function drawPartialStep(step, t) {
  const { point, subPoints } = polylineAtFraction(step.seg.points, t);
  positionMarker(point, step.spindleDir);
  const cls = step.seg.type === 'rapid' ? 'previewRapid'
    : step.phase === 'rough' ? 'previewRough'
    : step.phase === 'finish' ? 'previewFinish' : 'previewFeed';
  sim.tempPathTop.setAttribute('class', cls);
  sim.tempPathTop.setAttribute('d', pathFromPoints(toDisplayPoints(subPoints, step.spindleDir)));
  sim.tempPathBottom.setAttribute('d', '');
  el.roX.textContent = (point.x * 2).toFixed(3);
  el.roZ.textContent = point.z.toFixed(3);
}

function finalizeStep(step) {
  const pts = step.seg.points;
  positionMarker(pts[pts.length - 1], step.spindleDir);
  sim.tempPathTop.setAttribute('d', '');
  sim.tempPathBottom.setAttribute('d', '');
  const dPts = toDisplayPoints(pts, step.spindleDir);
  let cls, group, sw;
  if (step.seg.type === 'rapid') { cls = 'pathRapid'; group = sim.groups.rapid; sw = sim.SC.thin; }
  else if (step.phase === 'rough') { cls = 'pathFeedRough'; group = sim.groups.rough; sw = sim.SC.thin; }
  else if (step.phase === 'finish') { cls = 'pathFeedFinish'; group = sim.groups.finish; sw = sim.SC.normal; }
  else { cls = 'pathFeedGeneral'; group = sim.groups.general; sw = sim.SC.normal; }
  const dash = step.phase === 'rough' ? { 'stroke-dasharray': `${sim.SC.u * 1.6} ${sim.SC.u * 1.2}` } : {};
  group.appendChild(svgEl('path', { class: cls, 'stroke-width': sw, ...dash, d: pathFromPoints(dPts) }));
  if (step.seg.type === 'feed') {
    applyFeedToHeightmap(sim.hm, pts);
    sim.materialEl.setAttribute('d', heightmapToSilhouettePath(sim.hm));
  }
  el.roX.textContent = (pts[pts.length - 1].x * 2).toFixed(3);
  el.roZ.textContent = pts[pts.length - 1].z.toFixed(3);
  if (step.seg.f !== undefined) el.roF.textContent = (step.seg.f || 0).toFixed(3);
  if (step.seg.s !== undefined) el.roS.textContent = Math.round(step.seg.s || 0);
}

function updateProgress() {
  const elapsed = sim.elapsedBefore + sim.stepElapsed;
  el.progressBar.style.width = Math.min(100, (elapsed / sim.totalDuration) * 100) + '%';
}

function advance(dtMs) {
  let remaining = dtMs * sim.speed;
  while (remaining > 0 && sim.stepIndex < sim.steps.length) {
    const step = sim.steps[sim.stepIndex];
    if (step.kind === 'instant') {
      applyInstant(step.ev);
      sim.elapsedBefore += step.duration;
      sim.stepIndex++;
      continue;
    }
    if (step.line !== undefined && step.line !== activeLine) { activeLine = step.line; renderHighlight(); scrollActiveLineIntoView(); }
    const need = step.duration - sim.stepElapsed;
    if (remaining >= need) {
      finalizeStep(step);
      remaining -= need;
      sim.elapsedBefore += step.duration;
      sim.stepElapsed = 0;
      sim.stepIndex++;
    } else {
      sim.stepElapsed += remaining;
      drawPartialStep(step, sim.stepElapsed / step.duration);
      remaining = 0;
    }
  }
  if (sim.stepIndex >= sim.steps.length) {
    sim.playing = false;
    el.btnPlay.textContent = '↻ VOLVER A SIMULAR';
  }
  updateProgress();
}

function tick(now) {
  if (!sim.playing) return;
  if (!sim.lastTime) sim.lastTime = now;
  const dt = Math.min(now - sim.lastTime, 100);
  sim.lastTime = now;
  advance(dt);
  if (sim.playing) requestAnimationFrame(tick);
}

/* ---------- Transport controls ---------- */
el.btnPlay.addEventListener('click', () => {
  if (!sim.prepared) { if (!prepareSimulation()) return; }
  if (sim.stepIndex >= sim.steps.length) { // finished — restart
    sim.prepared = false;
    if (!prepareSimulation()) return;
  }
  sim.playing = true;
  sim.lastTime = 0;
  el.btnPlay.textContent = '▶ SIMULAR';
  requestAnimationFrame(tick);
});
el.btnPause.addEventListener('click', () => { sim.playing = false; });
el.btnStep.addEventListener('click', () => {
  if (!sim.prepared) { if (!prepareSimulation()) return; }
  sim.playing = false;
  if (sim.stepIndex >= sim.steps.length) return;
  const step = sim.steps[sim.stepIndex];
  if (step.kind === 'instant') { applyInstant(step.ev); sim.elapsedBefore += step.duration; }
  else { if (step.line !== undefined) { activeLine = step.line; renderHighlight(); scrollActiveLineIntoView(); } finalizeStep(step); sim.elapsedBefore += step.duration; sim.stepElapsed = 0; }
  sim.stepIndex++;
  updateProgress();
});
el.btnStepBack.addEventListener('click', () => {
  if (!sim.prepared) { if (!prepareSimulation()) return; }
  sim.playing = false;
  if (sim.stepIndex <= 0) return;
  jumpToStep(sim.stepIndex - 1);
});
function resetSimState() {
  sim.playing = false;
  sim.prepared = false;
  sim.steps = []; sim.stepIndex = 0; sim.stepElapsed = 0; sim.elapsedBefore = 0;
  el.btnPlay.textContent = '▶ SIMULAR';
  activeLine = -1;
  el.progressBar.style.width = '0%';
  el.ledSpindle.classList.remove('on');
  el.ledCoolant.classList.remove('on');
}
el.btnReset.addEventListener('click', () => {
  resetSimState();
  reparseAndRender();
  renderHighlight();
});
el.speedSlider.addEventListener('input', () => {
  sim.speed = parseFloat(el.speedSlider.value);
  el.speedVal.textContent = sim.speed.toFixed(2) + '×';
});

