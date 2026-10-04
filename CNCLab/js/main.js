/* ============================================================
   INIT
   ============================================================ */
el.input.value = DEFAULT_PROGRAM;
sim.speed = parseFloat(el.speedSlider.value);
el.speedVal.textContent = sim.speed.toFixed(2) + '×';
renderHighlight();
reparseAndRender();
// After a frame, so the panel is laid out: applyZoom measures the container to size
// the SVG, and the tab bar below is built after this file runs.
requestAnimationFrame(() => applyZoom(BOOT_ZOOM));
