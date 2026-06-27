/**
 * views/conciliacion.js — Conciliación mensual (replica la hoja CONCILIACION).
 * Matriz de conceptos de ingreso x Etapa para el mes seleccionado, con
 * totales de ingresos/egresos, utilidad y verificación de conciliación por etapa.
 */

import { conciliacionMensual } from '../calc.js';
import { subscribe } from '../store.js';
import { ZONAS } from '../config.js';
import { money, esc, todayISO } from '../utils.js';
import { card, badge, cardTitle } from '../ui.js';

export function render(container) {
  let mes = todayISO().slice(0, 7); // 'YYYY-MM'

  const draw = () => {
    const c = conciliacionMensual(mes, ZONAS);

    const th = (t, cls = '') => `<th class="py-2 px-3 ${cls}">${esc(t)}</th>`;
    const tdMoney = (v, cls = '') => `<td class="px-3 py-1.5 text-right tabular-nums ${cls}">${money(v)}</td>`;

    const headEtapas = c.etapas.map((e) => th(e, 'text-right')).join('') + th('Total', 'text-right');

    const filasHtml = c.filas.map((f) => `
      <tr class="border-b border-gray-100 dark:border-gray-700/50">
        <td class="px-3 py-1.5">${esc(f.label)}</td>
        ${f.valores.map((v) => tdMoney(v)).join('')}
        ${tdMoney(f.total, 'font-semibold')}
      </tr>`).join('');

    const rowTotals = (label, arr, gran, cls = '') => `
      <tr class="${cls}">
        <td class="px-3 py-2">${esc(label)}</td>
        ${arr.map((v) => tdMoney(v)).join('')}
        ${tdMoney(gran, 'font-bold')}
      </tr>`;

    const sum = (a) => a.reduce((x, y) => x + y, 0);

    container.innerHTML = `
      <div class="flex items-center gap-3 mb-4 flex-wrap">
        <label class="text-sm text-gray-500">Mes:</label>
        <input id="con-mes" type="month" class="field !w-48" value="${mes}" />
        <span class="text-sm text-gray-400">${esc(c.desde)} → ${esc(c.hasta)}</span>
      </div>

      ${card(`
        ${cardTitle('chartBar', 'Ingresos por concepto y etapa', 'bg-violet-500')}
        <div class="table-wrap">
          <table class="w-full text-sm">
            <thead class="text-left text-gray-500 border-b-2 border-gray-200 dark:border-gray-700">
              <tr>${th('Concepto')}${headEtapas}</tr>
            </thead>
            <tbody>${filasHtml}</tbody>
            <tfoot class="border-t-2 border-gray-300 dark:border-gray-600">
              ${rowTotals('Efectivo', c.totalEfectivo, sum(c.totalEfectivo), 'text-gray-500')}
              ${rowTotals('Depósito', c.totalDeposito, sum(c.totalDeposito), 'text-gray-500')}
              ${rowTotals('Total ingresos', c.totalIngresos, c.granTotalIngresos, 'font-bold text-green-600 border-t border-gray-200 dark:border-gray-700')}
            </tfoot>
          </table>
        </div>
      `)}

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        ${card(`
          ${cardTitle('link', 'Resultado por etapa', 'bg-blue-500')}
          <div class="table-wrap">
            <table class="w-full text-sm">
              <thead class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
                <tr>${th('Concepto')}${c.etapas.map((e) => th(e, 'text-right')).join('')}${th('Total', 'text-right')}</tr>
              </thead>
              <tbody>
                ${rowTotals('Ingresos', c.totalIngresos, c.granTotalIngresos)}
                ${rowTotals('Egresos', c.totalEgresos, c.granTotalEgresos)}
                <tr class="font-bold border-t border-gray-200 dark:border-gray-700">
                  <td class="px-3 py-2">Utilidad</td>
                  ${c.utilidad.map((v) => tdMoney(v, v >= 0 ? 'text-green-600' : 'text-red-600')).join('')}
                  ${tdMoney(c.granUtilidad, c.granUtilidad >= 0 ? 'text-green-600' : 'text-red-600')}
                </tr>
              </tbody>
            </table>
          </div>
        `)}

        ${card(`
          ${cardTitle('checkCircle', 'Verificación de conciliación', 'bg-green-500')}
          <p class="text-xs text-gray-500 mb-3">Total de ingresos menos la suma del desglose por concepto. Debe ser 0 en cada etapa.</p>
          <div class="space-y-2">
            ${c.etapas.map((e, i) => {
              const ok = Math.abs(c.conciliacion[i]) < 0.01;
              return `<div class="flex items-center justify-between">
                        <span class="text-sm">${esc(e)}</span>
                        ${badge(ok ? 'green' : 'red', ok ? 'Conciliado · ' + money(0) : money(c.conciliacion[i]))}
                      </div>`;
            }).join('')}
          </div>
        `)}
      </div>
    `;

    container.querySelector('#con-mes').addEventListener('change', (e) => {
      mes = e.target.value || todayISO().slice(0, 7);
      draw();
    });
  };

  draw();
  return subscribe(draw);
}
