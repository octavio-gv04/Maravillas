/**
 * views/flujo.js — Flujo de efectivo por Etapa (replica la hoja FLUJO del Excel).
 * Ingresos (efectivo/depósito + desglose por categoría con conciliación),
 * Egresos (comisiones por vendedor + operación) y Balance (utilidad).
 */

import { flujoEtapa } from '../calc.js';
import { subscribe } from '../store.js';
import { ZONAS } from '../config.js';
import { money, esc, todayISO } from '../utils.js';
import { card, badge, cardTitle } from '../ui.js';

export function render(container) {
  let etapa = ZONAS[1] || ZONAS[0]; // "Etapa 3" por defecto
  let desde = '';
  let hasta = '';

  const row = (label, value, cls = '') =>
    `<div class="flex justify-between py-1 ${cls}"><span>${esc(label)}</span><span class="font-medium tabular-nums">${money(value)}</span></div>`;

  const draw = () => {
    const f = flujoEtapa(etapa, { desde: desde || undefined, hasta: hasta || undefined });
    const conciliado = Math.abs(f.conciliacion) < 0.01;

    const etapaTabs = ZONAS.map((e) =>
      `<button data-etapa="${esc(e)}" class="px-3 py-1.5 rounded-lg text-sm border ${e === etapa ? 'bg-brand text-white border-brand' : 'border-gray-300 dark:border-gray-600'}">${esc(e)}</button>`).join('');

    container.innerHTML = `
      <div class="flex items-center gap-2 mb-3 flex-wrap">${etapaTabs}</div>
      <div class="flex items-center gap-3 mb-4 flex-wrap text-sm">
        <label class="text-gray-500">Desde</label><input id="f-desde" type="date" lang="es-MX" class="field !w-40" value="${desde}" />
        <label class="text-gray-500">Hasta</label><input id="f-hasta" type="date" lang="es-MX" class="field !w-40" value="${hasta}" />
        <button id="f-clear" class="text-brand underline">Todo el periodo</button>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <!-- INGRESOS -->
        ${card(`
          ${cardTitle('ingreso', `Ingresos — ${etapa}`, 'bg-green-500')}
          ${row('Efectivo', f.ingresos.efectivo)}
          ${row('Depósito', f.ingresos.deposito)}
          ${row('Total', f.ingresos.total, 'font-bold border-t border-gray-200 dark:border-gray-700 mt-1 pt-1')}
          <div class="mt-3 pt-2 border-t border-dashed border-gray-300 dark:border-gray-600">
            <p class="text-xs uppercase text-gray-400 mb-1">Desglose por concepto</p>
            ${f.desglose.map((d) => row(d.label, d.monto)).join('')}
          </div>
          <div class="mt-2 flex items-center justify-between text-sm">
            <span>Conciliación (Total − desglose)</span>
            ${badge(conciliado ? 'green' : 'red', conciliado ? money(0) : money(f.conciliacion))}
          </div>
          ${f.skvo.ingreso ? `
          <div class="mt-3 pt-2 border-t border-dashed border-gray-300 dark:border-gray-600">
            <p class="text-xs uppercase text-gray-400 mb-1">SKVO (asignado a esta etapa)</p>
            ${row('Ingresos SKVO', f.skvo.ingreso)}
            ${row('Total con SKVO', f.ingresosConSkvo, 'font-semibold border-t border-gray-100 dark:border-gray-700/50 mt-1 pt-1')}
          </div>` : ''}
        `)}

        <!-- EGRESOS -->
        ${card(`
          ${cardTitle('gasto', `Egresos — ${etapa}`, 'bg-red-500')}
          <p class="text-xs uppercase text-gray-400 mb-1">Comisiones (Comisión + Base)</p>
          ${f.comisiones.length ? `
            <table class="w-full text-sm">
              <thead><tr class="text-gray-400 text-xs">
                <th class="text-left font-normal">Vendedor</th>
                <th class="text-right font-normal">Comisión</th>
                <th class="text-right font-normal">Base</th>
                <th class="text-right font-normal">Lotes</th>
              </tr></thead>
              <tbody>
                ${f.comisiones.map((c) => `<tr>
                  <td class="py-0.5">${esc(c.vendedor)}</td>
                  <td class="text-right tabular-nums">${money(c.comision)}</td>
                  <td class="text-right tabular-nums">${money(c.base)}</td>
                  <td class="text-right tabular-nums">${c.lotes}</td>
                </tr>`).join('')}
              </tbody>
            </table>` : '<p class="text-sm text-gray-400">Sin comisiones</p>'}
          ${row('Total comisiones', f.totalComisiones, 'font-semibold border-t border-gray-200 dark:border-gray-700 mt-1 pt-1')}

          <div class="mt-3 pt-2 border-t border-dashed border-gray-300 dark:border-gray-600">
            <p class="text-xs uppercase text-gray-400 mb-1">Gastos generales <span class="normal-case">(compartidos ÷${2})</span></p>
            ${f.generales.filter((g) => g.monto).map((g) => row(g.label, g.monto)).join('') || '<p class="text-sm text-gray-400">Sin gastos generales</p>'}
            ${row('Total generales', f.totalGenerales, 'font-medium border-t border-gray-100 dark:border-gray-700/50 mt-1 pt-1')}
          </div>

          <div class="mt-3 pt-2 border-t border-dashed border-gray-300 dark:border-gray-600">
            <p class="text-xs uppercase text-gray-400 mb-1">Gastos asignados a la etapa</p>
            ${f.asignados.filter((g) => g.monto).map((g) => row(g.label, g.monto)).join('') || '<p class="text-sm text-gray-400">Sin gastos asignados</p>'}
            ${row('Total asignados', f.totalAsignados, 'font-medium border-t border-gray-100 dark:border-gray-700/50 mt-1 pt-1')}
          </div>

          ${f.skvo.gasto ? `
          <div class="mt-3 pt-2 border-t border-dashed border-gray-300 dark:border-gray-600">
            <p class="text-xs uppercase text-gray-400 mb-1">Gastos SKVO (maquinaria)</p>
            ${f.skvo.gastoPorCat.map((g) => row(g.label, g.monto)).join('')}
            ${row('Total SKVO', f.skvo.gasto, 'font-medium border-t border-gray-100 dark:border-gray-700/50 mt-1 pt-1')}
          </div>` : ''}

          ${row('Total de operación', f.totalOperacion, 'font-semibold mt-2')}
          ${row('Total de egresos', f.totalEgresos, 'font-bold text-red-600 border-t-2 border-gray-300 dark:border-gray-600 mt-2 pt-2')}
        `)}
      </div>

      <!-- BALANCE -->
      <div class="mt-4">
        ${card(`
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div>
              ${cardTitle('scale', `Balance — ${etapa}`, 'bg-amber-500')}
              <p class="text-xs text-gray-500 mt-1">Ingresos ${money(f.ingresos.total)} − Egresos ${money(f.totalEgresos)}</p>
            </div>
            <span class="text-2xl font-bold ${f.utilidad >= 0 ? 'text-green-600' : 'text-red-600'} tabular-nums">${money(f.utilidad)}</span>
          </div>
        `, f.utilidad >= 0 ? 'border-l-4 border-l-green-500' : 'border-l-4 border-l-red-500')}
      </div>
    `;

    container.querySelectorAll('[data-etapa]').forEach((b) =>
      b.addEventListener('click', () => { etapa = b.dataset.etapa; draw(); }));
    container.querySelector('#f-desde').addEventListener('change', (e) => { desde = e.target.value; draw(); });
    container.querySelector('#f-hasta').addEventListener('change', (e) => { hasta = e.target.value; draw(); });
    container.querySelector('#f-clear').addEventListener('click', () => { desde = ''; hasta = ''; draw(); });
  };

  draw();
  return subscribe(draw);
}
