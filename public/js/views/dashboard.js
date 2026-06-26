/**
 * views/dashboard.js — Dashboard por pestañas (replica el reporte del Excel).
 *   • General: KPIs del día, gráfica del mes, resumen del mes y operaciones (SIN detalle del día).
 *   • Etapa 1 y 2 / Etapa 3: lo mismo + detalle de ingresos del día de esa etapa.
 */

import { resumenDia, serieMesPorDia, resumenMes } from '../calc.js';
import { subscribe, ingresos } from '../store.js';
import { FLUJO_ETAPAS } from '../config.js';
import { money, prettyDate, todayISO, esc } from '../utils.js';
import { card, empty } from '../ui.js';

const ci = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

export function render(container) {
  let tab = 'General';
  let fecha = todayISO();   // día seleccionado (KPIs y detalle del día)
  let charts = [];
  const tabs = ['General', ...FLUJO_ETAPAS];

  const destroyCharts = () => { charts.forEach((c) => { try { c.destroy(); } catch {} }); charts = []; };

  // Tarjeta KPI: ícono-chip + etiqueta arriba; el valor ocupa todo el ancho y su
  // tamaño de letra se autoajusta (clamp) para que nunca se corte el número.
  const kpiCard = (label, value, icon, bg, text) => `
    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 border-l-4 ${bg.replace('bg-', 'border-l-')}">
      <div class="flex items-center gap-2 mb-1.5">
        <span class="w-6 h-6 shrink-0 rounded-md flex items-center justify-center text-white text-xs ${bg}">${icon}</span>
        <p class="text-[11px] uppercase tracking-wide text-gray-500 truncate">${esc(label)}</p>
      </div>
      <p class="font-bold ${text} tabular-nums whitespace-nowrap leading-tight"
         style="font-size:clamp(1.1rem,2.1vw,1.75rem)">${value}</p>
    </div>`;

  const draw = () => {
    destroyCharts();
    const iso = fecha;            // día elegido
    const mes = iso.slice(0, 7);  // su mes (para gráfica y resumen)
    const isGen = tab === 'General';
    const etapasList = isGen ? FLUJO_ETAPAS : [tab];

    const rDia = resumenDia(iso, isGen ? undefined : tab);
    const corteEfectivo = resumenDia(iso).diferenciaCaja ?? 0;
    const rm = resumenMes(mes, etapasList);

    const tabBar = tabs.map((t) =>
      `<button data-tab="${esc(t)}" class="px-3 py-1.5 rounded-lg text-sm border ${t === tab ? 'bg-brand text-white border-brand' : 'border-gray-300 dark:border-gray-600'}">${esc(t)}</button>`).join('');

    // --- KPIs del día ---
    const kpis = `
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        ${kpiCard('Ingresos del día', money(rDia.ingresos.total), '💲', 'bg-green-500', 'text-green-600')}
        ${kpiCard('Gastos del día', money(rDia.gastos.total), '⬇️', 'bg-red-500', 'text-red-600')}
        ${kpiCard('Resultado del día', money(rDia.neto), '📈', 'bg-amber-500', 'text-amber-600')}
        ${kpiCard('Corte efectivo', money(corteEfectivo), '🧮', 'bg-blue-500', Math.abs(corteEfectivo) >= 0.01 ? 'text-red-600' : 'text-blue-600')}
      </div>`;

    // --- Gráfica del mes ---
    const grafica = card(`
      <h2 class="font-semibold mb-3 text-center text-gray-500 uppercase text-sm tracking-wide">Ingresos / Gastos por día del mes</h2>
      <div class="relative" style="height:300px"><canvas id="dash-mes"></canvas></div>
    `);

    // --- Resumen del mes ---
    const fila = (l, v, cls = '') => `<div class="flex justify-between py-1 ${cls}"><span>${esc(l)}</span><span class="tabular-nums">${money(v)}</span></div>`;
    const resumen = card(`
      <h2 class="font-semibold mb-3 text-center text-gray-500 uppercase text-sm tracking-wide">Resumen del mes</h2>
      <div class="grid md:grid-cols-3 gap-4 items-center">
        <div>${rm.conceptos.map((c) => fila(c.label, c.monto)).join('')}</div>
        <div class="relative" style="height:180px"><canvas id="dash-dona"></canvas></div>
        <div>
          ${fila('Ingresos', rm.ingresos)}
          ${fila('Gastos', rm.egresos)}
          ${fila('Utilidad Operativa', rm.utilidad, 'font-bold border-t-2 border-gray-300 dark:border-gray-600 mt-1 pt-1')}
        </div>
      </div>
    `);

    // --- Barra de operaciones ---
    const ops = `
      <div class="grid grid-cols-3 rounded-xl overflow-hidden text-white text-sm font-semibold mt-4">
        <div class="bg-blue-600 px-4 py-3 flex items-center justify-between gap-2"><span>👤 ABONOS</span><span class="text-xl">${rm.abonos}</span></div>
        <div class="bg-amber-500 px-4 py-3 flex items-center justify-between gap-2"><span>🔁 DEVOLUCIONES</span><span class="text-xl">${rm.devoluciones}</span></div>
        <div class="bg-green-600 px-4 py-3 flex items-center justify-between gap-2"><span>🏷️ VENDIDOS</span><span class="text-xl">${rm.vendidos}</span></div>
      </div>`;

    // --- Detalle de ingresos del día (solo etapas) ---
    let detalle = '';
    if (!isGen) {
      const lista = ingresos.byDate(iso).filter((x) => ci(x.etapa, tab)).sort((a, b) => (a.folio ?? 0) - (b.folio ?? 0));
      const total = lista.reduce((a, x) => a + (Number(x.monto) || 0), 0);
      detalle = `<div class="mt-4">${card(`
        <h2 class="font-semibold mb-3">🧾 Detalle de ingresos del día — ${esc(tab)}</h2>
        ${lista.length ? `
        <div class="table-wrap"><table class="w-full text-sm">
          <thead class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
            <tr><th class="py-2">Concepto</th><th>Lote</th><th class="text-right">Cantidad</th></tr>
          </thead>
          <tbody>
            ${lista.map((x) => `<tr class="border-b border-gray-100 dark:border-gray-700/50">
              <td class="py-2">${esc(x.categoria)}</td><td>${esc(x.lote || '—')}</td>
              <td class="text-right font-medium text-green-600">${money(x.monto)}</td></tr>`).join('')}
          </tbody>
          <tfoot><tr class="font-semibold border-t-2 border-gray-200 dark:border-gray-700">
            <td class="py-2" colspan="2">Total ingresos del día</td>
            <td class="text-right text-green-600">${money(total)}</td></tr></tfoot>
        </table></div>` : empty('Sin ingresos registrados hoy en esta etapa')}
      `)}</div>`;
    }

    container.innerHTML = `
      <div class="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div class="flex items-center gap-2 flex-wrap">${tabBar}</div>
        <div class="flex items-center gap-2 text-sm">
          <label class="text-gray-500">Día:</label>
          <input id="dash-date" type="date" class="field !w-44" value="${fecha}" />
          <button id="dash-hoy" class="text-brand underline">Hoy</button>
        </div>
      </div>
      <p class="text-sm text-gray-500 mb-4">Mostrando <strong>${prettyDate(iso)}</strong></p>
      ${kpis}
      <div class="mt-4">${grafica}</div>
      <div class="mt-4">${resumen}</div>
      ${ops}
      ${detalle}
    `;

    renderGrafMes(mes, etapasList);
    renderDona(rm);

    container.querySelectorAll('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => { tab = b.dataset.tab; draw(); }));
    container.querySelector('#dash-date').addEventListener('change', (e) => {
      fecha = e.target.value || todayISO(); draw();
    });
    container.querySelector('#dash-hoy').addEventListener('click', () => { fecha = todayISO(); draw(); });
  };

  function chartColors() {
    const dark = document.documentElement.classList.contains('dark');
    return { grid: dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)', tick: dark ? '#cbd5e1' : '#475569' };
  }

  function renderGrafMes(mes, etapasList) {
    const canvas = container.querySelector('#dash-mes');
    if (!canvas || typeof Chart === 'undefined') return;
    const { labels, ingresos: ing, gastos: gas } = serieMesPorDia(mes, etapasList);
    const { grid, tick } = chartColors();
    charts.push(new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Ingresos', data: ing, borderColor: '#16a34a',
            backgroundColor: 'rgba(22,163,74,.12)', tension: .3, fill: true, borderWidth: 2 },
          { label: 'Gastos', data: gas, borderColor: '#dc2626',
            backgroundColor: 'rgba(220,38,38,.10)', tension: .3, fill: true, borderWidth: 2 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: tick } },
          tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${money(c.parsed.y)}` } },
        },
        scales: {
          x: { grid: { color: grid }, ticks: { color: tick } },
          y: { grid: { color: grid }, ticks: { color: tick, callback: (v) => money(v) } },
        },
      },
    }));
  }

  function renderDona(rm) {
    const canvas = container.querySelector('#dash-dona');
    if (!canvas || typeof Chart === 'undefined') return;
    const { tick } = chartColors();
    charts.push(new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Ingresos', 'Gastos'],
        datasets: [{ data: [rm.ingresos, rm.egresos], backgroundColor: ['#2563eb', '#dc2626'], borderWidth: 0 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '62%',
        plugins: {
          legend: { position: 'bottom', labels: { color: tick, boxWidth: 12, font: { size: 11 } } },
          tooltip: { callbacks: { label: (c) => `${c.label}: ${money(c.parsed)}` } },
        },
      },
    }));
  }

  draw();
  const unsub = subscribe(draw);
  return () => { unsub(); destroyCharts(); };
}
