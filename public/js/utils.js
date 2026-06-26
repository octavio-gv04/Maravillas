/**
 * utils.js — Funciones puras de apoyo: formato, fechas, DOM y notificaciones.
 */

import { APP } from './config.js';

// ---------- Dinero ----------
const moneyFmt = new Intl.NumberFormat(APP.locale, {
  style: 'currency',
  currency: APP.currency,
  minimumFractionDigits: 2,
});

/** Formatea un numero a moneda local. Ej: 1234.5 -> "$1,234.50" */
export const money = (n) => moneyFmt.format(Number(n) || 0);

/** Convierte cualquier entrada a numero seguro (2 decimales). */
export const toNum = (v) => Math.round((Number(v) || 0) * 100) / 100;

// ---------- Fechas ----------
/** Fecha de hoy en formato ISO corto YYYY-MM-DD (zona local). */
export function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

/** Formatea YYYY-MM-DD a día/mes/año: "17/06/2026". */
export function prettyDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
}

/** Hora actual legible HH:MM. */
export const nowTime = () =>
  new Date().toLocaleTimeString(APP.locale, { hour: '2-digit', minute: '2-digit' });

// ---------- IDs ----------
/** Identificador unico simple (sin dependencias). */
export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- DOM ----------
/** querySelector corto. */
export const $ = (sel, root = document) => root.querySelector(sel);
/** querySelectorAll -> array. */
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Escapa texto para evitar inyeccion al usar innerHTML. */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ---------- Notificaciones (toasts) ----------
export function toast(msg, type = 'info') {
  const colors = {
    info: 'bg-gray-800',
    success: 'bg-green-600',
    error: 'bg-red-600',
    warn: 'bg-amber-600',
  };
  const el = document.createElement('div');
  el.className = `toast text-white text-sm px-4 py-3 rounded-lg shadow-lg ${colors[type] || colors.info}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

/** Confirmacion simple (envuelve window.confirm para centralizar/cambiar luego). */
export const confirmAction = (msg) => window.confirm(msg);
