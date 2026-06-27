/**
 * views/ingresos.js — Registro de ingresos (replica hoja INGRESOS del Excel).
 * Campos: Folio, Fecha, Etapa, Lote, Cliente, Vendedor, Pago(categoria),
 *         Tipo(metodo), Cantidad(monto), Verificado, Saldo, Observaciones, Recibo.
 */

import { ingresos, subscribe } from '../store.js';
import { CAT_INGRESOS, METODOS_INGRESO, ETAPAS_INGRESO, VENDEDORES } from '../config.js';
import { money, prettyDate, todayISO, esc, toNum, toast, confirmAction } from '../utils.js';
import { card, btn, btnGhost, field, select, textarea, sectionHead, empty, badge, cardTitle, actionBtn } from '../ui.js';
import { can } from '../auth.js';
import { catalogoCaptura, keyOf } from '../maestra.js';
import { imprimirComprobante } from '../recibo.js';

export function render(container) {
  let editId = null;
  let query = '';
  let fEtapa = 'Todas';

  const formCard = () => {
    const cat = catalogoCaptura();
    return card(`
    ${cardTitle(editId ? 'pencil' : 'plus', editId ? 'Editar ingreso' : 'Nuevo ingreso', 'bg-green-500')}
    <form id="ing-form" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      ${field({ label: 'Fecha', name: 'fecha', type: 'date', value: todayISO(), attrs: 'required' })}
      ${select({ label: 'Etapa', name: 'etapa', options: ETAPAS_INGRESO })}
      ${field({ label: 'Lote', name: 'lote', placeholder: 'Ej. M39-L25', attrs: 'list="dl-lotes" autocomplete="off"' })}
      ${select({ label: 'Pago (categoría)', name: 'categoria', options: CAT_INGRESOS })}
      ${field({ label: 'Cliente', name: 'cliente', placeholder: 'Cliente (de la Base Maestra)', attrs: 'list="dl-clientes" autocomplete="off"' })}
      ${select({ label: 'Vendedor', name: 'vendedor', options: ['', ...VENDEDORES] })}
      ${select({ label: 'Tipo (método)', name: 'metodo', options: METODOS_INGRESO })}
      ${field({ label: 'Cantidad', name: 'monto', type: 'number', attrs: 'step="0.01" min="0" required' })}
      ${field({ label: 'Saldo', name: 'saldo', type: 'number', attrs: 'step="0.01"' })}
      <label class="flex items-center gap-2 mt-5 text-sm">
        <input type="checkbox" name="verificado" class="w-4 h-4" /> Verificado
      </label>
      <div class="sm:col-span-2 lg:col-span-4">
        ${textarea({ label: 'Observaciones', name: 'observaciones' })}
      </div>
      <div class="sm:col-span-2 lg:col-span-4 flex gap-2">
        ${btn(editId ? 'Guardar cambios' : 'Registrar ingreso', 'type="submit"')}
        ${editId ? btnGhost('Cancelar', 'type="button" id="ing-cancel"') : ''}
      </div>
      <datalist id="dl-clientes">${cat.nombres.map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>
      <datalist id="dl-lotes">${cat.lotesAll.map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>
    </form>
    <p class="text-xs text-gray-400 mt-2">💡 El campo Cliente sugiere los ${cat.nombres.length} clientes de la Base de Datos Maestra. Al elegir uno, se autocompletan su lote y vendedor.</p>
  `); };

  const tableCard = () => {
    let list = ingresos.all().sort((a, b) => (b.fecha + (b.creado || '')).localeCompare(a.fecha + (a.creado || '')));
    if (fEtapa !== 'Todas') list = list.filter((x) => x.etapa === fEtapa);
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((x) =>
        [x.cliente, x.concepto, x.categoria, x.recibo, x.lote, x.vendedor, x.observaciones]
          .some((f) => String(f || '').toLowerCase().includes(q)));
    }
    const total = list.reduce((a, x) => a + toNum(x.monto), 0);

    const etapaTabs = ['Todas', ...ETAPAS_INGRESO].map((e) =>
      `<button data-etapa="${esc(e)}" class="px-3 py-1 rounded-full text-xs border ${e === fEtapa ? 'bg-brand text-white border-brand' : 'border-gray-300 dark:border-gray-600'}">${esc(e)}</button>`).join('');

    return card(`
      ${sectionHead(`Ingresos (${list.length})`,
        `<input id="ing-search" class="field !w-56" placeholder="Buscar..." value="${esc(query)}" />`, 'trendingUp', 'bg-green-500')}
      <div class="flex gap-2 flex-wrap mb-3">${etapaTabs}</div>
      ${list.length ? `
      <div class="table-wrap">
        <table class="w-full text-sm">
          <thead class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th class="py-2">Folio</th><th>Fecha</th><th>Recibo</th><th>Etapa</th><th>Lote</th>
              <th>Pago</th><th>Cliente</th><th>Método</th><th class="text-right">Cantidad</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${list.map((x) => `
              <tr class="border-b border-gray-100 dark:border-gray-700/50">
                <td class="py-2">${x.folio ?? '—'}</td>
                <td class="whitespace-nowrap">${prettyDate(x.fecha)}</td>
                <td class="whitespace-nowrap">${esc(x.recibo || '—')}</td>
                <td class="whitespace-nowrap">${esc(x.etapa || '—')}</td>
                <td class="whitespace-nowrap">${esc(x.lote || '—')}</td>
                <td>${esc(x.categoria)}</td>
                <td>${esc(x.cliente || '—')}</td>
                <td class="whitespace-nowrap">${esc(x.metodo)}</td>
                <td class="text-right font-medium text-green-600">${money(x.monto)}</td>
                <td class="text-right whitespace-nowrap">
                  ${actionBtn('printer', `data-print="${x.id}"`, 'hover:text-brand', 'Imprimir recibo')}
                  ${actionBtn('pencil', `data-edit="${x.id}"`, 'hover:text-brand', 'Editar')}
                  ${can('eliminar') ? actionBtn('trash', `data-del="${x.id}"`, 'hover:text-red-600', 'Eliminar') : ''}
                </td>
              </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr class="font-semibold border-t-2 border-gray-200 dark:border-gray-700">
              <td class="py-2" colspan="8">Total filtrado</td>
              <td class="text-right text-green-600">${money(total)}</td><td></td>
            </tr>
          </tfoot>
        </table>
      </div>` : empty('No hay ingresos que coincidan')}
    `);
  };

  const draw = () => {
    container.innerHTML = `<div class="space-y-4">${formCard()}${tableCard()}</div>`;
    wire();
  };

  function wire() {
    const form = container.querySelector('#ing-form');

    if (editId) {
      const item = ingresos.all().find((x) => x.id === editId);
      if (item) {
        form.fecha.value = item.fecha;
        form.etapa.value = item.etapa || ETAPAS_INGRESO[0];
        form.lote.value = item.lote || '';
        form.categoria.value = item.categoria;
        form.cliente.value = item.cliente || '';
        form.vendedor.value = item.vendedor || '';
        form.metodo.value = item.metodo;
        form.monto.value = item.monto;
        form.saldo.value = item.saldo ?? '';
        form.verificado.checked = !!item.verificado;
        form.observaciones.value = item.observaciones || '';
      }
    }

    // Al elegir un cliente de la Maestra, autocompleta su lote (si es único) y vendedor.
    form.cliente.addEventListener('change', () => {
      const r = catalogoCaptura().porCliente.get(keyOf(form.cliente.value));
      if (!r) return;
      if (r.vendedor && !form.vendedor.value) form.vendedor.value = r.vendedor;
      const ls = [...r.lotes];
      if (ls.length === 1 && !form.lote.value.trim()) form.lote.value = ls[0];
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = {
        fecha: form.fecha.value,
        etapa: form.etapa.value,
        lote: form.lote.value.trim(),
        categoria: form.categoria.value,
        cliente: form.cliente.value.trim(),
        vendedor: form.vendedor.value,
        metodo: form.metodo.value,
        monto: toNum(form.monto.value),
        saldo: form.saldo.value === '' ? null : toNum(form.saldo.value),
        verificado: form.verificado.checked,
        observaciones: form.observaciones.value.trim(),
        // "concepto" se mantiene para compatibilidad con dashboard/movimientos.
        concepto: `${form.categoria.value}${form.lote.value ? ' · ' + form.lote.value.trim() : ''}`,
      };
      if (data.monto <= 0) { toast('La cantidad debe ser mayor a 0', 'error'); return; }

      try {
        if (editId) {
          await ingresos.update(editId, data);
          toast('Ingreso actualizado', 'success');
          editId = null;
        } else {
          // El servidor asigna folio y recibo consecutivos.
          const item = await ingresos.create(data);
          toast(`Ingreso registrado · Folio ${item?.folio ?? '—'} · ${item?.recibo ?? ''}`, 'success');
          if (item) imprimirComprobante('ingreso', item); // abre el recibo para imprimir
        }
      } catch (err) { toast('Error: ' + err.message, 'error'); }
    });

    container.querySelector('#ing-cancel')?.addEventListener('click', () => { editId = null; draw(); });

    container.querySelectorAll('[data-print]').forEach((b) =>
      b.addEventListener('click', () => {
        const item = ingresos.all().find((x) => x.id === b.dataset.print);
        if (item) imprimirComprobante('ingreso', item);
      }));

    container.querySelectorAll('[data-edit]').forEach((b) =>
      b.addEventListener('click', () => { editId = b.dataset.edit; draw(); window.scrollTo({ top: 0, behavior: 'smooth' }); }));

    container.querySelectorAll('[data-del]').forEach((b) =>
      b.addEventListener('click', () => {
        if (confirmAction('¿Eliminar este ingreso? Esta acción no se puede deshacer.')) {
          ingresos.remove(b.dataset.del);
          toast('Ingreso eliminado', 'warn');
        }
      }));

    container.querySelectorAll('[data-etapa]').forEach((b) =>
      b.addEventListener('click', () => { fEtapa = b.dataset.etapa; draw(); }));

    const search = container.querySelector('#ing-search');
    if (search) {
      search.addEventListener('input', () => {
        query = search.value;
        draw();
        const s = container.querySelector('#ing-search');
        s.focus(); s.setSelectionRange(s.value.length, s.value.length);
      });
    }
  }

  draw();
  return subscribe(draw);
}
