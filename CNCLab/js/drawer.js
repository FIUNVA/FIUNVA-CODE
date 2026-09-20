/* ============================================================
   COLLAPSIBLE PROGRAM DRAWER
   ============================================================ */
el.btnToggleEditor.addEventListener('click', () => {
  el.stage.classList.toggle('drawerOpen');
});
el.drawerBackdrop.addEventListener('click', () => {
  el.stage.classList.remove('drawerOpen');
});

