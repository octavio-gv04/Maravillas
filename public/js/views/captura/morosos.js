/**
 * views/captura/morosos.js — Seguimiento de clientes morosos para CAPTURA DIARIA.
 *
 * Versión acotada de la Cobranza de la Maestra pensada para Hillary: deriva el
 * atraso de la misma lógica (`cobranza()` por etapa activa) pero NO muestra
 * totales de cartera (vencido global, montos por segmento). Sí muestra el saldo
 * y el atraso POR CLIENTE —operativo, necesario para cobrar— y permite registrar
 * notas de gestión sin abrir la Base de Datos Maestra (su rol no tiene acceso).
 */

import { subscribe, cobranza as notasStore } from '../../store.js';
import { cobranza, notasDe, etapaActiva } from '../../maestra.js';
import { money, esc, prettyDate, todayISO, toast } from '../../utils.js';
import { card, badge, empty, sectionHead } from '../../ui.js';
import { getSession } from '../../auth.js';

export function render(container) {
  let fSeg = '';     // segmento filtrado (key de bucket) o '' = todos
  let selKey = '';   // cliente seleccionado para ver/registrar notas

  const draw = () => {
    const cob = cobranza();
    const morosos = cob.segmentos.flatMap((s) =>
      s.key === 'corriente' ? [] : s.clientes.map((c) => ({ ...c, seg: s })));
    const list = fSeg ? morosos.filter((c) => c.bucket.key === fSeg) : morosos;

    // Tarjetas por segmento: SOLO el conteo de clientes (sin montos de cartera).
    const tarjetas = cob.segmentos.map((s) => {
      const col = { green: 'border-green-500 text-green-600', yellow: 'border-amber-500 text-amber-600', red: 'border-red-500 text-red-600' }[s.color];
      const active = fSeg === s.key;
      return `<button data-seg="${s.key}" class="text-left bg-white dark:bg-gray-800 rounded-xl border-l-4 ${col.split(' ')[0]} border border-gray-200 dark:border-gray-700 p-3 ${active ? 'ring-2 ring-brand' : ''} hover:shadow-md transition">
        <p class="text-[11px] uppercase tracking-wide text-gray-500">${esc(s.label)}</p>
        <p class="text-lg font-bold ${col.split(' ')[1]}">${s.clientes.length}</p>
        <p class="text-xs text-gray-500">cliente(s)</p>
      </button>`;
    }).join('');

    const sel = selKey ? morosos.find((c) => c.key === selKey) : null;
    const notas = sel ? notasDe(selKey) : [];

    const detalle = sel ? card(`
      <div class="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h3 class="font-semibold">${esc(sel.nombre)}
          <span class="text-sm font-normal text-gray-500">· saldo <span class="text-red-600 tabular-nums">${money(sel.saldo)}</span> · ${sel.atrasoMeses} mes(es) de atraso</span>
        </h3>
        <button id="cerrar" class="text-sm text-brand underline">Cerrar</button>
      </div>
      <form id="nota-form" class="flex gap-2 mb-3">
        <input class="field flex-1" name="texto" placeholder="Registrar contacto / compromiso de pago…" autocomplete="off" required />
        <button class="bg-brand hover:bg-brand-dark text-white px-4 rounded-lg text-sm" type="submit">Agregar</button>
      </form>
      ${notas.length ? `<ul class="space-y-2">${notas.map((n) => `
        <li class="text-sm border-l-2 border-brand pl-3 py-0.5">
          <span class="text-gray-400 text-xs">${prettyDate(n.fecha)} · ${esc(n.usuario || '')}</span><br>${esc(n.texto)}
        </li>`).join('')}</ul>` : '<p class="text-sm text-gray-400">Sin notas todavía.</p>'}
    `) : '';

    container.innerHTML = `
      ${sectionHead(`Morosos — ${etapaActiva()}`,
        `<span class="text-sm self-center text-gray-500">${morosos.length} cliente(s) con atraso</span>`, 'creditCard', 'bg-amber-500')}

      <div class="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-3 mb-4">${tarjetas}</div>

      ${list.length ? card(`
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold">Clientes con atraso ${fSeg ? `· ${esc(cob.segmentos.find((s) => s.key === fSeg)?.label)}` : ''}</h3>
          ${fSeg ? '<button id="clear" class="text-sm text-brand underline">Ver todos</button>' : ''}
        </div>
        <div class="table-wrap"><table class="w-full text-sm">
          <thead class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
            <tr><th class="py-2">Cliente</th><th>Lote(s)</th><th>Vendedor</th><th class="text-right">Saldo</th><th class="text-right">Atraso</th><th>Segmento</th><th>Últ. pago</th></tr>
          </thead>
          <tbody>
            ${list.sort((a, b) => b.atrasoMeses - a.atrasoMeses).map((c) => `
              <tr class="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer ${c.key === selKey ? 'bg-amber-50 dark:bg-amber-900/20' : ''}" data-k="${esc(c.key)}">
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
        <p class="text-xs text-gray-400 mt-2">Toca un cliente para ver su historial de notas y registrar un contacto.</p>
      `) : empty('No hay clientes con atraso en este segmento')}

      ${detalle}
    `;

    container.querySelectorAll('[data-seg]').forEach((b) =>
      b.addEventListener('click', () => { fSeg = b.dataset.seg === 'corriente' ? '' : (fSeg === b.dataset.seg ? '' : b.dataset.seg); draw(); }));
    container.querySelector('#clear')?.addEventListener('click', () => { fSeg = ''; draw(); });
    container.querySelectorAll('[data-k]').forEach((tr) =>
      tr.addEventListener('click', () => {
        selKey = tr.dataset.k;
        draw();
        container.querySelector('#nota-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }));
    container.querySelector('#cerrar')?.addEventListener('click', () => { selKey = ''; draw(); });
    container.querySelector('#nota-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const texto = e.target.texto.value.trim();
      if (!texto || !sel) return;
      try {
        await notasStore.create({ clienteKey: selKey, cliente: sel.nombre, texto, fecha: todayISO(), usuario: getSession()?.name || '' });
        toast('Nota guardada', 'success');
      } catch (err) { toast(err.message || 'No se pudo guardar', 'error'); }
    });
  };

  draw();
  return subscribe(draw);
}
