/**
 * views/corte.js — Corte diario de caja + conciliacion (replica hoja CORTE).
 *
 * Corte del Flujo (esperado): automatico = efectivo ingresos - efectivo gastos del dia.
 * Corte contado:              manual.
 * Diferencia:                 esperado - contado  ->  ✔ SI / NO (semaforo).
 */

import { resumenDia, estadoConciliacion } from '../calc.js';
import { cortes, subscribe } from '../store.js';
import { RECIBIO_CORTE } from '../config.js';
import { money, prettyDate, todayISO, toNum, esc, toast } from '../utils.js';
import { card, btn, field, select, textarea, badge } from '../ui.js';

export function render(container) {
  let fecha = todayISO();

  const draw = () => {
    const r = resumenDia(fecha);            // todas las etapas
    const corte = cortes.byDate(fecha);
    const contado = corte ? toNum(corte.contado) : 0;
    const diferencia = r.efectivoEsperado - contado;
    const concil = estadoConciliacion({ ...r, corte, diferenciaCaja: corte ? diferencia : null });

    container.innerHTML = `
      <div class="flex items-center gap-3 mb-4 flex-wrap">
        <label class="text-sm text-gray-500">Fecha del corte:</label>
        <input id="corte-date" type="date" class="field !w-44" value="${fecha}" />
        ${badge(concil.color, concil.label)}
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <!-- Calculo automatico -->
        ${card(`
          <h2 class="font-semibold mb-3">🧮 Corte del Flujo — ${prettyDate(fecha)}</h2>
          <div class="space-y-1.5 text-sm">
            <div class="flex justify-between"><span>Efectivo recibido (ingresos)</span><span class="tabular-nums">${money(r.ingresos.efectivo)}</span></div>
            <div class="flex justify-between"><span>(−) Gastos en efectivo</span><span class="tabular-nums text-red-600">${money(r.gastos.efectivo)}</span></div>
            <div class="flex justify-between font-bold border-t border-gray-200 dark:border-gray-700 pt-2 mt-1">
              <span>Efectivo esperado</span><span class="tabular-nums">${money(r.efectivoEsperado)}</span>
            </div>
            <div class="flex justify-between text-xs text-gray-500 pt-1">
              <span>Depósitos del día (informativo)</span><span class="tabular-nums">${money(r.ingresos.deposito)}</span>
            </div>
          </div>
        `)}

        <!-- Formulario -->
        ${card(`
          <h2 class="font-semibold mb-3">📝 Registro de corte</h2>
          <form id="corte-form" class="space-y-3">
            ${field({ label: 'Corte contado (manual)', name: 'contado', type: 'number',
                      value: corte ? corte.contado : '', attrs: 'step="0.01" min="0" required' })}
            ${select({ label: 'Recibió', name: 'recibio', options: ['', ...RECIBIO_CORTE],
                       value: corte?.recibio || '' })}
            <div id="dif-box" class="rounded-lg p-3 ${corte && Math.abs(diferencia) >= 0.01 ? 'bg-red-50 dark:bg-red-900/20' : 'bg-gray-50 dark:bg-gray-700/30'}">
              <div class="flex justify-between text-sm items-center">
                <span>Diferencia (esperado − contado)</span>
                <span id="dif-out" class="font-bold tabular-nums ${corte && Math.abs(diferencia) >= 0.01 ? 'text-red-600' : 'text-green-600'}">
                  ${corte ? money(diferencia) : '—'}
                </span>
              </div>
              <p id="dif-msg" class="text-xs mt-1 ${corte && Math.abs(diferencia) >= 0.01 ? 'text-red-600' : 'text-gray-500'}">
                ${corte ? (Math.abs(diferencia) < 0.01 ? '✔️ SI — caja cuadrada' : '❌ NO — hay diferencia') : 'Captura el efectivo contado'}
              </p>
            </div>
            ${textarea({ label: 'Nota / Observaciones', name: 'observaciones', value: corte?.observaciones || '' })}
            ${btn(corte ? 'Actualizar corte' : 'Guardar corte', 'type="submit"')}
          </form>
        `)}
      </div>

      <!-- Conciliacion -->
      <div class="mt-4">
        ${card(`
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 class="font-semibold">🔗 Conciliación</h2>
              <p class="text-sm text-gray-500 mt-1">Neto del día ${money(r.neto)} · Diferencia de caja ${corte ? money(diferencia) : '—'}</p>
            </div>
            ${badge(concil.color, concil.estado)}
          </div>
        `)}
      </div>
    `;

    // Recalculo en vivo.
    const form = container.querySelector('#corte-form');
    const contadoInput = form.contado;
    const difOut = container.querySelector('#dif-out');
    const difMsg = container.querySelector('#dif-msg');
    const difBox = container.querySelector('#dif-box');

    const recompute = () => {
      const dif = r.efectivoEsperado - toNum(contadoInput.value);
      const bad = Math.abs(dif) >= 0.01;
      difOut.textContent = money(dif);
      difOut.className = `font-bold tabular-nums ${bad ? 'text-red-600' : 'text-green-600'}`;
      difMsg.textContent = bad ? '❌ NO — hay diferencia' : '✔️ SI — caja cuadrada';
      difMsg.className = `text-xs mt-1 ${bad ? 'text-red-600' : 'text-gray-500'}`;
      difBox.className = `rounded-lg p-3 ${bad ? 'bg-red-50 dark:bg-red-900/20' : 'bg-gray-50 dark:bg-gray-700/30'}`;
    };
    contadoInput.addEventListener('input', recompute);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const c = toNum(contadoInput.value);
      const dif = r.efectivoEsperado - c;
      const estado = Math.abs(dif) < 0.01 ? 'Conciliado' : 'Con diferencia';
      try {
        await cortes.save({
          fecha,
          esperado: r.efectivoEsperado,
          contado: c,
          diferencia: dif,
          recibio: form.recibio.value,
          observaciones: form.observaciones.value.trim(),
          estado,
        });
        toast(estado === 'Conciliado' ? 'Corte conciliado ✔️' : 'Corte guardado con diferencia ❌',
          estado === 'Conciliado' ? 'success' : 'warn');
      } catch (err) { toast('Error: ' + err.message, 'error'); }
    });

    container.querySelector('#corte-date').addEventListener('change', (e) => {
      fecha = e.target.value || todayISO();
      draw();
    });
  };

  draw();
  return subscribe(draw);
}
