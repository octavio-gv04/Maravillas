/**
 * views/maestra/reportes.js — Reportes ejecutivos de Etapa 3.
 * Tipos: clientes, cobranza, lotes, contratos, pagos (ingresos). Filtro por
 * periodo donde aplica. Exporta a CSV (PDF/Excel avanzados → Fase 2-4).
 */

import { subscribe, contratos } from '../../store.js';
import { clientes, cobranza, lotesResumen, pagosEtapa, etapaActiva } from '../../maestra.js';
import { money, esc, prettyDate, toast } from '../../utils.js';
import { card, empty, btn, sectionHead, select } from '../../ui.js';
import { svgIcon } from '../../icons.js';

const TIPOS = ['Clientes', 'Cobranza', 'Lotes', 'Contratos', 'Pagos'];

function datos(tipo, desde, hasta) {
  if (tipo === 'Clientes') {
    return {
      head: ['Cliente', 'Lote(s)', 'Vendedor', 'Pagado', 'Saldo', 'Estado'],
      rows: clientes().map((c) => [c.nombre, c.lotes.join(' / '), c.vendedor, c.totalPagado, c.saldo, c.estado]),
      money: [3, 4],
    };
  }
  if (tipo === 'Cobranza') {
    const rows = [];
    cobranza().segmentos.forEach((s) => s.clientes.forEach((c) =>
      rows.push([c.nombre, c.lotes.join(' / '), c.saldo, c.atrasoMeses, s.label, c.ultimoPago])));
    return { head: ['Cliente', 'Lote(s)', 'Saldo', 'Atraso (meses)', 'Segmento', 'Último pago'], rows, money: [2] };
  }
  if (tipo === 'Lotes') {
    return {
      head: ['Lote', 'Manzana', 'Cliente', 'Precio', 'Abonado', 'Saldo', 'Estado'],
      rows: lotesResumen().map((l) => [l.numero, l.manzana, l.cliente, l.precio, l.abonado, l.saldo, l.estado]),
      money: [3, 4, 5],
    };
  }
  if (tipo === 'Contratos') {
    return {
      head: ['Folio', 'Cliente', 'Lote', 'Firma', 'Precio', 'Enganche', 'Plazo', 'Estado'],
      rows: contratos.all().map((c) => [c.folio, c.cliente, c.lote, c.fechaFirma, c.precio, c.enganche, c.plazo, c.estado]),
      money: [4, 5],
    };
  }
  // Pagos (ingresos del Diario, Etapa 3) filtrados por periodo.
  const pagos = pagosEtapa().filter((p) => (!desde || p.fecha >= desde) && (!hasta || p.fecha <= hasta));
  return {
    head: ['Fecha', 'Recibo', 'Cliente', 'Lote', 'Concepto', 'Método', 'Monto', 'Saldo'],
    rows: pagos.map((p) => [p.fecha, p.recibo, p.cliente, p.lote, p.categoria, p.metodo, p.monto, p.saldo]),
    money: [6, 7], periodo: true,
  };
}

export function render(container) {
  let tipo = 'Clientes', desde = '', hasta = '';

  const draw = () => {
    const d = datos(tipo, desde, hasta);
    const isMoney = (i) => d.money?.includes(i);
    const total = (d.money || []).reduce((acc, col) => {
      acc[col] = d.rows.reduce((s, r) => s + (Number(r[col]) || 0), 0); return acc;
    }, {});

    container.innerHTML = `
      ${sectionHead(`Reportes — ${etapaActiva()}`, btn(`${svgIcon('download', 'w-4 h-4 inline')} Exportar CSV`, 'id="csv"'), 'chartBar', 'bg-violet-500')}
      <div class="grid sm:grid-cols-4 gap-2 mb-4">
        ${select({ label: 'Tipo de reporte', name: 'tipo', options: TIPOS, value: tipo })}
        ${d.periodo ? `
          <label class="block"><span class="text-xs font-medium text-gray-600 dark:text-gray-300">Desde</span>
            <input class="field mt-1" type="date" id="desde" value="${desde}" /></label>
          <label class="block"><span class="text-xs font-medium text-gray-600 dark:text-gray-300">Hasta</span>
            <input class="field mt-1" type="date" id="hasta" value="${hasta}" /></label>` : ''}
        <div class="flex items-end text-sm text-gray-500">${d.rows.length} registros</div>
      </div>
      ${d.rows.length ? card(`
        <div class="table-wrap"><table class="w-full text-sm">
          <thead class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
            <tr>${d.head.map((h, i) => `<th class="py-2 ${isMoney(i) ? 'text-right' : ''}">${esc(h)}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${d.rows.map((r) => `<tr class="border-b border-gray-100 dark:border-gray-700/50">
              ${r.map((v, i) => `<td class="py-1.5 ${isMoney(i) ? 'text-right tabular-nums' : ''}">${isMoney(i) ? money(v) : esc(v || '—')}</td>`).join('')}
            </tr>`).join('')}
          </tbody>
          ${(d.money || []).length ? `<tfoot><tr class="font-semibold border-t-2 border-gray-200 dark:border-gray-700">
            ${d.head.map((h, i) => `<td class="py-2 ${isMoney(i) ? 'text-right tabular-nums' : ''}">${i === 0 ? 'Totales' : (isMoney(i) ? money(total[i]) : '')}</td>`).join('')}
          </tr></tfoot>` : ''}
        </table></div>
      `) : empty('Sin datos para este reporte')}
    `;

    container.querySelector('[name=tipo]').addEventListener('change', (e) => { tipo = e.target.value; draw(); });
    container.querySelector('#desde')?.addEventListener('change', (e) => { desde = e.target.value; draw(); });
    container.querySelector('#hasta')?.addEventListener('change', (e) => { hasta = e.target.value; draw(); });
    container.querySelector('#csv').addEventListener('click', () => {
      const lines = [d.head, ...d.rows].map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','));
      const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `reporte-${tipo.toLowerCase()}-${etapaActiva().replace(/\s+/g, '_')}.csv`; a.click();
      toast('Reporte exportado (CSV)', 'success');
    });
  };

  draw();
  const unsub = subscribe(draw);
  return unsub;
}
