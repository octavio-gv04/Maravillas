/**
 * views/maestra/auditoria.js — Auditoría completa (bitácora del servidor).
 * Registra usuario, fecha, hora, acción y detalle de cada alta/edición/
 * eliminación en todo el sistema (Diario + Maestra). Búsqueda y filtro por acción.
 */

import { subscribe, getHistorial } from '../../store.js';
import { esc, prettyDate } from '../../utils.js';
import { card, badge, empty, sectionHead } from '../../ui.js';

const accionColor = (a) => ({ Alta: 'green', Edición: 'yellow', Eliminación: 'red', Corte: 'yellow', Respaldo: 'yellow' }[a] || 'yellow');

export function render(container) {
  let q = '', fAccion = '';

  const draw = () => {
    const all = getHistorial();
    const acciones = [...new Set(all.map((e) => e.accion).filter(Boolean))];
    const list = all.filter((e) =>
      (!fAccion || e.accion === fAccion)
      && (!q || `${e.usuario} ${e.detalle}`.toLowerCase().includes(q.toLowerCase())));

    container.innerHTML = `
      ${sectionHead('Auditoría', `<span class="text-sm text-gray-500 self-center">${list.length} de ${all.length} registros</span>`)}
      <div class="grid sm:grid-cols-2 gap-2 mb-4">
        <input id="a-q" class="field" placeholder="Buscar usuario o detalle…" value="${esc(q)}" />
        <select id="a-accion" class="field">
          <option value="">Todas las acciones</option>
          ${acciones.map((a) => `<option value="${esc(a)}" ${a === fAccion ? 'selected' : ''}>${esc(a)}</option>`).join('')}
        </select>
      </div>
      ${list.length ? card(`
        <div class="table-wrap"><table class="w-full text-sm">
          <thead class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
            <tr><th class="py-2">Fecha</th><th>Hora</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr>
          </thead>
          <tbody>
            ${list.map((e) => `<tr class="border-b border-gray-100 dark:border-gray-700/50">
              <td class="py-1.5 whitespace-nowrap">${prettyDate(e.fecha)}</td>
              <td class="text-gray-500">${esc(e.hora || '')}</td>
              <td>${esc(e.usuario || '')}</td>
              <td>${badge(accionColor(e.accion), e.accion || '')}</td>
              <td class="text-gray-500">${esc(e.detalle || '')}</td>
            </tr>`).join('')}
          </tbody>
        </table></div>
      `) : empty('Sin registros de auditoría')}
    `;

    const qi = container.querySelector('#a-q');
    qi.addEventListener('input', (e) => { q = e.target.value; const pos = e.target.selectionStart; draw(); const n = container.querySelector('#a-q'); n.focus(); n.setSelectionRange(pos, pos); });
    container.querySelector('#a-accion').addEventListener('change', (e) => { fAccion = e.target.value; draw(); });
  };

  draw();
  const unsub = subscribe(draw);
  return unsub;
}
