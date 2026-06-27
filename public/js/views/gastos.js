/**
 * views/gastos.js — Registro de gastos (replica hoja EGRESOS del Excel).
 * Campos: Folio, Fecha, Cantidad, Etapa, Lote, Categoría, Recibe(persona),
 *         Tipo(metodo), Concepto, Beneficiario.
 */

import { gastos, subscribe } from '../store.js';
import { CAT_GASTOS, METODOS_GASTO, ETAPAS_GASTO, VENDEDORES } from '../config.js';
import { money, prettyDate, todayISO, esc, toNum, toast, confirmAction } from '../utils.js';
import { card, btn, btnGhost, field, select, sectionHead, empty, cardTitle, actionBtn } from '../ui.js';
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
    ${cardTitle(editId ? 'pencil' : 'plus', editId ? 'Editar gasto' : 'Nuevo gasto', 'bg-red-500')}
    <form id="gas-form" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      ${field({ label: 'Fecha', name: 'fecha', type: 'date', value: todayISO(), attrs: 'required' })}
      ${select({ label: 'Etapa', name: 'etapa', options: ETAPAS_GASTO })}
      ${select({ label: 'Categoría', name: 'categoria', options: CAT_GASTOS })}
      ${field({ label: 'Cantidad', name: 'monto', type: 'number', attrs: 'step="0.01" min="0" required' })}
      ${field({ label: 'Lote', name: 'lote', placeholder: 'Ej. M41-L26 (opcional)', attrs: 'list="dl-lotes" autocomplete="off"' })}
      ${select({ label: 'Recibe (persona)', name: 'recibe', options: ['', ...VENDEDORES] })}
      ${select({ label: 'Tipo (método)', name: 'metodo', options: METODOS_GASTO })}
      ${field({ label: 'Concepto', name: 'concepto', placeholder: 'Ej. Comisión M41-L26', attrs: 'required' })}
      <div class="sm:col-span-2 lg:col-span-4">
        ${field({ label: 'Beneficiario (cliente / nombre completo)', name: 'beneficiario', attrs: 'list="dl-clientes" autocomplete="off"' })}
      </div>
      <div class="sm:col-span-2 lg:col-span-4 flex gap-2">
        ${btn(editId ? 'Guardar cambios' : 'Registrar gasto', 'type="submit"')}
        ${editId ? btnGhost('Cancelar', 'type="button" id="gas-cancel"') : ''}
      </div>
      <datalist id="dl-clientes">${cat.nombres.map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>
      <datalist id="dl-lotes">${cat.lotesAll.map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>
    </form>
    <p class="text-xs text-gray-400 mt-2">💡 Al elegir un Lote de la Base Maestra se autocompletan su vendedor (Recibe) y el cliente (Beneficiario).</p>
  `); };

  const tableCard = () => {
    let list = gastos.all().sort((a, b) => (b.fecha + (b.creado || '')).localeCompare(a.fecha + (a.creado || '')));
    if (fEtapa !== 'Todas') list = list.filter((x) => x.etapa === fEtapa);
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((x) =>
        [x.concepto, x.categoria, x.recibe, x.beneficiario, x.lote]
          .some((f) => String(f || '').toLowerCase().includes(q)));
    }
    const total = list.reduce((a, x) => a + toNum(x.monto), 0);

    const etapaTabs = ['Todas', ...ETAPAS_GASTO].map((e) =>
      `<button data-etapa="${esc(e)}" class="px-3 py-1 rounded-full text-xs border ${e === fEtapa ? 'bg-brand text-white border-brand' : 'border-gray-300 dark:border-gray-600'}">${esc(e)}</button>`).join('');

    return card(`
      ${sectionHead(`Gastos (${list.length})`,
        `<input id="gas-search" class="field !w-56" placeholder="Buscar..." value="${esc(query)}" />`, 'trendingDown', 'bg-red-500')}
      <div class="flex gap-2 flex-wrap mb-3">${etapaTabs}</div>
      ${list.length ? `
      <div class="table-wrap">
        <table class="w-full text-sm">
          <thead class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th class="py-2">Folio</th><th>Fecha</th><th>Etapa</th><th>Categoría</th>
              <th>Concepto</th><th>Lote</th><th>Recibe</th><th>Método</th><th class="text-right">Cantidad</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${list.map((x) => `
              <tr class="border-b border-gray-100 dark:border-gray-700/50">
                <td class="py-2">${x.folio ?? '—'}</td>
                <td class="whitespace-nowrap">${prettyDate(x.fecha)}</td>
                <td class="whitespace-nowrap">${esc(x.etapa || '—')}</td>
                <td>${esc(x.categoria)}</td>
                <td>${esc(x.concepto)}</td>
                <td class="whitespace-nowrap">${esc(x.lote || '—')}</td>
                <td>${esc(x.recibe || '—')}</td>
                <td class="whitespace-nowrap">${esc(x.metodo)}</td>
                <td class="text-right font-medium text-red-600">${money(x.monto)}</td>
                <td class="text-right whitespace-nowrap">
                  ${actionBtn('printer', `data-print="${x.id}"`, 'hover:text-brand', 'Imprimir comprobante')}
                  ${actionBtn('pencil', `data-edit="${x.id}"`, 'hover:text-brand', 'Editar')}
                  ${can('eliminar') ? actionBtn('trash', `data-del="${x.id}"`, 'hover:text-red-600', 'Eliminar') : ''}
                </td>
              </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr class="font-semibold border-t-2 border-gray-200 dark:border-gray-700">
              <td class="py-2" colspan="8">Total filtrado</td>
              <td class="text-right text-red-600">${money(total)}</td><td></td>
            </tr>
          </tfoot>
        </table>
      </div>` : empty('No hay gastos que coincidan')}
    `);
  };

  const draw = () => {
    container.innerHTML = `<div class="space-y-4">${formCard()}${tableCard()}</div>`;
    wire();
  };

  function wire() {
    const form = container.querySelector('#gas-form');

    if (editId) {
      const item = gastos.all().find((x) => x.id === editId);
      if (item) {
        form.fecha.value = item.fecha;
        form.etapa.value = item.etapa || ETAPAS_GASTO[0];
        form.categoria.value = item.categoria;
        form.monto.value = item.monto;
        form.lote.value = item.lote || '';
        form.recibe.value = item.recibe || '';
        form.metodo.value = item.metodo;
        form.concepto.value = item.concepto;
        form.beneficiario.value = item.beneficiario || '';
      }
    }

    // Autocompletado desde la Base Maestra:
    //  • al elegir un LOTE → rellena vendedor (Recibe) y cliente (Beneficiario);
    //  • al elegir un CLIENTE (Beneficiario) → rellena vendedor y lote (si es único).
    form.lote.addEventListener('change', () => {
      const r = catalogoCaptura().porLote.get(keyOf(form.lote.value));
      if (!r) return;
      if (r.vendedor && !form.recibe.value) form.recibe.value = r.vendedor;
      if (r.cliente && !form.beneficiario.value.trim()) form.beneficiario.value = r.cliente;
    });
    form.beneficiario.addEventListener('change', () => {
      const r = catalogoCaptura().porCliente.get(keyOf(form.beneficiario.value));
      if (!r) return;
      if (r.vendedor && !form.recibe.value) form.recibe.value = r.vendedor;
      const ls = [...r.lotes];
      if (ls.length === 1 && !form.lote.value.trim()) form.lote.value = ls[0];
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = {
        fecha: form.fecha.value,
        etapa: form.etapa.value,
        categoria: form.categoria.value,
        monto: toNum(form.monto.value),
        lote: form.lote.value.trim(),
        recibe: form.recibe.value,
        metodo: form.metodo.value,
        concepto: form.concepto.value.trim(),
        beneficiario: form.beneficiario.value.trim(),
        // alias para vistas que usan "descripcion"
        descripcion: form.concepto.value.trim(),
      };
      if (!data.concepto || data.monto <= 0) {
        toast('Concepto y cantidad válida son obligatorios', 'error');
        return;
      }
      try {
        if (editId) {
          await gastos.update(editId, data);
          toast('Gasto actualizado', 'success');
          editId = null;
        } else {
          const item = await gastos.create(data); // folio asignado por el servidor
          toast(`Gasto registrado · Folio ${item?.folio ?? '—'}`, 'success');
          if (item) imprimirComprobante('gasto', item); // abre el comprobante para imprimir
        }
      } catch (err) { toast('Error: ' + err.message, 'error'); }
    });

    container.querySelector('#gas-cancel')?.addEventListener('click', () => { editId = null; draw(); });

    container.querySelectorAll('[data-print]').forEach((b) =>
      b.addEventListener('click', () => {
        const item = gastos.all().find((x) => x.id === b.dataset.print);
        if (item) imprimirComprobante('gasto', item);
      }));

    container.querySelectorAll('[data-edit]').forEach((b) =>
      b.addEventListener('click', () => { editId = b.dataset.edit; draw(); window.scrollTo({ top: 0, behavior: 'smooth' }); }));

    container.querySelectorAll('[data-del]').forEach((b) =>
      b.addEventListener('click', () => {
        if (confirmAction('¿Eliminar este gasto?')) {
          gastos.remove(b.dataset.del);
          toast('Gasto eliminado', 'warn');
        }
      }));

    container.querySelectorAll('[data-etapa]').forEach((b) =>
      b.addEventListener('click', () => { fEtapa = b.dataset.etapa; draw(); }));

    const search = container.querySelector('#gas-search');
    if (search) {
      search.addEventListener('input', () => {
        query = search.value;
        draw();
        const s = container.querySelector('#gas-search');
        s.focus(); s.setSelectionRange(s.value.length, s.value.length);
      });
    }
  }

  draw();
  return subscribe(draw);
}
