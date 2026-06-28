/**
 * views/skvo.js — Registros SKVO (operación de maquinaria: retro, bulldozer, Tacoma).
 *
 * SKVO maneja su propia caja en efectivo: diésel, gasolina, refacciones y pagos
 * semanales (gastos) + servicios externos como limpieza (ingresos). Su EFECTIVO
 * forma parte del Corte del Flujo del día (ver calc.js → resumenDia).
 *
 * Dos secciones en una vista: Gastos SKVO e Ingresos SKVO, cada una con su
 * captura y su lista. Guardan en las colecciones `skvoGastos` / `skvoIngresos`.
 */

import { skvoGastos, skvoIngresos, subscribe } from '../store.js';
import {
  SKVO_CAT_GASTO, SKVO_CAT_INGRESO, SKVO_ENTREGO, SKVO_ETAPAS,
  METODOS_GASTO, METODOS_INGRESO, SKVO_ETAPA_DEFAULT,
} from '../config.js';
import { money, prettyDate, todayISO, esc, toNum, toast, confirmAction } from '../utils.js';
import { card, btn, btnGhost, field, select, sectionHead, empty, cardTitle, actionBtn } from '../ui.js';
import { svgIcon } from '../icons.js';
import { can } from '../auth.js';
import { imprimirComprobante } from '../recibo.js';

export function render(container) {
  let sub = 'gastos';   // 'gastos' | 'ingresos'
  let editId = null;
  let mes = todayISO().slice(0, 7);

  const col = () => (sub === 'gastos' ? skvoGastos : skvoIngresos);
  const enMes = (x) => (x.fecha || '').slice(0, 7) === mes;

  // ---------- Resumen del mes (efectivo SKVO que entra al Corte del Flujo) ----------
  const resumenCard = () => {
    const ing = skvoIngresos.all().filter(enMes);
    const gas = skvoGastos.all().filter(enMes);
    const inEf = ing.filter((x) => x.metodo === 'Efectivo').reduce((a, x) => a + toNum(x.monto), 0);
    const gaEf = gas.filter((x) => x.metodo === 'Efectivo').reduce((a, x) => a + toNum(x.monto), 0);
    const fila = (l, v, cls = '') => `<div class="flex justify-between py-0.5 ${cls}"><span>${esc(l)}</span><span class="tabular-nums">${money(v)}</span></div>`;
    return card(`
      <div class="flex items-center justify-between flex-wrap gap-3 mb-2">
        ${cardTitle('skvoLogo', `SKVO — resumen de ${mes}`, 'bg-amber-500')}
        <input id="skvo-mes" type="month" class="field !w-44" value="${mes}" />
      </div>
      <div class="grid sm:grid-cols-3 gap-3 text-sm">
        <div>${fila('Ingresos efectivo', inEf)}${fila('Gastos efectivo', gaEf, 'text-red-600')}</div>
        <div class="sm:col-span-2 flex items-center justify-end">
          <span class="text-xs text-gray-500 mr-2">Efectivo SKVO al Corte del Flujo</span>
          <span class="text-xl font-bold tabular-nums ${inEf - gaEf >= 0 ? 'text-green-600' : 'text-red-600'}">${money(inEf - gaEf)}</span>
        </div>
      </div>
      <p class="text-xs text-gray-400 mt-2">El efectivo SKVO entra al Corte del Flujo de cada día. En el <strong>Flujo de efectivo</strong>, cada registro suma en la <strong>etapa</strong> que tenga asignada.</p>
    `);
  };

  // ---------- Formularios ----------
  const formGasto = () => card(`
    ${cardTitle(editId ? 'pencil' : 'plus', editId ? 'Editar gasto SKVO' : 'Nuevo gasto SKVO', 'bg-red-500')}
    <form id="skvo-form" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      ${field({ label: 'Fecha', name: 'fecha', type: 'date', value: todayISO(), attrs: 'required' })}
      ${select({ label: 'Categoría', name: 'categoria', options: SKVO_CAT_GASTO })}
      ${field({ label: 'Cantidad', name: 'monto', type: 'number', attrs: 'step="0.01" min="0" required' })}
      ${select({ label: 'Método', name: 'metodo', options: METODOS_GASTO })}
      ${select({ label: 'Etapa', name: 'etapa', options: SKVO_ETAPAS, value: SKVO_ETAPA_DEFAULT })}
      ${select({ label: 'Entregó', name: 'entrego', options: ['', ...SKVO_ENTREGO] })}
      <div class="sm:col-span-2 lg:col-span-4">
        ${field({ label: 'Concepto', name: 'concepto', placeholder: 'Ej. Diésel retro / Pago semanal Juan', attrs: 'required' })}
      </div>
      <div class="sm:col-span-2 lg:col-span-4 flex gap-2">
        ${btn(editId ? 'Guardar cambios' : 'Registrar gasto SKVO', 'type="submit"')}
        ${editId ? btnGhost('Cancelar', 'type="button" id="skvo-cancel"') : ''}
      </div>
    </form>
  `);

  const formIngreso = () => card(`
    ${cardTitle(editId ? 'pencil' : 'plus', editId ? 'Editar ingreso SKVO' : 'Nuevo ingreso SKVO', 'bg-green-500')}
    <form id="skvo-form" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      ${field({ label: 'Fecha', name: 'fecha', type: 'date', value: todayISO(), attrs: 'required' })}
      ${select({ label: 'Categoría', name: 'categoria', options: SKVO_CAT_INGRESO })}
      ${field({ label: 'Cantidad', name: 'monto', type: 'number', attrs: 'step="0.01" min="0" required' })}
      ${select({ label: 'Método', name: 'metodo', options: METODOS_INGRESO })}
      ${select({ label: 'Etapa / destino', name: 'etapa', options: SKVO_ETAPAS, value: SKVO_ETAPA_DEFAULT })}
      ${field({ label: 'Lote', name: 'lote', placeholder: 'Opcional' })}
      ${field({ label: 'Cliente', name: 'cliente', placeholder: 'Nombre' })}
      ${select({ label: 'Capturó', name: 'captura', options: ['', ...SKVO_ENTREGO] })}
      <div class="sm:col-span-2 lg:col-span-4 flex gap-2">
        ${btn(editId ? 'Guardar cambios' : 'Registrar ingreso SKVO', 'type="submit"')}
        ${editId ? btnGhost('Cancelar', 'type="button" id="skvo-cancel"') : ''}
      </div>
    </form>
  `);

  // ---------- Tablas ----------
  const tablaGastos = () => {
    const list = skvoGastos.all().filter(enMes)
      .sort((a, b) => (b.fecha + (b.creado || '')).localeCompare(a.fecha + (a.creado || '')));
    const total = list.reduce((a, x) => a + toNum(x.monto), 0);
    return card(`
      ${sectionHead(`Gastos SKVO de ${esc(mes)} (${list.length})`)}
      ${list.length ? `
      <div class="table-wrap"><table class="w-full text-sm">
        <thead class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
          <tr><th class="py-2">Folio</th><th>Fecha</th><th>Categoría</th><th>Concepto</th><th>Etapa</th><th>Entregó</th><th>Método</th><th class="text-right">Cantidad</th><th></th></tr>
        </thead>
        <tbody>
          ${list.map((x) => `<tr class="border-b border-gray-100 dark:border-gray-700/50">
            <td class="py-2">${x.folio ?? '—'}</td>
            <td class="whitespace-nowrap">${prettyDate(x.fecha)}</td>
            <td>${esc(x.categoria)}</td>
            <td>${esc(x.concepto || '—')}</td>
            <td class="whitespace-nowrap">${esc(x.etapa || 'Etapa 3')}</td>
            <td>${esc(x.entrego || '—')}</td>
            <td>${esc(x.metodo)}</td>
            <td class="text-right font-medium text-red-600">${money(x.monto)}</td>
            <td class="text-right whitespace-nowrap">
              ${actionBtn('printer', `data-print="${x.id}"`, 'hover:text-brand', 'Imprimir comprobante')}
              ${actionBtn('pencil', `data-edit="${x.id}"`, 'hover:text-brand', 'Editar')}
              ${can('eliminar') ? actionBtn('trash', `data-del="${x.id}"`, 'hover:text-red-600', 'Eliminar') : ''}
            </td></tr>`).join('')}
        </tbody>
        <tfoot><tr class="font-semibold border-t-2 border-gray-200 dark:border-gray-700">
          <td class="py-2" colspan="7">Total del mes</td>
          <td class="text-right text-red-600">${money(total)}</td><td></td>
        </tr></tfoot>
      </table></div>` : empty('Sin gastos SKVO este mes')}
    `);
  };

  const tablaIngresos = () => {
    const list = skvoIngresos.all().filter(enMes)
      .sort((a, b) => (b.fecha + (b.creado || '')).localeCompare(a.fecha + (a.creado || '')));
    const total = list.reduce((a, x) => a + toNum(x.monto), 0);
    return card(`
      ${sectionHead(`Ingresos SKVO de ${esc(mes)} (${list.length})`)}
      ${list.length ? `
      <div class="table-wrap"><table class="w-full text-sm">
        <thead class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
          <tr><th class="py-2">Folio</th><th>Fecha</th><th>Categoría</th><th>Cliente</th><th>Etapa</th><th>Lote</th><th>Método</th><th class="text-right">Cantidad</th><th></th></tr>
        </thead>
        <tbody>
          ${list.map((x) => `<tr class="border-b border-gray-100 dark:border-gray-700/50">
            <td class="py-2">${x.folio ?? '—'}</td>
            <td class="whitespace-nowrap">${prettyDate(x.fecha)}</td>
            <td>${esc(x.categoria)}</td>
            <td>${esc(x.cliente || '—')}</td>
            <td class="whitespace-nowrap">${esc(x.etapa || '—')}</td>
            <td class="whitespace-nowrap">${esc(x.lote || '—')}</td>
            <td>${esc(x.metodo)}</td>
            <td class="text-right font-medium text-green-600">${money(x.monto)}</td>
            <td class="text-right whitespace-nowrap">
              ${actionBtn('printer', `data-print="${x.id}"`, 'hover:text-brand', 'Imprimir recibo')}
              ${actionBtn('pencil', `data-edit="${x.id}"`, 'hover:text-brand', 'Editar')}
              ${can('eliminar') ? actionBtn('trash', `data-del="${x.id}"`, 'hover:text-red-600', 'Eliminar') : ''}
            </td></tr>`).join('')}
        </tbody>
        <tfoot><tr class="font-semibold border-t-2 border-gray-200 dark:border-gray-700">
          <td class="py-2" colspan="7">Total del mes</td>
          <td class="text-right text-green-600">${money(total)}</td><td></td>
        </tr></tfoot>
      </table></div>` : empty('Sin ingresos SKVO este mes')}
    `);
  };

  const subTabs = () => ['gastos', 'ingresos'].map((s) =>
    `<button data-sub="${s}" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border ${s === sub ? 'bg-brand text-white border-brand' : 'border-gray-300 dark:border-gray-600'}">${svgIcon(s === 'gastos' ? 'trendingDown' : 'trendingUp', 'w-4 h-4')} ${s === 'gastos' ? 'Gastos SKVO' : 'Ingresos SKVO'}</button>`).join('');

  const draw = () => {
    const form = sub === 'gastos' ? formGasto() : formIngreso();
    const tabla = sub === 'gastos' ? tablaGastos() : tablaIngresos();
    container.innerHTML = `
      <div class="flex items-center gap-2 mb-4 flex-wrap">${subTabs()}</div>
      <div class="space-y-4">${resumenCard()}${form}${tabla}</div>`;
    wire();
  };

  function wire() {
    container.querySelectorAll('[data-sub]').forEach((b) =>
      b.addEventListener('click', () => { sub = b.dataset.sub; editId = null; draw(); }));
    container.querySelector('#skvo-mes')?.addEventListener('change', (e) => {
      mes = e.target.value || todayISO().slice(0, 7); draw();
    });

    const form = container.querySelector('#skvo-form');
    if (editId) {
      const item = col().all().find((x) => x.id === editId);
      if (item) [...form.elements].forEach((el) => { if (el.name && item[el.name] != null) el.value = item[el.name]; });
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = form;
      const data = sub === 'gastos'
        ? {
            fecha: f.fecha.value, categoria: f.categoria.value, monto: toNum(f.monto.value),
            metodo: f.metodo.value, etapa: f.etapa.value, entrego: f.entrego.value,
            concepto: f.concepto.value.trim(),
          }
        : {
            fecha: f.fecha.value, categoria: f.categoria.value, monto: toNum(f.monto.value),
            metodo: f.metodo.value, etapa: f.etapa.value, lote: f.lote.value.trim(),
            cliente: f.cliente.value.trim(), captura: f.captura.value,
            concepto: f.categoria.value,
          };
      if (data.monto <= 0) { toast('Captura una cantidad válida', 'error'); return; }
      try {
        if (editId) {
          await col().update(editId, data); toast('Registro SKVO actualizado', 'success'); editId = null;
        } else {
          const item = await col().create(data);
          toast(`Registro SKVO guardado · Folio ${item?.folio ?? '—'}`, 'success');
          // Abre el recibo/comprobante para imprimir (mismo formato que Ingresos/Gastos).
          if (item) imprimirComprobante(sub === 'gastos' ? 'skvo-gasto' : 'skvo-ingreso', item);
        }
      } catch (err) { toast('Error: ' + err.message, 'error'); }
    });

    container.querySelector('#skvo-cancel')?.addEventListener('click', () => { editId = null; draw(); });
    container.querySelectorAll('[data-print]').forEach((b) =>
      b.addEventListener('click', () => {
        const item = col().all().find((x) => x.id === b.dataset.print);
        if (item) imprimirComprobante(sub === 'gastos' ? 'skvo-gasto' : 'skvo-ingreso', item);
      }));
    container.querySelectorAll('[data-edit]').forEach((b) =>
      b.addEventListener('click', () => { editId = b.dataset.edit; draw(); window.scrollTo({ top: 0, behavior: 'smooth' }); }));
    container.querySelectorAll('[data-del]').forEach((b) =>
      b.addEventListener('click', () => {
        if (confirmAction('¿Eliminar este registro SKVO?')) {
          col().remove(b.dataset.del); toast('Registro SKVO eliminado', 'warn');
        }
      }));
  }

  draw();
  return subscribe(draw);
}
