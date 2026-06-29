/**
 * periodo.js — Mes activo COMPARTIDO del Control Mensual.
 *
 * Un único estado de "mes" (YYYY-MM) que sincroniza las vistas analíticas del
 * administrador (dashboard, flujo, conciliación, corte): al cambiarlo desde el
 * selector global de la barra superior —o desde el navegador de mes de cualquier
 * vista— todas responden al mismo periodo. Así el admin audita "el mes" de
 * corrido sin re-elegirlo en cada pantalla.
 *
 * No aplica a Captura Diaria: esas vistas trabajan sobre "hoy" con su propio
 * control (ver ingresos/gastos/skvo).
 */

import { todayISO } from './utils.js';

let _mes = todayISO().slice(0, 7); // 'YYYY-MM'
const subs = new Set();

export const getMes = () => _mes;

/** Cambia el mes activo y notifica a las vistas suscritas. */
export function setMes(m) {
  if (!m || m === _mes) return;
  _mes = m;
  subs.forEach((fn) => { try { fn(_mes); } catch {} });
}

/** Suscribe a cambios del mes. Devuelve la función para desuscribir. */
export function onMes(fn) { subs.add(fn); return () => subs.delete(fn); }

/** Primer día del mes (YYYY-MM-01). */
export const mesDesde = (m = _mes) => `${m}-01`;

/** Último día del mes (YYYY-MM-DD), respetando meses de 28/30/31 días. */
export function mesHasta(m = _mes) {
  const [y, mm] = m.split('-').map(Number);
  const dias = new Date(y, mm, 0).getDate(); // día 0 del mes siguiente = último de este
  return `${m}-${String(dias).padStart(2, '0')}`;
}

/** ¿El mes dado es el mes natural en curso? (para decidir el día por defecto). */
export const esMesActual = (m = _mes) => m === todayISO().slice(0, 7);
