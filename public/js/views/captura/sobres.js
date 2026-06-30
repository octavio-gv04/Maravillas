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
import { money, esc, toNum, todayISO, toast } from '../../utils.js';
import { card, badge, empty, sectionHead, btn, btnGhost } from '../../ui.js';
import { getSession } from '../../auth.js';
import { queryParam } from '../../router.js';

export function render(container) {
  let q = '';
  let filtro = 'pendientes';   // pendientes | revisados | todos
  // `?lote=` abre directo en el editor de ese lote (botón desde el Estado de
  // cuenta del cliente). Sin parámetro, arranca en la lista.
  let selLote = queryParam('lote') || '';   // lote en edición (vacío = lista)

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

  // ---------------- EDITOR (solo total del sobre) ----------------
  function drawEditor() {
    const g = gridSobre(selLote);
    if (!g) { selLote = ''; draw(); return; }

    // Precarga: el total ya verificado del sobre si existe; si no, lo que tiene el sistema.
    const sysTotal = g.totalConciliado;
    const prefill = g.totalSobre != null ? g.totalSobre : sysTotal;

    container.innerHTML = `
      ${sectionHead('Revisión de Sobre', btnGhost('← Volver a la lista', 'id="volver"'), 'envelope', 'bg-cyan-500')}

      ${card(`
        <div class="flex items-start justify-between gap-3 flex-wrap mb-1">
          <div>
            <h2 class="text-xl font-semibold">${esc(g.cliente)}</h2>
            <p class="text-sm text-gray-500">Lote <span class="font-medium text-gray-700 dark:text-gray-200">${esc(g.lote)}</span>
              · Precio ${money(g.precio)}
              · Mensualidad ${g.mensualidad ? money(g.mensualidad) : '—'}
              · Enganche ${money(g.enganche)}</p>
          </div>
          ${g.revisado ? badge('green', 'Ya revisado') : badge('yellow', 'Pendiente')}
        </div>
      `)}

      ${card(`
        <h3 class="font-semibold mb-1">Total del sobre</h3>
        <p class="text-sm text-gray-500 mb-3">Escribe el <strong>total</strong> que el cliente trae pagado según su sobre físico (incluye enganche y todos los abonos). El sistema ajusta el saldo y el atraso con ese número.</p>
        <div class="grid sm:grid-cols-2 gap-4 items-start">
          <label class="block">
            <span class="text-[11px] uppercase tracking-wide text-gray-500">Total pagado (sobre)</span>
            <input id="sobre-total" data-money inputmode="decimal" class="field text-right tabular-nums text-lg mt-1"
                   value="${prefill ? money(prefill) : ''}" placeholder="$0.00" autocomplete="off" />
          </label>
          <div class="text-sm space-y-1 sm:pt-5">
            <div class="flex justify-between gap-4"><span class="text-gray-500">El sistema tiene registrado</span><span class="tabular-nums">${money(sysTotal)}</span></div>
            <div class="flex justify-between gap-4"><span class="text-gray-500">Diferencia</span><span id="dif" class="tabular-nums font-medium">—</span></div>
            <div class="flex justify-between gap-4 border-t border-gray-200 dark:border-gray-700 pt-1 mt-1"><span class="text-gray-500">Saldo resultante</span><span id="saldo-res" class="tabular-nums font-medium">—</span></div>
          </div>
        </div>
        <div class="flex gap-2 mt-4 flex-wrap">
          ${btn('Guardar revisión', 'id="guardar"')}
          ${btnGhost('Cancelar', 'id="cancelar"')}
        </div>
        <p class="text-xs text-gray-400 mt-2">Al guardar, este total se vuelve la verdad del lote: se recalcula el saldo y el atraso. Los pagos del Diario siguen siendo solo para el corte de caja.</p>
      `, 'border-2 border-cyan-200 dark:border-cyan-800')}
    `;

    const input = container.querySelector('#sobre-total');
    const recompute = () => {
      const total = toNum(input.value);
      const dif = Math.round((total - sysTotal) * 100) / 100;
      const difEl = container.querySelector('#dif');
      difEl.textContent = dif === 0 ? money(0) : (dif > 0 ? '+' : '−') + money(Math.abs(dif));
      difEl.className = 'tabular-nums font-medium ' + (dif > 0 ? 'text-green-600' : (dif < 0 ? 'text-red-600' : 'text-gray-500'));
      container.querySelector('#saldo-res').textContent = money(Math.max(0, g.precio - total));
    };
    input.addEventListener('input', recompute);
    recompute();

    container.querySelector('#volver').addEventListener('click', () => { selLote = ''; draw(); });
    container.querySelector('#cancelar').addEventListener('click', () => { selLote = ''; draw(); });
    container.querySelector('#guardar').addEventListener('click', () => guardar(g));
  }

  async function guardar(g) {
    const total = toNum(container.querySelector('#sobre-total').value);
    const doc = {
      lote: g.lote, cliente: g.cliente, etapa: g.etapa,
      total,                                   // total verificado del sobre = verdad del lote
      enganche: g.enganche, fechaEnganche: g.fechaEnganche, inicio: g.inicio,
      totalConciliadoPrev: g.totalConciliado,
      revisado: true, fecha: todayISO(), usuario: getSession()?.name || '',
    };

    try {
      if (g.sobre && g.sobre.id) await sobresStore.update(g.sobre.id, doc);
      else await sobresStore.create(doc);
      toast('Sobre revisado · saldo y atraso actualizados', 'success');
      selLote = '';
      draw();
    } catch (err) { toast(err.message || 'No se pudo guardar', 'error'); }
  }

  draw();
  // Mientras se edita un sobre no redibujamos por eventos en vivo (evita perder
  // la captura en curso); la lista sí se refresca con los cambios.
  return subscribe(() => { if (!selLote) draw(); });
}
