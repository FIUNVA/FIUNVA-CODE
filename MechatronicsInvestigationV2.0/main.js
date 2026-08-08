import { init } from './ui.js';

async function loadGameData() {
  try {
    const response = await fetch('./data.json');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.warn('No se pudo cargar data.json con fetch:', error);
  }

  try {
    const module = await import('./data.js');
    return module.default;
  } catch (error) {
    console.error('No se pudo cargar data.js como fallback:', error);
    return null;
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  const data = await loadGameData();
  if (!data) {
    document.body.innerHTML = '<div style="color:white;padding:40px;font-family:sans-serif;">Error: no se pudo cargar data.json ni data.js. Asegúrate de que ambos archivos existan en el mismo directorio y abre la página desde un servidor local.</div>';
    return;
  }
  init(data);
});
