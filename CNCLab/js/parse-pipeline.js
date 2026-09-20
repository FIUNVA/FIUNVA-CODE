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

