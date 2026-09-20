/* ============================================================
   INIT
   ============================================================ */
el.input.value = DEFAULT_PROGRAM;
sim.speed = parseFloat(el.speedSlider.value);
el.speedVal.textContent = sim.speed.toFixed(2) + '×';
renderHighlight();
reparseAndRender();
