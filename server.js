/**
 * server.js — Servidor central compartido (multiusuario + tiempo real).
 *
 * - Sirve la SPA estática.
 * - API REST autenticada (JWT) sobre una base JSON compartida (server/db.js).
 * - Tiempo real vía SSE (server/realtime.js): cada cambio se difunde a todos.
 *
 * Pensado para acceso remoto: escucha en 0.0.0.0. Migrable a SQL sin tocar el front.
 */

import express from 'express';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as db from './server/db.js';
import { login, requireAuth, requirePerm } from './server/auth.js';
import { addClient, broadcast, clientCount } from './server/realtime.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// ---------- Salud ----------
app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', clientes: clientCount(), ts: new Date().toISOString() }));

// ---------- Login ----------
app.post('/api/login', (req, res) => {
  const { user, pass } = req.body || {};
  const result = login(String(user || ''), String(pass || ''));
  if (!result) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  res.json(result);
});

// ---------- Estado completo (hidratación inicial) ----------
app.get('/api/state', requireAuth, (_req, res) => res.json(db.getState()));

// ---------- Tiempo real (SSE) ----------
app.get('/api/stream', requireAuth, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');           // reconexión automática del navegador
  res.write(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`);
  addClient(res, { user: req.user.sub });
});

// ---------- Cortes (upsert por fecha) ----------
// IMPORTANTE: las rutas específicas van ANTES de la genérica /api/:col.
app.post('/api/cortes', requireAuth, requirePerm('crear'), (req, res) => {
  const { item, historial } = db.saveCorte(req.body, req.user.name);
  broadcast({ kind: 'corte', item, historial });
  res.json(item);
});

// ---------- Importar respaldo / resembrar (solo admin) ----------
app.post('/api/import', requireAuth, requirePerm('eliminar'), (req, res) => {
  const state = db.replaceAll(req.body, req.user.name);
  broadcast({ kind: 'reset' });
  res.json({ ok: true, ingresos: state.ingresos.length, gastos: state.gastos.length });
});

app.post('/api/reseed', requireAuth, requirePerm('eliminar'), (req, res) => {
  try {
    const state = db.reseed(req.user.name);
    broadcast({ kind: 'reset' });
    res.json({ ok: true, ingresos: state.ingresos.length, gastos: state.gastos.length });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ---------- CRUD de colecciones ----------
// ingresos/gastos = Sistema Diario · lotes/contratos/vendedores/cobranza = Base de Datos Maestra.
const COLS = new Set(['ingresos', 'gastos', 'lotes', 'contratos', 'vendedores', 'cobranza', 'pagos']);

app.post('/api/:col', requireAuth, requirePerm('crear'), (req, res) => {
  if (!COLS.has(req.params.col)) return res.status(404).json({ error: 'Colección inválida' });
  const { item, historial } = db.create(req.params.col, req.body, req.user.name);
  broadcast({ kind: 'upsert', col: req.params.col, item, historial });
  res.json(item);
});

app.put('/api/:col/:id', requireAuth, requirePerm('editar'), (req, res) => {
  if (!COLS.has(req.params.col)) return res.status(404).json({ error: 'Colección inválida' });
  const r = db.update(req.params.col, req.params.id, req.body, req.user.name);
  if (!r) return res.status(404).json({ error: 'No encontrado' });
  broadcast({ kind: 'upsert', col: req.params.col, item: r.item, historial: r.historial });
  res.json(r.item);
});

app.delete('/api/:col/:id', requireAuth, requirePerm('eliminar'), (req, res) => {
  if (!COLS.has(req.params.col)) return res.status(404).json({ error: 'Colección inválida' });
  const { id, historial } = db.remove(req.params.col, req.params.id, req.user.name);
  broadcast({ kind: 'remove', col: req.params.col, id, historial });
  res.json({ ok: true });
});

// Fallback SPA.
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, HOST, () => {
  const nets = os.networkInterfaces();
  const lan = Object.values(nets).flat().find((n) => n.family === 'IPv4' && !n.internal)?.address;
  console.log('\n  Admin Financiera (multiusuario + tiempo real)');
  console.log(`  • Local:  http://localhost:${PORT}`);
  if (lan) console.log(`  • Red:    http://${lan}:${PORT}   (otros equipos en la misma red)`);
  console.log('');
});
