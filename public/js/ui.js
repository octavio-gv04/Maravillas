/**
 * ui.js — Componentes de interfaz reutilizables (devuelven HTML string).
 * Mantiene las vistas cortas y consistentes con la paleta de marca.
 */

import { esc, money, toNum } from './utils.js';
import { iconChip, svgIcon } from './icons.js';

/** Tarjeta-contenedor. */
export const card = (inner, extra = '') =>
  `<div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 md:p-5 ${extra}">${inner}</div>`;

/** Tarjeta de metrica (KPI) para el dashboard. */
export function kpi({ label, value, icon, accent = 'text-gray-900 dark:text-white', sub = '' }) {
  return card(`
    <div class="flex items-start justify-between">
      <div>
        <p class="text-xs uppercase tracking-wide text-gray-500">${esc(label)}</p>
        <p class="text-2xl font-bold mt-1 ${accent}">${value}</p>
        ${sub ? `<p class="text-xs text-gray-500 mt-1">${sub}</p>` : ''}
      </div>
      <span class="text-2xl">${icon}</span>
    </div>`);
}

/** Boton primario. Misma altura (2.5rem) que inputs/selects (.field). */
export const btn = (label, attrs = '') =>
  `<button class="bg-brand hover:bg-brand-dark text-white inline-flex items-center justify-center min-h-[2.5rem] px-4 rounded-lg text-sm font-medium transition" ${attrs}>${label}</button>`;

/** Boton secundario / neutro. Misma altura (2.5rem) que inputs/selects (.field). */
export const btnGhost = (label, attrs = '') =>
  `<button class="border border-gray-300 dark:border-gray-600 inline-flex items-center justify-center min-h-[2.5rem] px-3 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition" ${attrs}>${label}</button>`;

/** Campo de texto/numero/fecha con etiqueta. `money:true` lo convierte en campo
 *  de dinero: se muestra formateado ($1,234.00) y se edita como número plano. */
export function field({ label, name, type = 'text', value = '', attrs = '', placeholder = '', money: isMoney = false }) {
  if (isMoney) {
    const val = (value === '' || value == null) ? '' : money(toNum(value));
    return `
    <label class="block">
      <span class="text-xs font-medium text-gray-600 dark:text-gray-300">${esc(label)}</span>
      <input class="field mt-1 text-right tabular-nums" type="text" inputmode="decimal" data-money name="${name}"
             value="${esc(val)}" placeholder="${esc(placeholder || '$0.00')}" ${attrs} />
    </label>`;
  }
  // En inputs nativos de fecha forzamos locale mexicano (dd/mm/aaaa) en Safari/Chrome.
  const lang = (type === 'date' || type === 'month') ? 'lang="es-MX"' : '';
  // Las claves de lote se ven y se guardan en MAYÚSCULAS (uniformidad).
  const up = (name === 'lote' || name === 'numero') ? 'style="text-transform:uppercase"' : '';
  return `
    <label class="block">
      <span class="text-xs font-medium text-gray-600 dark:text-gray-300">${esc(label)}</span>
      <input class="field mt-1" type="${type}" name="${name}" value="${esc(value)}" ${lang} ${up}
             placeholder="${esc(placeholder)}" ${attrs} />
    </label>`;
}

/** Campo select con etiqueta. */
export function select({ label, name, options, value = '', attrs = '' }) {
  const opts = options.map((o) =>
    `<option value="${esc(o)}" ${o === value ? 'selected' : ''}>${esc(o)}</option>`).join('');
  return `
    <label class="block">
      <span class="text-xs font-medium text-gray-600 dark:text-gray-300">${esc(label)}</span>
      <select class="field mt-1" name="${name}" ${attrs}>${opts}</select>
    </label>`;
}

/** Textarea con etiqueta. */
export function textarea({ label, name, value = '', rows = 2 }) {
  return `
    <label class="block">
      <span class="text-xs font-medium text-gray-600 dark:text-gray-300">${esc(label)}</span>
      <textarea class="field mt-1" name="${name}" rows="${rows}">${esc(value)}</textarea>
    </label>`;
}

/** Etiqueta de estado con semaforo. */
export function badge(color, label) {
  const map = {
    green: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    red: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    yellow: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  };
  return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${map[color]}">
            <span class="dot dot-${color}"></span>${esc(label)}
          </span>`;
}

/**
 * Título de tarjeta/sección con chip de icono (estilo KPI: chip de color sólido
 * + icono blanco calado). `icon` es un nombre del set en icons.js.
 */
export const cardTitle = (icon, text, color = 'bg-brand', extra = '') =>
  `<h2 class="flex items-center gap-2 font-semibold mb-3 ${extra}">
     ${iconChip(icon, color)}<span>${esc(text)}</span>
   </h2>`;

/** Encabezado de seccion con titulo (opcional con chip de icono) y acciones a la derecha. */
export const sectionHead = (title, actions = '', icon = '', color = 'bg-brand') =>
  `<div class="flex items-center justify-between mb-4 gap-3 flex-wrap">
     <h2 class="flex items-center gap-2 text-xl font-semibold">${icon ? iconChip(icon, color) : ''}<span>${esc(title)}</span></h2>
     <div class="flex gap-2">${actions}</div>
   </div>`;

/**
 * Botón-icono de acción para tablas (editar / eliminar / imprimir…).
 * Icono de línea (currentColor) que hereda el color del hover.
 */
export const actionBtn = (icon, attrs = '', cls = 'hover:text-brand', title = '') =>
  `<button ${attrs} title="${esc(title)}" class="px-1.5 align-middle ${cls}">${svgIcon(icon, 'w-4 h-4 inline')}</button>`;

/** Mensaje de "sin datos". */
export const empty = (msg = 'Sin registros') =>
  `<div class="text-center text-gray-400 py-10 text-sm">${svgIcon('list', 'w-8 h-8 inline opacity-40 mb-2')}<br>${esc(msg)}</div>`;

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const mesBtnCls = (active) =>
  `rounded-lg py-1.5 text-sm transition ${active ? 'bg-brand text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`;

/**
 * Selector de mes como MENÚ EMERGENTE: un botón "Mes Año" que abre un popup con
 * navegación de año (‹ ›) y una cuadrícula de meses. Reemplaza a
 * `<input type="month">`, que macOS Safari NO soporta. Wirearlo con wireMonthNav.
 * @param {string} mes 'YYYY-MM'
 */
export function monthNav(mes) {
  const [y, m] = mes.split('-').map(Number);
  const grid = MESES.map((nm, i) =>
    `<button type="button" data-mes-pick="${i + 1}" class="${mesBtnCls(i + 1 === m)}">${nm.slice(0, 3)}</button>`).join('');
  const yBtn = 'rounded-lg w-8 h-8 inline-flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition';
  return `
    <div class="relative inline-block" data-mesnav>
      <button type="button" data-mes-trigger class="field !w-44 inline-flex items-center justify-between gap-2 cursor-pointer">
        <span data-mes-label>${MESES[m - 1]} ${y}</span>${svgIcon('chevronDown', 'w-4 h-4 opacity-60 shrink-0')}
      </button>
      <div data-mes-panel class="hidden absolute z-30 mt-1 left-0 w-64 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl p-3">
        <div class="flex items-center justify-between mb-2">
          <button type="button" data-mes-yprev class="${yBtn}" title="Año anterior">${svgIcon('chevronLeft', 'w-4 h-4')}</button>
          <span data-mes-year class="font-semibold tabular-nums">${y}</span>
          <button type="button" data-mes-ynext class="${yBtn}" title="Año siguiente">${svgIcon('chevronRight', 'w-4 h-4')}</button>
        </div>
        <div class="grid grid-cols-3 gap-1" data-mes-grid>${grid}</div>
      </div>
    </div>`;
}

/** Conecta un monthNav (popup): llama onChange('YYYY-MM') al elegir un mes. */
export function wireMonthNav(root, mes, onChange) {
  const el = root.querySelector('[data-mesnav]');
  if (!el) return;
  const [cy, cm] = mes.split('-').map(Number);
  const panel = el.querySelector('[data-mes-panel]');
  const yearLbl = el.querySelector('[data-mes-year]');
  const grid = el.querySelector('[data-mes-grid]');
  let viewYear = cy;
  let onDoc = null;

  const highlight = () => {
    yearLbl.textContent = viewYear;
    grid.querySelectorAll('[data-mes-pick]').forEach((b) => {
      b.className = mesBtnCls(viewYear === cy && Number(b.dataset.mesPick) === cm);
    });
  };
  const close = () => {
    panel.classList.add('hidden');
    if (onDoc) { document.removeEventListener('mousedown', onDoc); onDoc = null; }
  };
  const open = () => {
    viewYear = cy; highlight();
    panel.classList.remove('hidden');
    onDoc = (ev) => { if (!el.contains(ev.target)) close(); };
    document.addEventListener('mousedown', onDoc);
  };

  el.querySelector('[data-mes-trigger]').addEventListener('click', () =>
    panel.classList.contains('hidden') ? open() : close());
  el.querySelector('[data-mes-yprev]').addEventListener('click', () => { viewYear--; highlight(); });
  el.querySelector('[data-mes-ynext]').addEventListener('click', () => { viewYear++; highlight(); });
  grid.querySelectorAll('[data-mes-pick]').forEach((b) =>
    b.addEventListener('click', () => {
      const m = Number(b.dataset.mesPick);
      close();
      onChange(`${viewYear}-${String(m).padStart(2, '0')}`);
    }));
}
