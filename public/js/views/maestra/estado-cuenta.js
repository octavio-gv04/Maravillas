/**
 * views/maestra/estado-cuenta.js — Vista 360° / estado de cuenta de un cliente.
 * Precio, enganche, total pagado, saldo, próximo vencimiento, intereses, atraso,
 * historial completo de pagos (derivado del Diario) y notas de cobranza.
 * Exporta a CSV. Todo automático; sin captura de pagos.
 */

import { subscribe, cobranza } from '../../store.js';
import { estadoCuenta, notasDe } from '../../maestra.js';
import { money, esc, prettyDate, todayISO, toast } from '../../utils.js';
import { card, badge, empty, btnGhost, sectionHead, cardTitle } from '../../ui.js';
import { svgIcon } from '../../icons.js';
import { navigate, queryParam } from '../../router.js';
import { getSession } from '../../auth.js';

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
  pagado:    { monto: 'text-green-600', concepto: (c) => esc(c), tag: '', row: '' },
  vencido:   { monto: 'text-red-600 font-semibold', concepto: () => 'Mensualidad vencida (no pagó)', tag: '', row: 'bg-red-50 dark:bg-red-900/10' },
  pendiente: { monto: 'text-gray-400', concepto: () => 'Mensualidad por pagar', tag: '', row: 'opacity-70' },
};

function exportarCSV(ec) {
  const rows = [['Fecha', 'Concepto', 'Método', 'Recibo', 'Monto', 'Saldo']];
  ec.pagos.forEach((p) => rows.push([p.fecha, p.categoria, p.metodo, p.recibo || '', p.monto, p.saldo ?? '']));
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `estado-cuenta-${ec.cliente.nombre.replace(/\s+/g, '_')}.csv`;
  a.click();
  toast('Estado de cuenta exportado (CSV)', 'success');
}

export function render(container) {
  const k = queryParam('k');

  const draw = () => {
    const ec = k ? estadoCuenta(k) : null;
    if (!ec) {
      container.innerHTML = `
        ${sectionHead('Estado de cuenta')}
        ${empty('Selecciona un cliente desde el módulo Clientes')}
        <div class="text-center mt-3">${btnGhost('← Ir a Clientes', 'id="go-cli"')}</div>`;
      container.querySelector('#go-cli')?.addEventListener('click', () => navigate('m/clientes'));
      return;
    }
    const c = ec.cliente;
    const fila = (l, v, cls = '') => `<div class="flex justify-between py-1.5 ${cls}"><span class="text-gray-500">${esc(l)}</span><span class="tabular-nums font-medium">${v}</span></div>`;
    const notas = notasDe(k);

    container.innerHTML = `
      <div class="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div class="flex items-center gap-2">
          ${btnGhost('←', 'id="back"')}
          <div>
            <h2 class="text-xl font-semibold">${esc(c.nombre)}</h2>
            <p class="text-sm text-gray-500">Lote(s): ${esc(c.lotes.join(', ') || '—')} · Vendedor: ${esc(c.vendedor || '—')}</p>
          </div>
        </div>
        <div class="flex items-center gap-2">${ec.adelantado ? badge('green', 'Adelantado') : estadoBadge(ec.estado)} ${btnGhost(`${svgIcon('download', 'w-4 h-4 inline')} CSV`, 'id="csv"')}</div>
      </div>

      ${c.lotes.length ? card(`
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <div class="flex items-center gap-2 text-sm">
            ${svgIcon('envelope', 'w-4 h-4 text-cyan-500')}
            <span class="font-medium">Revisión de sobre físico</span>
            <span class="text-gray-400 hidden sm:inline">— captura mes a mes lo que dice el sobre</span>
          </div>
          <div class="flex gap-2 flex-wrap">
            ${c.lotes.map((l) => btnGhost(`Revisar sobre ${esc(l)}`, `data-sobre="${esc(l)}"`)).join('')}
          </div>
        </div>
      `, 'mb-4') : ''}

      <div class="grid md:grid-cols-2 gap-4">
        ${card(`
          <h3 class="font-semibold mb-2">Resumen financiero</h3>
          ${fila('Precio total del lote', money(ec.precioTotal))}
          ${fila('Enganche' + (ec.fechaEnganche ? ` (${prettyDate(ec.fechaEnganche)})` : ''), money(ec.enganche))}
          ${fila('Total pagado a la fecha', money(ec.totalPagado))}
          ${fila('Intereses / recargos', money(ec.intereses))}
          ${fila('Saldo pendiente', money(ec.saldo), 'border-t-2 border-gray-200 dark:border-gray-700 mt-1 pt-2 text-lg ' + (ec.saldo > 0.01 ? 'text-red-600' : 'text-green-600'))}
        `)}
        ${card(`
          <h3 class="font-semibold mb-2">Cobranza</h3>
          ${fila('Estado', ec.adelantado ? 'Adelantado' : ec.estado)}
          ${fila('Atraso', ec.atrasoMeses > 0
            ? `${ec.atrasoMeses} mes(es) · ${ec.bucket.label}`
            : (ec.adelantado ? `✅ Adelantado${ec.adelantoMeses >= 1 ? ` ${Math.floor(ec.adelantoMeses)} mensualidad(es)` : ''}` : 'Al corriente'))}
          ${ec.adelantado ? fila('Pago adelantado', money(ec.excedenteAdelanto), 'text-green-600') : ''}
          ${fila('Próximo vencimiento', ec.proximoVencimiento ? prettyDate(ec.proximoVencimiento) : '—')}
          ${fila('Mensualidad (contrato)', ec.mensualidad ? money(ec.mensualidad) : '—')}
          ${fila('Plazo total', ec.plazo ? `${ec.plazo} meses` : '—')}
          ${fila('Mensualidades pagadas', `${ec.mesesPagados} de ${ec.plazo || '—'}`, 'text-green-600')}
          ${fila('Mensualidades por pagar', `${ec.mesesRestantes}${ec.atrasoMeses > 0 ? ` · ${ec.atrasoMeses} vencida(s)` : ''}`, ec.atrasoMeses > 0 ? 'text-red-600' : 'text-gray-600 dark:text-gray-300')}
          ${ec.plazo ? `<div class="mt-2 h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div class="h-full bg-green-500" style="width:${Math.min(100, Math.round((ec.mesesPagados / ec.plazo) * 100))}%"></div>
          </div><p class="text-[11px] text-gray-400 mt-1 text-right">${Math.min(100, Math.round((ec.mesesPagados / ec.plazo) * 100))}% pagado</p>` : ''}
          ${ec.cliente.contrato ? `<p class="text-xs text-gray-400 mt-2">📄 Contrato ${esc(ec.cliente.contrato.folio || '')}</p>` : '<p class="text-xs text-amber-500 mt-2">Sin contrato registrado · valores derivados de pagos</p>'}
        `)}
      </div>

      <div class="mt-4">${card(`
        ${cardTitle('receipt', 'Historial de pagos (mes a mes)', 'bg-teal-500', 'mb-1')}
        <div class="flex flex-wrap gap-3 text-xs mb-3">
          <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-green-500"></span>Pagos: ${ec.calendario.filter((r) => r.estado === 'pagado').length}</span>
          <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-red-500"></span>Meses vencidos (debe): ${ec.calendario.filter((r) => r.estado === 'vencido').length}</span>
          <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-gray-400"></span>Meses por pagar: ${ec.calendario.filter((r) => r.estado === 'pendiente').length}</span>
        </div>
        ${ec.calendario.length ? `
        <div class="table-wrap" style="max-height:420px;overflow-y:auto"><table class="w-full text-sm">
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
        </table></div>
        <p class="text-xs text-gray-400 mt-2">Pagos reales en verde · meses vencidos (no pagados) en rojo con lo que debe · mensualidades futuras en gris.</p>
        ` : empty('Sin pagos registrados')}
      `)}</div>

      <div class="mt-4">${card(`
        ${cardTitle('phone', 'Notas de seguimiento de cobranza', 'bg-amber-500')}
        <form id="nota-form" class="flex gap-2 mb-3">
          <input class="field flex-1" name="texto" placeholder="Registrar contacto / compromiso de pago…" required />
          <button class="bg-brand hover:bg-brand-dark text-white px-4 rounded-lg text-sm" type="submit">Agregar</button>
        </form>
        ${notas.length ? `<ul class="space-y-2">${notas.map((n) => `
          <li class="text-sm border-l-2 border-brand pl-3 py-0.5">
            <span class="text-gray-400 text-xs">${prettyDate(n.fecha)} · ${esc(n.usuario || '')}</span><br>${esc(n.texto)}
          </li>`).join('')}</ul>` : '<p class="text-sm text-gray-400">Sin notas todavía.</p>'}
      `)}</div>
    `;

    container.querySelector('#back').addEventListener('click', () => navigate('m/clientes'));
    container.querySelector('#csv').addEventListener('click', () => exportarCSV(ec));
    container.querySelectorAll('[data-sobre]').forEach((b) =>
      b.addEventListener('click', () => navigate('sobres', { lote: b.dataset.sobre })));
    container.querySelector('#nota-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const texto = e.target.texto.value.trim();
      if (!texto) return;
      try {
        await cobranza.create({ clienteKey: k, cliente: c.nombre, texto, fecha: todayISO(), usuario: getSession()?.name || '' });
        toast('Nota guardada', 'success');
      } catch (err) { toast(err.message || 'No se pudo guardar', 'error'); }
    });
  };

  draw();
  const unsub = subscribe(draw);
  return unsub;
}
