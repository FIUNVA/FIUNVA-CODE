/* ============================================================
   EXAMPLES MENU
   ============================================================ */
function loadProgramText(text) {
  el.input.value = text;
  if (sim.prepared) resetSimState();
  renderHighlight();
  reparseAndRender();
}
EXAMPLES.forEach((ex, i) => {
  const btn = document.createElement('button');
  btn.textContent = ex.name;
  btn.className = 'exampleItem';
  btn.addEventListener('click', () => {
    loadProgramText(ex.code);
    el.examplesMenu.classList.remove('open');
  });
  el.examplesDropdown.appendChild(btn);
});
el.btnExamplesMenu.addEventListener('click', (e) => {
  e.stopPropagation();
  el.examplesMenu.classList.toggle('open');
});
document.addEventListener('click', (e) => {
  if (!el.examplesMenu.contains(e.target)) el.examplesMenu.classList.remove('open');
});

