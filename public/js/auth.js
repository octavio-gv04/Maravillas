/**
 * auth.js — Autenticacion contra el servidor (JWT firmado en el backend).
 * Guarda la sesion en localStorage para sobrevivir recargas; el token se
 * adjunta a cada peticion de la API y al stream SSE.
 */

import { STORAGE_KEYS, ROLES } from './config.js';

/** Inicia sesion contra el servidor. @returns {Promise<boolean>} */
export async function login(user, pass) {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user, pass }),
  });
  if (!res.ok) return false;
  const data = await res.json(); // { token, user:{user,name,role} }
  localStorage.setItem(STORAGE_KEYS.session, JSON.stringify({
    token: data.token, ...data.user,
  }));
  return true;
}

export function logout() {
  localStorage.removeItem(STORAGE_KEYS.session);
}

/** Sesion activa (o null), validando expiracion local del token. */
export function getSession() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEYS.session));
    if (!s?.token) return null;
    const payload = JSON.parse(atob(s.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp && Date.now() > payload.exp) { logout(); return null; }
    return s;
  } catch { return null; }
}

export const isLogged = () => !!getSession();
export const getToken = () => getSession()?.token || null;

/** Permiso del rol de la sesion. */
export function can(permiso) {
  const s = getSession();
  return s ? (ROLES[s.role]?.can.includes(permiso) ?? false) : false;
}

/** Rol de la sesión activa (o null). */
export const role = () => getSession()?.role || null;

/** ¿La sesión es de captura diaria (Hillary)? Vista operativa sin P&L. */
export const isCapturista = () => role() === 'capturista';
