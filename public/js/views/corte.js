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

import { resumenDia } from '../calc.js';
import { cortes, subscribe } from '../store.js';
import { RECIBIO_CORTE } from '../config.js';
import { money, todayISO, toNum, esc, toast } from '../utils.js';
import { card, cardTitle, btn, monthNav, wireMonthNav } from '../ui.js';

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
  let mes = todayISO().slice(0, 7);
  const opcionesRecibio = ['', ...RECIBIO_CORTE];

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

  const draw = () => {
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

    container.innerHTML = `
      <div class="flex items-center gap-3 mb-4 flex-wrap">
        <h1 class="text-lg font-bold">Efectivo, entrega y nota</h1>
        <span class="text-sm text-gray-400">·</span>
        <label class="text-sm text-gray-500">Mes:</label>
        ${monthNav(mes)}
      </div>
      <div class="space-y-4">${hoyCard}${tabla}</div>
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

    // ---------- Wiring filas ----------
    container.querySelectorAll('tbody tr').forEach((tr) => {
      const esperado = toNum(tr.querySelector('[data-flujo]').dataset.esperado);
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

    wireMonthNav(container, mes, (m) => { mes = m; draw(); });
  };

  draw();
  return subscribe(draw);
}
