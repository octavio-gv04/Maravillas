/**
 * views/maestra/sync.js — Panel técnico de sincronización con el Sistema Diario.
 * Como ambos espacios comparten servidor y canal SSE, la sincronización es
 * instantánea. Muestra estado de conexión, eventos pendientes (cola offline),
 * última actualización y la bitácora de eventos en vivo.
 */

import { subscribe, onStatus, getStatusInfo, getHistorial } from '../../store.js';
import { esc, prettyDate } from '../../utils.js';
import { card, badge, empty, sectionHead } from '../../ui.js';
import { iconChip } from '../../icons.js';

export function render(container) {
  let ultimaSync = new Date();
  let unsubStatus = null;

  const draw = () => {
    const st = getStatusInfo();
    const eventos = getHistorial().slice(0, 30);

    const estadoConn = st.online
      ? badge('green', 'Conectado · en tiempo real')
      : badge('yellow', 'Sin conexión · reintentando');
    const estadoCola = st.pending
      ? badge('red', `${st.pending} evento(s) en cola`)
      : badge('green', 'Cola vacía');

    const kpi = (label, value, sub) => `
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <p class="text-[11px] uppercase tracking-wide text-gray-500">${esc(label)}</p>
        <div class="mt-1 text-lg font-bold">${value}</div>
        ${sub ? `<p class="text-xs text-gray-500 mt-1">${sub}</p>` : ''}
      </div>`;

    container.innerHTML = `
      ${sectionHead('Sincronización')}
      <p class="text-sm text-gray-500 mb-4">
        La Base de Datos Maestra y el Control Diario comparten un único servidor y un canal
        de eventos en tiempo real (SSE). Cada ingreso de Etapa 3 capturado en el Diario actualiza
        la Maestra al instante, sin captura manual ni duplicación.
      </p>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        ${kpi('Estado de conexión', estadoConn)}
        ${kpi('Cola de sincronización', estadoCola)}
        ${kpi('Última actualización', `<span class="tabular-nums">${ultimaSync.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>`, prettyDate(ultimaSync.toISOString().slice(0, 10)))}
        ${kpi('Canal', 'SSE · /api/stream', 'Reconexión automática')}
      </div>

      <div class="mt-4">${card(`
        <h3 class="flex items-center gap-2 font-semibold mb-3">${iconChip('list', 'bg-sky-500')}<span>Bitácora de eventos</span> <span class="text-sm font-normal text-gray-500">(últimos ${eventos.length})</span></h3>
        ${eventos.length ? `<div class="table-wrap"><table class="w-full text-sm">
          <thead class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
            <tr><th class="py-2">Fecha</th><th>Hora</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr>
          </thead>
          <tbody>
            ${eventos.map((e) => `<tr class="border-b border-gray-100 dark:border-gray-700/50">
              <td class="py-1.5">${prettyDate(e.fecha)}</td>
              <td class="text-gray-500">${esc(e.hora || '')}</td>
              <td class="text-gray-500">${esc(e.usuario || '')}</td>
              <td>${esc(e.accion || '')}</td>
              <td class="text-gray-500">${esc(e.detalle || '')}</td>
            </tr>`).join('')}
          </tbody></table></div>` : empty('Sin eventos registrados')}
      `)}</div>
    `;
  };

  draw();
  // Refleja cambios de datos (cada evento = una sincronización aplicada).
  const unsubData = subscribe(() => { ultimaSync = new Date(); draw(); });
  unsubStatus = onStatus(() => draw());
  return () => { unsubData(); unsubStatus?.(); };
}
