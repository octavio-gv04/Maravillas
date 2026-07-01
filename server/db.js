/**
 * server/db.js — Persistencia compartida en archivo JSON (fuente única de verdad).
 *
 * Todos los clientes leen/escriben aquí a través de la API. Para un equipo
 * pequeño, un archivo JSON con escritura atómica (temp + rename) es suficiente
 * y sin dependencias. Migrable a SQL en el futuro sin tocar la API ni el front.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const SEED_FILE = path.join(__dirname, '..', 'public', 'data', 'seed.json');
// Seed de la Base de Datos Maestra (migrado del Excel "Base de Datos"): catálogo
// real de lotes/contratos + historial de pagos 2023-2026 de Etapa 3.
const MAESTRA_SEED_FILE = path.join(__dirname, '..', 'public', 'data', 'maestra-seed.json');

const EMPTY = () => ({
  ingresos: [], gastos: [], cortes: [], historial: [],
  // SKVO: operación de maquinaria con caja en efectivo propia (su efectivo forma
  // parte del Corte del Flujo). Ingresos (limpieza/servicios) y gastos (diésel,
  // refacciones, pagos semanales) capturados aparte del Sistema Diario.
  skvoIngresos: [], skvoGastos: [],
  // Datos maestros de la Base de Datos Maestra (Etapa 3). Historial del Excel +
  // pagos nuevos que llegan del Sistema Diario. `pagos` = historial migrado.
  lotes: [], contratos: [], vendedores: [], cobranza: [], pagos: [],
  // sobres = revisión manual del sobre físico del cliente: itemización real
  // mes a mes de un lote para corregir el historial y recalcular el atraso.
  sobres: [],
  // entregas = efectivo que Javier entrega a Sergio para cerrar el mes
  // (liquidación de socios: Utilidad de Sergio − Depósitos totales).
  entregas: [],
  recibos_seq: 0, folio_ingreso: 100, folio_gasto: 100, folio_contrato: 100,
  folio_skvo_ingreso: 200, folio_skvo_gasto: 100,
});

let db = EMPTY();

// ---------- Carga / guardado ----------
function load() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    try {
      db = { ...EMPTY(), ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) };
      seedMaestraIfEmpty(); // inyecta el Excel maestro si aún no está, aunque ya haya db.json
      normalizarExistentes(); // corrige nombres mal capturados (MAYÚSCULAS, etc.)
      save();
      return;
    } catch (e) { console.error('db.json corrupto, usando respaldo vacío:', e.message); }
  }
  // Primera ejecución: sembrar desde el Excel migrado si existe.
  if (fs.existsSync(SEED_FILE)) {
    try {
      const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
      db = { ...EMPTY(), ...seed };
      delete db._meta;
      console.log(`  Sembrado inicial: ${db.ingresos.length} ingresos, ${db.gastos.length} gastos`);
    } catch (e) { console.error('No se pudo sembrar:', e.message); }
  }
  seedMaestraIfEmpty();
  normalizarExistentes();
  save();
}

/**
 * Inyecta el catálogo y el historial de la Maestra (Excel) si aún no existen,
 * AUNQUE db.json ya tenga movimientos del Diario. Corre una sola vez: en cuanto
 * hay lotes, no vuelve a tocar nada (los pagos nuevos del Diario se acumulan
 * encima en tiempo real). Migrable a SQL sin cambios en el front.
 */
function seedMaestraIfEmpty() {
  if ((db.lotes && db.lotes.length) || !fs.existsSync(MAESTRA_SEED_FILE)) return;
  try {
    const m = JSON.parse(fs.readFileSync(MAESTRA_SEED_FILE, 'utf8'));
    db.lotes = (m.lotes || []).map((x) => ({ id: uid(), ...x }));
    db.contratos = (m.contratos || []).map((x) => ({ id: uid(), ...x }));
    db.vendedores = (m.vendedores || []).map((x) => ({ id: uid(), ...x }));
    db.pagos = (m.pagos || []).map((x) => ({ id: uid(), ...x }));
    db.maestra_asof = m._meta?.asOf || '';
    console.log(`  Maestra sembrada: ${db.lotes.length} lotes, ${db.contratos.length} contratos, ${db.pagos.length} pagos`);
  } catch (e) { console.error('No se pudo sembrar la Maestra:', e.message); }
}

let saveTimer = null;
function save() {
  // Escritura atómica diferida (evita corromper el archivo ante escrituras seguidas).
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
    fs.renameSync(tmp, DB_FILE);
  }, 50);
}

const uid = () => Date.now().toString(36) + crypto.randomBytes(3).toString('hex');

// ---------- Normalización de nombres (Título: 1ª letra mayúscula, resto minúscula) ----------
// Las partículas españolas (de, del, la…) van en minúscula salvo al inicio.
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'da', 'do', 'van', 'von']);
function tituloNombre(s) {
  if (s == null || s === '') return s;
  return String(s).trim().replace(/\s+/g, ' ').toLowerCase().split(' ')
    .map((w, i) => (i > 0 && PARTICULAS.has(w)) ? w : (w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}
// Campos de nombre de persona a normalizar por colección.
const NAME_FIELDS = {
  ingresos: ['cliente'], gastos: ['beneficiario'], lotes: ['cliente'],
  contratos: ['cliente'], cobranza: ['cliente'], pagos: ['cliente'],
};
function normNombres(col, item) {
  for (const f of (NAME_FIELDS[col] || [])) if (item[f] != null) item[f] = tituloNombre(item[f]);
  return item;
}
/** Corrige de una vez todos los nombres ya capturados (incl. los del Excel en MAYÚSCULAS). */
function normalizarExistentes() {
  let changed = false;
  for (const [col, fields] of Object.entries(NAME_FIELDS)) {
    for (const it of (db[col] || [])) for (const f of fields) {
      if (it[f] != null) { const n = tituloNombre(it[f]); if (n !== it[f]) { it[f] = n; changed = true; } }
    }
  }
  if (changed) save();
}

// ---------- Bitácora ----------
function log(usuario, accion, detalle) {
  const entry = {
    id: uid(),
    fecha: new Date().toISOString().slice(0, 10),
    hora: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
    usuario, accion, detalle,
  };
  db.historial.unshift(entry);
  db.historial = db.historial.slice(0, 1000);
  return entry;
}

// ---------- API de dominio (devuelve {item/ id, historial} para difundir) ----------
export const getState = () => db;

const labels = {
  ingresos: 'Ingreso', gastos: 'Gasto',
  skvoIngresos: 'Ingreso SKVO', skvoGastos: 'Gasto SKVO',
  lotes: 'Lote', contratos: 'Contrato', vendedores: 'Vendedor', cobranza: 'Nota de cobranza',
  pagos: 'Pago', sobres: 'Sobre',
};
// Etiqueta de colección para la bitácora, con respaldo para que ninguna colección
// (presente o futura) genere un detalle que empiece con "undefined:".
const labelOf = (col) => labels[col] || 'Registro';

export function create(col, data, usuario) {
  const item = { id: uid(), creado: new Date().toISOString(), ...data };
  if (col === 'ingresos') {
    item.folio = ++db.folio_ingreso;
    item.recibo = 'R-' + String(++db.recibos_seq).padStart(5, '0');
  } else if (col === 'gastos') {
    item.folio = ++db.folio_gasto;
  } else if (col === 'skvoIngresos') {
    item.folio = ++db.folio_skvo_ingreso;
  } else if (col === 'skvoGastos') {
    item.folio = ++db.folio_skvo_gasto;
  } else if (col === 'contratos') {
    item.folio = 'C-' + String(++db.folio_contrato).padStart(4, '0');
  }
  normNombres(col, item);
  db[col].push(item);
  const h = log(usuario, 'Alta', `${labelOf(col)}: ${nombre(item)}`);
  save();
  return { item, historial: h };
}

/** Etiqueta legible de un registro para la bitácora (varía por colección). */
function nombre(item) {
  return item.concepto || item.descripcion || item.numero || item.nombre
    || item.cliente || item.folio || item.id;
}

export function update(col, id, data, usuario) {
  const idx = db[col].findIndex((x) => x.id === id);
  if (idx === -1) return null;
  db[col][idx] = { ...db[col][idx], ...data, id };
  normNombres(col, db[col][idx]);
  const h = log(usuario, 'Edición', `${labelOf(col)}: ${nombre(db[col][idx])}`);
  save();
  return { item: db[col][idx], historial: h };
}

export function remove(col, id, usuario) {
  const target = db[col].find((x) => x.id === id);
  db[col] = db[col].filter((x) => x.id !== id);
  const h = log(usuario, 'Eliminación', `${labelOf(col)}: ${target ? nombre(target) : id}`);
  save();
  return { id, historial: h };
}

/** Corte: uno por fecha (upsert). */
export function saveCorte(corte, usuario) {
  const idx = db.cortes.findIndex((c) => c.fecha === corte.fecha);
  if (idx === -1) { db.cortes.push({ id: uid(), ...corte }); }
  else { db.cortes[idx] = { ...db.cortes[idx], ...corte }; }
  const h = log(usuario, 'Corte', `Corte de caja ${corte.fecha}`);
  save();
  return { item: db.cortes.find((c) => c.fecha === corte.fecha), historial: h };
}

/**
 * Reemplaza todo (importar respaldo o resembrar desde el Excel).
 * Los datos maestros de la Maestra (lotes, contratos, vendedores, cobranza) se
 * CONSERVAN salvo que el respaldo los traiga explícitamente: el Excel del
 * Sistema Diario solo contiene movimientos, no la administración de Etapa 3.
 */
export function replaceAll(obj, usuario, motivo = 'Importación') {
  db = {
    ...EMPTY(),
    ingresos: obj.ingresos || [],
    gastos: obj.gastos || [],
    skvoIngresos: obj.skvoIngresos || db.skvoIngresos || [],
    skvoGastos: obj.skvoGastos || db.skvoGastos || [],
    cortes: obj.cortes || [],
    historial: obj.historial || db.historial,
    lotes: obj.lotes || db.lotes,
    contratos: obj.contratos || db.contratos,
    vendedores: obj.vendedores || db.vendedores,
    cobranza: obj.cobranza || db.cobranza,
    pagos: obj.pagos || db.pagos,
    maestra_asof: db.maestra_asof,
    recibos_seq: obj.recibos_seq || 0,
    folio_ingreso: obj.folio_ingreso || 100,
    folio_gasto: obj.folio_gasto || 100,
    folio_contrato: obj.folio_contrato || db.folio_contrato || 100,
    folio_skvo_ingreso: obj.folio_skvo_ingreso || db.folio_skvo_ingreso || 200,
    folio_skvo_gasto: obj.folio_skvo_gasto || db.folio_skvo_gasto || 100,
  };
  log(usuario, 'Respaldo', motivo);
  save();
  return getState();
}

/** Resembrar desde el seed.json del Excel. */
export function reseed(usuario) {
  if (!fs.existsSync(SEED_FILE)) throw new Error('No existe seed.json');
  const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  delete seed._meta;
  return replaceAll(seed, usuario, 'Datos recargados desde el Excel');
}

load();
