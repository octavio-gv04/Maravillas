/**
 * views/ingresos.js — Registro de ingresos (replica hoja INGRESOS del Excel).
 * Campos: Folio, Fecha, Etapa, Lote, Cliente, Vendedor, Pago(categoria),
 *         Tipo(metodo), Cantidad(monto), Verificado, Saldo, Observaciones, Recibo.
 */

import { ingresos, lotes, subscribe } from '../store.js';
import { CAT_INGRESOS, METODOS_INGRESO, ETAPAS_INGRESO, VENDEDORES, CAT_VENTA_LOTE, CAT_VENTA_FORM } from '../config.js';
import { money, prettyDate, todayISO, esc, toNum, toast, confirmAction } from '../utils.js';
import { card, btn, btnGhost, field, select, textarea, sectionHead, empty, badge, cardTitle, actionBtn } from '../ui.js';
import { svgIcon } from '../icons.js';
import { can } from '../auth.js';
import { catalogoCaptura, keyOf, registrarVentaLote } from '../maestra.js';
import { imprimirComprobante } from '../recibo.js';

export function render(container) {
  let editId = null;
  let modo = 'pago';   // 'pago' | 'venta'
  let query = '';
  let fEtapa = 'Todas';

  // Lote de la Base Maestra por su clave (para autocompletar / prellenar en Venta).
  const loteDe = (clave) => lotes.all().find((l) => keyOf(l.numero) === keyOf(clave));

  const modoTabs = () => `
    <div class="flex gap-2 mb-4">
      ${[['venta', 'tag', 'Venta'], ['pago', 'cash', 'Pago']].map(([m, ic, label]) =>
        `<button data-modo="${m}" class="inline-flex items-center gap-1.5 px-4 min-h-[2.5rem] rounded-lg text-sm border ${m === modo ? 'bg-brand text-white border-brand' : 'border-gray-300 dark:border-gray-600'}">${svgIcon(ic, 'w-4 h-4')} ${label}</button>`).join('')}
    </div>`;

  const formCard = () => {
    const cat = catalogoCaptura();
    const esVenta = modo === 'venta';
    const titulo = editId ? (esVenta ? 'Editar venta' : 'Editar pago') : (esVenta ? 'Nueva venta' : 'Nuevo pago');
    const catPago = CAT_INGRESOS.filter((c) => !CAT_VENTA_FORM.includes(c));

    const camposVenta = `
      <div id="lote-estado" class="hidden sm:col-span-2 lg:col-span-4 text-sm rounded-lg px-3 py-2"></div>
      ${field({ label: 'Fecha', name: 'fecha', type: 'date', value: todayISO(), attrs: 'required' })}
      ${select({ label: 'Etapa', name: 'etapa', options: ETAPAS_INGRESO })}
      ${field({ label: 'Lote', name: 'lote', placeholder: 'Ej. M39-L25', attrs: 'list="dl-lotes" autocomplete="off" required' })}
      ${select({ label: 'Tipo de venta', name: 'categoria', options: CAT_VENTA_FORM })}
      ${field({ label: 'Nombre del cliente', name: 'cliente', placeholder: 'Nombre completo', attrs: 'list="dl-clientes" autocomplete="off" required' })}
      ${field({ label: 'Teléfono', name: 'telefono', type: 'tel', placeholder: '10 dígitos' })}
      ${field({ label: 'Email', name: 'email', type: 'email', placeholder: 'correo@ejemplo.com' })}
      ${select({ label: 'Vendedor', name: 'vendedor', options: ['', ...VENDEDORES] })}
      ${select({ label: 'Tipo (método)', name: 'metodo', options: METODOS_INGRESO })}
      ${field({ label: 'Enganche / pago', name: 'monto', type: 'number', attrs: 'step="0.01" min="0" required' })}
      ${field({ label: 'Precio del lote', name: 'precio', type: 'number', attrs: 'step="0.01" min="0"' })}
      ${field({ label: 'Mensualidad', name: 'mensualidad', type: 'number', attrs: 'step="0.01" min="0"' })}
      <div class="sm:col-span-2 lg:col-span-4">
        ${textarea({ label: 'Observaciones', name: 'observaciones' })}
      </div>`;

    const camposPago = `
      ${field({ label: 'Fecha', name: 'fecha', type: 'date', value: todayISO(), attrs: 'required' })}
      ${select({ label: 'Etapa', name: 'etapa', options: ETAPAS_INGRESO })}
      ${field({ label: 'Lote', name: 'lote', placeholder: 'Ej. M39-L25', attrs: 'list="dl-lotes" autocomplete="off"' })}
      ${select({ label: 'Pago (categoría)', name: 'categoria', options: catPago })}
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
      </div>`;

    const tip = esVenta
      ? 'En Venta se registra el enganche o la Promo 1er Mes de un cliente nuevo. Al guardar, el lote se da de alta como Vendido con sus datos (cliente, teléfono, email, vendedor, precio y mensualidad).'
      : `El campo Cliente sugiere los ${cat.nombres.length} clientes de la Base de Datos Maestra. Al elegir uno, se autocompletan su lote y vendedor.`;

    return card(`
    ${cardTitle(editId ? 'pencil' : (esVenta ? 'tag' : 'plus'), titulo, esVenta ? 'bg-blue-600' : 'bg-green-500')}
    ${modoTabs()}
    <form id="ing-form" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      ${esVenta ? camposVenta : camposPago}
      <div class="sm:col-span-2 lg:col-span-4 flex gap-2">
        ${btn(editId ? 'Guardar cambios' : (esVenta ? 'Registrar venta' : 'Registrar pago'), 'type="submit"')}
        ${editId ? btnGhost('Cancelar', 'type="button" id="ing-cancel"') : ''}
      </div>
      <datalist id="dl-clientes">${cat.nombres.map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>
      <datalist id="dl-lotes">${cat.lotesAll.map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>
    </form>
    <p class="flex items-start gap-1.5 text-xs text-gray-400 mt-2">${svgIcon('bulb', 'w-4 h-4 shrink-0 text-amber-400')}<span>${tip}</span></p>
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
    const els = form.elements;
    const setVal = (name, val) => { if (els[name]) els[name].value = val; };
    const fillEmpty = (name, val) => { if (els[name] && !String(els[name].value).trim()) els[name].value = val ?? ''; };

    if (editId) {
      const item = ingresos.all().find((x) => x.id === editId);
      if (item) {
        setVal('fecha', item.fecha);
        setVal('etapa', item.etapa || ETAPAS_INGRESO[0]);
        setVal('lote', item.lote || '');
        setVal('categoria', item.categoria);
        setVal('cliente', item.cliente || '');
        setVal('vendedor', item.vendedor || '');
        setVal('metodo', item.metodo);
        setVal('monto', item.monto);
        setVal('saldo', item.saldo ?? '');
        if (els.verificado) els.verificado.checked = !!item.verificado;
        setVal('observaciones', item.observaciones || '');
        // En Venta, completa los datos comerciales desde el lote.
        if (modo === 'venta') {
          const l = loteDe(item.lote);
          if (l) { setVal('telefono', l.telefono || ''); setVal('email', l.email || ''); setVal('precio', l.precio || ''); setVal('mensualidad', l.mensualidad || ''); }
        }
      }
    }

    // Al elegir un cliente de la Maestra, autocompleta su lote (si es único) y vendedor.
    els.cliente.addEventListener('change', () => {
      const r = catalogoCaptura().porCliente.get(keyOf(els.cliente.value));
      if (!r) return;
      if (r.vendedor && !els.vendedor.value) els.vendedor.value = r.vendedor;
      const ls = [...r.lotes];
      if (ls.length === 1 && !els.lote.value.trim()) els.lote.value = ls[0];
    });

    // Indicador de disponibilidad del lote (solo en modo Venta).
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

    // Al elegir un lote de la Base Maestra:
    //  • Pago  → autocompleta cliente y vendedor (es un pago de un lote ya vendido).
    //  • Venta → NO copia los datos de un cliente existente; indica si el lote está
    //    disponible o ya vendido. Si está disponible, solo trae precio/mensualidad.
    els.lote?.addEventListener('change', () => {
      const clave = els.lote.value.trim();
      const l = loteDe(clave);

      if (modo === 'venta') {
        if (!clave) { estadoEl?.classList.add('hidden'); return; }
        const ocupado = /vendido/i.test(l?.estado || '') || !!String(l?.cliente || '').trim();
        if (l && ocupado) {
          setEstado('warn', 'alertTriangle', `El lote <strong>${esc(clave)}</strong> ya está vendido a <strong>${esc(l.cliente || '—')}</strong>. Elige otro lote para una venta nueva.`);
        } else if (l) {
          setEstado('ok', 'checkCircle', `Lote <strong>${esc(clave)}</strong> disponible.`);
          fillEmpty('precio', l.precio);
          fillEmpty('mensualidad', l.mensualidad);
        } else {
          setEstado('info', 'plus', `Lote <strong>${esc(clave)}</strong> nuevo: no existe en la Base Maestra, se dará de alta como Vendido.`);
        }
        return;
      }

      // Modo Pago: autollenado normal desde el lote.
      if (!l) return;
      fillEmpty('cliente', l.cliente);
      fillEmpty('vendedor', l.vendedor);
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const lote = els.lote.value.trim();
      const categoria = els.categoria.value;
      const data = {
        fecha: els.fecha.value,
        etapa: els.etapa.value,
        lote,
        categoria,
        cliente: els.cliente.value.trim(),
        vendedor: els.vendedor.value,
        metodo: els.metodo.value,
        monto: toNum(els.monto.value),
        observaciones: (els.observaciones?.value || '').trim(),
        // "concepto" se mantiene para compatibilidad con dashboard/movimientos.
        concepto: `${categoria}${lote ? ' · ' + lote : ''}`,
      };
      // Campos exclusivos del modo Pago.
      if (modo === 'pago') {
        data.saldo = els.saldo.value === '' ? null : toNum(els.saldo.value);
        data.verificado = !!els.verificado?.checked;
      }
      if (data.monto <= 0) { toast('La cantidad debe ser mayor a 0', 'error'); return; }
      if (modo === 'venta' && (!data.lote || !data.cliente)) { toast('Venta: lote y nombre del cliente son obligatorios', 'error'); return; }
      // En una venta nueva, evita re-vender un lote ya asignado a otro cliente.
      if (modo === 'venta' && !editId) {
        const l = loteDe(data.lote);
        const ocupado = l && (/vendido/i.test(l.estado || '') || String(l.cliente || '').trim());
        if (ocupado && keyOf(l.cliente) !== keyOf(data.cliente) &&
            !confirmAction(`El lote ${data.lote} ya está vendido a ${l.cliente}. ¿Registrar la venta de todos modos?`)) return;
      }

      try {
        if (editId) {
          await ingresos.update(editId, data);
          toast('Ingreso actualizado', 'success');
          editId = null;
        } else {
          // El servidor asigna folio y recibo consecutivos.
          const item = await ingresos.create(data);
          toast(`${modo === 'venta' ? 'Venta' : 'Pago'} registrado · Folio ${item?.folio ?? '—'} · ${item?.recibo ?? ''}`, 'success');
          if (item) imprimirComprobante('ingreso', item); // abre el recibo para imprimir
        }

        // Venta de lote: si la categoría marca una venta (Enganche / Promo 1er Mes
        // / Contado), damos de alta el lote como "Vendido" con el cliente, para que
        // el cliente nuevo aparezca en el padrón de la Maestra sin doble captura.
        const esVentaCat = CAT_VENTA_LOTE.some((c) => c.toLowerCase() === categoria.trim().toLowerCase());
        if (esVentaCat && data.lote && data.cliente) {
          const extra = modo === 'venta' ? {
            telefono: (els.telefono?.value || '').trim(),
            email: (els.email?.value || '').trim(),
            precio: els.precio?.value ? toNum(els.precio.value) : undefined,
            mensualidad: els.mensualidad?.value ? toNum(els.mensualidad.value) : undefined,
          } : {};
          try {
            const r = await registrarVentaLote({
              lote: data.lote, cliente: data.cliente, vendedor: data.vendedor,
              etapa: data.etapa, fecha: data.fecha, ...extra,
            });
            if (r?.action === 'create') toast(`Lote ${r.numero} dado de alta como Vendido · ${r.cliente}`, 'success');
            else if (r?.action === 'update') toast(`Lote ${r.numero} marcado como Vendido · ${r.cliente}`, 'success');
          } catch (e) { toast('Ingreso guardado, pero no se pudo actualizar el lote: ' + e.message, 'warn'); }
        }
      } catch (err) { toast('Error: ' + err.message, 'error'); }
    });

    container.querySelectorAll('[data-modo]').forEach((b) =>
      b.addEventListener('click', () => { if (modo === b.dataset.modo && !editId) return; modo = b.dataset.modo; editId = null; draw(); }));

    container.querySelector('#ing-cancel')?.addEventListener('click', () => { editId = null; draw(); });

    container.querySelectorAll('[data-print]').forEach((b) =>
      b.addEventListener('click', () => {
        const item = ingresos.all().find((x) => x.id === b.dataset.print);
        if (item) imprimirComprobante('ingreso', item);
      }));

    container.querySelectorAll('[data-edit]').forEach((b) =>
      b.addEventListener('click', () => {
        editId = b.dataset.edit;
        const it = ingresos.all().find((x) => x.id === editId);
        modo = it && CAT_VENTA_FORM.some((c) => c.toLowerCase() === String(it.categoria).trim().toLowerCase()) ? 'venta' : 'pago';
        draw();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }));

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
