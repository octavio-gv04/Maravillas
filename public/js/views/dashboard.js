/**
 * views/dashboard.js — Dashboard por pestañas (replica el reporte del Excel).
 *   • General: KPIs del día, gráfica del mes, resumen del mes y operaciones (SIN detalle del día).
 *   • Etapa 1 y 2 / Etapa 3: lo mismo + detalle de ingresos del día de esa etapa.
 */

import { resumenDia, serieMesPorDia, resumenMes, resumenSkvoDia, serieSkvoMes, resumenSkvoMes } from '../calc.js';
import { subscribe, ingresos } from '../store.js';
import { ZONAS } from '../config.js';
import { money, prettyDate, todayISO, esc } from '../utils.js';
import { card, empty, cardTitle } from '../ui.js';
import { svgIcon } from '../icons.js';

const ci = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

// Iconos KPI (set central): chip de color sólido + icono blanco calado.
const ICONS = {
  ingreso: svgIcon('ingreso'), gasto: svgIcon('gasto'),
  resultado: svgIcon('resultado'), corte: svgIcon('calculator'),
};

export function render(container) {
  let tab = 'General';
  let fecha = todayISO();   // día seleccionado (KPIs y detalle del día)
  let charts = [];
  const tabs = ['General', ...ZONAS, 'SKVO'];

  const destroyCharts = () => { charts.forEach((c) => { try { c.destroy(); } catch {} }); charts = []; };

  // Tarjeta KPI: ícono-chip + etiqueta arriba; el valor ocupa todo el ancho y su
  // tamaño de letra se autoajusta (clamp) para que nunca se corte el número.
  const kpiCard = (label, value, icon, bg, text) => `
    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 border-l-4 ${bg.replace('bg-', 'border-l-')}">
      <div class="flex items-center gap-2.5 mb-1.5">
        <span class="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-white ${bg}">${icon}</span>
        <p class="text-sm font-semibold uppercase tracking-wide text-gray-500 truncate">${esc(label)}</p>
      </div>
      <p class="font-bold ${text} tabular-nums whitespace-nowrap leading-tight"
         style="font-size:clamp(1.1rem,2.1vw,1.75rem)">${value}</p>
    </div>`;

  const fila = (l, v, cls = '') => `<div class="flex justify-between py-1 ${cls}"><span>${esc(l)}</span><span class="tabular-nums">${money(v)}</span></div>`;
  const graficaCard = (titulo) => card(`
    <h2 class="font-semibold mb-3 text-center text-gray-500 uppercase text-sm tracking-wide">${esc(titulo)}</h2>
    <div class="relative" style="height:300px"><canvas id="dash-mes"></canvas></div>
  `);

  const draw = () => {
    destroyCharts();
    const iso = fecha;            // día elegido
    const mes = iso.slice(0, 7);  // su mes (para gráfica y resumen)
    const isGen = tab === 'General';
    const isSkvo = tab === 'SKVO';

    const tabBar = tabs.map((t) =>
      `<button data-tab="${esc(t)}" class="px-3 py-1.5 rounded-lg text-sm border ${t === tab ? 'bg-brand text-white border-brand' : 'border-gray-300 dark:border-gray-600'}">${esc(t)}</button>`).join('');
    const header = `
      <div class="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div class="flex items-center gap-2 flex-wrap">${tabBar}</div>
        <div class="flex items-center gap-2 text-sm">
          <label class="text-gray-500">Día:</label>
          <input id="dash-date" type="date" class="field !w-44" value="${fecha}" />
          <button id="dash-hoy" class="border border-gray-300 dark:border-gray-600 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition">Hoy</button>
        </div>
      </div>
      <p class="text-sm text-gray-500 mb-4">Mostrando <strong>${prettyDate(iso)}</strong></p>`;

    if (isSkvo) {
      // ===== SKVO: parámetros de la operación de maquinaria =====
      const sd = resumenSkvoDia(iso);
      const sm = resumenSkvoMes(mes);

      const kpis = `
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          ${kpiCard('Ingresos SKVO del día', money(sd.ingresos.total), ICONS.ingreso, 'bg-green-500', 'text-green-600')}
          ${kpiCard('Gastos SKVO del día', money(sd.gastos.total), ICONS.gasto, 'bg-red-500', 'text-red-600')}
          ${kpiCard('Neto del día', money(sd.neto), ICONS.resultado, 'bg-amber-500', sd.neto >= 0 ? 'text-amber-600' : 'text-red-600')}
          ${kpiCard('Efectivo al corte', money(sd.efectivoNeto), ICONS.corte, 'bg-blue-500', sd.efectivoNeto >= 0 ? 'text-blue-600' : 'text-red-600')}
        </div>`;

      const resumen = card(`
        <h2 class="font-semibold mb-3 text-center text-gray-500 uppercase text-sm tracking-wide">Resumen SKVO del mes</h2>
        <div class="grid md:grid-cols-3 gap-4 items-center">
          <div>
            <p class="text-xs uppercase text-gray-400 mb-1">Gastos por categoría</p>
            ${sm.gastosPorCat.length ? sm.gastosPorCat.map((c) => fila(c.label, c.monto)).join('') : '<p class="text-sm text-gray-400">Sin gastos</p>'}
          </div>
          <div class="relative" style="height:180px"><canvas id="dash-dona"></canvas></div>
          <div>
            ${fila('Ingresos', sm.ingresos)}
            ${fila('Gastos', sm.gastos)}
            ${fila('Neto', sm.neto, 'font-bold border-t-2 border-gray-300 dark:border-gray-600 mt-1 pt-1')}
            ${fila('Efectivo al corte', sm.efectivoNeto, 'text-blue-600')}
          </div>
        </div>
      `);

      const movs = sd.movimientos.slice().sort((a, b) => (a.folio ?? 0) - (b.folio ?? 0));
      const detalle = `<div class="mt-4">${card(`
        ${cardTitle('cog', 'Detalle SKVO del día', 'bg-slate-500')}
        ${movs.length ? `
        <div class="table-wrap"><table class="w-full text-sm">
          <thead class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
            <tr><th class="py-2">Tipo</th><th>Categoría</th><th>Concepto</th><th>Quién</th><th>Método</th><th class="text-right">Cantidad</th></tr>
          </thead>
          <tbody>
            ${movs.map((x) => `<tr class="border-b border-gray-100 dark:border-gray-700/50">
              <td class="py-2"><span class="inline-flex items-center gap-1.5 ${x.tipo === 'Ingreso' ? 'text-green-600' : 'text-red-600'}">${svgIcon(x.tipo === 'Ingreso' ? 'trendingUp' : 'trendingDown', 'w-4 h-4')} ${esc(x.tipo)}</span></td>
              <td>${esc(x.categoria || '—')}</td>
              <td>${esc(x.concepto || '—')}</td>
              <td>${esc(x.entrego || x.cliente || '—')}</td>
              <td>${esc(x.metodo || '—')}</td>
              <td class="text-right font-medium ${x.tipo === 'Ingreso' ? 'text-green-600' : 'text-red-600'}">${money(x.monto)}</td>
            </tr>`).join('')}
          </tbody>
        </table></div>` : empty('Sin movimientos SKVO este día')}
      `)}</div>`;

      container.innerHTML = `${header}${kpis}
        <div class="mt-4">${graficaCard('Ingresos / Gastos SKVO por día del mes')}</div>
        <div class="mt-4">${resumen}</div>
        ${detalle}`;

      renderGrafMes(serieSkvoMes(mes));
      renderDona(sm.ingresos, sm.gastos);
    } else {
      // ===== Ventas: General o una zona =====
      const etapasList = isGen ? ZONAS : [tab];
      const rDia = resumenDia(iso, isGen ? undefined : tab);
      // "Corte efectivo" = Corte del Flujo del día (efectivo esperado a entregar,
      // todas las etapas). Se marca en rojo si hay un corte registrado que descuadra.
      const rCaja = resumenDia(iso);
      const corteEfectivo = rCaja.efectivoEsperado;
      const cajaDescuadra = rCaja.diferenciaCaja != null && Math.abs(rCaja.diferenciaCaja) >= 0.01;
      const rm = resumenMes(mes, etapasList);

      const kpis = `
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          ${kpiCard('Ingresos del día', money(rDia.ingresos.total), ICONS.ingreso, 'bg-green-500', 'text-green-600')}
          ${kpiCard('Gastos del día', money(rDia.gastos.total), ICONS.gasto, 'bg-red-500', 'text-red-600')}
          ${kpiCard('Resultado del día', money(rDia.neto), ICONS.resultado, 'bg-amber-500', 'text-amber-600')}
          ${kpiCard('Corte efectivo', money(corteEfectivo), ICONS.corte, 'bg-blue-500', cajaDescuadra ? 'text-red-600' : 'text-blue-600')}
        </div>`;

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

      const ops = `
        <div class="grid grid-cols-3 rounded-xl overflow-hidden text-white text-sm font-semibold mt-4">
          <div class="bg-blue-600 px-4 py-3 flex items-center justify-between gap-2"><span class="flex items-center gap-1.5">${svgIcon('users', 'w-4 h-4')} ABONOS</span><span class="text-xl">${rm.abonos}</span></div>
          <div class="bg-amber-500 px-4 py-3 flex items-center justify-between gap-2"><span class="flex items-center gap-1.5">${svgIcon('refresh', 'w-4 h-4')} DEVOLUCIONES</span><span class="text-xl">${rm.devoluciones}</span></div>
          <div class="bg-green-600 px-4 py-3 flex items-center justify-between gap-2"><span class="flex items-center gap-1.5">${svgIcon('tag', 'w-4 h-4')} VENDIDOS</span><span class="text-xl">${rm.vendidos}</span></div>
        </div>`;

      let detalle = '';
      if (!isGen) {
        const lista = ingresos.byDate(iso).filter((x) => ci(x.etapa, tab)).sort((a, b) => (a.folio ?? 0) - (b.folio ?? 0));
        const total = lista.reduce((a, x) => a + (Number(x.monto) || 0), 0);
        detalle = `<div class="mt-4">${card(`
          ${cardTitle('receipt', `Detalle de ingresos del día — ${tab}`, 'bg-green-500')}
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

      container.innerHTML = `${header}${kpis}
        <div class="mt-4">${graficaCard('Ingresos / Gastos por día del mes')}</div>
        <div class="mt-4">${resumen}</div>
        ${ops}
        ${detalle}`;

      renderGrafMes(serieMesPorDia(mes, etapasList));
      renderDona(rm.ingresos, rm.egresos);
    }

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

  function renderGrafMes(serie) {
    const canvas = container.querySelector('#dash-mes');
    if (!canvas || typeof Chart === 'undefined') return;
    const { labels, ingresos: ing, gastos: gas } = serie;
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

  function renderDona(ingresosVal, egresosVal) {
    const canvas = container.querySelector('#dash-dona');
    if (!canvas || typeof Chart === 'undefined') return;
    const { tick } = chartColors();
    charts.push(new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Ingresos', 'Gastos'],
        datasets: [{ data: [ingresosVal, egresosVal], backgroundColor: ['#2563eb', '#dc2626'], borderWidth: 0 }],
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
