/**
 * views/corte.js — Corte efectivo del mes (replica la hoja "Efectivo, Entrega y Nota").
 *
 * Tabla con una fila por día del mes:
 *   • Corte del Flujo  → automático = efectivo de ingresos − efectivo de gastos del día.
 *   • Entregado        → manual: el efectivo contado al cierre y entregado.
 *   • Diferencia       → Corte del Flujo − Entregado (✔ cuadra / ✖ descuadra).
 *   • Recibió          → Sergio / Javier / Otro (con campo para especificar).
 *   • Nota             → observación libre.
 *
 * Cada fila se guarda (upsert por fecha) en el store `cortes`; el Dashboard
 * refleja el Corte del Flujo del día en su KPI "Corte efectivo".
 */

import { resumenDia } from '../calc.js';
import { cortes, subscribe } from '../store.js';
import { RECIBIO_CORTE } from '../config.js';
import { money, todayISO, toNum, esc, toast } from '../utils.js';
import { card, monthNav, wireMonthNav } from '../ui.js';

// "lun, 1 jun 2026" a partir de YYYY-MM-DD (construido en hora local, sin desfase UTC).
function etiquetaFecha(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d)
    .toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

// Lista de fechas YYYY-MM-DD de un mes 'YYYY-MM'.
function diasDelMes(mes) {
  const [y, m] = mes.split('-').map(Number);
  const total = new Date(y, m, 0).getDate();
  return Array.from({ length: total }, (_, i) => `${mes}-${String(i + 1).padStart(2, '0')}`);
}

export function render(container) {
  let mes = todayISO().slice(0, 7); // 'YYYY-MM'

  const draw = () => {
    const dias = diasDelMes(mes);

    // Datos por día: Corte del Flujo (auto) + corte guardado (si existe).
    const filas = dias.map((iso) => {
      const esperado = resumenDia(iso).efectivoEsperado;
      const c = cortes.byDate(iso);
      const contado = c ? toNum(c.contado) : null;
      const diferencia = contado != null ? esperado - contado : null;
      return { iso, esperado, c, contado, diferencia };
    });

    const totEsperado = filas.reduce((a, f) => a + f.esperado, 0);
    const totContado = filas.reduce((a, f) => a + (f.contado || 0), 0);
    const totDif = totEsperado - totContado;

    const opcionesRecibio = ['', ...RECIBIO_CORTE];

    const checkCell = (f) => {
      if (f.contado == null) return '<span class="text-gray-300 dark:text-gray-600">—</span>';
      return Math.abs(f.diferencia) < 0.01
        ? '<span class="text-green-600 font-bold">✔</span>'
        : '<span class="text-red-600 font-bold">✖</span>';
    };

    const filaHtml = (f) => {
      const recibio = f.c?.recibio || '';
      const esOtro = recibio === 'Otro';
      const difCls = f.contado == null ? 'text-gray-400'
        : Math.abs(f.diferencia) < 0.01 ? 'text-green-600' : 'text-red-600';
      return `
        <tr class="border-b border-gray-100 dark:border-gray-700/50" data-fecha="${f.iso}">
          <td class="px-3 py-1.5 font-medium whitespace-nowrap">${esc(etiquetaFecha(f.iso))}</td>
          <td class="px-3 py-1.5 text-right tabular-nums" data-flujo>${money(f.esperado)}</td>
          <td class="px-2 py-1">
            <input type="number" step="0.01" min="0" data-field="contado"
              class="field !py-1 !w-32 text-right tabular-nums" placeholder="0.00"
              value="${f.contado != null ? f.contado : ''}" />
          </td>
          <td class="px-3 py-1.5 text-center" data-check>${checkCell(f)}</td>
          <td class="px-3 py-1.5 text-right tabular-nums ${difCls}" data-dif>${f.contado != null ? money(f.diferencia) : '—'}</td>
          <td class="px-2 py-1">
            <select data-field="recibio" class="field !py-1 !w-32">
              ${opcionesRecibio.map((o) =>
                `<option value="${esc(o)}" ${o === recibio ? 'selected' : ''}>${o ? esc(o) : 'Seleccionar'}</option>`).join('')}
            </select>
            <input type="text" data-field="recibioOtro" placeholder="Especificar"
              class="field !py-1 !w-32 mt-1 ${esOtro ? '' : 'hidden'}"
              value="${esc(f.c?.recibioOtro || '')}" />
          </td>
          <td class="px-2 py-1">
            <input type="text" data-field="observaciones" placeholder="Nota…"
              class="field !py-1 w-full min-w-[12rem]" value="${esc(f.c?.observaciones || '')}" />
          </td>
        </tr>`;
    };

    container.innerHTML = `
      <div class="flex items-center gap-3 mb-4 flex-wrap">
        <h1 class="text-lg font-bold">Efectivo, entrega y nota</h1>
        <span class="text-sm text-gray-400">·</span>
        <label class="text-sm text-gray-500">Mes:</label>
        ${monthNav(mes)}
      </div>

      ${card(`
        <div class="table-wrap">
          <table class="w-full text-sm">
            <thead class="text-left text-gray-500 border-b-2 border-gray-200 dark:border-gray-700">
              <tr>
                <th class="px-3 py-2">Fecha</th>
                <th class="px-3 py-2 text-right">Corte del Flujo</th>
                <th class="px-2 py-2">Entregado</th>
                <th class="px-3 py-2 text-center">✓</th>
                <th class="px-3 py-2 text-right">Diferencia</th>
                <th class="px-2 py-2">Recibió</th>
                <th class="px-2 py-2">Nota</th>
              </tr>
            </thead>
            <tbody>${filas.map(filaHtml).join('')}</tbody>
            <tfoot class="border-t-2 border-gray-300 dark:border-gray-600 font-bold">
              <tr>
                <td class="px-3 py-2">Total del mes</td>
                <td class="px-3 py-2 text-right tabular-nums">${money(totEsperado)}</td>
                <td class="px-3 py-2 text-right tabular-nums">${money(totContado)}</td>
                <td></td>
                <td class="px-3 py-2 text-right tabular-nums ${Math.abs(totDif) < 0.01 ? 'text-green-600' : 'text-red-600'}">${money(totDif)}</td>
                <td colspan="2"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      `)}
      <p class="text-xs text-gray-500 mt-3">El <strong>Corte del Flujo</strong> es el efectivo esperado del día (ingresos − gastos en efectivo) y se calcula solo. Captura el <strong>Entregado</strong> al cierre; la fila se guarda al salir del campo.</p>
    `;

    // --- Interacción por fila ---
    const recompute = (tr) => {
      const esperado = toNum(tr.querySelector('[data-flujo]').dataset.esperado);
      const contadoRaw = tr.querySelector('[data-field="contado"]').value.trim();
      const difCell = tr.querySelector('[data-dif]');
      const checkCell2 = tr.querySelector('[data-check]');
      if (contadoRaw === '') {
        difCell.textContent = '—';
        difCell.className = 'px-3 py-1.5 text-right tabular-nums text-gray-400';
        checkCell2.innerHTML = '<span class="text-gray-300 dark:text-gray-600">—</span>';
        return;
      }
      const dif = esperado - toNum(contadoRaw);
      const ok = Math.abs(dif) < 0.01;
      difCell.textContent = money(dif);
      difCell.className = `px-3 py-1.5 text-right tabular-nums ${ok ? 'text-green-600' : 'text-red-600'}`;
      checkCell2.innerHTML = ok ? '<span class="text-green-600 font-bold">✔</span>' : '<span class="text-red-600 font-bold">✖</span>';
    };

    // Guarda el corte de una fila (solo si tiene algún dato; recalcula esperado).
    const saveRow = async (tr) => {
      const fecha = tr.dataset.fecha;
      const contadoRaw = tr.querySelector('[data-field="contado"]').value.trim();
      const recibio = tr.querySelector('[data-field="recibio"]').value;
      const recibioOtro = tr.querySelector('[data-field="recibioOtro"]').value.trim();
      const observaciones = tr.querySelector('[data-field="observaciones"]').value.trim();

      // Sin datos relevantes: no creamos un corte vacío.
      if (contadoRaw === '' && !recibio && !observaciones) return;

      const esperado = resumenDia(fecha).efectivoEsperado;
      const contado = toNum(contadoRaw);
      const diferencia = esperado - contado;
      const estado = Math.abs(diferencia) < 0.01 ? 'Conciliado' : 'Con diferencia';
      try {
        await cortes.save({
          fecha, esperado, contado, diferencia,
          recibio, recibioOtro: recibio === 'Otro' ? recibioOtro : '',
          observaciones, estado,
        });
      } catch (err) { toast('Error al guardar: ' + err.message, 'error'); }
    };

    container.querySelectorAll('tbody tr').forEach((tr) => {
      // Guarda el "esperado" en el dataset de la celda para recálculo en vivo.
      const flujoCell = tr.querySelector('[data-flujo]');
      const f = filas.find((x) => x.iso === tr.dataset.fecha);
      flujoCell.dataset.esperado = f.esperado;

      const contadoInput = tr.querySelector('[data-field="contado"]');
      contadoInput.addEventListener('input', () => recompute(tr));
      contadoInput.addEventListener('change', () => saveRow(tr));

      const recibioSel = tr.querySelector('[data-field="recibio"]');
      const otroInput = tr.querySelector('[data-field="recibioOtro"]');
      recibioSel.addEventListener('change', () => {
        otroInput.classList.toggle('hidden', recibioSel.value !== 'Otro');
        saveRow(tr);
      });
      otroInput.addEventListener('change', () => saveRow(tr));
      tr.querySelector('[data-field="observaciones"]').addEventListener('change', () => saveRow(tr));
    });

    wireMonthNav(container, mes, (m) => { mes = m; draw(); });
  };

  draw();
  return subscribe(draw);
}
