/**
 * views/maestra/dashboard.js — Dashboard general de la Base de Datos Maestra (Etapa 3).
 * KPIs de clientes/cobranza/lotes/contratos + ingresos del mes, gráfica del mes
 * y semáforo de morosidad. Todo en tiempo real (deriva del Sistema Diario).
 */

import { subscribe } from '../../store.js';
import { dashboard, etapaActiva, setEtapa } from '../../maestra.js';
import { money, esc, todayISO } from '../../utils.js';
import { card } from '../../ui.js';
import { svgIcon } from '../../icons.js';
import { navigate } from '../../router.js';
import { ETAPAS_MAESTRA } from '../../config.js';

export function render(container) {
  let mes = todayISO().slice(0, 7);
  let chart = null;
  const destroy = () => { try { chart?.destroy(); } catch {} chart = null; };

  // icon = nombre del set de icons.js (chip de color sólido + icono blanco calado).
  const kpi = (label, value, icon, bg, text, onclick = '') => `
    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 border-l-4 ${bg.replace('bg-', 'border-l-')} ${onclick ? 'cursor-pointer hover:shadow-md transition' : ''}" ${onclick ? `data-go="${onclick}"` : ''}>
      <div class="flex items-center gap-2.5 mb-1.5">
        <span class="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-white ${bg}">${svgIcon(icon)}</span>
        <p class="text-sm font-semibold uppercase tracking-wide text-gray-500 truncate">${esc(label)}</p>
      </div>
      <p class="font-bold ${text} tabular-nums whitespace-nowrap leading-tight" style="font-size:clamp(1.1rem,2.1vw,1.75rem)">${value}</p>
    </div>`;

  const draw = () => {
    destroy();
    const d = dashboard(mes);

    const fila = (l, v, cls = '') => `<div class="flex justify-between py-1 text-sm ${cls}"><span>${esc(l)}</span><span class="tabular-nums">${v}</span></div>`;

    const semaforo = d.cobranza.segmentos.map((s) => {
      const c = { green: 'bg-green-500', yellow: 'bg-amber-500', red: 'bg-red-500' }[s.color];
      return `<div class="flex items-center justify-between gap-2 py-1.5 text-sm">
        <span class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full ${c}"></span>${esc(s.label)}</span>
        <span class="tabular-nums text-gray-500">${s.clientes.length} · ${money(s.total)}</span>
      </div>`;
    }).join('');

    container.innerHTML = `
      <div class="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 class="text-xl font-semibold">Dashboard</h2>
          <p class="text-sm text-gray-500">Centro operativo · sincronizado en tiempo real con el Control Diario</p>
        </div>
        <input id="m-mes" type="month" class="field !w-44" value="${mes}" />
      </div>

      <p class="text-xs uppercase tracking-wide text-gray-500 mb-2">Elige la etapa</p>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 md:gap-3 mb-5">
        ${ETAPAS_MAESTRA.map((e) => `
          <button data-etapa="${esc(e)}"
            class="px-4 py-3 rounded-xl border text-sm font-semibold text-center transition ${e === etapaActiva()
              ? 'bg-brand text-white border-brand shadow'
              : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:border-brand hover:shadow-sm'}">
            ${esc(e)}
          </button>`).join('')}
      </div>

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        ${kpi('Clientes activos', d.clientes.activos, 'users', 'bg-blue-500', 'text-blue-600', 'm/clientes')}
        ${kpi('Clientes morosos', d.clientes.morosos, 'alertTriangle', 'bg-red-500', 'text-red-600', 'm/cobranza')}
        ${kpi('Cartera por cobrar', money(d.cobranza.cartera), 'creditCard', 'bg-amber-500', 'text-amber-600', 'm/cobranza')}
        ${kpi('Ingresos del mes', money(d.ingresos.mes), 'cash', 'bg-green-500', 'text-green-600')}
      </div>

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mt-3 md:mt-4">
        ${kpi('Lotes vendidos', `${d.lotes.vendidos}/${d.lotes.total}`, 'home', 'bg-emerald-500', 'text-emerald-600', 'm/lotes')}
        ${kpi('Lotes disponibles', d.lotes.disponibles, 'checkCircle', 'bg-teal-500', 'text-teal-600', 'm/lotes')}
        ${kpi('Contratos activos', d.contratos.activos, 'doc', 'bg-indigo-500', 'text-indigo-600', 'm/contratos')}
        ${kpi('Vencido por cobrar', money(d.cobranza.vencido), 'clock', 'bg-rose-500', 'text-rose-600', 'm/cobranza')}
      </div>

      <div class="grid lg:grid-cols-3 gap-4 mt-4">
        <div class="lg:col-span-2">${card(`
          <h3 class="font-semibold mb-3 text-center text-gray-500 uppercase text-sm tracking-wide">Ingresos por día del mes</h3>
          <div class="relative" style="height:280px"><canvas id="m-graf"></canvas></div>
        `)}</div>
        <div>${card(`
          <h3 class="font-semibold mb-2 text-center text-gray-500 uppercase text-sm tracking-wide">Morosidad por antigüedad</h3>
          ${semaforo}
          <div class="border-t border-gray-200 dark:border-gray-700 mt-2 pt-2">
            ${fila('Ingresos del mes (enganche)', money(d.ingresos.enganche))}
            ${fila('Ingresos del mes (abonos)', money(d.ingresos.abonos))}
            ${fila('Acumulado histórico', money(d.ingresos.acumulado), 'font-semibold')}
          </div>
        `)}</div>
      </div>
    `;

    container.querySelectorAll('[data-go]').forEach((el) =>
      el.addEventListener('click', () => navigate(el.dataset.go)));
    container.querySelectorAll('[data-etapa]').forEach((b) =>
      b.addEventListener('click', () => { setEtapa(b.dataset.etapa); draw(); }));
    container.querySelector('#m-mes').addEventListener('change', (e) => { mes = e.target.value || mes; draw(); });

    renderChart(d.serieIngresosMes);
  };

  function chartColors() {
    const dark = document.documentElement.classList.contains('dark');
    return { grid: dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)', tick: dark ? '#cbd5e1' : '#475569' };
  }
  function renderChart({ labels, data }) {
    const canvas = container.querySelector('#m-graf');
    if (!canvas || typeof Chart === 'undefined') return;
    const { grid, tick } = chartColors();
    chart = new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Ingresos', data, backgroundColor: '#16a34a', borderRadius: 4 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => money(c.parsed.y) } } },
        scales: {
          x: { grid: { color: grid }, ticks: { color: tick } },
          y: { grid: { color: grid }, ticks: { color: tick, callback: (v) => money(v) } },
        },
      },
    });
  }

  draw();
  const unsub = subscribe(draw);
  return () => { unsub(); destroy(); };
}
