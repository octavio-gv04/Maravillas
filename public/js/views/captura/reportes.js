/**
 * views/captura/reportes.js — Menú "Reportes" de Captura Diaria (Hillary).
 *
 * Agrupa en un solo menú, con pestañas internas, los reportes de seguimiento que
 * antes vivían sueltos en el menú lateral:
 *   • Morosos → seguimiento de cobranza acotado (views/captura/morosos.js).
 *   • Sobre   → revisión de sobres mes a mes  (views/captura/sobres.js).
 *
 * Cada sub-vista es autónoma: pinta su propio contenido en el contenedor que se
 * le pasa y devuelve una función de limpieza (desuscripción). Aquí solo montamos
 * la pestaña activa en `#rep-body`, limpiando la anterior al cambiar. La pestaña
 * inicial puede fijarse con el parámetro de la ruta `#/reportes?t=sobres`.
 */

import { render as morosos } from './morosos.js';
import { render as sobres } from './sobres.js';
import { esc } from '../../utils.js';
import { queryParam } from '../../router.js';

const TABS = [
  ['morosos', 'Morosos', morosos],
  ['sobres', 'Sobre', sobres],
];

export function render(container) {
  let active = queryParam('t');
  if (!TABS.some(([k]) => k === active)) active = 'morosos';
  let cleanup = null;

  container.innerHTML = `
    <div class="flex items-center gap-3 mb-4 flex-wrap">
      <h1 class="text-lg font-bold">Reportes</h1>
    </div>
    <div id="rep-tabs" class="flex gap-2 mb-4 flex-wrap"></div>
    <div id="rep-body"></div>`;

  const tabsEl = container.querySelector('#rep-tabs');
  const body = container.querySelector('#rep-body');

  const tabBtn = (key, label) =>
    `<button data-rtab="${key}" class="px-3 py-1.5 rounded-lg text-sm font-medium ${active === key
      ? 'bg-brand text-white'
      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}">${esc(label)}</button>`;

  const mount = () => {
    if (typeof cleanup === 'function') { try { cleanup(); } catch {} }
    tabsEl.innerHTML = TABS.map(([key, label]) => tabBtn(key, label)).join('');
    tabsEl.querySelectorAll('[data-rtab]').forEach((b) =>
      b.addEventListener('click', () => { if (active !== b.dataset.rtab) { active = b.dataset.rtab; mount(); } }));
    const def = TABS.find(([k]) => k === active);
    cleanup = def[2](body) || null;
  };

  mount();
  return () => { if (typeof cleanup === 'function') { try { cleanup(); } catch {} } };
}
