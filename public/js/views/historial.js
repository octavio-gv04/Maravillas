/**
 * views/historial.js — Bitacora de acciones + respaldo/restauracion JSON.
 */

import { getHistorial, subscribe, exportBackup, importBackup, seedFromExcel } from '../store.js';
import { prettyDate, esc, toast, confirmAction } from '../utils.js';
import { card, btn, btnGhost, sectionHead, empty } from '../ui.js';

export function render(container) {
  const draw = () => {
    const log = getHistorial();
    container.innerHTML = card(`
      ${sectionHead(`Historial (${log.length})`,
        `${btn('⬇️ Respaldo', 'id="backup-btn"')} ${btnGhost('⬆️ Restaurar', 'id="restore-btn"')} ${btnGhost('📥 Datos del Excel', 'id="seed-btn"')}`)}
      <input id="restore-file" type="file" accept="application/json" class="hidden" />
      ${log.length ? `
      <div class="table-wrap">
        <table class="w-full text-sm">
          <thead class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
            <tr><th class="py-2">Fecha</th><th>Hora</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr>
          </thead>
          <tbody>
            ${log.map((h) => `
              <tr class="border-b border-gray-100 dark:border-gray-700/50">
                <td class="py-2 whitespace-nowrap">${prettyDate(h.fecha)}</td>
                <td class="whitespace-nowrap">${esc(h.hora)}</td>
                <td>${esc(h.usuario)}</td>
                <td>${esc(h.accion)}</td>
                <td>${esc(h.detalle)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>` : empty('Sin actividad registrada')}
    `);

    // Descargar respaldo JSON.
    container.querySelector('#backup-btn').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(exportBackup(), null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `respaldo-admin-financiera-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast('Respaldo descargado', 'success');
    });

    // Recargar los datos reales migrados del Excel (reemplaza lo actual).
    container.querySelector('#seed-btn').addEventListener('click', async () => {
      if (!confirmAction('¿Recargar los datos del Excel? Reemplazará los datos actuales.')) return;
      try {
        await seedFromExcel(true);
        toast('Datos del Excel recargados', 'success');
      } catch (e) {
        toast('Error: ' + e.message, 'error');
      }
    });

    // Restaurar desde archivo.
    const fileInput = container.querySelector('#restore-file');
    container.querySelector('#restore-btn').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          await importBackup(JSON.parse(reader.result));
          toast('Datos restaurados', 'success');
        } catch (e) {
          toast('Archivo inválido: ' + e.message, 'error');
        }
      };
      reader.readAsText(file);
    });
  };

  draw();
  return subscribe(draw);
}
