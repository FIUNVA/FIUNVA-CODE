/* ============================================================
   PARSE PIPELINE (debounced on input)
   ============================================================ */
let debounceHandle = null;
function scheduleReparse() {
  clearTimeout(debounceHandle);
  debounceHandle = setTimeout(reparseAndRender, 260);
}

function reparseAndRender() {
  if (sim.playing || sim.prepared) return; // don't fight an ongoing/finished simulation view
  renderHighlight();
  let result;
  try {
    result = runInterpreter(el.input.value);
  } catch (err) {
    // An internal error means the program was NEVER interpreted, so nothing of it may stay
    // on screen. Returning with the previous scene still in the viewport made a program that
    // crashes look exactly like the one loaded before it — the readouts, the dimensions and
    // the silhouette all kept describing the previous part.
    lastResult = null;
    lastVb = null;
    el.svg.innerHTML = '';
    el.passHint.textContent = '';
    el.dims.innerHTML = '<span>EL PROGRAMA NO SE PUDO INTERPRETAR</span>';
    renderLog([{ message: 'Error interno al interpretar el programa: ' + err.message }]);
    return;
  }
  lastResult = result;
  renderLog(result.warnings, result.noSemiLines);
  renderStaticPreview(result);
  renderDims(result, lastVb);
  updateReadouts(result.finalState);
}

el.input.addEventListener('input', () => {
  if (sim.prepared) resetSimState(); // typing again always returns to the live preview
  renderHighlight();
  scheduleReparse();
});

