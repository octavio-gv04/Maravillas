/**
 * views/maestra/lotes.js — Catálogo de lotes de Etapa 3 + mapa visual por manzana.
 *
 * El MAPA replica la hoja PLANO del Excel: cada manzana se dibuja como sus dos
 * hileras reales de lotes (superior descendente, inferior ascendente). El color
 * = estado del lote (cruzado con los pagos del Diario en tiempo real). Click en
 * un lote → editar su ficha. Debajo, la tabla completa con CRUD.
 */

import { subscribe, lotes } from '../../store.js';
import { lotesResumen, etapaActiva, keyOf } from '../../maestra.js';
import { money, esc, toast, confirmAction } from '../../utils.js';
import { card, badge, empty, btn, btnGhost, sectionHead, field, select, cardTitle } from '../../ui.js';
import { svgIcon, iconChip } from '../../icons.js';
import { can } from '../../auth.js';
import { catalogoCaptura } from '../../maestra.js';
import { ESTADOS_LOTE, ETAPA_MAESTRA_DEFAULT, VENDEDORES } from '../../config.js';

const colorEstado = (e) => ({ Disponible: 'green', Apartado: 'yellow', Vendido: 'red', Inactivo: 'yellow', Cancelado: 'yellow' }[e] || 'yellow');
const tileBg = (e) => ({ Disponible: 'bg-green-500', Apartado: 'bg-amber-500', Vendido: 'bg-blue-600', Inactivo: 'bg-gray-300 dark:bg-gray-600', Cancelado: 'bg-gray-400' }[e] || 'bg-gray-300');
const loteNum = (clave) => String(clave).replace(/^M\d+-?L?/i, '') || clave;
// "Seleccionar" es el placeholder de vendedor del Excel para lotes sin vender.
const cleanVend = (v) => (!v || /^seleccionar$/i.test(v.trim())) ? '' : v;

let plano = null;            // layout de PLANO (se carga una vez)
let planoLoading = false;

export function render(container) {
  let editing = null;        // lote en edición (objeto) o {} para nuevo, o null
  let vista = 'mapa';        // 'mapa' | 'tabla'
  let qManz = '';            // filtro de manzana en el mapa

  // Carga perezosa del plano (archivo estático migrado de la hoja PLANO).
  if (!plano && !planoLoading) {
    planoLoading = true;
    fetch('/data/plano.json').then((r) => r.ok ? r.json() : null)
      .then((j) => { plano = j || { manzanas: [] }; draw(); })
      .catch(() => { plano = { manzanas: [] }; draw(); })
      .finally(() => { planoLoading = false; });
  }

  const draw = () => {
    const filas = lotesResumen();
    const puedeEditar = can('crear');
    const byClave = new Map(filas.map((l) => [keyOf(l.numero), l]));

    // ----- Mapa por manzana (según PLANO) -----
    const manzanas = (plano?.manzanas || []).filter((m) => !qManz || m.manzana === qManz);
    const tile = (clave) => {
      const l = byClave.get(keyOf(clave));
      const estado = l?.estado || 'Inactivo';
      return `<button data-edit="${esc(l?.id || '')}" title="${esc(clave)} · ${esc(estado)}${l?.cliente ? ' · 👤 ' + esc(l.cliente) : ''}${cleanVend(l?.vendedor) ? ' · 🤝 ' + esc(cleanVend(l.vendedor)) : ''}${l ? ' · saldo ' + money(l.saldo) : ''}"
        class="w-7 h-7 sm:w-8 sm:h-8 shrink-0 rounded ${tileBg(estado)} text-white text-[9px] font-medium flex items-center justify-center hover:ring-2 hover:ring-brand transition">${esc(loteNum(clave))}</button>`;
    };
    const bloque = (m) => `
      <div class="inline-block align-top border border-gray-200 dark:border-gray-700 rounded-lg p-2 m-1">
        <div class="text-xs font-semibold text-gray-500 mb-1">${esc(m.manzana)}</div>
        <div class="space-y-1">
          ${m.filas.map((fila) => `<div class="flex gap-1">${fila.map(tile).join('')}</div>`).join('')}
        </div>
      </div>`;

    const mapaHTML = !plano
      ? '<div class="text-center text-gray-400 py-8 text-sm">Cargando mapa…</div>'
      : (manzanas.length
        ? `<div class="overflow-x-auto -mx-1 pb-2 flex flex-wrap">${manzanas.map(bloque).join('')}</div>`
        : empty('La hoja PLANO no tiene manzanas para mostrar'));

    const manzOpts = ['', ...new Set((plano?.manzanas || []).map((m) => m.manzana))];

    // ----- Formulario CRUD -----
    const cat = catalogoCaptura();
    const vendList = [...new Set([...VENDEDORES, ...filas.map((l) => cleanVend(l.vendedor)).filter(Boolean)])].sort();
    const formHTML = editing ? card(`
      <h3 class="font-semibold mb-3">${editing.id ? 'Editar lote ' + esc(editing.numero || '') : 'Nuevo lote'}</h3>
      <form id="lote-form" class="grid sm:grid-cols-2 gap-3">
        ${field({ label: 'Número de lote', name: 'numero', value: editing.numero || '', attrs: 'required' })}
        ${field({ label: 'Manzana', name: 'manzana', value: editing.manzana || '' })}
        ${field({ label: 'Superficie (m²)', name: 'superficie', type: 'number', value: editing.superficie || '', attrs: 'step="0.01"' })}
        ${field({ label: 'Precio original', name: 'precio', type: 'number', value: editing.precio || '', attrs: 'step="0.01"' })}
        ${field({ label: 'Cliente / dueño', name: 'cliente', value: editing.cliente || '', attrs: 'list="dl-cli-lote" autocomplete="off"' })}
        ${field({ label: 'Vendedor', name: 'vendedor', value: cleanVend(editing.vendedor), attrs: 'list="dl-vend-lote" autocomplete="off"' })}
        ${select({ label: 'Estado', name: 'estado', options: ESTADOS_LOTE, value: editing.estado || 'Disponible' })}
        <div class="sm:col-span-2 flex gap-2 justify-end">
          ${btnGhost('Cancelar', 'type="button" id="cancel"')}
          ${btn(editing.id ? 'Guardar' : 'Crear', 'type="submit"')}
        </div>
        <datalist id="dl-cli-lote">${cat.nombres.map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>
        <datalist id="dl-vend-lote">${vendList.map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>
      </form>`) : '';

    container.innerHTML = `
      ${sectionHead(`Lotes — ${etapaActiva()}`, puedeEditar && !editing ? btn('+ Nuevo lote', 'id="new"') : '')}

      <div class="flex flex-wrap items-center gap-3 text-xs mb-3">
        <div class="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
          <button id="v-mapa" class="inline-flex items-center gap-1.5 px-3 py-1.5 ${vista === 'mapa' ? 'bg-brand text-white' : ''}">${svgIcon('map', 'w-4 h-4')} Mapa</button>
          <button id="v-tabla" class="inline-flex items-center gap-1.5 px-3 py-1.5 ${vista === 'tabla' ? 'bg-brand text-white' : ''}">${svgIcon('list', 'w-4 h-4')} Tabla</button>
        </div>
        ${['Disponible', 'Vendido', 'Inactivo'].map((e) =>
          `<span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded ${tileBg(e)}"></span>${e}</span>`).join('')}
        ${vista === 'mapa' ? `<select id="f-manz" class="field !w-auto !py-1 ml-auto">
          ${manzOpts.map((m) => `<option value="${esc(m)}" ${m === qManz ? 'selected' : ''}>${m ? 'Manzana ' + esc(m) : 'Todas las manzanas'}</option>`).join('')}
        </select>` : ''}
      </div>

      ${formHTML}

      ${vista === 'mapa' ? `<div class="mt-2">${card(`
        <h3 class="flex items-center gap-2 font-semibold mb-3">${iconChip('map', 'bg-green-500')}<span>Mapa de lotes</span> <span class="text-sm font-normal text-gray-500">(PLANO · ${(plano?.manzanas || []).length} manzanas)</span></h3>
        ${mapaHTML}
      `)}</div>` : `<div class="mt-2">${card(`
        <div class="table-wrap"><table class="w-full text-sm">
          <thead class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
            <tr><th class="py-2">Lote</th><th>Manzana</th><th>Superficie</th><th>Cliente / dueño</th><th>Vendedor</th><th class="text-right">Precio</th><th class="text-right">Abonado</th><th class="text-right">Saldo</th><th>Estado</th>${puedeEditar ? '<th></th>' : ''}</tr>
          </thead>
          <tbody>
            ${filas.map((l) => `<tr class="border-b border-gray-100 dark:border-gray-700/50">
              <td class="py-2 font-medium">${esc(l.numero)}</td>
              <td class="text-gray-500">${esc(l.manzana || '—')}</td>
              <td class="text-gray-500">${l.superficie ? esc(l.superficie) + ' m²' : '—'}</td>
              <td class="text-gray-500">${esc(l.cliente || '—')}</td>
              <td class="text-gray-500">${esc(cleanVend(l.vendedor) || '—')}</td>
              <td class="text-right tabular-nums">${l.precio ? money(l.precio) : '—'}</td>
              <td class="text-right tabular-nums text-green-600">${money(l.abonado)}</td>
              <td class="text-right tabular-nums ${l.saldo > 0.01 ? 'text-red-600' : 'text-gray-400'}">${money(l.saldo)}</td>
              <td>${badge(colorEstado(l.estado), l.estado)}</td>
              ${puedeEditar ? `<td class="text-right"><button data-edit="${esc(l.id)}" class="text-brand">Editar</button></td>` : ''}
            </tr>`).join('')}
          </tbody>
        </table></div>
      `)}</div>`}
    `;

    container.querySelector('#v-mapa')?.addEventListener('click', () => { vista = 'mapa'; draw(); });
    container.querySelector('#v-tabla')?.addEventListener('click', () => { vista = 'tabla'; draw(); });
    container.querySelector('#f-manz')?.addEventListener('change', (e) => { qManz = e.target.value; draw(); });
    container.querySelector('#new')?.addEventListener('click', () => { editing = {}; draw(); });
    container.querySelector('#cancel')?.addEventListener('click', () => { editing = null; draw(); });
    container.querySelectorAll('[data-edit]').forEach((el) => el.addEventListener('click', () => {
      if (!el.dataset.edit) return;
      const l = filas.find((x) => String(x.id) === el.dataset.edit);
      if (l) { editing = l; draw(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    }));

    container.querySelector('#lote-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const data = {
        numero: f.numero.value.trim().toUpperCase().replace(/\s+/g, ''), manzana: f.manzana.value.trim().toUpperCase().replace(/\s+/g, ''),
        superficie: f.superficie.value, precio: f.precio.value,
        cliente: f.cliente.value.trim(), vendedor: f.vendedor.value.trim(),
        estado: f.estado.value, etapa: editing.etapa || ETAPA_MAESTRA_DEFAULT,
      };
      try {
        if (editing.id) await lotes.update(editing.id, data);
        else await lotes.create(data);
        toast('Lote guardado', 'success'); editing = null; draw();
      } catch (err) { toast(err.message || 'Error al guardar', 'error'); }
    });
  };

  draw();
  const unsub = subscribe(draw);
  return unsub;
}
