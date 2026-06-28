/**
 * ui.js — Componentes de interfaz reutilizables (devuelven HTML string).
 * Mantiene las vistas cortas y consistentes con la paleta de marca.
 */

import { esc } from './utils.js';
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

/** Campo de texto/numero/fecha con etiqueta. */
export function field({ label, name, type = 'text', value = '', attrs = '', placeholder = '' }) {
  // En inputs nativos de fecha forzamos locale mexicano (dd/mm/aaaa) en Safari/Chrome.
  const lang = (type === 'date' || type === 'month') ? 'lang="es-MX"' : '';
  return `
    <label class="block">
      <span class="text-xs font-medium text-gray-600 dark:text-gray-300">${esc(label)}</span>
      <input class="field mt-1" type="${type}" name="${name}" value="${esc(value)}" ${lang}
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
