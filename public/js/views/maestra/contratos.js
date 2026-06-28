/**
 * views/maestra/contratos.js — Contratos de Etapa 3 (datos maestros, CRUD).
 * El folio lo asigna el servidor (C-####). Enlaza cliente + lote con precio,
 * enganche, plazo y mensualidad; el saldo real se ve en el estado de cuenta
 * (derivado de los pagos del Diario).
 */

import { subscribe, contratos } from '../../store.js';
import { clientes, lotesResumen, etapaActiva } from '../../maestra.js';
import { money, esc, prettyDate, todayISO, toast, confirmAction } from '../../utils.js';
import { card, badge, empty, btn, btnGhost, sectionHead, field, select } from '../../ui.js';
import { can } from '../../auth.js';
import { ESTADOS_CONTRATO } from '../../config.js';

const colorEstado = (e) => ({ Activo: 'green', Liquidado: 'green', Vencido: 'red', Cancelado: 'yellow' }[e] || 'yellow');

export function render(container) {
  let editing = null;

  const draw = () => {
    const list = contratos.all().slice().sort((a, b) => String(b.folio).localeCompare(String(a.folio)));
    const puedeEditar = can('crear');
    const cli = clientes();
    const lts = lotesResumen();

    const dataCli = cli.map((c) => `<option value="${esc(c.nombre)}">`).join('');
    const dataLote = lts.map((l) => `<option value="${esc(l.numero)}">`).join('');

    const formHTML = editing ? card(`
      <h3 class="font-semibold mb-3">${editing.id ? 'Editar contrato ' + esc(editing.folio || '') : 'Nuevo contrato'}</h3>
      <form id="ctr-form" class="grid sm:grid-cols-2 gap-3">
        <label class="block"><span class="text-xs font-medium text-gray-600 dark:text-gray-300">Cliente</span>
          <input class="field mt-1" name="cliente" list="dl-cli" value="${esc(editing.cliente || '')}" required /></label>
        <label class="block"><span class="text-xs font-medium text-gray-600 dark:text-gray-300">Lote</span>
          <input class="field mt-1 uppercase" name="lote" list="dl-lote" value="${esc(editing.lote || '')}" required /></label>
        ${field({ label: 'Fecha de firma', name: 'fechaFirma', type: 'date', value: editing.fechaFirma || todayISO() })}
        ${field({ label: 'Precio', name: 'precio', type: 'number', value: editing.precio || '', attrs: 'step="0.01"' })}
        ${field({ label: 'Enganche', name: 'enganche', type: 'number', value: editing.enganche || '', attrs: 'step="0.01"' })}
        ${field({ label: 'Plazo (meses)', name: 'plazo', type: 'number', value: editing.plazo || '' })}
        ${field({ label: 'Mensualidad', name: 'mensualidad', type: 'number', value: editing.mensualidad || '', attrs: 'step="0.01"' })}
        ${select({ label: 'Estado', name: 'estado', options: ESTADOS_CONTRATO, value: editing.estado || 'Activo' })}
        <div class="sm:col-span-2 flex gap-2 justify-end">
          ${btnGhost('Cancelar', 'type="button" id="cancel"')}
          ${btn(editing.id ? 'Guardar' : 'Crear', 'type="submit"')}
        </div>
      </form>
      <datalist id="dl-cli">${dataCli}</datalist>
      <datalist id="dl-lote">${dataLote}</datalist>
    `) : '';

    container.innerHTML = `
      ${sectionHead(`Contratos — ${etapaActiva()}`, puedeEditar && !editing ? btn('+ Nuevo contrato', 'id="new"') : '')}
      ${formHTML}
      <div class="mt-4">${card(
        list.length ? `<div class="table-wrap"><table class="w-full text-sm">
          <thead class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
            <tr><th class="py-2">Folio</th><th>Cliente</th><th>Lote</th><th>Firma</th><th class="text-right">Precio</th><th class="text-right">Enganche</th><th>Plazo</th><th>Estado</th>${puedeEditar ? '<th></th>' : ''}</tr>
          </thead>
          <tbody>
            ${list.map((c) => `<tr class="border-b border-gray-100 dark:border-gray-700/50">
              <td class="py-2 font-mono text-xs">${esc(c.folio || '—')}</td>
              <td class="font-medium">${esc(c.cliente)}</td>
              <td class="text-gray-500">${esc(c.lote || '—')}</td>
              <td class="text-gray-500">${c.fechaFirma ? prettyDate(c.fechaFirma) : '—'}</td>
              <td class="text-right tabular-nums">${money(c.precio)}</td>
              <td class="text-right tabular-nums">${money(c.enganche)}</td>
              <td class="text-gray-500">${esc(c.plazo || '—')}</td>
              <td>${badge(colorEstado(c.estado), c.estado || 'Activo')}</td>
              ${puedeEditar ? `<td class="text-right whitespace-nowrap">
                <button data-edit="${esc(c.id)}" class="text-brand">Editar</button>
                ${can('eliminar') ? `· <button data-del="${esc(c.id)}" class="text-red-600">Borrar</button>` : ''}
              </td>` : ''}
            </tr>`).join('')}
          </tbody></table></div>` : empty('Sin contratos. Crea el primero con "+ Nuevo contrato".'))}
      </div>
    `;

    container.querySelector('#new')?.addEventListener('click', () => { editing = {}; draw(); });
    container.querySelector('#cancel')?.addEventListener('click', () => { editing = null; draw(); });
    container.querySelectorAll('[data-edit]').forEach((el) => el.addEventListener('click', () => {
      editing = list.find((x) => x.id === el.dataset.edit); draw(); window.scrollTo({ top: 0, behavior: 'smooth' });
    }));
    container.querySelectorAll('[data-del]').forEach((el) => el.addEventListener('click', async () => {
      if (!confirmAction('¿Eliminar este contrato?')) return;
      try { await contratos.remove(el.dataset.del); toast('Contrato eliminado', 'success'); }
      catch (err) { toast(err.message || 'Error', 'error'); }
    }));

    container.querySelector('#ctr-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const data = {
        cliente: f.cliente.value.trim(), lote: f.lote.value.trim().toUpperCase(), fechaFirma: f.fechaFirma.value,
        precio: f.precio.value, enganche: f.enganche.value, plazo: f.plazo.value,
        mensualidad: f.mensualidad.value, estado: f.estado.value, etapa: editing.etapa || etapaActiva(),
      };
      try {
        if (editing.id) await contratos.update(editing.id, data);
        else await contratos.create(data);
        toast('Contrato guardado', 'success'); editing = null; draw();
      } catch (err) { toast(err.message || 'Error al guardar', 'error'); }
    });
  };

  draw();
  const unsub = subscribe(draw);
  return unsub;
}
