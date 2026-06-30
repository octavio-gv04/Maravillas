/**
 * views/maestra/general.js — Vista General de la etapa (réplica de la hoja GENERAL).
 *
 * Una sola pantalla con la "vista de pájaro" de toda la etapa: bloque de
 * indicadores + tabla maestra (una fila por lote). NO captura ni guarda datos
 * propios: es otro LENTE sobre el motor de la Maestra (lotesResumen + cobranza),
 * filtrado por la etapa activa. Clic en una fila → estado de cuenta del cliente.
 */

import { subscribe } from '../../store.js';
import { lotesResumen, cobranza, etapaActiva, etapaBar, wireEtapaBar } from '../../maestra.js';
import { money, esc, prettyDate, toast } from '../../utils.js';
import { card, empty, btn, btnGhost, sectionHead } from '../../ui.js';
import { svgIcon } from '../../icons.js';
import { navigate } from '../../router.js';

const low = (s) => String(s ?? '').trim().toLowerCase();
const cleanVend = (v) => (!v || /^seleccionar$/i.test(String(v).trim())) ? '' : v;
const tel = (t) => (t && t !== 'Sin Registro') ? t : '';

const estadoBadge = (e) => {
  const m = {
    Vendido: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    Disponible: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    Apartado: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    Inactivo: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    Cancelado: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  };
  return `<span class="inline-block px-2 py-0.5 rounded-full text-xs font-medium ${m[e] || m.Inactivo}">${esc(e || '—')}</span>`;
};

// Columnas de la tabla maestra. `full: true` solo se muestran con "Ver todas".
const COLS = [
  { key: 'numero', label: 'Clave', sticky: true, cell: (l) => `<span class="font-mono text-xs">${esc(l.numero)}</span>` },
  { key: 'estado', label: 'Estado', cell: (l) => estadoBadge(l.estado) },
  { key: 'cliente', label: 'Cliente', cell: (l) => esc(l.cliente || '—') },
  { key: 'vendedor', label: 'Vendedor', muted: true, cell: (l) => esc(cleanVend(l.vendedor) || '—') },
  { key: 'tipo', label: 'Tipo', full: true, muted: true, cell: (l) => esc(l.tipo || '—') },
  { key: 'superficie', label: 'm²', full: true, align: 'right', muted: true, cell: (l) => l.superficie ? esc(l.superficie) : '—' },
  { key: 'telefono', label: 'Teléfono', full: true, muted: true, cell: (l) => esc(tel(l.telefono) || '—') },
  { key: 'precio', label: 'Precio', align: 'right', cell: (l) => l.precio ? money(l.precio) : '—' },
  { key: 'enganche', label: 'Enganche', full: true, align: 'right', cell: (l) => l.enganche ? money(l.enganche) : '—' },
  { key: 'abonado', label: 'Pagó', align: 'right', cls: 'text-green-600', cell: (l) => money(l.abonado) },
  { key: 'saldo', label: 'Debe', align: 'right', cell: (l) => `<span class="${l.saldo > 0.01 ? 'text-red-600 font-medium' : 'text-gray-400'}">${money(l.saldo)}</span>` },
  { key: 'mensualidad', label: 'Mens.', align: 'right', cell: (l) => l.mensualidad ? money(l.mensualidad) : '—' },
  { key: 'plazo', label: 'Plazo', full: true, align: 'right', muted: true, cell: (l) => l.plazo ? esc(l.plazo) : '—' },
  { key: 'atraso', label: 'Atraso', cell: (l) => l.retrasoMeses > 0
      ? `<span class="text-red-600">${l.retrasoMeses} m</span>`
      : (low(l.estado) === 'vendido' ? '<span class="text-green-600">Al corriente</span>' : '<span class="text-gray-400">—</span>') },
  { key: 'comisionPct', label: '% Com.', full: true, align: 'right', muted: true, cell: (l) => l.comisionPct ? l.comisionPct + '%' : '—' },
  { key: 'tipoPago', label: 'Pago', full: true, muted: true, cell: (l) => esc(l.tipoPago || '—') },
  { key: 'fechaVenta', label: 'Venta', full: true, muted: true, cell: (l) => l.fechaVenta ? prettyDate(l.fechaVenta) : '—' },
  { key: 'fechaTermino', label: 'Término', full: true, muted: true, cell: (l) => l.fechaTermino ? prettyDate(l.fechaTermino) : '—' },
];

// Encabezado plano para exportar a CSV (todas las columnas, valores crudos).
const CSV_HEAD = ['Clave', 'Tipo', 'Superficie', 'Precio', 'Estado', 'Cliente', 'Telefono',
  'Vendedor', '% Comision', 'Tipo de pago', 'Enganche', 'Mensualidad', 'Plazo',
  'Pago', 'Saldo', 'Atraso (meses)', 'Fecha venta', 'Fecha termino'];
const csvRow = (l) => [l.numero, l.tipo, l.superficie, l.precio, l.estado, l.cliente, tel(l.telefono),
  cleanVend(l.vendedor), l.comisionPct, l.tipoPago, l.enganche, l.mensualidad, l.plazo,
  l.abonado, l.saldo, l.retrasoMeses, l.fechaVenta, l.fechaTermino];

export function render(container) {
  let q = '';
  let fEstado = '';
  let full = false;

  const draw = () => {
    const filas = lotesResumen();
    const cob = cobranza();

    // Resumen de la etapa (deriva de los mismos datos, garantiza consistencia).
    const vendidos = filas.filter((l) => low(l.estado) === 'vendido');
    const total = filas.length;
    const nVend = vendidos.length;
    const nDisp = filas.filter((l) => low(l.estado) === 'disponible').length;
    const nInac = filas.filter((l) => low(l.estado) === 'inactivo').length;
    const ventaTotal = vendidos.reduce((a, l) => a + (Number(l.precio) || 0), 0);
    const cobrado = filas.reduce((a, l) => a + (Number(l.abonado) || 0), 0);
    const saldoTotal = filas.reduce((a, l) => a + (Number(l.saldo) || 0), 0);
    const pctCob = ventaTotal ? Math.round((cobrado / ventaTotal) * 100) : 0;
    const pctVend = total ? Math.round((nVend / total) * 100) : 0;

    // Filtros de la tabla.
    const list = filas.filter((l) =>
      (!fEstado || low(l.estado) === low(fEstado))
      && (!q || low(l.numero).includes(low(q)) || low(l.cliente).includes(low(q)) || low(cleanVend(l.vendedor)).includes(low(q))));

    const cols = full ? COLS : COLS.filter((c) => !c.full);

    const kpi = (label, value, sub = '', cls = '') => `
      <div class="bg-gray-50 dark:bg-gray-800/60 rounded-xl p-3 overflow-hidden">
        <p class="text-xs text-gray-500 truncate">${esc(label)}</p>
        <p class="font-bold tabular-nums whitespace-nowrap ${cls}" style="font-size:clamp(0.95rem,1.7vw,1.3rem)">${value}</p>
        ${sub ? `<p class="text-[11px] text-gray-400 truncate">${sub}</p>` : ''}
      </div>`;

    const th = (c) => `<th class="px-3 py-2 font-medium ${c.align === 'right' ? 'text-right' : 'text-left'} ${c.sticky ? 'sticky left-0 z-10 bg-gray-50 dark:bg-gray-800' : ''}">${esc(c.label)}</th>`;
    const td = (c, l) => `<td class="px-3 py-2 whitespace-nowrap ${c.align === 'right' ? 'text-right tabular-nums' : ''} ${c.muted ? 'text-gray-500' : ''} ${c.cls || ''} ${c.sticky ? 'sticky left-0 bg-white dark:bg-gray-800' : ''}">${c.cell(l)}</td>`;

    const opt = (v, sel, label) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(label)}</option>`;

    container.innerHTML = `
      ${sectionHead(`Vista general — ${etapaActiva()}`, `
        ${btnGhost(`${full ? 'Menos columnas' : 'Ver todas las columnas'}`, 'id="toggle-cols"')}
        ${btn(`${svgIcon('download', 'w-4 h-4 inline')} Exportar CSV`, 'id="csv"')}
      `, 'list', 'bg-indigo-500')}
      ${etapaBar()}

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 md:gap-3 mb-4">
        ${kpi('Lotes', total)}
        ${kpi('Vendidos', nVend, `${pctVend}% del total`)}
        ${kpi('Disponibles', nDisp)}
        ${kpi('Inactivos', nInac)}
        ${kpi('Venta total', money(ventaTotal))}
        ${kpi('Cobrado', money(cobrado), `${pctCob}% cobranza`, 'text-green-600')}
        ${kpi('Saldo total', money(saldoTotal))}
        ${kpi('Vencido', money(cob.porCobrarVencido), '', 'text-red-600')}
      </div>

      <div class="grid sm:grid-cols-3 gap-2 mb-3">
        <input id="g-q" class="field" placeholder="Buscar clave, cliente o vendedor…" value="${esc(q)}" />
        <select id="g-estado" class="field">
          ${opt('', fEstado, 'Todos los estados')}
          ${['Vendido', 'Disponible', 'Apartado', 'Inactivo', 'Cancelado'].map((e) => opt(e, fEstado, e)).join('')}
        </select>
        <div class="flex items-center text-sm text-gray-500">${list.length} de ${total} lotes</div>
      </div>

      ${list.length ? card(`
        <div class="table-wrap" style="max-height:70vh;overflow:auto">
          <table class="w-full text-sm">
            <thead class="text-gray-500 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-gray-50 dark:bg-gray-800 z-20">
              <tr>${cols.map(th).join('')}</tr>
            </thead>
            <tbody>
              ${list.map((l) => `<tr class="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 ${l.cliente ? 'cursor-pointer' : ''}" ${l.cliente ? `data-k="${esc(low(l.cliente))}"` : ''}>
                ${cols.map((c) => td(c, l)).join('')}
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <p class="text-xs text-gray-400 mt-2">Una fila por lote · clic en una fila con cliente abre su estado de cuenta · ${full ? COLS.length : cols.length} de ${COLS.length} columnas</p>
      `, 'overflow-hidden') : empty('Sin lotes que coincidan con el filtro')}
    `;

    wireEtapaBar(container, () => { q = ''; fEstado = ''; draw(); });
    container.querySelector('#toggle-cols')?.addEventListener('click', () => { full = !full; draw(); });
    const qi = container.querySelector('#g-q');
    qi?.addEventListener('input', (e) => {
      q = e.target.value; draw();
      const s = container.querySelector('#g-q'); s.focus(); s.setSelectionRange(s.value.length, s.value.length);
    });
    container.querySelector('#g-estado')?.addEventListener('change', (e) => { fEstado = e.target.value; draw(); });
    container.querySelectorAll('[data-k]').forEach((tr) =>
      tr.addEventListener('click', () => navigate('m/estado-cuenta', { k: tr.dataset.k })));

    container.querySelector('#csv')?.addEventListener('click', () => {
      const lines = [CSV_HEAD, ...list.map(csvRow)]
        .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','));
      const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `vista-general-${etapaActiva().replace(/\s+/g, '_')}.csv`;
      a.click();
      toast('Vista general exportada (CSV)', 'success');
    });
  };

  draw();
  const unsub = subscribe(draw);
  return unsub;
}
