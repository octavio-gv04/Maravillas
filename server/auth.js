/**
 * server/auth.js — Autenticacion real en el servidor (JWT firmado con HS256).
 * Usa node:crypto (sin dependencias externas). Seguro para exponer remotamente.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SECRET_FILE = path.join(__dirname, '..', 'data', '.secret');

// Secreto de firma: variable de entorno o autogenerado y persistido.
function loadSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  try { return fs.readFileSync(SECRET_FILE, 'utf8'); }
  catch {
    const s = crypto.randomBytes(48).toString('hex');
    fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
    fs.writeFileSync(SECRET_FILE, s);
    return s;
  }
}
const SECRET = loadSecret();

/**
 * Usuarios del sistema. Para agregar personas, añade entradas aquí
 * (o define USERS_JSON como variable de entorno con un arreglo JSON).
 * Roles: admin (todo), capturista (registrar/editar), supervisor (revisar).
 */
export const USERS = process.env.USERS_JSON
  ? JSON.parse(process.env.USERS_JSON)
  : [
      { user: 'admin', pass: 'admin123', name: 'Administrador', role: 'admin' },
      { user: 'capturista', pass: 'captura123', name: 'Capturista', role: 'capturista' },
      { user: 'supervisor', pass: 'super123', name: 'Supervisor', role: 'supervisor' },
    ];

const b64url = (buf) => Buffer.from(buf).toString('base64url');

function sign(payload) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const sig = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verify(token) {
  try {
    const [header, body, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url');
    const a = Buffer.from(sig); const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch { return null; }
}

/** Valida credenciales y devuelve {token, user} o null. */
export function login(user, pass) {
  const u = USERS.find((x) => x.user === user && x.pass === pass);
  if (!u) return null;
  const payload = {
    sub: u.user, name: u.name, role: u.role,
    iat: Date.now(), exp: Date.now() + 12 * 3600 * 1000, // 12 h
  };
  return { token: sign(payload), user: { user: u.user, name: u.name, role: u.role } };
}

/** Middleware Express: exige token válido (header Authorization o ?token=). */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
  const payload = token && verify(token);
  if (!payload) return res.status(401).json({ error: 'No autorizado' });
  req.user = payload;
  next();
}

/** Exige un permiso del rol. */
const PERMS = {
  admin: ['ver', 'crear', 'editar', 'eliminar', 'revisar'],
  capturista: ['ver', 'crear', 'editar', 'eliminar'],
  supervisor: ['ver', 'revisar'],
};
export const requirePerm = (perm) => (req, res, next) => {
  if (!PERMS[req.user.role]?.includes(perm)) return res.status(403).json({ error: 'Permiso insuficiente' });
  next();
};
