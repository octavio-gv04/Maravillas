/**
 * views/gastos.js — Registro de gastos (replica hoja EGRESOS del Excel).
 * Dos modos: «Gasto» (egreso normal) y «Devolución» (cancela la venta de un
 * lote y lo regresa a Disponible, devolviendo una cantidad al cliente).
 * Campos: Folio, Fecha, Cantidad, Etapa, Lote, Categoría, Recibe(persona),
 *         Tipo(metodo), Concepto, Beneficiario.
 */

import { gastos, subscribe } from '../store.js';
import { CAT_GASTOS, METODOS_GASTO, ETAPAS_GASTO, VENDEDORES, ZONAS } from '../config.js';
import { money, prettyDate, todayISO, esc, toNum, toast, confirmAction } from '../utils.js';
import { card, btn, btnGhost, field, select, sectionHead, empty, cardTitle, actionBtn } from '../ui.js';
import { svgIcon } from '../icons.js';
import { can } from '../auth.js';
import { catalogoCaptura, keyOf, infoLoteVenta, cancelarVentaLote } from '../maestra.js';
import { imprimirComprobante } from '../recibo.js';

export function render(container) {
  let editId = null;
  let modo = 'gasto';   // 'gasto' | 'devolucion'
  let query = '';
  let fEtapa = 'Todas';

  const modoTabs = () => `
    <div class="flex gap-2 mb-4">
      ${[['gasto', 'trendingDown', 'Gasto'], ['devolucion', 'refresh', 'Devolución']].map(([m, ic, label]) =>
        `<button data-modo="${m}" class="inline-flex items-center gap-1.5 px-4 min-h-[2.5rem] rounded-lg text-sm border ${m === modo ? 'bg-brand text-white border-brand' : 'border-gray-300 dark:border-gray-600'}">${svgIcon(ic, 'w-4 h-4')} ${label}</button>`).join('')}
    </div>`;

  const formCard = () => {
    const cat = catalogoCaptura();
    const esDev = modo === 'devolucion';
    const titulo = editId ? (esDev ? 'Editar devolución' : 'Editar gasto') : (esDev ? 'Nueva devolución' : 'Nuevo gasto');
    const catGasto = CAT_GASTOS.filter((c) => c !== 'Devolución');

    const camposGasto = `
      ${field({ label: 'Fecha', name: 'fecha', type: 'date', value: todayISO(), attrs: 'required' })}
      ${select({ label: 'Etapa', name: 'etapa', options: ETAPAS_GASTO })}
      ${select({ label: 'Categoría', name: 'categoria', options: catGasto })}
      ${field({ label: 'Cantidad', name: 'monto', type: 'number', attrs: 'step="0.01" min="0" required' })}
      ${field({ label: 'Lote', name: 'lote', placeholder: 'Ej. M41-L26 (opcional)', attrs: 'list="dl-lotes" autocomplete="off"' })}
      ${select({ label: 'Recibe (persona)', name: 'recibe', options: ['', ...VENDEDORES] })}
      ${select({ label: 'Tipo (método)', name: 'metodo', options: METODOS_GASTO })}
      ${field({ label: 'Concepto', name: 'concepto', placeholder: 'Ej. Comisión M41-L26', attrs: 'required' })}
      <div class="sm:col-span-2 lg:col-span-4">
        ${field({ label: 'Beneficiario (cliente / nombre completo)', name: 'beneficiario', attrs: 'list="dl-clientes" autocomplete="off"' })}
      </div>`;

    const camposDev = `
      <div id="lote-estado" class="hidden sm:col-span-2 lg:col-span-4 text-sm rounded-lg px-3 py-2"></div>
      ${field({ label: 'Fecha', name: 'fecha', type: 'date', value: todayISO(), attrs: 'required' })}
      ${select({ label: 'Etapa', name: 'etapa', options: ZONAS })}
      ${field({ label: 'Lote a cancelar', name: 'lote', placeholder: 'Ej. M39-L25', attrs: 'list="dl-lotes" autocomplete="off" required' })}
      ${field({ label: 'Cliente (a quien se devuelve)', name: 'beneficiario', placeholder: 'Nombre completo', attrs: 'list="dl-clientes" autocomplete="off" required' })}
      ${field({ label: 'Monto a devolver', name: 'monto', type: 'number', attrs: 'step="0.01" min="0" required' })}
      ${select({ label: 'Tipo (método)', name: 'metodo', options: METODOS_GASTO })}
      <div class="sm:col-span-2 lg:col-span-4">
        ${field({ label: 'Motivo / concepto', name: 'concepto', placeholder: 'Ej. Cancelación por desistimiento del cliente' })}
      </div>`;

    const tip = esDev
      ? 'La Devolución CANCELA la venta del lote: lo regresa a Disponible en la Base Maestra y registra el reembolso como gasto. Los pagos previos del cliente se conservan en el flujo (el dinero sí entró).'
      : 'Al elegir un Lote de la Base Maestra se autocompletan su vendedor (Recibe) y el cliente (Beneficiario).';

    return card(`
    ${cardTitle(editId ? 'pencil' : (esDev ? 'refresh' : 'plus'), titulo, esDev ? 'bg-amber-500' : 'bg-red-500')}
    ${modoTabs()}
    <form id="gas-form" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      ${esDev ? camposDev : camposGasto}
      <div class="sm:col-span-2 lg:col-span-4 flex gap-2">
        ${btn(editId ? 'Guardar cambios' : (esDev ? 'Registrar devolución' : 'Registrar gasto'), 'type="submit"')}
        ${editId ? btnGhost('Cancelar', 'type="button" id="gas-cancel"') : ''}
      </div>
      <datalist id="dl-clientes">${cat.nombres.map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>
      <datalist id="dl-lotes">${cat.lotesAll.map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>
    </form>
    <p class="flex items-start gap-1.5 text-xs text-gray-400 mt-2">${svgIcon('bulb', 'w-4 h-4 shrink-0 text-amber-400')}<span>${tip}</span></p>
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
    const LIMIT = 150;
    const shown = list.slice(0, LIMIT);
    const hayMas = list.length > LIMIT;

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
            ${shown.map((x) => `
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
      </div>
      ${hayMas ? `<p class="text-xs text-gray-400 mt-2">Mostrando ${LIMIT} de ${list.length}. Usa el buscador para encontrar registros específicos.</p>` : ''}` : empty('No hay gastos que coincidan')}
    `);
  };

  const draw = () => {
    container.innerHTML = `<div class="space-y-4"><div id="gas-form-host">${formCard()}</div><div id="gas-table-host">${tableCard()}</div></div>`;
    wireForm(); wireTable();
  };
  const redrawForm = () => { const h = container.querySelector('#gas-form-host'); if (h) { h.innerHTML = formCard(); wireForm(); } };
  const redrawTable = () => { const h = container.querySelector('#gas-table-host'); if (h) { h.innerHTML = tableCard(); wireTable(); } };

  function wireForm() {
    const form = container.querySelector('#gas-form');
    if (!form) return;
    const els = form.elements;
    const setVal = (name, val) => { if (els[name]) els[name].value = val; };

    if (editId) {
      const item = gastos.all().find((x) => x.id === editId);
      if (item) {
        setVal('fecha', item.fecha);
        setVal('etapa', item.etapa || ETAPAS_GASTO[0]);
        setVal('categoria', item.categoria);
        setVal('monto', item.monto);
        setVal('lote', item.lote || '');
        setVal('recibe', item.recibe || '');
        setVal('metodo', item.metodo);
        setVal('concepto', item.concepto);
        setVal('beneficiario', item.beneficiario || '');
      }
    }

    // Banner de estado del lote (solo modo Devolución).
    const estadoEl = container.querySelector('#lote-estado');
    const setEstado = (tipo, icon, html) => {
      if (!estadoEl) return;
      const styles = {
        ok:   'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
        warn: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
        info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
      };
      estadoEl.className = `sm:col-span-2 lg:col-span-4 text-sm rounded-lg px-3 py-2 flex items-center gap-2 ${styles[tipo]}`;
      estadoEl.innerHTML = `${svgIcon(icon, 'w-4 h-4 shrink-0')}<span>${html}</span>`;
    };

    // Cambio de Lote:
    //  • Gasto      → autocompleta Recibe (vendedor) y Beneficiario (cliente).
    //  • Devolución → muestra cuánto ha pagado el cliente, saldo y comisión, e
    //    indica si el lote realmente está vendido (solo así se puede cancelar).
    els.lote?.addEventListener('change', () => {
      if (modo === 'devolucion') {
        const clave = els.lote.value.trim();
        if (!clave) { estadoEl?.classList.add('hidden'); return; }
        const info = infoLoteVenta(clave);
        if (!info.vendido) {
          setEstado('warn', 'alertTriangle', `El lote <strong>${esc(clave)}</strong> no está vendido; no hay operación que cancelar.`);
          return;
        }
        if (els.beneficiario && !els.beneficiario.value.trim()) els.beneficiario.value = info.cliente;
        // La devolución se contabiliza en la etapa (zona) del lote, para que sí
        // aparezca en el recuadro DEVOLUCIONES del dashboard (no en "General").
        if (info.etapa && els.etapa && ZONAS.includes(info.etapa)) els.etapa.value = info.etapa;
        let html = `Cliente <strong>${esc(info.cliente || '—')}</strong> · pagado <strong>${money(info.pagado)}</strong>`;
        if (info.saldo) html += ` · saldo ${money(info.saldo)}`;
        if (info.comision) html += ` · ⚠ comisión pagada <strong>${money(info.comision)}</strong>`;
        setEstado('info', 'cash', html);
        return;
      }
      const r = catalogoCaptura().porLote.get(keyOf(els.lote.value));
      if (!r) return;
      if (r.vendedor && els.recibe && !els.recibe.value) els.recibe.value = r.vendedor;
      if (r.cliente && els.beneficiario && !els.beneficiario.value.trim()) els.beneficiario.value = r.cliente;
    });

    // En modo Gasto, al elegir un CLIENTE (Beneficiario) → rellena vendedor y lote.
    els.beneficiario?.addEventListener('change', () => {
      if (modo !== 'gasto') return;
      const r = catalogoCaptura().porCliente.get(keyOf(els.beneficiario.value));
      if (!r) return;
      if (r.vendedor && !els.recibe.value) els.recibe.value = r.vendedor;
      const ls = [...r.lotes];
      if (ls.length === 1 && !els.lote.value.trim()) els.lote.value = ls[0];
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const lote = els.lote.value.trim();
      const monto = toNum(els.monto.value);

      if (modo === 'devolucion') {
        const beneficiario = els.beneficiario.value.trim();
        const concepto = (els.concepto.value || '').trim() || `Devolución · ${lote}`;
        if (!lote || !beneficiario) { toast('Devolución: lote y cliente son obligatorios', 'error'); return; }
        if (monto <= 0) { toast('Captura el monto a devolver', 'error'); return; }
        if (!editId) {
          const info = infoLoteVenta(lote);
          if (!info.vendido && !confirmAction(`El lote ${lote} no aparece como vendido. ¿Registrar la devolución de todos modos?`)) return;
          if (!confirmAction(`Vas a CANCELAR la venta del lote ${lote} y devolver ${money(monto)} a ${beneficiario}. El lote volverá a Disponible. ¿Continuar?`)) return;
        }
        const data = {
          fecha: els.fecha.value, etapa: els.etapa.value, categoria: 'Devolución',
          monto, lote, recibe: 'Cliente', metodo: els.metodo.value,
          concepto, beneficiario, descripcion: concepto,
        };
        try {
          if (editId) {
            await gastos.update(editId, data);
            toast('Devolución actualizada', 'success');
            editId = null;
          } else {
            const item = await gastos.create(data);
            toast(`Devolución registrada · Folio ${item?.folio ?? '—'}`, 'success');
            if (item) imprimirComprobante('gasto', item);
            const r = await cancelarVentaLote(lote);
            if (r?.action === 'liberado') toast(`Lote ${r.numero} liberado (Disponible)`, 'success');
          }
        } catch (err) { toast('Error: ' + err.message, 'error'); }
        return;
      }

      // ---- Modo Gasto normal ----
      const data = {
        fecha: els.fecha.value,
        etapa: els.etapa.value,
        categoria: els.categoria.value,
        monto,
        lote,
        recibe: els.recibe.value,
        metodo: els.metodo.value,
        concepto: els.concepto.value.trim(),
        beneficiario: els.beneficiario.value.trim(),
        descripcion: els.concepto.value.trim(),
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

    container.querySelectorAll('[data-modo]').forEach((b) =>
      b.addEventListener('click', () => { if (modo === b.dataset.modo && !editId) return; modo = b.dataset.modo; editId = null; redrawForm(); }));

    container.querySelector('#gas-cancel')?.addEventListener('click', () => { editId = null; redrawForm(); });
  }

  function wireTable() {
    container.querySelectorAll('[data-print]').forEach((b) =>
      b.addEventListener('click', () => {
        const item = gastos.all().find((x) => x.id === b.dataset.print);
        if (item) imprimirComprobante('gasto', item);
      }));

    container.querySelectorAll('[data-edit]').forEach((b) =>
      b.addEventListener('click', () => {
        editId = b.dataset.edit;
        const it = gastos.all().find((x) => x.id === editId);
        modo = it && /devoluc/i.test(it.categoria || '') ? 'devolucion' : 'gasto';
        redrawForm();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }));

    container.querySelectorAll('[data-del]').forEach((b) =>
      b.addEventListener('click', () => {
        if (confirmAction('¿Eliminar este gasto?')) {
          gastos.remove(b.dataset.del);
          toast('Gasto eliminado', 'warn');
        }
      }));

    container.querySelectorAll('[data-etapa]').forEach((b) =>
      b.addEventListener('click', () => { fEtapa = b.dataset.etapa; redrawTable(); }));

    const search = container.querySelector('#gas-search');
    if (search) {
      search.addEventListener('input', () => {
        query = search.value;
        redrawTable();
        const s = container.querySelector('#gas-search');
        s.focus(); s.setSelectionRange(s.value.length, s.value.length);
      });
    }
  }

  draw();
  return subscribe(draw);
}
