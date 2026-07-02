/**
 * views/captura/morosos.js — Seguimiento de lotes morosos para CAPTURA DIARIA.
 *
 * Versión acotada de la Cobranza de la Maestra pensada para Hillary: deriva el
 * atraso de la misma lógica (`cobranzaPorLote()` por etapa activa) pero NO muestra
 * totales de cartera (vencido global, montos por segmento). Cada LOTE es una fila
 * (cada uno refleja una situación distinta). Al seleccionar un lote se despliega
 * ARRIBA el estado de cuenta completo del cliente para tomar acciones, con opción
 * de generar un informe imprimible / PDF y registrar notas de gestión —sin abrir
 * la Base de Datos Maestra (su rol no tiene acceso).
 */

import { subscribe, cobranza as notasStore } from '../../store.js';
import { cobranzaPorLote, estadoCuentaLote, cuentasDeCliente, notasDe, keyOf } from '../../maestra.js';
import { money, esc, prettyDate, todayISO, toast } from '../../utils.js';
import { card, badge, empty, sectionHead, cardTitle, btnGhost } from '../../ui.js';
import { svgIcon } from '../../icons.js';
import { getSession } from '../../auth.js';
import { navigate } from '../../router.js';

// Regla de negocio: a partir de 4 meses de atraso la venta se considera CANCELADA.
const MESES_CANCELACION = 4;

/** Estado de cobranza por meses de atraso: específico 1-3 meses, "Cancelado" desde 4. */
function cobranzaStatus(meses, adelantado = false) {
  if (adelantado) return { label: 'Adelantado', color: 'green' };
  if (meses >= MESES_CANCELACION) return { label: 'Cancelado', color: 'red' };
  if (meses > 0) return { label: `Atraso ${meses} ${meses > 1 ? 'meses' : 'mes'}`, color: meses >= 3 ? 'red' : 'yellow' };
  return { label: 'Al corriente', color: 'green' };
}
const cobranzaBadge = (meses, adelantado = false) => {
  const s = cobranzaStatus(meses, adelantado);
  return badge(s.color, s.label);
};
const estadoBadge = (estado) => ({
  Liquidado: badge('green', 'Liquidado'),
  Activo: badge('green', 'Al corriente'),
  Moroso: badge('red', 'Moroso'),
}[estado] || badge('yellow', estado));

const mesLabel = (iso) => {
  const s = new Date(iso + 'T00:00:00').toLocaleDateString('es-MX', { month: 'short', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
// Estilo de cada renglón del calendario según su estado.
const CAL = {
  pagado:    { monto: 'text-green-600', concepto: (c) => esc(c), row: '' },
  vencido:   { monto: 'text-red-600 font-semibold', concepto: () => 'Mensualidad vencida (no pagó)', row: 'bg-red-50 dark:bg-red-900/10' },
  pendiente: { monto: 'text-gray-400', concepto: () => 'Mensualidad por pagar', row: 'opacity-70' },
};

export function render(container) {
  let fSeg = '';     // segmento filtrado (key de bucket) o '' = todos
  let selKey = '';   // lote seleccionado (clienteKey|lote) para ver el detalle

  const draw = (scroll = false) => {
    const cob = cobranzaPorLote();
    const morosos = cob.segmentos.flatMap((s) =>
      s.key === 'corriente' ? [] : s.clientes.map((c) => ({ ...c, seg: s })));
    const list = fSeg ? morosos.filter((c) => c.bucket.key === fSeg) : morosos;

    // Tarjetas por segmento: SOLO el conteo de lotes (sin montos de cartera).
    const tarjetas = cob.segmentos.map((s) => {
      const col = { green: 'border-green-500 text-green-600', yellow: 'border-amber-500 text-amber-600', red: 'border-red-500 text-red-600' }[s.color];
      const active = fSeg === s.key;
      const cardLabel = s.key === 'mas90' ? 'Cancelado (4+ meses)' : s.label;
      return `<button data-seg="${s.key}" class="text-left bg-white dark:bg-gray-800 rounded-xl border-l-4 ${col.split(' ')[0]} border border-gray-200 dark:border-gray-700 p-3 ${active ? 'ring-2 ring-brand' : ''} hover:shadow-md transition">
        <p class="text-[11px] uppercase tracking-wide text-gray-500">${esc(cardLabel)}</p>
        <p class="text-lg font-bold ${col.split(' ')[1]}">${s.clientes.length}</p>
        <p class="text-xs text-gray-500">lote(s)</p>
      </button>`;
    }).join('');

    const sel = selKey ? morosos.find((c) => c.key === selKey) : null;
    const ec = sel ? estadoCuentaLote(sel.lote) : null;        // estado de cuenta del lote
    const cli = sel ? cuentasDeCliente(sel.clienteKey) : null; // todos los lotes del cliente + deuda total
    const notas = sel ? notasDe(sel.clienteKey) : [];

    container.innerHTML = `
      ${sectionHead('Morosos',
        `<span class="text-sm self-center text-gray-500">${morosos.length} lote(s) con atraso</span>`, 'creditCard', 'bg-orange-500')}

      <div id="detalle">${ec ? panelDetalle(sel, ec, cli, notas) : ''}</div>

      <div class="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-3 mb-4">${tarjetas}</div>

      ${list.length ? card(`
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold">Lotes con atraso ${fSeg ? `· ${esc(cob.segmentos.find((s) => s.key === fSeg)?.label)}` : ''}</h3>
          ${fSeg ? btnGhost('Ver todos', 'id="clear"') : ''}
        </div>
        <div class="table-wrap"><table class="w-full text-sm">
          <thead class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
            <tr><th class="py-2">Cliente</th><th>Lote</th><th>Vendedor</th><th class="text-right">Saldo</th><th class="text-right">Atraso</th><th>Estado</th><th>Últ. pago</th></tr>
          </thead>
          <tbody>
            ${list.sort((a, b) => b.atrasoMeses - a.atrasoMeses).map((c) => `
              <tr class="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer ${c.key === selKey ? 'bg-amber-50 dark:bg-amber-900/20' : ''}" data-k="${esc(c.key)}">
                <td class="py-2 font-medium">${esc(c.nombre)}</td>
                <td class="text-gray-500">${esc(c.lote || '—')}</td>
                <td class="text-gray-500">${esc(c.vendedor || '—')}</td>
                <td class="text-right tabular-nums text-red-600 font-medium">${money(c.saldo)}</td>
                <td class="text-right tabular-nums">${c.atrasoMeses} mes(es)</td>
                <td>${cobranzaBadge(c.atrasoMeses)}</td>
                <td class="text-gray-500">${c.ultimoPago ? prettyDate(c.ultimoPago) : '—'}</td>
              </tr>`).join('')}
          </tbody>
        </table></div>
        <p class="text-xs text-gray-400 mt-2">Toca un lote para ver el estado de cuenta completo del cliente y tomar acciones.</p>
      `) : empty('No hay lotes con atraso en este segmento')}
    `;

    container.querySelectorAll('[data-seg]').forEach((b) =>
      b.addEventListener('click', () => { fSeg = b.dataset.seg === 'corriente' ? '' : (fSeg === b.dataset.seg ? '' : b.dataset.seg); draw(); }));
    container.querySelector('#clear')?.addEventListener('click', () => { fSeg = ''; draw(); });
    container.querySelectorAll('[data-k]').forEach((tr) =>
      tr.addEventListener('click', () => { selKey = tr.dataset.k; draw(true); }));
    container.querySelector('#cerrar')?.addEventListener('click', () => { selKey = ''; draw(); });
    container.querySelector('#imprimir')?.addEventListener('click', () => imprimirInforme(sel, cli, notas));
    container.querySelector('#devolucion')?.addEventListener('click', () => {
      // Lleva a Gastos en modo Devolución con el lote precargado (cancela la venta y libera el lote).
      navigate('gastos', { devolucion: sel.lote });
    });
    container.querySelector('#nota-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const texto = e.target.texto.value.trim();
      if (!texto || !sel) return;
      try {
        await notasStore.create({ clienteKey: sel.clienteKey, cliente: sel.nombre, texto, fecha: todayISO(), usuario: getSession()?.name || '' });
        toast('Nota guardada', 'success');
      } catch (err) { toast(err.message || 'No se pudo guardar', 'error'); }
    });

    if (scroll) container.querySelector('#detalle')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  draw();
  return subscribe(() => draw());
}

/** Panel del estado de cuenta del LOTE seleccionado + deuda total del cliente (arriba de la tabla). */
function panelDetalle(sel, ec, cli, notas) {
  const c = ec.cliente;
  const fila = (l, v, cls = '') => `<div class="flex justify-between py-1.5 ${cls}"><span class="text-gray-500">${esc(l)}</span><span class="tabular-nums font-medium">${v}</span></div>`;
  const variosLotes = cli.numLotes > 1;

  // Desglose de todos los lotes del cliente (cuando tiene más de uno).
  const desglose = variosLotes ? card(`
    <div class="flex items-center justify-between mb-2">
      <h3 class="font-semibold">Lotes del cliente <span class="text-sm font-normal text-gray-500">(${cli.numLotes})</span></h3>
      <span class="text-sm">Deuda total: <span class="text-red-600 font-bold tabular-nums">${money(cli.deudaTotal)}</span></span>
    </div>
    <div class="table-wrap"><table class="w-full text-sm">
      <thead class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
        <tr><th class="py-1.5">Lote</th><th class="text-right">Saldo</th><th class="text-right">Atraso</th><th>Estado</th><th>Últ. pago</th></tr>
      </thead>
      <tbody>
        ${cli.cuentas.slice().sort((a, b) => b.atrasoMeses - a.atrasoMeses).map((x) => {
          const lk = sel.clienteKey + '|' + keyOf(x.lotes[0]);
          const activo = x.lotes[0] === sel.lote;
          return `<tr class="border-b border-gray-100 dark:border-gray-700/50 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 ${activo ? 'bg-amber-100 dark:bg-amber-900/30 font-medium' : ''}" data-k="${esc(lk)}">
            <td class="py-1.5">${esc(x.lotes[0])}${activo ? ' ◀' : ''}</td>
            <td class="text-right tabular-nums ${x.saldo > 0.01 ? 'text-red-600' : 'text-green-600'}">${money(x.saldo)}</td>
            <td class="text-right tabular-nums">${x.atrasoMeses} mes(es)</td>
            <td>${cobranzaBadge(x.atrasoMeses, x.adelantado)}</td>
            <td class="text-gray-500">${x.cliente.ultimoPago ? prettyDate(x.cliente.ultimoPago) : '—'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>
    <p class="text-xs text-gray-400 mt-2">Toca un lote para ver su detalle. El informe incluye el detalle de todos.</p>
  `, 'bg-amber-50/60 dark:bg-amber-900/10 mb-4') : '';

  return card(`
    <div class="flex items-start justify-between gap-3 flex-wrap mb-4">
      <div>
        <h2 class="text-xl font-semibold">${esc(c.nombre)}</h2>
        <p class="text-sm text-gray-500">
          Lote: <span class="font-medium text-gray-700 dark:text-gray-200">${esc(sel.lote)}</span>
          ${variosLotes ? ` <span class="text-gray-400">(${cli.numLotes} lotes · deuda total ${money(cli.deudaTotal)})</span>` : ''}
          · Vendedor: ${esc(c.vendedor || '—')}${c.telefono ? ` · Tel: ${esc(c.telefono)}` : ''}
        </p>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        ${cobranzaBadge(ec.atrasoMeses, ec.adelantado)}
        ${btnGhost(`${svgIcon('printer', 'w-4 h-4 inline')} Informe / PDF`, 'id="imprimir"')}
        <button id="devolucion" class="inline-flex items-center gap-1.5 px-3 min-h-[2.25rem] rounded-lg text-sm text-white ${ec.atrasoMeses >= MESES_CANCELACION ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-500 hover:bg-amber-600'}">${svgIcon('refresh', 'w-4 h-4')} ${ec.atrasoMeses >= MESES_CANCELACION ? 'Cancelar venta' : 'Devolución'}</button>
        ${btnGhost('Cerrar', 'id="cerrar"')}
      </div>
    </div>

    ${ec.atrasoMeses >= MESES_CANCELACION ? `<div class="flex items-start gap-2 text-sm rounded-lg px-3 py-2 mb-3 bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
      ${svgIcon('alertTriangle', 'w-4 h-4 shrink-0 mt-0.5')}
      <span>Este lote acumula <strong>${ec.atrasoMeses} meses</strong> de atraso (≥ ${MESES_CANCELACION}): la venta se considera <strong>CANCELADA</strong>. Procede con la <strong>Devolución</strong> para liberar el lote.</span>
    </div>` : ''}

    ${desglose}

    <div class="grid md:grid-cols-2 gap-4">
      ${card(`
        <h3 class="font-semibold mb-2">Resumen financiero <span class="text-sm font-normal text-gray-500">· Lote ${esc(sel.lote)}</span></h3>
        ${fila('Precio total', money(ec.precioTotal))}
        ${fila('Enganche' + (ec.fechaEnganche ? ` (${prettyDate(ec.fechaEnganche)})` : ''), money(ec.enganche))}
        ${fila('Total pagado a la fecha', money(ec.totalPagado))}
        ${fila('Intereses / recargos', money(ec.intereses))}
        ${fila('Saldo pendiente', money(ec.saldo), 'border-t-2 border-gray-200 dark:border-gray-700 mt-1 pt-2 text-lg ' + (ec.saldo > 0.01 ? 'text-red-600' : 'text-green-600'))}
      `, 'bg-gray-50 dark:bg-gray-900/40')}
      ${card(`
        <h3 class="font-semibold mb-2">Cobranza <span class="text-sm font-normal text-gray-500">· Lote ${esc(sel.lote)}</span></h3>
        ${fila('Estado', cobranzaStatus(ec.atrasoMeses, ec.adelantado).label)}
        ${fila('Atraso', ec.atrasoMeses > 0
          ? `${ec.atrasoMeses} mes(es)${ec.atrasoMeses >= MESES_CANCELACION ? ' · <span class="text-red-600 font-semibold">Cancelado</span>' : ''}`
          : (ec.adelantado ? `✅ Adelantado${ec.adelantoMeses >= 1 ? ` ${Math.floor(ec.adelantoMeses)} mensualidad(es)` : ''}` : 'Al corriente'))}
        ${ec.adelantado ? fila('Pago adelantado', money(ec.excedenteAdelanto), 'text-green-600') : ''}
        ${fila('Próximo vencimiento', ec.proximoVencimiento ? prettyDate(ec.proximoVencimiento) : '—')}
        ${fila('Mensualidad', ec.mensualidad ? money(ec.mensualidad) : '—')}
        ${fila('Plazo total', ec.plazo ? `${ec.plazo} meses` : '—')}
        ${fila('Mensualidades pagadas', `${ec.mesesPagados} de ${ec.plazo || '—'}`, 'text-green-600')}
        ${fila('Mensualidades por pagar', `${ec.mesesRestantes}${ec.atrasoMeses > 0 ? ` · ${ec.atrasoMeses} vencida(s)` : ''}`, ec.atrasoMeses > 0 ? 'text-red-600' : 'text-gray-600 dark:text-gray-300')}
        ${ec.plazo ? `<div class="mt-2 h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div class="h-full bg-green-500" style="width:${Math.min(100, Math.round((ec.mesesPagados / ec.plazo) * 100))}%"></div>
        </div><p class="text-[11px] text-gray-400 mt-1 text-right">${Math.min(100, Math.round((ec.mesesPagados / ec.plazo) * 100))}% pagado</p>` : ''}
      `, 'bg-gray-50 dark:bg-gray-900/40')}
    </div>

    <div class="mt-4">${card(`
      ${cardTitle('receipt', 'Historial de pagos (mes a mes)', 'bg-teal-500', 'mb-1')}
      <div class="flex flex-wrap gap-3 text-xs mb-3">
        <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-green-500"></span>Pagos: ${ec.calendario.filter((r) => r.estado === 'pagado').length}</span>
        <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-red-500"></span>Meses vencidos (debe): ${ec.calendario.filter((r) => r.estado === 'vencido').length}</span>
        <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-gray-400"></span>Meses por pagar: ${ec.calendario.filter((r) => r.estado === 'pendiente').length}</span>
      </div>
      ${ec.calendario.length ? `
      <div class="table-wrap" style="max-height:360px;overflow-y:auto"><table class="w-full text-sm">
        <thead class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800">
          <tr><th class="py-2">Periodo</th><th>Concepto</th><th>Método</th><th class="text-right">Monto</th></tr>
        </thead>
        <tbody>
          ${ec.calendario.map((r) => { const s = CAL[r.estado]; return `<tr class="border-b border-gray-100 dark:border-gray-700/50 ${s.row}">
            <td class="py-2 whitespace-nowrap">${r.estado === 'pagado' ? prettyDate(r.fecha) : mesLabel(r.fecha)}</td>
            <td>${s.concepto(r.concepto)}</td>
            <td class="text-gray-500">${r.estado === 'pagado' ? esc(r.metodo || '—') : '—'}</td>
            <td class="text-right tabular-nums ${s.monto}">${money(r.monto)}</td>
          </tr>`; }).join('')}
        </tbody>
      </table></div>` : empty('Sin pagos registrados')}
    `)}</div>

    <div class="mt-4">${card(`
      ${cardTitle('phone', 'Notas de seguimiento de cobranza', 'bg-amber-500')}
      <form id="nota-form" class="flex gap-2 mb-3">
        <input class="field flex-1" name="texto" placeholder="Registrar contacto / compromiso de pago…" autocomplete="off" required />
        <button class="bg-brand hover:bg-brand-dark text-white px-4 rounded-lg text-sm" type="submit">Agregar</button>
      </form>
      ${notas.length ? `<ul class="space-y-2">${notas.map((n) => `
        <li class="text-sm border-l-2 border-brand pl-3 py-0.5">
          <span class="text-gray-400 text-xs">${prettyDate(n.fecha)} · ${esc(n.usuario || '')}</span><br>${esc(n.texto)}
        </li>`).join('')}</ul>` : '<p class="text-sm text-gray-400">Sin notas todavía.</p>'}
    `)}</div>
  `, 'border-2 border-amber-300 dark:border-amber-700 mb-4');
}

/** Abre una ventana con el informe formateado (deuda total + detalle de cada lote) y lanza el diálogo de impresión / PDF. */
function imprimirInforme(sel, cli, notas) {
  const c = cli.cuentas[0]?.cliente || {};
  const hoy = prettyDate(todayISO());
  const fila = (l, v) => `<tr><td class="lbl">${esc(l)}</td><td class="val">${v}</td></tr>`;
  const atrasoMax = cli.cuentas.reduce((m, ec) => Math.max(m, ec.atrasoMeses), 0);
  const variosLotes = cli.numLotes > 1;

  // Detalle de un lote: resumen financiero + cobranza + historial de pagos.
  const seccionLote = (ec) => {
    const calRows = ec.calendario.map((r) => {
      const cls = r.estado === 'vencido' ? 'vencido' : (r.estado === 'pendiente' ? 'pend' : '');
      const concepto = r.estado === 'vencido' ? 'Mensualidad vencida (no pagó)'
        : (r.estado === 'pendiente' ? 'Mensualidad por pagar' : esc(r.concepto));
      return `<tr class="${cls}">
        <td>${r.estado === 'pagado' ? prettyDate(r.fecha) : mesLabel(r.fecha)}</td>
        <td>${concepto}</td>
        <td>${r.estado === 'pagado' ? esc(r.metodo || '—') : '—'}</td>
        <td class="num">${money(r.monto)}</td>
      </tr>`;
    }).join('');
    const st = cobranzaStatus(ec.atrasoMeses, ec.adelantado);
    return `
      <div class="lote">
        <div class="lote-head">
          <h3>Lote ${esc(ec.cliente.lotes[0])}</h3>
          <span class="pill ${ec.atrasoMeses > 0 ? 'bad' : 'ok'}">${st.label}${ec.atrasoMeses > 0 && ec.atrasoMeses < MESES_CANCELACION ? ` (${ec.atrasoMeses} mes${ec.atrasoMeses > 1 ? 'es' : ''})` : (ec.atrasoMeses >= MESES_CANCELACION ? ` · ${ec.atrasoMeses} meses de atraso` : '')}</span>
        </div>
        <div class="cols">
          <div>
            <table class="kv">
              ${fila('Precio', money(ec.precioTotal))}
              ${fila('Enganche' + (ec.fechaEnganche ? ` (${prettyDate(ec.fechaEnganche)})` : ''), money(ec.enganche))}
              ${fila('Total pagado', money(ec.totalPagado))}
              ${fila('Intereses / recargos', money(ec.intereses))}
              ${fila('Saldo pendiente', `<span class="saldo">${money(ec.saldo)}</span>`)}
            </table>
          </div>
          <div>
            <table class="kv">
              ${fila('Mensualidad', ec.mensualidad ? money(ec.mensualidad) : '—')}
              ${fila('Plazo total', ec.plazo ? `${ec.plazo} meses` : '—')}
              ${fila('Mensualidades pagadas', `${ec.mesesPagados} de ${ec.plazo || '—'}`)}
              ${fila('Mensualidades por pagar', `${ec.mesesRestantes}${ec.atrasoMeses > 0 ? ` · ${ec.atrasoMeses} vencida(s)` : ''}`)}
              ${fila('Próximo vencimiento', ec.proximoVencimiento ? prettyDate(ec.proximoVencimiento) : '—')}
            </table>
          </div>
        </div>
        <div class="grid"><table>
          <thead><tr><th>Periodo</th><th>Concepto</th><th>Método</th><th class="num">Monto</th></tr></thead>
          <tbody>${calRows || '<tr><td colspan="4" class="muted">Sin pagos registrados</td></tr>'}</tbody>
        </table></div>
      </div>`;
  };

  // Lotes ordenados: primero el seleccionado, luego por mayor atraso.
  const cuentas = cli.cuentas.slice().sort((a, b) =>
    (a.cliente.lotes[0] === sel.lote ? -1 : 0) - (b.cliente.lotes[0] === sel.lote ? -1 : 0)
    || b.atrasoMeses - a.atrasoMeses);

  const resumenLotes = variosLotes ? `
    <h2>Resumen de lotes (${cli.numLotes})</h2>
    <div class="grid"><table>
      <thead><tr><th>Lote</th><th class="num">Precio</th><th class="num">Pagado</th><th class="num">Saldo</th><th>Atraso</th></tr></thead>
      <tbody>
        ${cuentas.map((ec) => `<tr class="${ec.atrasoMeses > 0 ? 'vencido' : ''}">
          <td>${esc(ec.cliente.lotes[0])}</td>
          <td class="num">${money(ec.precioTotal)}</td>
          <td class="num">${money(ec.totalPagado)}</td>
          <td class="num">${money(ec.saldo)}</td>
          <td>${ec.atrasoMeses > 0 ? `${ec.atrasoMeses} mes(es)${ec.atrasoMeses >= MESES_CANCELACION ? ' · Cancelado' : ''}` : 'Al corriente'}</td>
        </tr>`).join('')}
        <tr class="tot"><td>TOTAL</td><td class="num">${money(cli.precioTotal)}</td><td class="num">${money(cli.pagadoTotal)}</td><td class="num">${money(cli.deudaTotal)}</td><td></td></tr>
      </tbody>
    </table></div>` : '';

  const notasRows = notas.length
    ? notas.map((n) => `<li><b>${prettyDate(n.fecha)}</b> · ${esc(n.usuario || '')}<br>${esc(n.texto)}</li>`).join('')
    : '<li class="muted">Sin notas registradas.</li>';

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
    <title>Estado de cuenta — ${esc(c.nombre || '')}</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #1f2937; margin: 32px; font-size: 13px; }
      h1 { font-size: 20px; margin: 0; }
      h2 { font-size: 14px; margin: 22px 0 8px; border-bottom: 2px solid #e5e7eb; padding-bottom: 4px; }
      h3 { font-size: 13px; margin: 0; }
      .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #f59e0b; padding-bottom: 12px; }
      .brand { font-size: 12px; color: #92400e; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
      .muted { color: #6b7280; }
      .sub { color: #6b7280; font-size: 12px; margin-top: 4px; }
      .pill { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
      .pill.ok { background: #dcfce7; color: #166534; }
      .pill.bad { background: #fee2e2; color: #991b1b; }
      .deuda { margin: 14px 0; padding: 10px 14px; background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; }
      .deuda .big { font-size: 18px; font-weight: 700; color: #b91c1c; }
      .cols { display: flex; gap: 24px; }
      .cols > div { flex: 1; }
      table { width: 100%; border-collapse: collapse; }
      .kv td { padding: 4px 0; }
      .kv .lbl { color: #6b7280; }
      .kv .val { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
      .grid { margin-top: 8px; }
      .grid table { font-size: 12px; }
      .grid th, .grid td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #eee; }
      .grid th { background: #f9fafb; color: #6b7280; }
      .grid .num { text-align: right; font-variant-numeric: tabular-nums; }
      tr.vencido td { background: #fef2f2; color: #991b1b; font-weight: 600; }
      tr.pend td { color: #9ca3af; }
      tr.tot td { background: #f3f4f6; font-weight: 700; border-top: 2px solid #d1d5db; }
      .saldo { color: #b91c1c; font-weight: 700; }
      .lote { margin-top: 18px; padding: 12px 14px; border: 1px solid #e5e7eb; border-radius: 8px; page-break-inside: avoid; }
      .lote-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
      ul { padding-left: 18px; } li { margin-bottom: 6px; }
      .foot { margin-top: 28px; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 8px; }
      @media print { body { margin: 12mm; } }
    </style></head><body>
    <div class="head">
      <div>
        <div class="brand">Administración Las Maravillas</div>
        <h1>Estado de cuenta</h1>
        <div class="sub">Generado el ${hoy}${getSession()?.name ? ` · por ${esc(getSession().name)}` : ''}</div>
      </div>
      <div style="text-align:right">
        <span class="pill ${atrasoMax > 0 ? 'bad' : 'ok'}">${atrasoMax >= MESES_CANCELACION ? `Cancelado · ${atrasoMax} meses de atraso` : (atrasoMax > 0 ? `${atrasoMax} mes(es) de atraso` : 'Al corriente')}</span>
      </div>
    </div>

    <h2>Cliente</h2>
    <table class="kv">
      ${fila('Nombre', esc(c.nombre || ''))}
      ${fila(variosLotes ? 'Lotes' : 'Lote', esc(cli.cuentas.map((x) => x.cliente.lotes[0]).join(', ')))}
      ${fila('Vendedor', esc(c.vendedor || '—'))}
      ${fila('Teléfono', esc(c.telefono || '—'))}
    </table>

    <div class="deuda">
      <span>Deuda total del cliente${variosLotes ? ` (${cli.numLotes} lotes)` : ''}</span>
      <span class="big">${money(cli.deudaTotal)}</span>
    </div>

    ${resumenLotes}

    <h2>Detalle por lote</h2>
    ${cuentas.map(seccionLote).join('')}

    <h2>Notas de seguimiento</h2>
    <ul>${notasRows}</ul>

    <div class="foot">Documento informativo generado por el sistema Administración Las Maravillas. Saldos al corte y deltas en vivo del control diario.</div>
    <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 250); };<\/script>
  </body></html>`;

  const w = window.open('', '_blank');
  if (!w) { toast('Permite las ventanas emergentes para generar el informe', 'error'); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
