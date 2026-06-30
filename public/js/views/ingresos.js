/**
 * views/ingresos.js — Registro de ingresos (replica hoja INGRESOS del Excel).
 * Campos: Folio, Fecha, Etapa, Lote, Cliente, Vendedor, Pago(categoria),
 *         Tipo(metodo), Cantidad(monto), Verificado, Saldo, Observaciones, Recibo.
 */

import { ingresos, lotes, subscribe } from '../store.js';
import { CAT_INGRESOS, METODOS_INGRESO, ETAPAS_INGRESO, VENDEDORES, CAT_VENTA_LOTE, CAT_VENTA_FORM } from '../config.js';
import { money, prettyDate, todayISO, esc, toNum, toast, confirmAction, formatMoneyIn } from '../utils.js';
import { card, btn, btnGhost, field, select, textarea, sectionHead, empty, badge, cardTitle, actionBtn, monthNav, wireMonthNav } from '../ui.js';
import { svgIcon } from '../icons.js';
import { can, isCapturista } from '../auth.js';
import { catalogoCaptura, keyOf, registrarVentaLote, revertirVentaLote, comisionVendedor } from '../maestra.js';
import { imprimirComprobante } from '../recibo.js';

export function render(container) {
  let editId = null;
  let modo = 'pago';   // 'pago' | 'venta'
  let query = '';
  let fEtapa = 'Todas';
  let page = 0;        // página de la tabla (100 por página)
  let _pages = 1;      // total de páginas (lo fija tableCard)
  let mes = todayISO().slice(0, 7);  // mes de captura mostrado en la tabla
  // Vista de captura (Hillary): sin totales del negocio y enfocada en HOY.
  const soloCaptura = isCapturista();
  let soloHoy = soloCaptura;         // capturista arranca viendo solo el día

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
      <div class="sm:col-span-2">${field({ label: 'Nombre del cliente', name: 'cliente', placeholder: 'Nombre completo', attrs: 'list="dl-clientes" autocomplete="off" required' })}</div>
      ${field({ label: 'Teléfono', name: 'telefono', type: 'tel', placeholder: '10 dígitos' })}
      ${field({ label: 'Email', name: 'email', type: 'email', placeholder: 'correo@ejemplo.com' })}
      ${select({ label: 'Tipo (método)', name: 'metodo', options: METODOS_INGRESO })}
      ${field({ label: 'Enganche / pago', name: 'monto', money: true, attrs: 'required' })}
      ${field({ label: 'Precio del lote', name: 'precio', money: true })}
      ${field({ label: 'Mensualidad', name: 'mensualidad', money: true })}
      <!-- Vendedor y comisión, juntos al final -->
      ${select({ label: 'Vendedor', name: 'vendedor', options: ['', ...VENDEDORES] })}
      ${field({ label: '% Comisión', name: 'comisionPct', type: 'text', placeholder: 'Ej. 7%', attrs: 'data-percent inputmode="decimal" autocomplete="off"' })}
      <div class="sm:col-span-2 lg:col-span-4">
        ${textarea({ label: 'Observaciones', name: 'observaciones' })}
      </div>`;

    const camposPago = `
      ${field({ label: 'Fecha', name: 'fecha', type: 'date', value: todayISO(), attrs: 'required' })}
      ${select({ label: 'Etapa', name: 'etapa', options: ETAPAS_INGRESO })}
      ${field({ label: 'Lote', name: 'lote', placeholder: 'Ej. M39-L25', attrs: 'list="dl-lotes" autocomplete="off"' })}
      ${select({ label: 'Pago (categoría)', name: 'categoria', options: catPago })}
      ${field({ label: 'Cliente', name: 'cliente', placeholder: 'Cliente (de la Base Maestra)', attrs: 'list="dl-clientes" autocomplete="off"' })}
      ${select({ label: 'Tipo (método)', name: 'metodo', options: METODOS_INGRESO })}
      ${field({ label: 'Cantidad', name: 'monto', money: true, attrs: 'required' })}
      ${field({ label: 'Saldo', name: 'saldo', money: true })}
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
    list = list.filter((x) => (x.fecha || '').slice(0, 7) === mes);  // solo el mes de captura
    if (fEtapa !== 'Todas') list = list.filter((x) => x.etapa === fEtapa);
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((x) =>
        [x.cliente, x.concepto, x.categoria, x.recibo, x.lote, x.vendedor, x.observaciones]
          .some((f) => String(f || '').toLowerCase().includes(q)));
    }
    if (soloHoy) list = list.filter((x) => (x.fecha || '') === todayISO());
    const total = list.reduce((a, x) => a + toNum(x.monto), 0);
    const PER = 100;
    _pages = Math.max(1, Math.ceil(list.length / PER));
    if (page > _pages - 1) page = _pages - 1;
    if (page < 0) page = 0;
    const start = page * PER;
    const shown = list.slice(start, start + PER);

    const etapaTabs = ['Todas', ...ETAPAS_INGRESO].map((e) =>
      `<button data-etapa="${esc(e)}" class="px-3 py-1 rounded-full text-xs border ${e === fEtapa ? 'bg-brand text-white border-brand' : 'border-gray-300 dark:border-gray-600'}">${esc(e)}</button>`).join('');

    return card(`
      ${sectionHead(`Ingresos (${list.length})${soloCaptura ? '' : ` · ${money(total)}`}`,
        `<input id="ing-search" class="field !w-56" placeholder="Buscar..." value="${esc(query)}" />`, 'trendingUp', 'bg-green-500')}
      <div class="flex items-center gap-3 mb-3 flex-wrap">
        ${monthNav(mes)}
        ${soloCaptura ? `<button data-hoy class="px-3 py-1 rounded-full text-xs border ${soloHoy ? 'bg-brand text-white border-brand' : 'border-gray-300 dark:border-gray-600'}">Solo hoy</button>` : ''}
        <div class="flex gap-2 flex-wrap">${etapaTabs}</div>
      </div>
      ${list.length ? `
      <div class="table-wrap">
        <table class="w-full text-sm">
          <thead class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th class="py-2">Folio</th><th>Fecha</th><th>Etapa</th><th>Lote</th>
              <th>Pago</th><th>Cliente</th><th>Método</th><th class="text-right">Cantidad</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${shown.map((x) => `
              <tr class="border-b border-gray-100 dark:border-gray-700/50">
                <td class="py-2">${x.folio ?? '—'}</td>
                <td class="whitespace-nowrap">${prettyDate(x.fecha)}</td>
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
          ${soloCaptura ? '' : `<tfoot>
            <tr class="font-semibold border-t-2 border-gray-200 dark:border-gray-700">
              <td class="py-2" colspan="7">Total filtrado</td>
              <td class="text-right text-green-600">${money(total)}</td><td></td>
            </tr>
          </tfoot>`}
        </table>
      </div>
      ${_pages > 1 ? `<div class="flex items-center justify-between gap-2 mt-3 text-sm">
        <button data-pg="prev" class="inline-flex items-center gap-1 px-3 min-h-[2.25rem] rounded-lg border border-gray-300 dark:border-gray-600 ${page === 0 ? 'opacity-40 pointer-events-none' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}">${svgIcon('chevronLeft', 'w-4 h-4')} Anteriores</button>
        <span class="text-gray-500 tabular-nums">Página ${page + 1} de ${_pages} · ${start + 1}–${Math.min(start + PER, list.length)} de ${list.length}</span>
        <button data-pg="next" class="inline-flex items-center gap-1 px-3 min-h-[2.25rem] rounded-lg border border-gray-300 dark:border-gray-600 ${page >= _pages - 1 ? 'opacity-40 pointer-events-none' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}">Siguientes ${svgIcon('chevronRight', 'w-4 h-4')}</button>
      </div>` : ''}` : empty('No hay ingresos que coincidan')}
    `);
  };

  const draw = () => {
    container.innerHTML = `<div class="space-y-4"><div id="ing-form-host">${formCard()}</div><div id="ing-table-host">${tableCard()}</div></div>`;
    wireForm(); wireTable();
  };
  // Re-render dirigido: cambiar de modo o editar solo toca el formulario; buscar/
  // filtrar solo la tabla. Evita re-renderizar miles de filas en cada clic.
  const redrawForm = () => { const h = container.querySelector('#ing-form-host'); if (h) { h.innerHTML = formCard(); wireForm(); } };
  const redrawTable = () => { const h = container.querySelector('#ing-table-host'); if (h) { h.innerHTML = tableCard(); wireTable(); } };

  function wireForm() {
    const form = container.querySelector('#ing-form');
    if (!form) return;
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
        setVal('observaciones', item.observaciones || '');
        // En Venta, completa los datos comerciales desde el lote.
        if (modo === 'venta') {
          const l = loteDe(item.lote);
          if (l) { setVal('telefono', l.telefono || ''); setVal('email', l.email || ''); setVal('precio', l.precio || ''); setVal('mensualidad', l.mensualidad || ''); setVal('comisionPct', l.comisionPct || ''); }
        }
        formatMoneyIn(form); // muestra los montos prellenados como $1,234.00
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

    // En Venta, al elegir vendedor se sugiere su % de comisión por defecto (editable).
    els.vendedor?.addEventListener('change', () => {
      if (modo !== 'venta' || !els.comisionPct || els.comisionPct.value.trim()) return;
      const pct = comisionVendedor(els.vendedor.value);
      if (pct != null && pct > 0) els.comisionPct.value = pct + '%';   // formateado
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
      const lote = els.lote.value.trim().toUpperCase().replace(/\s+/g, '');
      const categoria = els.categoria.value;
      const data = {
        fecha: els.fecha.value,
        etapa: els.etapa.value,
        lote,
        categoria,
        cliente: els.cliente.value.trim(),
        vendedor: els.vendedor?.value || '',   // solo existe en modo Venta
        metodo: els.metodo.value,
        monto: toNum(els.monto.value),
        observaciones: (els.observaciones?.value || '').trim(),
        // "concepto" se mantiene para compatibilidad con dashboard/movimientos.
        concepto: `${categoria}${lote ? ' · ' + lote : ''}`,
      };
      // Campos exclusivos del modo Pago.
      if (modo === 'pago') {
        data.saldo = els.saldo.value === '' ? null : toNum(els.saldo.value);
        // `verificado` ya NO se captura aquí: se marca en el Corte (depósitos por
        // verificar). No se incluye en `data` para no pisarlo al editar un pago.
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
            comisionPct: els.comisionPct?.value ? toNum(els.comisionPct.value) : undefined,
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
      b.addEventListener('click', () => { if (modo === b.dataset.modo && !editId) return; modo = b.dataset.modo; editId = null; redrawForm(); }));

    container.querySelector('#ing-cancel')?.addEventListener('click', () => { editId = null; redrawForm(); });
  }

  function wireTable() {
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
        redrawForm();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }));

    container.querySelectorAll('[data-del]').forEach((b) =>
      b.addEventListener('click', async () => {
        const it = ingresos.all().find((x) => x.id === b.dataset.del);
        if (!it) return;
        // ¿Es la venta que dio de alta el lote? Solo se libera el lote si, al quitar
        // este ingreso, NO le quedan otros pagos asociados (no romper historial).
        const esVentaCat = it.lote && CAT_VENTA_LOTE.some((c) => c.toLowerCase() === String(it.categoria).trim().toLowerCase());
        const otrosPagos = esVentaCat && ingresos.all().some((x) => x.id !== it.id && keyOf(x.lote) === keyOf(it.lote));
        const liberaLote = esVentaCat && !otrosPagos;
        const msg = liberaLote
          ? `¿Eliminar esta venta y LIBERAR el lote ${it.lote}? Volverá a Disponible. Esta acción no se puede deshacer.`
          : '¿Eliminar este ingreso? Esta acción no se puede deshacer.';
        if (!confirmAction(msg)) return;
        try {
          await ingresos.remove(it.id);
          if (liberaLote) {
            const r = await revertirVentaLote(it.lote);
            if (r?.action === 'delete') toast(`Venta eliminada · lote ${r.numero} quitado`, 'warn');
            else if (r?.action === 'free') toast(`Venta eliminada · lote ${r.numero} liberado (Disponible)`, 'warn');
            else toast('Ingreso eliminado', 'warn');
          } else {
            toast(esVentaCat ? 'Ingreso eliminado · el lote conserva otros pagos, no se liberó' : 'Ingreso eliminado', 'warn');
          }
        } catch (err) { toast('Error: ' + err.message, 'error'); }
      }));

    wireMonthNav(container, mes, (m) => { mes = m; page = 0; redrawTable(); });

    container.querySelector('[data-hoy]')?.addEventListener('click', () => { soloHoy = !soloHoy; page = 0; redrawTable(); });

    container.querySelector('[data-pg="prev"]')?.addEventListener('click', () => { if (page > 0) { page--; redrawTable(); } });
    container.querySelector('[data-pg="next"]')?.addEventListener('click', () => { if (page < _pages - 1) { page++; redrawTable(); } });

    container.querySelectorAll('[data-etapa]').forEach((b) =>
      b.addEventListener('click', () => { fEtapa = b.dataset.etapa; page = 0; redrawTable(); }));

    const search = container.querySelector('#ing-search');
    if (search) {
      search.addEventListener('input', () => {
        query = search.value;
        page = 0;
        redrawTable();
        const s = container.querySelector('#ing-search');
        s.focus(); s.setSelectionRange(s.value.length, s.value.length);
      });
    }
  }

  draw();
  return subscribe(draw);
}
