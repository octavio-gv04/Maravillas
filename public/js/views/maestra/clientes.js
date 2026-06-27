/**
 * views/maestra/clientes.js — Padrón de clientes de Etapa 3 (derivado de pagos).
 * Búsqueda, filtros (estado/vendedor) y acceso a la vista 360° (estado de cuenta).
 * Los clientes NO se capturan: surgen automáticamente de los ingresos del Diario.
 */

import { subscribe } from '../../store.js';
import { clientes, etapaActiva } from '../../maestra.js';
import { money, esc, prettyDate } from '../../utils.js';
import { card, badge, empty, sectionHead } from '../../ui.js';
import { navigate } from '../../router.js';

const estadoBadge = (estado) => ({
  Liquidado: badge('green', 'Liquidado'),
  Activo: badge('green', 'Al corriente'),
  Moroso: badge('red', 'Moroso'),
}[estado] || badge('yellow', estado));

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
        <div class="table-wrap"><table class="w-full text-sm">
          <thead class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th class="py-2">Cliente</th><th>Lote(s)</th><th>Vendedor</th>
              <th class="text-right">Pagado</th><th class="text-right">Saldo</th>
              <th>Estado</th><th>Últ. pago</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${list.map((c) => `
              <tr class="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer" data-k="${esc(c.key)}">
                <td class="py-2 font-medium">${esc(c.nombre)}</td>
                <td class="text-gray-500">${esc(c.lotes.join(', ') || '—')}</td>
                <td class="text-gray-500">${esc(c.vendedor || '—')}</td>
                <td class="text-right tabular-nums text-green-600">${money(c.totalPagado)}</td>
                <td class="text-right tabular-nums ${c.saldo > 0.01 ? 'text-red-600 font-medium' : 'text-gray-400'}">${money(c.saldo)}</td>
                <td>${estadoBadge(c.estado)}</td>
                <td class="text-gray-500">${c.ultimoPago ? prettyDate(c.ultimoPago) : '—'}</td>
                <td class="text-right text-brand">Ver →</td>
              </tr>`).join('')}
          </tbody>
        </table></div>
      `) : empty('Sin clientes que coincidan con el filtro')}
    `;

    const redraw = () => draw();
    const qi = container.querySelector('#c-q');
    qi.addEventListener('input', (e) => { q = e.target.value; draw(); container.querySelector('#c-q').focus(); });
    container.querySelector('#c-estado').addEventListener('change', (e) => { fEstado = e.target.value; redraw(); });
    container.querySelector('#c-vend').addEventListener('change', (e) => { fVendedor = e.target.value; redraw(); });
    container.querySelectorAll('[data-k]').forEach((tr) =>
      tr.addEventListener('click', () => navigate('m/estado-cuenta', { k: tr.dataset.k })));
  };

  draw();
  const unsub = subscribe(draw);
  return unsub;
}
