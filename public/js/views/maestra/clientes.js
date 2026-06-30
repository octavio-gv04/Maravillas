/**
 * views/maestra/clientes.js — Padrón de clientes de Etapa 3 (derivado de pagos).
 * Búsqueda, filtros (estado/vendedor) y acceso a la vista 360° (estado de cuenta).
 * Los clientes NO se capturan: surgen automáticamente de los ingresos del Diario.
 */

import { subscribe } from '../../store.js';
import { clientes, etapaActiva, etapaBar, wireEtapaBar } from '../../maestra.js';
import { money, esc, prettyDate } from '../../utils.js';
import { card, empty, sectionHead } from '../../ui.js';
import { navigate } from '../../router.js';

// Estado en texto de color (mismo estilo que la columna Estado de Vista General):
// verde "Al corriente" / rojo "Moroso · N m" (con los meses de atraso) / verde "Liquidado".
const estadoBadge = (estado, atrasoMeses = 0) => {
  if (estado === 'Moroso') {
    return `<span class="text-red-600 font-medium">Moroso${atrasoMeses > 0 ? ` · ${atrasoMeses} m` : ''}</span>`;
  }
  const label = { Activo: 'Al corriente', Liquidado: 'Liquidado' }[estado] || estado;
  return `<span class="text-green-600">${esc(label)}</span>`;
};

export function render(container) {
  let q = '', fEstado = '', fVendedor = '';

  const draw = () => {
    const all = clientes();
    const vendedores = [...new Set(all.map((c) => c.vendedor).filter(Boolean))].sort();

    const list = all.filter((c) =>
      (!q || c.nombre.toLowerCase().includes(q.toLowerCase()) || c.lotes.join(' ').toLowerCase().includes(q.toLowerCase()))
      && (!fEstado || c.estado === fEstado)
      && (!fVendedor || c.vendedor === fVendedor));

    const opt = (v, sel) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(v || '')}</option>`;

    container.innerHTML = `
      ${sectionHead(`Clientes — ${etapaActiva()}`, `<span class="text-sm text-gray-500 self-center">${list.length} de ${all.length}</span>`)}
      ${etapaBar()}
      <div class="grid sm:grid-cols-3 gap-2 mb-4">
        <input id="c-q" class="field" placeholder="Buscar nombre o lote…" value="${esc(q)}" />
        <select id="c-estado" class="field">
          <option value="">Todos los estados</option>
          ${['Activo', 'Moroso', 'Liquidado'].map((e) => opt(e, fEstado)).join('')}
        </select>
        <select id="c-vend" class="field">
          <option value="">Todos los vendedores</option>
          ${vendedores.map((v) => opt(v, fVendedor)).join('')}
        </select>
      </div>
      ${list.length ? card(`
        <div class="table-wrap" style="overflow:auto"><table class="w-full text-sm">
          <thead class="text-gray-500 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th class="px-3 py-2 font-medium text-left">Cliente</th>
              <th class="px-3 py-2 font-medium text-left">Lote(s)</th>
              <th class="px-3 py-2 font-medium text-left">Vendedor</th>
              <th class="px-3 py-2 font-medium text-right">Pagado</th>
              <th class="px-3 py-2 font-medium text-right">Saldo</th>
              <th class="px-3 py-2 font-medium text-left">Estado</th>
              <th class="px-3 py-2 font-medium text-left">Últ. pago</th>
              <th class="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            ${list.map((c) => `
              <tr class="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer" data-k="${esc(c.key)}">
                <td class="px-3 py-2 whitespace-nowrap font-medium">${esc(c.nombre)}</td>
                <td class="px-3 py-2 whitespace-nowrap text-gray-500">${esc(c.lotes.join(', ') || '—')}</td>
                <td class="px-3 py-2 whitespace-nowrap text-gray-500">${esc(c.vendedor || '—')}</td>
                <td class="px-3 py-2 whitespace-nowrap text-right tabular-nums text-green-600">${money(c.totalPagado)}</td>
                <td class="px-3 py-2 whitespace-nowrap text-right tabular-nums ${c.saldo > 0.01 ? 'text-red-600 font-medium' : 'text-gray-400'}">${money(c.saldo)}</td>
                <td class="px-3 py-2 whitespace-nowrap">${estadoBadge(c.estado, c.atrasoMeses)}</td>
                <td class="px-3 py-2 whitespace-nowrap text-gray-500">${c.ultimoPago ? prettyDate(c.ultimoPago) : '—'}</td>
                <td class="px-3 py-2 whitespace-nowrap text-right text-brand">Ver →</td>
              </tr>`).join('')}
          </tbody>
        </table></div>
      `) : empty('Sin clientes que coincidan con el filtro')}
    `;

    const redraw = () => draw();
    wireEtapaBar(container, draw);
    const qi = container.querySelector('#c-q');
    qi.addEventListener('input', (e) => {
      q = e.target.value;
      draw();
      const s = container.querySelector('#c-q');
      s.focus(); s.setSelectionRange(s.value.length, s.value.length); // cursor al final (evita texto invertido)
    });
    container.querySelector('#c-estado').addEventListener('change', (e) => { fEstado = e.target.value; redraw(); });
    container.querySelector('#c-vend').addEventListener('change', (e) => { fVendedor = e.target.value; redraw(); });
    container.querySelectorAll('[data-k]').forEach((tr) =>
      tr.addEventListener('click', () => navigate('m/estado-cuenta', { k: tr.dataset.k })));
  };

  draw();
  const unsub = subscribe(draw);
  return unsub;
}
