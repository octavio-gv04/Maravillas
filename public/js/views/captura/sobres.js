/**
 * views/captura/sobres.js — Revisión de Sobres (conciliación mes a mes).
 *
 * Cada cliente guarda sus recibos en un sobre físico con el registro manual de
 * cada pago. La captura anterior cuadró el TOTAL pagado por lote, pero no en qué
 * mes ocurrió cada pago, por lo que el calendario y el atraso quedaron poco
 * confiables. Este módulo permite, sobre en mano, capturar el monto realmente
 * pagado en cada mes; al guardar reemplaza la itemización del lote y RECALCULA el
 * atraso (y por tanto el estado "Cancelado") a partir de la línea de tiempo real.
 *
 * Cuadre "ambos con aviso": muestra Capturado vs Total conciliado y la diferencia;
 * permite guardar aunque no cuadre, eligiendo si adoptar el total del sobre o
 * conservar el total anterior (la diferencia se guarda como ajuste).
 */

import { subscribe, sobres as sobresStore } from '../../store.js';
import { lotesCliente, gridSobre, revisionSobresResumen } from '../../maestra.js';
import { money, esc, toNum, todayISO, prettyDate, toast } from '../../utils.js';
import { card, badge, empty, sectionHead, btn, btnGhost } from '../../ui.js';
import { getSession } from '../../auth.js';

const mesLabel = (ym) => {
  const s = new Date(ym + '-01T00:00:00').toLocaleDateString('es-MX', { month: 'short', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export function render(container) {
  let q = '';
  let filtro = 'pendientes';   // pendientes | revisados | todos
  let selLote = '';            // lote en edición (vacío = lista)
  let saveMode = 'conservar';  // conservar | adoptar (cuando hay diferencia)

  const draw = () => { selLote ? drawEditor() : drawLista(); };

  // ---------------- LISTA ----------------
  function drawLista() {
    const res = revisionSobresResumen();
    const pct = res.total ? Math.round((res.revisados / res.total) * 100) : 0;
    let list = lotesCliente();
    if (filtro === 'pendientes') list = list.filter((l) => !l.sobreRevisado);
    else if (filtro === 'revisados') list = list.filter((l) => l.sobreRevisado);
    if (q) { const s = q.toLowerCase(); list = list.filter((l) => `${l.nombre} ${l.lote}`.toLowerCase().includes(s)); }

    const tab = (key, label) => `<button data-filtro="${key}" class="px-3 py-1 rounded-full text-xs border ${filtro === key ? 'bg-brand text-white border-brand' : 'border-gray-300 dark:border-gray-600'}">${label}</button>`;

    container.innerHTML = `
      ${sectionHead('Revisión de Sobre',
        `<span class="text-sm self-center text-gray-500">${res.revisados} de ${res.total} revisados</span>`, 'envelope', 'bg-cyan-500')}

      ${card(`
        <div class="flex items-center justify-between gap-3 mb-2 flex-wrap">
          <h3 class="font-semibold">Avance de revisión</h3>
          <span class="text-sm text-gray-500">${res.pendientes} pendiente(s) · ${pct}%</span>
        </div>
        <div class="h-2.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div class="h-full bg-cyan-500" style="width:${pct}%"></div>
        </div>
      `)}

      <div class="flex items-center gap-3 my-4 flex-wrap">
        <div class="flex gap-2">${tab('pendientes', 'Pendientes')}${tab('revisados', 'Revisados')}${tab('todos', 'Todos')}</div>
        <input id="buscar" class="field !w-64" placeholder="Buscar cliente o lote…" value="${esc(q)}" autocomplete="off" />
      </div>

      ${list.length ? card(`
        <div class="table-wrap"><table class="w-full text-sm">
          <thead class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
            <tr><th class="py-2">Cliente</th><th>Lote</th><th class="text-right">Total pagado</th><th class="text-right">Saldo</th><th class="text-right">Atraso</th><th>Revisión</th><th></th></tr>
          </thead>
          <tbody>
            ${list.map((l) => `
              <tr class="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                <td class="py-2 font-medium">${esc(l.nombre)}</td>
                <td class="text-gray-500">${esc(l.lote)}</td>
                <td class="text-right tabular-nums">${money(l.totalPagado)}</td>
                <td class="text-right tabular-nums ${l.saldo > 0.01 ? 'text-red-600' : 'text-green-600'}">${money(l.saldo)}</td>
                <td class="text-right tabular-nums">${l.atrasoMeses} mes(es)</td>
                <td>${l.sobreRevisado ? badge('green', 'Revisado') : badge('yellow', 'Pendiente')}</td>
                <td class="text-right">${btnGhost(l.sobreRevisado ? 'Ver / editar' : 'Revisar sobre', `data-rev="${esc(l.lote)}"`)}</td>
              </tr>`).join('')}
          </tbody>
        </table></div>
      `) : empty('No hay lotes en este filtro')}
    `;

    container.querySelectorAll('[data-filtro]').forEach((b) =>
      b.addEventListener('click', () => { filtro = b.dataset.filtro; draw(); }));
    container.querySelectorAll('[data-rev]').forEach((b) =>
      b.addEventListener('click', () => { selLote = b.dataset.rev; saveMode = 'conservar'; draw(); window.scrollTo({ top: 0, behavior: 'smooth' }); }));
    const buscar = container.querySelector('#buscar');
    if (buscar) buscar.addEventListener('input', () => {
      q = buscar.value;
      // redibujar solo la tabla mantendría el foco; aquí basta redibujar todo y re-enfocar
      drawLista();
      const s = container.querySelector('#buscar'); s.focus(); s.setSelectionRange(s.value.length, s.value.length);
    });
  }

  // ---------------- EDITOR ----------------
  function drawEditor() {
    const g = gridSobre(selLote);
    if (!g) { selLote = ''; draw(); return; }

    const filas = g.periodos.map((p) => `
      <tr class="border-b border-gray-100 dark:border-gray-700/50">
        <td class="py-1.5 whitespace-nowrap">${mesLabel(p.periodo)}</td>
        <td class="text-right tabular-nums text-gray-400">${g.mensualidad ? money(g.mensualidad) : '—'}</td>
        <td class="text-right">
          <input data-mes="${p.periodo}" data-money inputmode="decimal" class="field !w-32 text-right tabular-nums"
                 value="${p.monto > 0 ? money(p.monto) : ''}" placeholder="$0.00" autocomplete="off" />
        </td>
        <td><input data-recibo="${p.periodo}" class="field !w-40" value="${esc(p.recibo || '')}" placeholder="Recibo / nota" autocomplete="off" /></td>
      </tr>`).join('');

    container.innerHTML = `
      ${sectionHead('Revisión de Sobre', btnGhost('← Volver a la lista', 'id="volver"'), 'envelope', 'bg-cyan-500')}

      ${card(`
        <div class="flex items-start justify-between gap-3 flex-wrap mb-1">
          <div>
            <h2 class="text-xl font-semibold">${esc(g.cliente)}</h2>
            <p class="text-sm text-gray-500">Lote <span class="font-medium text-gray-700 dark:text-gray-200">${esc(g.lote)}</span>
              · Mensualidad ${g.mensualidad ? money(g.mensualidad) : '—'}
              · Enganche ${money(g.enganche)}${g.fechaEnganche ? ` (${prettyDate(g.fechaEnganche)})` : ''}
              · Corte ${prettyDate(g.corte)}</p>
          </div>
          ${g.revisado ? badge('green', 'Ya revisado') : badge('yellow', 'Pendiente')}
        </div>
      `)}

      <!-- Resumen de cuadre (en vivo) -->
      ${card(`
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
          <div><p class="text-[11px] uppercase tracking-wide text-gray-500">Enganche</p><p class="font-semibold tabular-nums">${money(g.enganche)}</p></div>
          <div><p class="text-[11px] uppercase tracking-wide text-gray-500">Abonos capturados</p><p id="cap-abonos" class="font-semibold tabular-nums">$0.00</p></div>
          <div><p class="text-[11px] uppercase tracking-wide text-gray-500">Capturado total</p><p id="cap-total" class="font-semibold tabular-nums">${money(g.enganche)}</p></div>
          <div><p class="text-[11px] uppercase tracking-wide text-gray-500">Total conciliado</p><p class="font-semibold tabular-nums">${money(g.totalConciliado)}</p></div>
        </div>
        <div id="dif-banner" class="mt-3 rounded-lg px-3 py-2 text-sm hidden"></div>
        <div id="modo-box" class="mt-3 hidden text-sm">
          <p class="font-medium mb-1">Hay una diferencia. Al guardar:</p>
          <label class="flex items-center gap-2 mb-1"><input type="radio" name="modo" value="conservar" checked /> Conservar el total anterior <span id="m-conservar" class="text-gray-500"></span></label>
          <label class="flex items-center gap-2"><input type="radio" name="modo" value="adoptar" /> Adoptar el total del sobre <span id="m-adoptar" class="text-gray-500"></span></label>
        </div>
      `, 'border-2 border-cyan-200 dark:border-cyan-800')}

      ${card(`
        <h3 class="font-semibold mb-2">Pagos mes a mes (según el sobre)</h3>
        <div class="table-wrap" style="max-height:480px;overflow-y:auto"><table class="w-full text-sm">
          <thead class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800">
            <tr><th class="py-2">Mes</th><th class="text-right">Mensualidad</th><th class="text-right">Pagado (sobre)</th><th>Recibo / nota</th></tr>
          </thead>
          <tbody>${filas || '<tr><td colspan="4" class="py-3 text-gray-400">Sin meses en el rango</td></tr>'}</tbody>
        </table></div>
        <div class="flex gap-2 mt-3 flex-wrap">
          ${btn('Guardar revisión', 'id="guardar"')}
          ${g.mensualidad ? btnGhost('Llenar vacíos con la mensualidad', 'id="llenar"') : ''}
          ${btnGhost('Cancelar', 'id="cancelar"')}
        </div>
        <p class="text-xs text-gray-400 mt-2">Captura el monto realmente pagado cada mes (0 o vacío si ese mes no pagó). Al guardar se recalcula el atraso del lote.</p>
      `)}
    `;

    const fmt = (n) => money(n);
    const leerMeses = () => container.querySelectorAll('[data-mes]');
    const recompute = () => {
      let sumAbonos = 0;
      leerMeses().forEach((i) => { sumAbonos += toNum(i.value); });
      const capTotal = g.enganche + sumAbonos;
      const dif = Math.round((g.totalConciliado - capTotal) * 100) / 100;
      container.querySelector('#cap-abonos').textContent = fmt(sumAbonos);
      container.querySelector('#cap-total').textContent = fmt(capTotal);
      const banner = container.querySelector('#dif-banner');
      const modoBox = container.querySelector('#modo-box');
      if (Math.abs(dif) < 0.01) {
        banner.className = 'mt-3 rounded-lg px-3 py-2 text-sm bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
        banner.textContent = '✓ Cuadra con el total conciliado del sistema.';
        modoBox.classList.add('hidden');
      } else {
        const falta = dif > 0;
        banner.className = 'mt-3 rounded-lg px-3 py-2 text-sm bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
        banner.textContent = `Diferencia de ${fmt(Math.abs(dif))} — ${falta ? 'lo capturado es MENOR que el total conciliado' : 'lo capturado es MAYOR que el total conciliado'}.`;
        modoBox.classList.remove('hidden');
        container.querySelector('#m-conservar').textContent = `→ saldo no cambia (${fmt(g.totalConciliado)}); la diferencia ${fmt(dif)} queda como ajuste.`;
        container.querySelector('#m-adoptar').textContent = `→ el total pasa a ${fmt(capTotal)} y el saldo se recalcula.`;
      }
    };

    leerMeses().forEach((i) => i.addEventListener('input', recompute));
    container.querySelectorAll('input[name="modo"]').forEach((r) =>
      r.addEventListener('change', () => { saveMode = r.value; }));
    container.querySelector('#volver').addEventListener('click', () => { selLote = ''; draw(); });
    container.querySelector('#cancelar').addEventListener('click', () => { selLote = ''; draw(); });
    container.querySelector('#llenar')?.addEventListener('click', () => {
      leerMeses().forEach((i) => { if (toNum(i.value) === 0) i.value = money(g.mensualidad); });
      recompute();
    });
    container.querySelector('#guardar').addEventListener('click', () => guardar(g));

    recompute();
  }

  async function guardar(g) {
    const meses = [];
    container.querySelectorAll('[data-mes]').forEach((i) => {
      const periodo = i.dataset.mes;
      const monto = toNum(i.value);
      const recibo = (container.querySelector(`[data-recibo="${periodo}"]`)?.value || '').trim();
      if (monto > 0 || recibo) meses.push({ periodo, monto, recibo });
    });
    const sumAbonos = meses.reduce((a, m) => a + m.monto, 0);
    const capTotal = g.enganche + sumAbonos;
    const dif = Math.round((g.totalConciliado - capTotal) * 100) / 100;
    const ajuste = (Math.abs(dif) >= 0.01 && saveMode === 'conservar') ? dif : 0;

    const doc = {
      lote: g.lote, cliente: g.cliente, etapa: g.etapa,
      enganche: g.enganche, fechaEnganche: g.fechaEnganche, inicio: g.inicio,
      meses, ajuste,
      totalConciliadoPrev: g.totalConciliado,
      revisado: true, fecha: todayISO(), usuario: getSession()?.name || '',
    };

    try {
      if (g.sobre && g.sobre.id) await sobresStore.update(g.sobre.id, doc);
      else await sobresStore.create(doc);
      toast('Sobre revisado y atraso recalculado', 'success');
      selLote = '';
      draw();
    } catch (err) { toast(err.message || 'No se pudo guardar', 'error'); }
  }

  draw();
  // Mientras se edita un sobre no redibujamos por eventos en vivo (evita perder
  // la captura en curso); la lista sí se refresca con los cambios.
  return subscribe(() => { if (!selLote) draw(); });
}
