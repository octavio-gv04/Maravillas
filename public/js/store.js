/**
 * store.js — Capa de datos del cliente (servidor compartido + tiempo real).
 *
 * Modelo:
 *   - El SERVIDOR es la fuente de verdad (API REST). Aquí mantenemos una
 *     CACHÉ en memoria para que las vistas lean de forma síncrona (sin cambios).
 *   - TIEMPO REAL: un stream SSE recibe cada cambio de cualquier usuario y
 *     actualiza la caché → emit() → las vistas se redibujan al instante.
 *   - OFFLINE-FIRST: la caché se respalda en localStorage para leer sin conexión;
 *     las escrituras sin red se aplican de forma optimista y se encolan para
 *     enviarse al reconectar.
 */

import { STORAGE_KEYS } from './config.js';
import { getToken, logout } from './auth.js';

// ---------- Caché en memoria ----------
// Colecciones del Sistema Diario (ingresos/gastos/cortes) + Base de Datos Maestra
// (lotes/contratos/vendedores/cobranza). historial es la bitácora/auditoría compartida.
const EMPTY_CACHE = () => ({
  ingresos: [], gastos: [], cortes: [], historial: [],
  skvoIngresos: [], skvoGastos: [],
  lotes: [], contratos: [], vendedores: [], cobranza: [], pagos: [], sobres: [],
  entregas: [],
});
let cache = EMPTY_CACHE();

// ---------- Pub/Sub de datos ----------
const subscribers = new Set();
export function subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); }
function emit() { subscribers.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } }); }

// ---------- Estado de conexión (para el indicador de la UI) ----------
let status = { online: false, pending: 0 };
const statusSubs = new Set();
export function onStatus(fn) { statusSubs.add(fn); fn(status); return () => statusSubs.delete(fn); }
function setStatus(p) { status = { ...status, ...p }; statusSubs.forEach((fn) => fn(status)); }
export const getStatusInfo = () => status;

// ---------- Respaldo local de la caché (para offline) ----------
function persistLocal() {
  try { localStorage.setItem(STORAGE_KEYS.cache || 'af.v2.cache', JSON.stringify(cache)); } catch {}
}
function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.cache || 'af.v2.cache');
    if (raw) cache = { ...EMPTY_CACHE(), ...JSON.parse(raw) };
  } catch {}
}

// ---------- Cola de cambios offline ----------
const QKEY = 'af.v2.queue';
const readQueue = () => { try { return JSON.parse(localStorage.getItem(QKEY)) || []; } catch { return []; } };
const writeQueue = (q) => { localStorage.setItem(QKEY, JSON.stringify(q)); setStatus({ pending: q.length }); };

// ---------- Helper de red ----------
async function api(method, path, body) {
  const res = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { logout(); location.reload(); throw new Error('Sesión expirada'); }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || ('HTTP ' + res.status));
  return res.json();
}
const isNetErr = (e) => e instanceof TypeError || !navigator.onLine;

// ---------- Aplicar cambios a la caché ----------
function upsertById(arr, item) {
  const i = arr.findIndex((x) => x.id === item.id);
  if (i === -1) arr.push(item); else arr[i] = item;
}
function applyChange(p) {
  if (p.kind === 'upsert') upsertById(cache[p.col], p.item);
  else if (p.kind === 'remove') cache[p.col] = cache[p.col].filter((x) => x.id !== p.id);
  else if (p.kind === 'corte') {
    const i = cache.cortes.findIndex((c) => c.fecha === p.item.fecha);
    if (i === -1) cache.cortes.push(p.item); else cache.cortes[i] = p.item;
  } else if (p.kind === 'reset') { hydrate(); return; }
  if (p.historial) cache.historial.unshift(p.historial);
  persistLocal(); emit();
}

// ---------- Hidratación + stream SSE ----------
export async function hydrate() {
  try {
    const state = await api('GET', '/state');
    cache = { ...EMPTY_CACHE(), ...state };
    persistLocal(); setStatus({ online: true }); emit();
  } catch (e) { setStatus({ online: false }); }
}

let es = null;
function openStream() {
  if (es) es.close();
  es = new EventSource('/api/stream?token=' + encodeURIComponent(getToken()));
  es.addEventListener('hello', () => { setStatus({ online: true }); flushQueue(); });
  es.addEventListener('change', (ev) => applyChange(JSON.parse(ev.data)));
  es.onerror = () => setStatus({ online: false }); // EventSource reintenta solo
}

/** Arranque tras el login. */
export async function init() {
  loadLocal(); emit();          // muestra datos cacheados de inmediato
  await hydrate();              // estado fresco del servidor
  openStream();                // tiempo real
  flushQueue();
  window.addEventListener('online', () => flushQueue().then(hydrate));
  window.addEventListener('offline', () => setStatus({ online: false }));
}

// ---------- Envío de mutaciones (con respaldo offline) ----------
async function mutate(op, optimistic) {
  // op: { method, path, body }
  if (navigator.onLine) {
    try {
      const server = await api(op.method, op.path, op.body);
      // Aplicar de inmediato (idempotente; el SSE confirmará al resto).
      if (op.method === 'DELETE') applyChange({ kind: 'remove', col: op.col, id: op.id });
      else if (op.col === 'cortes') applyChange({ kind: 'corte', item: server });
      else applyChange({ kind: 'upsert', col: op.col, item: server });
      return server;
    } catch (e) {
      if (!isNetErr(e)) throw e; // error real (permiso/validación): propagar
    }
  }
  // Sin red: optimista + encolar.
  const q = readQueue(); q.push(op); writeQueue(q);
  if (optimistic) applyChange(optimistic);
  return optimistic?.item || null;
}

/** Reenvía la cola pendiente al reconectar. */
let flushing = false;
export async function flushQueue() {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  let q = readQueue();
  try {
    while (q.length) {
      const op = q[0];
      await api(op.method, op.path, op.body); // el servidor difunde por SSE
      q.shift(); writeQueue(q);
    }
    await hydrate(); // reconcilia con la verdad del servidor
  } catch (e) {
    if (!isNetErr(e)) { q.shift(); writeQueue(q); } // descarta op inválida y sigue
  } finally { flushing = false; }
}

// ---------- API de colecciones (igual interfaz que antes para las vistas) ----------
function makeCollection(col) {
  return {
    all: () => cache[col],
    byDate: (iso) => cache[col].filter((x) => x.fecha === iso),
    create: (data) => mutate(
      { method: 'POST', path: '/' + col, body: data, col },
      { kind: 'upsert', col, item: { id: 'tmp-' + Date.now(), folio: '—', creado: new Date().toISOString(), ...data } },
    ),
    update: (id, data) => mutate(
      { method: 'PUT', path: `/${col}/${id}`, body: data, col },
      { kind: 'upsert', col, item: { ...cache[col].find((x) => x.id === id), ...data, id } },
    ),
    remove: (id) => mutate(
      { method: 'DELETE', path: `/${col}/${id}`, col, id },
      { kind: 'remove', col, id },
    ),
  };
}

export const ingresos = makeCollection('ingresos');
export const gastos = makeCollection('gastos');
export const skvoIngresos = makeCollection('skvoIngresos');
export const skvoGastos = makeCollection('skvoGastos');

// Colecciones de la Base de Datos Maestra (datos maestros de Etapa 3).
export const lotes = makeCollection('lotes');
export const contratos = makeCollection('contratos');
export const vendedores = makeCollection('vendedores');
export const cobranza = makeCollection('cobranza');
export const pagos = makeCollection('pagos'); // historial migrado del Excel
export const sobres = makeCollection('sobres'); // revisión manual del sobre físico (itemización por mes)
export const entregas = makeCollection('entregas'); // entregas de efectivo Javier→Sergio (liquidación de socios)

/** Fecha de corte del Excel maestro (los pagos del Diario posteriores son "nuevos"). */
export const maestraAsOf = () => cache.maestra_asof || '';

export const cortes = {
  all: () => cache.cortes,
  byDate: (iso) => cache.cortes.find((c) => c.fecha === iso) || null,
  save: (corte) => mutate(
    { method: 'POST', path: '/cortes', body: corte, col: 'cortes' },
    { kind: 'corte', item: { id: 'tmp-' + Date.now(), ...corte } },
  ),
};

export const getHistorial = () => cache.historial;
export const isEmpty = () => cache.ingresos.length === 0 && cache.gastos.length === 0;

// ---------- Respaldo / restauración / resembrado ----------
export function exportBackup() {
  return {
    _meta: { app: 'admin-financiera', version: 2, fecha: new Date().toISOString() },
    ingresos: cache.ingresos, gastos: cache.gastos, cortes: cache.cortes, historial: cache.historial,
  };
}

export async function importBackup(obj) {
  if (!obj || obj._meta?.app !== 'admin-financiera') throw new Error('Respaldo inválido');
  await api('POST', '/import', obj); // el servidor difunde 'reset'
}

/** Recarga los datos del Excel en el SERVIDOR (afecta a todos). */
export async function seedFromExcel() {
  await api('POST', '/reseed');
}
