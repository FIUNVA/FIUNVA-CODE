/* ============================================================
   SAVE / LOAD PROGRAM (.txt)
   ============================================================ */
el.btnSaveFile.addEventListener('click', () => {
  const blob = new Blob([el.input.value], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const progNum = (el.input.value.match(/^O\s*(\d+)/im) || [])[1] || 'programa';
  a.href = url;
  a.download = `O${progNum}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});
el.btnLoadFile.addEventListener('click', () => el.fileLoadInput.click());
el.fileLoadInput.addEventListener('change', () => {
  const file = el.fileLoadInput.files && el.fileLoadInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    el.input.value = String(reader.result);
    if (sim.prepared) resetSimState();
    renderHighlight();
    reparseAndRender();
  };
  reader.readAsText(file);
  el.fileLoadInput.value = '';
});

