/**
 * views/maestra/cobranza.js — Cartera segmentada por antigüedad de atraso.
 * Tarjetas por segmento (1-30, 31-60, 61-90, >90) + tabla de morosos con acceso
 * al estado de cuenta. Cálculo automático del estatus (Regla de Oro: deriva del Diario).
 */

import { subscribe } from '../../store.js';
import { cobranza, etapaActiva } from '../../maestra.js';
import { money, esc, prettyDate } from '../../utils.js';
import { card, badge, empty, sectionHead, btnGhost } from '../../ui.js';
import { navigate } from '../../router.js';

export function render(container) {
  let fSeg = '';

  const draw = () => {
    const cob = cobranza();
    const morosos = cob.segmentos.flatMap((s) => s.key === 'corriente' ? [] : s.clientes.map((c) => ({ ...c, seg: s })));
    const list = fSeg ? morosos.filter((c) => c.bucket.key === fSeg) : morosos;

    const tarjetas = cob.segmentos.map((s) => {
      const col = { green: 'border-green-500 text-green-600', yellow: 'border-amber-500 text-amber-600', red: 'border-red-500 text-red-600' }[s.color];
      const active = fSeg === s.key;
      return `<button data-seg="${s.key}" class="text-left bg-white dark:bg-gray-800 rounded-xl border-l-4 ${col.split(' ')[0]} border border-gray-200 dark:border-gray-700 p-3 ${active ? 'ring-2 ring-brand' : ''} hover:shadow-md transition">
        <p class="text-[11px] uppercase tracking-wide text-gray-500">${esc(s.label)}</p>
        <p class="text-lg font-bold ${col.split(' ')[1]}">${s.clientes.length}</p>
        <p class="text-xs text-gray-500 tabular-nums">${money(s.total)}</p>
      </button>`;
    }).join('');

    container.innerHTML = `
      ${sectionHead(`Cobranza — ${etapaActiva()}`, `
        <span class="text-sm self-center">Cartera total: <strong class="tabular-nums">${money(cob.totalCartera)}</strong> · Vencido: <strong class="text-red-600 tabular-nums">${money(cob.porCobrarVencido)}</strong></span>`)}

      <div class="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-3 mb-4">${tarjetas}</div>

      ${list.length ? card(`
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold">Clientes con atraso ${fSeg ? `· ${esc(cob.segmentos.find((s) => s.key === fSeg)?.label)}` : ''}</h3>
          ${fSeg ? btnGhost('Ver todos', 'id="clear"') : ''}
        </div>
        <div class="table-wrap"><table class="w-full text-sm">
          <thead class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
            <tr><th class="py-2">Cliente</th><th>Lote(s)</th><th>Vendedor</th><th class="text-right">Saldo</th><th class="text-right">Atraso</th><th>Segmento</th><th>Últ. pago</th></tr>
          </thead>
          <tbody>
            ${list.sort((a, b) => b.atrasoMeses - a.atrasoMeses).map((c) => `
              <tr class="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer" data-k="${esc(c.key)}">
                <td class="py-2 font-medium">${esc(c.nombre)}</td>
                <td class="text-gray-500">${esc(c.lotes.join(', ') || '—')}</td>
                <td class="text-gray-500">${esc(c.vendedor || '—')}</td>
                <td class="text-right tabular-nums text-red-600 font-medium">${money(c.saldo)}</td>
                <td class="text-right tabular-nums">${c.atrasoMeses} mes(es)</td>
                <td>${badge(c.bucket.color, c.bucket.label)}</td>
                <td class="text-gray-500">${c.ultimoPago ? prettyDate(c.ultimoPago) : '—'}</td>
              </tr>`).join('')}
          </tbody>
        </table></div>
      `) : empty('No hay clientes con atraso en este segmento')}
    `;

    container.querySelectorAll('[data-seg]').forEach((b) =>
      b.addEventListener('click', () => { fSeg = b.dataset.seg === 'corriente' ? '' : (fSeg === b.dataset.seg ? '' : b.dataset.seg); draw(); }));
    container.querySelector('#clear')?.addEventListener('click', () => { fSeg = ''; draw(); });
    container.querySelectorAll('[data-k]').forEach((tr) =>
      tr.addEventListener('click', () => navigate('m/estado-cuenta', { k: tr.dataset.k })));
  };

  draw();
  const unsub = subscribe(draw);
  return unsub;
}
