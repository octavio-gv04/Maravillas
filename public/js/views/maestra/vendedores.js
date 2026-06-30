/**
 * views/maestra/vendedores.js — Vendedores de Etapa 3 e indicadores.
 * Cruza el alta maestra (nombre, % comisión) con el desempeño derivado de los
 * pagos del Diario: lotes vendidos, ingresos generados, clientes y comisión estimada.
 */

import { subscribe, vendedores } from '../../store.js';
import { vendedoresResumen, clientesDeVendedor, etapaActiva, keyOf, etapaBar, wireEtapaBar } from '../../maestra.js';
import { money, esc, prettyDate, toast, confirmAction } from '../../utils.js';
import { card, badge, empty, btn, btnGhost, sectionHead, field } from '../../ui.js';
import { iconChip } from '../../icons.js';
import { can } from '../../auth.js';
import { navigate } from '../../router.js';

const estadoBadge = (e) => ({ Liquidado: badge('green', 'Liquidado'), Activo: badge('green', 'Al corriente'), Moroso: badge('red', 'Moroso') }[e] || badge('yellow', e));

export function render(container) {
  let editing = null;
  let expanded = null; // nombre del vendedor cuyo detalle de clientes está abierto

  const draw = () => {
    const filas = vendedoresResumen();
    const puedeEditar = can('crear');

    const formHTML = editing ? card(`
      <h3 class="font-semibold mb-3">${editing.id ? 'Editar vendedor' : 'Nuevo vendedor'}</h3>
      <form id="v-form" class="grid sm:grid-cols-3 gap-3">
        ${field({ label: 'Nombre', name: 'nombre', value: editing.nombre || '', attrs: 'required' })}
        ${field({ label: 'Comisión (%)', name: 'comision', type: 'number', value: editing.comision || '', attrs: 'step="0.1"' })}
        ${field({ label: 'Teléfono', name: 'telefono', value: editing.telefono || '' })}
        <div class="sm:col-span-3 flex gap-2 justify-end">
          ${btnGhost('Cancelar', 'type="button" id="cancel"')}
          ${btn(editing.id ? 'Guardar' : 'Crear', 'type="submit"')}
        </div>
      </form>`) : '';

    container.innerHTML = `
      ${sectionHead(`Vendedores — ${etapaActiva()}`, puedeEditar && !editing ? btn('+ Nuevo vendedor', 'id="new"') : '')}
      ${etapaBar()}
      ${formHTML}
      <div class="mt-4">${card(
        filas.length ? `<div class="table-wrap"><table class="w-full text-sm">
          <thead class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
            <tr><th class="py-2">Vendedor</th><th class="text-right">Lotes</th><th class="text-right">Clientes</th><th class="text-right">Ingresos generados</th><th class="text-right">Comisión total</th><th class="text-right">Por pagar</th><th class="text-right">% efec.</th>${puedeEditar ? '<th></th>' : ''}</tr>
          </thead>
          <tbody>
            ${filas.map((v) => `<tr class="border-b border-gray-100 dark:border-gray-700/50 ${keyOf(v.nombre) === keyOf(expanded) ? 'bg-brand/5' : ''}">
              <td class="py-2 font-medium"><button data-ver="${esc(v.nombre)}" class="text-left hover:text-brand">${keyOf(v.nombre) === keyOf(expanded) ? '▾' : '▸'} ${esc(v.nombre)}</button> ${v.master ? '' : '<span class="text-xs text-amber-500">(sin alta)</span>'}</td>
              <td class="text-right tabular-nums">${v.lotesVendidos}</td>
              <td class="text-right tabular-nums"><button data-ver="${esc(v.nombre)}" class="hover:text-brand underline-offset-2 hover:underline">${v.clientesACargo}</button></td>
              <td class="text-right tabular-nums text-green-600">${money(v.ingresosGenerados)}</td>
              <td class="text-right tabular-nums">${v.comisionTotal ? money(v.comisionTotal) : '—'}</td>
              <td class="text-right tabular-nums text-amber-600">${v.comisionExigible ? money(v.comisionExigible) : '—'}</td>
              <td class="text-right tabular-nums text-gray-500">${v.pctEfectivo ? v.pctEfectivo + '%' : '—'}</td>
              ${puedeEditar ? `<td class="text-right whitespace-nowrap">
                <button data-edit="${esc(v.master?.id || '')}" data-nombre="${esc(v.nombre)}" class="text-brand">${v.master ? 'Editar' : 'Dar de alta'}</button>
                ${v.master && can('eliminar') ? `· <button data-del="${esc(v.master.id)}" class="text-red-600">Borrar</button>` : ''}
              </td>` : ''}
            </tr>`).join('')}
          </tbody></table></div>
          <p class="text-xs text-gray-400 mt-2">"Por pagar" = comisión de ventas con el enganche ya cubierto (lista para pagarse al vendedor). "% efec." = comisión total ÷ venta total.</p>` : empty('Sin vendedores. Surgen de los pagos o se dan de alta aquí.'))}
      </div>
      ${expanded ? detalleVendedor(expanded) : ''}
    `;

    wireEtapaBar(container, () => { editing = null; expanded = null; draw(); });
    container.querySelectorAll('[data-ver]').forEach((el) => el.addEventListener('click', () => {
      expanded = keyOf(expanded) === keyOf(el.dataset.ver) ? null : el.dataset.ver;
      draw();
    }));
    container.querySelectorAll('[data-cliente]').forEach((el) => el.addEventListener('click', () =>
      navigate('m/estado-cuenta', { k: el.dataset.cliente })));
    container.querySelector('#new')?.addEventListener('click', () => { editing = {}; draw(); });
    container.querySelector('#cancel')?.addEventListener('click', () => { editing = null; draw(); });
    container.querySelectorAll('[data-edit]').forEach((el) => el.addEventListener('click', () => {
      editing = el.dataset.edit ? vendedores.all().find((x) => x.id === el.dataset.edit) : { nombre: el.dataset.nombre };
      draw(); window.scrollTo({ top: 0, behavior: 'smooth' });
    }));
    container.querySelectorAll('[data-del]').forEach((el) => el.addEventListener('click', async () => {
      if (!confirmAction('¿Eliminar el alta de este vendedor? (sus ventas históricas se conservan)')) return;
      try { await vendedores.remove(el.dataset.del); toast('Vendedor eliminado', 'success'); }
      catch (err) { toast(err.message || 'Error', 'error'); }
    }));

    container.querySelector('#v-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const data = { nombre: f.nombre.value.trim(), comision: f.comision.value, telefono: f.telefono.value.trim() };
      try {
        if (editing.id) await vendedores.update(editing.id, data);
        else await vendedores.create(data);
        toast('Vendedor guardado', 'success'); editing = null; draw();
      } catch (err) { toast(err.message || 'Error al guardar', 'error'); }
    });
  };

  /** Tarjeta con todos los clientes con los que ha trabajado un vendedor. */
  function detalleVendedor(nombre) {
    const cli = clientesDeVendedor(nombre);
    const totalSaldo = cli.reduce((a, c) => a + (c.saldo || 0), 0);
    const totalPagado = cli.reduce((a, c) => a + (c.totalPagado || 0), 0);
    return `<div class="mt-4">${card(`
      <div class="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h3 class="flex items-center gap-2 font-semibold">${iconChip('users', 'bg-sky-500')}<span>Clientes de ${esc(nombre)}</span> <span class="text-sm font-normal text-gray-500">(${cli.length})</span></h3>
        <span class="text-sm text-gray-500">Pagado: <strong class="text-green-600">${money(totalPagado)}</strong> · Saldo: <strong class="text-red-600">${money(totalSaldo)}</strong></span>
      </div>
      ${cli.length ? `<div class="table-wrap"><table class="w-full text-sm">
        <thead class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
          <tr><th class="py-2">Cliente</th><th>Lote(s)</th><th class="text-right">Pagado</th><th class="text-right">Saldo</th><th>Estado</th><th>Últ. pago</th></tr>
        </thead>
        <tbody>
          ${cli.map((c) => `<tr class="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer" data-cliente="${esc(c.key)}">
            <td class="py-2 font-medium">${esc(c.nombre)}</td>
            <td class="text-gray-500">${esc(c.lotes.join(', ') || '—')}</td>
            <td class="text-right tabular-nums text-green-600">${money(c.totalPagado)}</td>
            <td class="text-right tabular-nums ${c.saldo > 0.01 ? 'text-red-600' : 'text-gray-400'}">${money(c.saldo)}</td>
            <td>${estadoBadge(c.estado)}</td>
            <td class="text-gray-500">${c.ultimoPago ? prettyDate(c.ultimoPago) : '—'}</td>
          </tr>`).join('')}
        </tbody></table></div>` : empty('Este vendedor no tiene clientes registrados')}
    `)}</div>`;
  }

  draw();
  const unsub = subscribe(draw);
  return unsub;
}
