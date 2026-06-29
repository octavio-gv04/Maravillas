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

/** Convierte cualquier entrada a numero seguro (2 decimales). Tolera formato de
 *  moneda: "$60,050.00" -> 60050. (Quita todo menos dígitos, punto y signo). */
export const toNum = (v) => {
  const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, ''));
  return Math.round((n || 0) * 100) / 100;
};

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

/** Mes legible a partir de 'YYYY-MM': "2026-06" -> "Junio 2026". */
const MESES_LARGO = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
export function mesLargo(ym) {
  const [y, m] = String(ym || '').split('-');
  return m ? `${MESES_LARGO[+m] || ''} ${y}`.trim() : String(ym || '');
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

// ---------- Campos de dinero ($ + miles) ----------
/** Formatea a moneda todos los inputs [data-money] dentro de root. */
export function formatMoneyIn(root) {
  (root || document).querySelectorAll('[data-money]').forEach((el) => {
    el.value = el.value.trim() === '' ? '' : money(toNum(el.value));
  });
}

/**
 * Instala (una vez) el comportamiento de los campos de dinero: al enfocar se
 * muestra el número plano para editar; al salir se formatea como $1,234.00.
 * El guardado lee el valor con toNum, que ya tolera el formato.
 */
export function installMoneyInputs() {
  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (el && el.matches && el.matches('[data-money]')) {
      el.value = el.value.trim() === '' ? '' : String(toNum(el.value));
      try { el.select(); } catch {}
    }
  });
  document.addEventListener('focusout', (e) => {
    const el = e.target;
    if (el && el.matches && el.matches('[data-money]')) {
      el.value = el.value.trim() === '' ? '' : money(toNum(el.value));
    }
  });
}

// ---------- Validación de formularios en español ----------
/**
 * Traduce al español los globos de validación nativos del navegador
 * ("Please fill out this field", etc.). Se instala UNA vez a nivel documento;
 * el evento `invalid` no burbujea, por eso se escucha en fase de captura.
 */
export function localizeFormValidation() {
  const mensaje = (el) => {
    const v = el.validity;
    if (v.valueMissing) {
      return (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'radio')
        ? 'Selecciona una opción.' : 'Por favor, llena este campo.';
    }
    if (v.typeMismatch) {
      if (el.type === 'email') return 'Escribe un correo electrónico válido.';
      if (el.type === 'url') return 'Escribe una dirección web válida.';
      return 'El formato no es válido.';
    }
    if (v.rangeUnderflow) return `El valor debe ser mayor o igual a ${el.min}.`;
    if (v.rangeOverflow) return `El valor debe ser menor o igual a ${el.max}.`;
    if (v.stepMismatch) return 'El valor no es válido.';
    if (v.tooShort) return `Usa al menos ${el.minLength} caracteres.`;
    if (v.tooLong) return `Usa máximo ${el.maxLength} caracteres.`;
    if (v.patternMismatch) return 'El formato solicitado no coincide.';
    if (v.badInput) return 'Escribe un valor válido.';
    return 'Revisa este campo.';
  };
  document.addEventListener('invalid', (e) => {
    const el = e.target;
    if (el && typeof el.setCustomValidity === 'function') el.setCustomValidity(mensaje(el));
  }, true);
  // Limpia el mensaje custom al editar para que el campo pueda volver a ser válido.
  const limpiar = (e) => {
    const el = e.target;
    if (el && typeof el.setCustomValidity === 'function') el.setCustomValidity('');
  };
  document.addEventListener('input', limpiar, true);
  document.addEventListener('change', limpiar, true);
}
