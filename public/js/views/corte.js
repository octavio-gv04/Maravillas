/**
 * views/corte.js — Corte de efectivo del mes ("Efectivo, Entrega y Nota").
 *
 * Separa dos cosas:
 *   1) CONCILIACIÓN del día: Corte del Flujo (auto = efectivo ingresos − efectivo
 *      gastos, incluido SKVO) vs Contado (físico). La diferencia se etiqueta como
 *      Faltante (falta efectivo) o Sobrante (sobra), con motivo opcional.
 *   2) RECOLECCIÓN: quién recoge el efectivo y cuándo (puede ser días después).
 *      Cada día queda Pendiente de recoger hasta marcarse Recogido.
 *
 * Captura rápida del día en la tarjeta superior; la tabla es el historial
 * editable del mes. Todo se guarda (upsert por fecha) en el store `cortes`.
 */

import { resumenDia, liquidacionMes, serieMesPorDia } from '../calc.js';
import { cortes, ingresos, gastos, entregas, subscribe } from '../store.js';
import { RECIBIO_CORTE, ZONAS, FLUJO_ETAPAS, FLUJO_ETAPAS_COMPARTIDAS } from '../config.js';
import { money, todayISO, toNum, esc, toast, mesLargo, prettyDate, confirmAction, formatMoneyIn } from '../utils.js';
import { card, cardTitle, btn, btnGhost, field, select, empty, monthNav, wireMonthNav } from '../ui.js';
import { getMes, setMes, onMes } from '../periodo.js';
import { isCapturista } from '../auth.js';

function etiquetaFecha(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
function diasDelMes(mes) {
  const [y, m] = mes.split('-').map(Number);
  const total = new Date(y, m, 0).getDate();
  return Array.from({ length: total }, (_, i) => `${mes}-${String(i + 1).padStart(2, '0')}`);
}
/** Estado de la diferencia: cuadra / faltante / sobrante. */
function difInfo(esperado, contado) {
  if (contado == null) return { txt: '—', cls: 'text-gray-400', tipo: '' };
  const d = Math.round((esperado - contado) * 100) / 100;
  if (Math.abs(d) < 0.01) return { txt: 'Cuadra', cls: 'text-green-600', tipo: 'ok', val: 0 };
  if (d > 0) return { txt: 'Faltante ' + money(d), cls: 'text-red-600', tipo: 'faltante', val: d };
  return { txt: 'Sobrante ' + money(-d), cls: 'text-amber-600', tipo: 'sobrante', val: d };
}
const contadoDe = (c) => (c && c.contado != null && c.contado !== '' ? toNum(c.contado) : null);

export function render(container) {
  const opcionesRecibio = ['', ...RECIBIO_CORTE];
  let depFiltro = 'pendientes';   // pendientes | verificados | todos (lista de depósitos)
  let corteTab = 'efectivo';      // efectivo | depositos | reporte | liquidacion (pestañas del Corte)
  let entEditId = null;           // entrega de Sergio en edición (pestaña Liquidación)
  let reporteDia = todayISO();    // día del Reporte diario (imprimible)
  let reporteCharts = [];         // instancias Chart.js del reporte (para destruir)
  const chartColors = () => { const d = document.documentElement.classList.contains('dark'); return { grid: d ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)', tick: d ? '#cbd5e1' : '#475569' }; };
  const destroyReporteCharts = () => { reporteCharts.forEach((c) => { try { c.destroy(); } catch {} }); reporteCharts = []; };

  // Lee los campos (data-field) dentro de un contenedor (tarjeta de hoy o fila).
  const readScope = (scope) => {
    const g = (n) => scope.querySelector(`[data-field="${n}"]`);
    return {
      contadoRaw: g('contado') ? g('contado').value.trim() : '',
      recibio: g('recibio') ? g('recibio').value : '',
      recibioOtro: g('recibioOtro') ? g('recibioOtro').value.trim() : '',
      recoleccion: g('recoleccion') ? g('recoleccion').value : '',
      observaciones: g('observaciones') ? g('observaciones').value.trim() : '',
    };
  };
  const saveCorte = async (fecha, scope) => {
    const v = readScope(scope);
    if (v.contadoRaw === '' && !v.recibio && !v.observaciones && !v.recoleccion) return;
    const esperado = resumenDia(fecha).efectivoEsperado;
    const contado = v.contadoRaw === '' ? null : toNum(v.contadoRaw);
    const diferencia = contado == null ? null : Math.round((esperado - contado) * 100) / 100;
    const recoleccionFecha = v.recoleccion;
    try {
      await cortes.save({
        fecha, esperado, contado, diferencia,
        recibio: v.recibio, recibioOtro: v.recibio === 'Otro' ? v.recibioOtro : '',
        recogido: !!(v.recibio || recoleccionFecha), recoleccionFecha,
        observaciones: v.observaciones,
        estado: diferencia == null ? 'Pendiente' : (Math.abs(diferencia) < 0.01 ? 'Conciliado' : 'Con diferencia'),
      });
    } catch (err) { toast('Error al guardar: ' + err.message, 'error'); }
  };

  // Actualiza el texto de diferencia en vivo dentro de un scope.
  const recompute = (scope, esperado) => {
    const inp = scope.querySelector('[data-field="contado"]');
    const cell = scope.querySelector('[data-dif]');
    if (!inp || !cell) return;
    const raw = inp.value.trim();
    const info = difInfo(esperado, raw === '' ? null : toNum(raw));
    cell.textContent = info.txt;
    cell.className = cell.className.replace(/text-(green|red|amber|gray)-[0-9]+/g, '') + ' ' + info.cls;
  };

  // Captura Diaria (Hillary): el corte se limita al mes actual, sin navegar a otros.
  const soloActual = isCapturista();
  const draw = () => {
    const mes = soloActual ? todayISO().slice(0, 7) : getMes(); // periodo compartido del Control Mensual
    const dias = diasDelMes(mes);
    const filas = dias.map((iso) => {
      const esperado = resumenDia(iso).efectivoEsperado;
      const c = cortes.byDate(iso);
      const contado = contadoDe(c);
      return { iso, esperado, c: c || {}, contado, dif: difInfo(esperado, contado) };
    });

    const totEsperado = filas.reduce((a, f) => a + f.esperado, 0);
    const totContado = filas.reduce((a, f) => a + (f.contado || 0), 0);
    const totFaltante = filas.reduce((a, f) => a + (f.dif.tipo === 'faltante' ? f.dif.val : 0), 0);
    const totSobrante = filas.reduce((a, f) => a + (f.dif.tipo === 'sobrante' ? -f.dif.val : 0), 0);
    const totPendiente = filas.reduce((a, f) => a + ((f.contado > 0 && !f.c.recibio && !f.c.recoleccionFecha) ? f.contado : 0), 0);

    // ---------- Tarjeta: Corte de hoy ----------
    const hoy = todayISO();
    const hoyFlujo = resumenDia(hoy).efectivoEsperado;
    const h = cortes.byDate(hoy) || {};
    const hoyContado = contadoDe(h);
    const hoyDif = difInfo(hoyFlujo, hoyContado);
    const recibioSel = (sel) => `<select data-field="recibio" class="field">${opcionesRecibio.map((o) => `<option value="${esc(o)}" ${o === sel ? 'selected' : ''}>${o ? esc(o) : 'Recibió…'}</option>`).join('')}</select>`;
    const hoyCard = card(`
      <div class="flex items-center justify-between flex-wrap gap-3 mb-3">
        ${cardTitle('calculator', 'Corte de hoy · ' + etiquetaFecha(hoy), 'bg-blue-500')}
        <div class="text-right">
          <p class="text-xs uppercase tracking-wide text-gray-500">Corte del Flujo</p>
          <p class="text-2xl font-bold tabular-nums">${money(hoyFlujo)}</p>
        </div>
      </div>
      <div id="corte-hoy" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
        <label class="block"><span class="text-xs font-medium text-gray-600 dark:text-gray-300">Efectivo contado</span>
          <input type="text" inputmode="decimal" data-money data-field="contado" class="field mt-1 text-right tabular-nums" placeholder="$0.00" value="${hoyContado != null ? money(hoyContado) : ''}" /></label>
        <div><span class="text-xs font-medium text-gray-600 dark:text-gray-300">Diferencia</span>
          <p class="mt-1 font-semibold tabular-nums ${hoyDif.cls}" data-dif>${hoyDif.txt}</p></div>
        <label class="block"><span class="text-xs font-medium text-gray-600 dark:text-gray-300">Recibió (quién recoge)</span>
          ${recibioSel(h.recibio || '')}</label>
        <label class="block"><span class="text-xs font-medium text-gray-600 dark:text-gray-300">Fecha de recolección</span>
          <input type="date" lang="es-MX" data-field="recoleccion" class="field mt-1" value="${esc(h.recoleccionFecha || '')}" /></label>
        <input type="text" data-field="recibioOtro" class="field ${h.recibio === 'Otro' ? '' : 'hidden'}" placeholder="Especificar quién" value="${esc(h.recibioOtro || '')}" />
        <label class="block sm:col-span-2"><span class="text-xs font-medium text-gray-600 dark:text-gray-300">Motivo / nota</span>
          <input type="text" data-field="observaciones" class="field mt-1" placeholder="Motivo del descuadre o nota…" value="${esc(h.observaciones || '')}" /></label>
      </div>
      <div class="mt-3">${btn('Guardar corte de hoy', 'id="corte-hoy-save"')}</div>
    `);

    // ---------- Tabla del mes ----------
    const estadoEntrega = (f) => {
      if (f.contado == null || f.contado === 0) return '<span class="text-gray-400">—</span>';
      return (f.c.recibio || f.c.recoleccionFecha)
        ? '<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"><span class="dot dot-green"></span>Recogido</span>'
        : '<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"><span class="dot dot-yellow"></span>Pendiente</span>';
    };
    const filaHtml = (f) => `
      <tr class="border-b border-gray-100 dark:border-gray-700/50" data-fecha="${f.iso}">
        <td class="px-3 py-1.5 font-medium whitespace-nowrap">${esc(etiquetaFecha(f.iso))}</td>
        <td class="px-3 py-1.5 text-right tabular-nums" data-flujo data-esperado="${f.esperado}">${money(f.esperado)}</td>
        <td class="px-2 py-1"><input type="text" inputmode="decimal" data-money data-field="contado" class="field !py-1 !w-32 text-right tabular-nums" placeholder="$0.00" value="${f.contado != null ? money(f.contado) : ''}" /></td>
        <td class="px-3 py-1.5 text-right tabular-nums ${f.dif.cls}" data-dif>${f.dif.txt}</td>
        <td class="px-3 py-1.5 text-center">${estadoEntrega(f)}</td>
        <td class="px-2 py-1">
          <select data-field="recibio" class="field !py-1 !w-28">${opcionesRecibio.map((o) => `<option value="${esc(o)}" ${o === (f.c.recibio || '') ? 'selected' : ''}>${o ? esc(o) : '—'}</option>`).join('')}</select>
          <input type="text" data-field="recibioOtro" placeholder="Especificar" class="field !py-1 !w-28 mt-1 ${f.c.recibio === 'Otro' ? '' : 'hidden'}" value="${esc(f.c.recibioOtro || '')}" />
        </td>
        <td class="px-2 py-1"><input type="date" lang="es-MX" data-field="recoleccion" class="field !py-1 !w-36" value="${esc(f.c.recoleccionFecha || '')}" /></td>
        <td class="px-2 py-1"><input type="text" data-field="observaciones" placeholder="Motivo / nota…" class="field !py-1 w-full min-w-[10rem]" value="${esc(f.c.observaciones || '')}" /></td>
      </tr>`;

    const tabla = card(`
      <div class="table-wrap">
        <table class="w-full text-sm">
          <thead class="text-left text-gray-500 border-b-2 border-gray-200 dark:border-gray-700">
            <tr>
              <th class="px-3 py-2">Fecha</th>
              <th class="px-3 py-2 text-right">Corte del Flujo</th>
              <th class="px-2 py-2">Contado</th>
              <th class="px-3 py-2 text-right">Diferencia</th>
              <th class="px-3 py-2 text-center">Entrega</th>
              <th class="px-2 py-2">Recibió</th>
              <th class="px-2 py-2">Recolección</th>
              <th class="px-2 py-2">Motivo / nota</th>
            </tr>
          </thead>
          <tbody>${filas.map(filaHtml).join('')}</tbody>
          <tfoot class="border-t-2 border-gray-300 dark:border-gray-600 font-bold">
            <tr>
              <td class="px-3 py-2">Total del mes</td>
              <td class="px-3 py-2 text-right tabular-nums">${money(totEsperado)}</td>
              <td class="px-3 py-2 text-right tabular-nums">${money(totContado)}</td>
              <td colspan="5"></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-sm">
        <div class="rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2"><span class="text-gray-500">Faltantes</span><br><span class="font-bold text-red-600 tabular-nums">${money(totFaltante)}</span></div>
        <div class="rounded-lg bg-amber-50 dark:bg-amber-900/20 px-3 py-2"><span class="text-gray-500">Sobrantes</span><br><span class="font-bold text-amber-600 tabular-nums">${money(totSobrante)}</span></div>
        <div class="rounded-lg bg-blue-50 dark:bg-blue-900/20 px-3 py-2"><span class="text-gray-500">Pendiente por recoger</span><br><span class="font-bold text-blue-600 tabular-nums">${money(totPendiente)}</span></div>
        <div class="rounded-lg bg-green-50 dark:bg-green-900/20 px-3 py-2"><span class="text-gray-500">Contado del mes</span><br><span class="font-bold text-green-600 tabular-nums">${money(totContado)}</span></div>
      </div>
    `);

    // ---------- Depósitos por verificar (contra el banco) ----------
    // Pagos por Depósito del mes, agrupados por la FECHA DEL DEPÓSITO (no la de captura).
    const depsMes = ingresos.all()
      .filter((i) => /dep[oó]sito/i.test(i.metodo || '') && (i.fecha || '').startsWith(mes))
      .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
    const totDepositado = depsMes.reduce((a, d) => a + toNum(d.monto), 0);
    const totVerificado = depsMes.filter((d) => d.verificado).reduce((a, d) => a + toNum(d.monto), 0);
    const totDepPend = totDepositado - totVerificado;
    const depList = depsMes.filter((d) => depFiltro === 'todos' ? true : depFiltro === 'verificados' ? d.verificado : !d.verificado);
    const porFecha = new Map();
    depList.forEach((d) => { const k = d.fecha || ''; if (!porFecha.has(k)) porFecha.set(k, []); porFecha.get(k).push(d); });
    const depTab = (key, label) => `<button data-depfiltro="${key}" class="px-3 py-1 rounded-full text-xs border ${depFiltro === key ? 'bg-brand text-white border-brand' : 'border-gray-300 dark:border-gray-600'}">${label}</button>`;
    const depFilasHtml = [...porFecha.entries()].map(([fecha, items]) => {
      const tot = items.reduce((a, d) => a + toNum(d.monto), 0);
      const head = `<tr class="bg-gray-50 dark:bg-gray-800/60"><td colspan="4" class="px-3 py-1.5 font-medium text-gray-600 dark:text-gray-300">${etiquetaFecha(fecha)} · ${items.length} depósito(s) · ${money(tot)}</td></tr>`;
      const rows = items.map((d) => `<tr class="border-b border-gray-100 dark:border-gray-700/50">
        <td class="px-3 py-1.5">${esc(d.cliente || '—')}</td>
        <td class="px-3 py-1.5 text-gray-500">${esc(d.lote || '—')}</td>
        <td class="px-3 py-1.5 text-right tabular-nums">${money(d.monto)}</td>
        <td class="px-3 py-1.5 text-center"><input type="checkbox" data-verif="${esc(d.id)}" class="w-4 h-4 align-middle" ${d.verificado ? 'checked' : ''} /></td>
      </tr>`).join('');
      return head + rows;
    }).join('');
    const depCard = card(`
      <div class="flex items-center justify-between gap-3 mb-3 flex-wrap">
        ${cardTitle('creditCard', 'Depósitos por verificar', 'bg-cyan-500')}
        <div class="flex gap-2">${depTab('pendientes', 'Pendientes')}${depTab('verificados', 'Verificados')}${depTab('todos', 'Todos')}</div>
      </div>
      ${depList.length ? `<div class="table-wrap"><table class="w-full text-sm">
        <thead class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
          <tr><th class="px-3 py-2">Cliente</th><th class="px-3 py-2">Lote</th><th class="px-3 py-2 text-right">Monto</th><th class="px-3 py-2 text-center">Verificado</th></tr>
        </thead>
        <tbody>${depFilasHtml}</tbody>
      </table></div>` : '<p class="text-sm text-gray-400 py-3">Sin depósitos en este filtro.</p>'}
      <div class="grid grid-cols-3 gap-3 mt-3 text-sm">
        <div class="rounded-lg bg-gray-50 dark:bg-gray-800/60 px-3 py-2"><span class="text-gray-500">Depositado</span><br><span class="font-bold tabular-nums">${money(totDepositado)}</span></div>
        <div class="rounded-lg bg-green-50 dark:bg-green-900/20 px-3 py-2"><span class="text-gray-500">Verificado</span><br><span class="font-bold text-green-600 tabular-nums">${money(totVerificado)}</span></div>
        <div class="rounded-lg bg-amber-50 dark:bg-amber-900/20 px-3 py-2"><span class="text-gray-500">Pendiente</span><br><span class="font-bold text-amber-600 tabular-nums">${money(totDepPend)}</span></div>
      </div>
      <p class="text-xs text-gray-400 mt-2">Marca cada depósito al cuadrarlo con el estado de cuenta del banco. Se agrupa por la fecha del depósito (no la de captura).</p>
    `);

    // ---------- Pestañas del Corte (acortan el scroll) ----------
    const corteTabBtn = (key, label) => `<button data-cortetab="${key}" class="px-3 py-1.5 rounded-lg text-sm font-medium ${corteTab === key ? 'bg-brand text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}">${esc(label)}</button>`;
    // ---------- Reporte diario (imprimible; sin resumen del mes) ----------
    const rci = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
    const repDiaISO = reporteDia;
    const corteEfeDia = resumenDia(repDiaISO).efectivoEsperado; // corte del día completo (todas las etapas)
    // El Reporte diario NO se puede imprimir hasta que se capture el "Efectivo
    // contado" de ese día en la pestaña Efectivo (colección `cortes`).
    const contadoRep = contadoDe(cortes.byDate(repDiaISO));
    const puedeImprimir = contadoRep != null;
    const kpiMini = (label, val, cls) => `<div class="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
      <p class="text-xs text-gray-500">${esc(label)}</p><p class="text-lg font-bold tabular-nums ${cls}">${money(val)}</p></div>`;
    // Normaliza un concepto (automático): lotes/códigos (con dígito) en MAYÚSCULAS,
    // títulos (Sr/Sra/Ing) y el nombre que les sigue capitalizados, nombres conocidos
    // capitalizados, y el resto en caso oración (primera letra mayúscula).
    const TITULOS = { sr: 'Sr', sra: 'Sra', ing: 'Ing', dr: 'Dr', lic: 'Lic' };
    const NOMBRES = new Set(['goyo', 'monica', 'mónica', 'hillary', 'juan', 'manuel', 'sergio', 'javier', 'laura', 'gonzalo', 'ricardo', 'gilberto']);
    const capW = (w) => w.charAt(0).toUpperCase() + w.slice(1);
    const titulo = (s) => {
      const w = String(s ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
      if (!w.length) return '';
      const out = w.map((p) => /\d/.test(p) ? p.toUpperCase() : (TITULOS[p] || (NOMBRES.has(p) ? capW(p) : p)));
      const tit = Object.values(TITULOS);
      for (let i = 0; i < out.length - 1; i++) if (tit.includes(out[i])) out[i + 1] = capW(out[i + 1]);
      return capW(out.join(' '));
    };
    const byFolio = (a, b) => (a.folio ?? 0) - (b.folio ?? 0);
    // Los gastos "General" (compartidos) del día se reparten ÷N entre las etapas
    // que comparten (Etapa 1 y 2 y Etapa 3). `div` divide el monto mostrado.
    const genGastos = gastos.byDate(repDiaISO).filter((x) => rci(x.etapa, 'General')).sort(byFolio);
    const tablaGastos = (rows, div = 1) => `<table class="w-full text-sm">
      <thead class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700"><tr><th class="py-1">Concepto</th><th>Beneficiario</th><th class="text-right">Cantidad</th></tr></thead>
      <tbody>${rows.map((x) => `<tr class="border-b border-gray-100 dark:border-gray-700/50"><td class="py-1">${esc(titulo(x.concepto || x.categoria || '—'))}</td><td>${esc(x.beneficiario || x.recibe || x.lote || '—')}</td><td class="text-right tabular-nums text-red-600">${money(toNum(x.monto) / div)}</td></tr>`).join('')}</tbody></table>`;
    // Orden del reporte: Etapa 3 primero (como el PDF), luego el resto.
    const ordenRep = ['Etapa 3', ...ZONAS.filter((z) => !rci(z, 'Etapa 3'))];
    const etapasRep = ordenRep.filter((et) => {
      const r = resumenDia(repDiaISO, et);
      return r.ingresos.total || r.gastos.total || (genGastos.length && FLUJO_ETAPAS.some((e) => rci(e, et)));
    });
    const secciones = etapasRep.map((et, idx) => {
      const r = resumenDia(repDiaISO, et);
      const comparteEt = FLUJO_ETAPAS.some((e) => rci(e, et));
      const operativosDia = comparteEt ? genGastos.reduce((a, x) => a + toNum(x.monto), 0) / FLUJO_ETAPAS_COMPARTIDAS : 0;
      const resultadoDia = r.neto - operativosDia; // ingresos − gastos etapa − ½ operativos
      const lista = ingresos.byDate(repDiaISO).filter((x) => rci(x.etapa, et)).sort(byFolio);
      const glista = gastos.byDate(repDiaISO).filter((x) => rci(x.etapa, et)).sort(byFolio);
      return `<section class="rep-etapa ${idx > 0 ? 'rep-break' : ''}" style="padding:8px 0">
        <div class="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 pb-2 mb-3">
          <div><p class="font-bold">Administración Las Maravillas</p><p class="text-xs text-gray-500">${esc(etiquetaFecha(repDiaISO))}</p></div>
          <p class="font-semibold text-brand">${esc(et)}</p>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-3">
          ${kpiMini('Ingresos del día', r.ingresos.total, 'text-green-600')}
          ${kpiMini('Gastos del día', r.gastos.total, 'text-red-600')}
          ${kpiMini('Operativos (½)', operativosDia, 'text-yellow-500')}
          ${kpiMini('Resultado del día', resultadoDia, 'text-amber-600')}
          ${kpiMini('Corte efectivo', corteEfeDia, 'text-blue-600')}
        </div>
        <div class="relative mb-3" style="height:220px"><canvas data-repchart="${esc(et)}"></canvas></div>
        <p class="font-semibold text-green-600 mb-1">Detalle de ingresos del día</p>
        ${lista.length ? `<table class="w-full text-sm">
          <thead class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700"><tr><th class="py-1">Concepto</th><th>Lote</th><th class="text-right">Cantidad</th></tr></thead>
          <tbody>${lista.map((x) => `<tr class="border-b border-gray-100 dark:border-gray-700/50"><td class="py-1">${esc(x.categoria)}</td><td>${esc(x.lote || '—')}</td><td class="text-right tabular-nums text-green-600">${money(x.monto)}</td></tr>`).join('')}</tbody>
        </table>` : '<p class="text-sm text-gray-400 py-2">Sin ingresos este día.</p>'}
        ${glista.length ? `<p class="font-semibold text-red-600 mt-3 mb-1">Detalle de gastos del día</p>${tablaGastos(glista)}` : ''}
        ${(comparteEt && genGastos.length) ? `<p class="font-semibold text-yellow-500 mt-3 mb-1">Gastos operativos del día (½ compartido)</p>${tablaGastos(genGastos, FLUJO_ETAPAS_COMPARTIDAS)}` : ''}
      </section>`;
    }).join('');
    const reporteCard = card(`
      <style>@media print {
        body * { visibility: hidden !important; }
        #reporte-diario, #reporte-diario * { visibility: visible !important; }
        #reporte-diario { position:absolute; left:0; top:0; width:100%; background:#fff; color:#111827; padding:0; }
        #reporte-diario .text-gray-400 { color:#6b7280 !important; }
        #reporte-diario .text-gray-500 { color:#4b5563 !important; }
        .no-print { display:none !important; }
        .rep-break { page-break-before: always; }
        .rep-etapa { break-inside: avoid; }
      }</style>
      <div class="flex items-center gap-3 flex-wrap mb-4 no-print">
        ${cardTitle('receipt', 'Reporte diario', 'bg-amber-500')}
        <label class="text-sm text-gray-500">Día:</label>
        <input id="rep-dia" type="date" class="field !w-44" value="${repDiaISO}" />
        ${puedeImprimir
          ? btn('Imprimir / PDF', 'id="rep-print" type="button"')
          : `<button id="rep-print" type="button" disabled title="Captura primero el efectivo contado del día" class="bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 inline-flex items-center justify-center min-h-[2.5rem] px-4 rounded-lg text-sm font-medium cursor-not-allowed">Imprimir / PDF</button>`}
      </div>
      ${puedeImprimir ? '' : `<p class="no-print flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400 -mt-2 mb-4">⚠️ Para imprimir, captura primero el <strong>Efectivo contado</strong> de este día en la pestaña <strong>Efectivo</strong>.</p>`}
      <div id="reporte-diario">${secciones || empty('Sin movimientos registrados este día')}</div>
    `);
    // ---------- Entregas de Sergio (efectivo del Corte → Javier) · solo Control Mensual ----------
    let liqCard = '';
    if (!soloActual) {
      const L = liquidacionMes(mes);
      const editItem = entEditId ? L.entregasMes.find((e) => e.id === entEditId) : null;
      const cerrado = Math.abs(L.pendiente) < 0.01;
      const jv = L.socios.Javier, sg = L.socios.Sergio;
      const sub = (t) => `<tr class="bg-gray-100 dark:bg-gray-800/60"><td class="py-1 px-2 text-xs uppercase tracking-wide text-gray-500" colspan="3">${esc(t)}</td></tr>`;
      const brow = (l, j, s, o = {}) => `<tr class="${o.bold ? 'font-semibold' : ''} border-b border-gray-100 dark:border-gray-700/50">
        <td class="py-1.5 ${o.indent ? 'pl-5 text-gray-500 font-normal' : ''}">${esc(l)}</td>
        <td class="text-right tabular-nums ${o.neg && j < 0 ? 'text-red-500' : ''}">${money(j)}</td>
        <td class="text-right tabular-nums ${o.neg && s < 0 ? 'text-red-500' : ''}">${money(s)}</td></tr>`;
      const aj = L.ajuste;
      const cierre = Math.abs(aj) < 0.01
        ? '<p class="text-sm text-green-600 mt-2 font-medium">✓ Cada socio tiene lo que le corresponde.</p>'
        : `<p class="text-sm mt-2">Para cerrar entre socios: <strong>${aj > 0 ? 'Sergio entrega ' + money(aj) + ' a Javier' : 'Javier entrega ' + money(-aj) + ' a Sergio'}</strong>.</p>`;
      liqCard = card(`
        ${cardTitle('cash', `Entregas de efectivo — ${mesLargo(mes)}`, 'bg-emerald-500')}
        <div class="table-wrap"><table class="w-full text-sm">
          <thead class="text-gray-500 border-b border-gray-200 dark:border-gray-700">
            <tr><th class="text-left py-1.5">Balance</th>
              <th class="text-right">Etapa 3 + SKVO<br><span class="text-xs font-normal">Javier</span></th>
              <th class="text-right">Etapa 1 y 2<br><span class="text-xs font-normal">Sergio</span></th></tr></thead>
          <tbody>
            ${brow('Ingresos', jv.ingresos, sg.ingresos, { bold: true })}
            ${sub('Gastos operativos')}
            ${brow('Generales', jv.generales, sg.generales, { indent: true })}
            ${brow('Operación', jv.operacion, sg.operacion, { indent: true })}
            ${brow('Comisiones', jv.comisiones, sg.comisiones, { indent: true })}
            ${brow('Total de gastos', jv.totalGastosOper, sg.totalGastosOper, { bold: true })}
            ${brow('Utilidad Operativa', jv.utilidadOperativa, sg.utilidadOperativa, { bold: true })}
            ${sub('SKVO · maquinaria (la cubre Etapa 3)')}
            ${brow('Ingresos SKVO', jv.ingresosSkvo, sg.ingresosSkvo, { indent: true })}
            ${brow('Gastos SKVO', jv.gastosSkvo, sg.gastosSkvo, { indent: true })}
            ${brow('Utilidad con SKVO', jv.utilidad, sg.utilidad, { bold: true })}
            ${sub('Conciliación · lo recibido')}
            ${brow('Recibido en depósitos', jv.recibidoDeposito, sg.recibidoDeposito, { indent: true })}
            ${brow('Recibido en efectivo', jv.recibidoEfectivo, sg.recibidoEfectivo, { indent: true })}
            ${brow('Total recibido', jv.totalRecibido, sg.totalRecibido, { bold: true })}
            ${brow('Balance (Utilidad − Recibido)', jv.balance, sg.balance, { bold: true, neg: true })}
          </tbody>
        </table></div>
        ${cierre}
        <p class="text-xs text-gray-400 mt-1">Los depósitos de todas las zonas (${money(L.depositosTotal)}) caen en la cuenta de Sergio. "Recibido en efectivo" = lo que Sergio te ha entregado. Balance negativo = recibió de más.</p>
        <div class="border-t border-gray-200 dark:border-gray-700 my-4"></div>
        <form id="ent-form" class="grid grid-cols-1 sm:grid-cols-6 gap-3 items-end mb-4">
          ${select({ label: 'Quién entrega', name: 'de', options: ['Sergio', 'Javier'], value: editItem?.de || 'Sergio' })}
          ${select({ label: 'Quién recibe', name: 'para', options: ['Javier', 'Sergio'], value: editItem?.para || 'Javier' })}
          ${field({ label: 'Fecha', name: 'fecha', type: 'date', value: editItem?.fecha || todayISO(), attrs: 'required' })}
          ${field({ label: 'Monto (− si se lo quitas)', name: 'monto', money: true, value: editItem ? money(editItem.monto) : '', attrs: 'required' })}
          <div class="sm:col-span-2">${field({ label: 'Nota', name: 'nota', value: editItem?.nota || '', placeholder: 'Opcional' })}</div>
          <div class="sm:col-span-6 flex gap-2">
            ${btn(editItem ? 'Guardar cambios' : 'Registrar entrega', 'type="submit"')}
            ${editItem ? btnGhost('Cancelar', 'type="button" id="ent-cancel"') : ''}
          </div>
        </form>
        ${L.entregasMes.length ? `<div class="table-wrap"><table class="w-full text-sm">
          <thead class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
            <tr><th class="py-2">Fecha</th><th>Entrega → Recibe</th><th>Nota</th><th class="text-right">Monto</th><th></th></tr></thead>
          <tbody>
            ${L.entregasMes.map((e) => `<tr class="border-b border-gray-100 dark:border-gray-700/50">
              <td class="py-1.5">${esc(prettyDate(e.fecha))}</td>
              <td class="text-gray-500">${esc(e.de || 'Sergio')} → ${esc(e.para || 'Javier')}</td>
              <td class="text-gray-500">${esc(e.nota || '—')}</td>
              <td class="text-right tabular-nums font-medium ${toNum(e.monto) < 0 ? 'text-red-500' : 'text-green-600'}">${money(e.monto)}</td>
              <td class="text-right whitespace-nowrap">
                <button data-entedit="${e.id}" class="text-brand hover:underline text-xs">Editar</button>
                <button data-entdel="${e.id}" class="text-red-500 hover:underline text-xs ml-2">Borrar</button></td></tr>`).join('')}
          </tbody>
          <tfoot><tr class="font-semibold border-t-2 border-gray-200 dark:border-gray-700">
            <td class="py-2" colspan="3">Total Sergio → Javier</td>
            <td class="text-right tabular-nums text-green-600">${money(L.sergioAJavier)}</td><td></td></tr></tfoot>
        </table></div>` : empty('Sin entregas registradas este mes')}
        <p class="text-xs text-gray-400 mt-2">Sergio recoge el efectivo del Corte del Flujo (${money(L.corteFlujo)} este mes) y lo entrega a Javier; al cierre, Javier le entrega a Sergio el efectivo de sus etapas. El pendiente es lo que Sergio aún no te ha entregado.</p>
      `);
    }

    const contenido = corteTab === 'depositos' ? depCard
      : corteTab === 'reporte' ? reporteCard
      : corteTab === 'liquidacion' ? liqCard
      : `<div class="space-y-4">${hoyCard}${tabla}</div>`;

    destroyReporteCharts(); // limpia gráficas previas antes de rehacer el DOM

    container.innerHTML = `
      <div class="flex items-center gap-3 mb-4 flex-wrap">
        <h1 class="text-lg font-bold">Corte</h1>
        <span class="text-sm text-gray-400">·</span>
        <label class="text-sm text-gray-500">Mes:</label>
        ${soloActual ? `<span class="text-sm font-medium">${esc(mesLargo(mes))}</span>` : monthNav(mes)}
      </div>
      <div class="flex gap-2 mb-4 flex-wrap">
        ${corteTabBtn('efectivo', 'Efectivo')}${corteTabBtn('depositos', 'Depósitos')}${corteTabBtn('reporte', 'Reporte diario')}${soloActual ? '' : corteTabBtn('liquidacion', 'Entregas de Efectivo')}
      </div>
      ${contenido}
      <p class="text-xs text-gray-500 mt-3">El <strong>Corte del Flujo</strong> es el efectivo esperado del día (ingresos − gastos en efectivo, incluido SKVO) y se calcula solo. Captura el <strong>Contado</strong> físico: si no coincide, se marca <strong>Faltante</strong> o <strong>Sobrante</strong>. La <strong>recolección</strong> (quién y cuándo) puede registrarse después; los días sin recoger quedan <strong>Pendiente</strong>.</p>
    `;

    // ---------- Wiring tarjeta de hoy ----------
    const hoyScope = container.querySelector('#corte-hoy');
    if (hoyScope) {
      hoyScope.querySelector('[data-field="contado"]').addEventListener('input', () => recompute(hoyScope, hoyFlujo));
      const hRec = hoyScope.querySelector('[data-field="recibio"]');
      hRec.addEventListener('change', () => hoyScope.querySelector('[data-field="recibioOtro"]').classList.toggle('hidden', hRec.value !== 'Otro'));
      container.querySelector('#corte-hoy-save').addEventListener('click', async () => {
        await saveCorte(hoy, hoyScope);
        toast('Corte de hoy guardado', 'success');
      });
    }

    // ---------- Wiring filas (solo las del corte de efectivo) ----------
    container.querySelectorAll('tbody tr').forEach((tr) => {
      const flujoEl = tr.querySelector('[data-flujo]');
      if (!flujoEl) return;   // otras tablas (p.ej. depósitos) no tienen estas filas
      const esperado = toNum(flujoEl.dataset.esperado);
      const contadoInput = tr.querySelector('[data-field="contado"]');
      contadoInput.addEventListener('input', () => recompute(tr, esperado));
      contadoInput.addEventListener('change', () => saveCorte(tr.dataset.fecha, tr));
      const recibioSelEl = tr.querySelector('[data-field="recibio"]');
      const otroInput = tr.querySelector('[data-field="recibioOtro"]');
      recibioSelEl.addEventListener('change', () => { otroInput.classList.toggle('hidden', recibioSelEl.value !== 'Otro'); saveCorte(tr.dataset.fecha, tr); });
      otroInput.addEventListener('change', () => saveCorte(tr.dataset.fecha, tr));
      tr.querySelector('[data-field="recoleccion"]').addEventListener('change', () => saveCorte(tr.dataset.fecha, tr));
      tr.querySelector('[data-field="observaciones"]').addEventListener('change', () => saveCorte(tr.dataset.fecha, tr));
    });

    // ---------- Wiring pestañas ----------
    container.querySelectorAll('[data-cortetab]').forEach((b) =>
      b.addEventListener('click', () => { corteTab = b.dataset.cortetab; draw(); }));

    // ---------- Wiring depósitos por verificar ----------
    container.querySelectorAll('[data-depfiltro]').forEach((b) =>
      b.addEventListener('click', () => { depFiltro = b.dataset.depfiltro; draw(); }));
    container.querySelectorAll('[data-verif]').forEach((chk) =>
      chk.addEventListener('change', async () => {
        try { await ingresos.update(chk.dataset.verif, { verificado: chk.checked }); }
        catch (err) { chk.checked = !chk.checked; toast('No se pudo guardar: ' + err.message, 'error'); }
      }));

    // ---------- Wiring entregas de Sergio (pestaña Liquidación, solo Control Mensual) ----------
    const entForm = container.querySelector('#ent-form');
    if (entForm) {
      formatMoneyIn(container);
      entForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = entForm.elements;
        const data = { fecha: f.fecha.value, mes, monto: toNum(f.monto.value), nota: f.nota.value.trim(), de: f.de.value, para: f.para.value };
        if (!data.monto) { toast('Escribe un monto', 'warn'); return; }
        try {
          if (entEditId) { await entregas.update(entEditId, data); entEditId = null; toast('Entrega actualizada'); }
          else { await entregas.create(data); toast('Entrega registrada'); }
        } catch { toast('No se pudo guardar', 'error'); }
      });
      container.querySelector('#ent-cancel')?.addEventListener('click', () => { entEditId = null; draw(); });
      container.querySelectorAll('[data-entedit]').forEach((b) =>
        b.addEventListener('click', () => { entEditId = b.dataset.entedit; draw(); }));
      container.querySelectorAll('[data-entdel]').forEach((b) =>
        b.addEventListener('click', async () => {
          if (await confirmAction('¿Borrar esta entrega?')) { entregas.remove(b.dataset.entdel); toast('Entrega eliminada', 'warn'); }
        }));
    }

    // ---------- Wiring Reporte diario (gráficas + día + imprimir) ----------
    if (corteTab === 'reporte') {
      const { grid, tick } = chartColors(); // colores del tema en pantalla (se oscurecen al imprimir)
      const repMes = reporteDia.slice(0, 7);
      const rciw = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
      const genMitad = serieMesPorDia(repMes, ['General']).gastos.map((v) => v / FLUJO_ETAPAS_COMPARTIDAS);
      container.querySelectorAll('[data-repchart]').forEach((canvas) => {
        if (typeof Chart === 'undefined') return;
        const et = canvas.dataset.repchart;
        const serie = serieMesPorDia(repMes, [et]);
        const datasets = [
          { label: 'Ingresos', data: serie.ingresos, borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,.12)', tension: .3, fill: true, borderWidth: 2 },
          { label: 'Gastos', data: serie.gastos, borderColor: '#dc2626', backgroundColor: 'rgba(220,38,38,.10)', tension: .3, fill: true, borderWidth: 2 },
        ];
        if (FLUJO_ETAPAS.some((e) => rciw(e, et))) {
          datasets.push({ label: 'Operativos (½)', data: genMitad, borderColor: '#eab308', backgroundColor: 'rgba(234,179,8,.10)', tension: .3, fill: false, borderWidth: 2 });
        }
        reporteCharts.push(new Chart(canvas, {
          type: 'line',
          data: { labels: serie.labels, datasets },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: tick } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${money(c.parsed.y)}` } } },
            scales: { x: { grid: { color: grid }, ticks: { color: tick } }, y: { grid: { color: grid }, ticks: { color: tick, callback: (v) => money(v) } } },
          },
        }));
      });
      const repDia = container.querySelector('#rep-dia');
      repDia?.addEventListener('change', () => { reporteDia = repDia.value; draw(); });
      container.querySelector('#rep-print')?.addEventListener('click', () => {
        // No imprimir sin el efectivo contado del día (respaldo del botón deshabilitado).
        if (contadoDe(cortes.byDate(reporteDia)) == null) {
          toast('Captura primero el efectivo contado del día en la pestaña Efectivo.', 'warn');
          return;
        }
        // El navegador usa el título del documento como nombre sugerido del PDF.
        const fechaArchivo = etiquetaFecha(reporteDia).replace(/^[^,]*,\s*/, '');
        const prev = document.title;
        document.title = `Corte Las Maravillas ${fechaArchivo}`;
        window.print();
        setTimeout(() => { document.title = prev; }, 800);
      });
    }

    if (!soloActual) wireMonthNav(container, mes, (m) => setMes(m));
  };

  // Al imprimir, oscurece ejes/leyenda de las gráficas del reporte (hoja blanca);
  // al terminar, restaura los colores del tema (la pantalla sigue oscura).
  const setChartTicks = (tick, grid) => reporteCharts.forEach((ch) => {
    if (!ch.options) return;
    ch.options.plugins.legend.labels.color = tick;
    ch.options.scales.x.ticks.color = tick; ch.options.scales.y.ticks.color = tick;
    ch.options.scales.x.grid.color = grid; ch.options.scales.y.grid.color = grid;
    ch.update('none');
  });
  const onBeforePrint = () => setChartTicks('#334155', 'rgba(0,0,0,.15)');
  const onAfterPrint = () => { const c = chartColors(); setChartTicks(c.tick, c.grid); };
  window.addEventListener('beforeprint', onBeforePrint);
  window.addEventListener('afterprint', onAfterPrint);

  draw();
  const unsubs = [subscribe(draw), onMes(draw)];
  return () => {
    unsubs.forEach((u) => u());
    window.removeEventListener('beforeprint', onBeforePrint);
    window.removeEventListener('afterprint', onAfterPrint);
    destroyReporteCharts();
  };
}
