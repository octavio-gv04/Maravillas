/**
 * server/realtime.js — Tiempo real con Server-Sent Events (SSE).
 *
 * Estandar HTTP, compatible con Safari/Chrome/Firefox/Edge, sin librerias.
 * El servidor mantiene una conexion abierta por cliente y difunde cada cambio.
 */

const clients = new Set();

/** Registra una conexion SSE (response de Express ya con cabeceras puestas). */
export function addClient(res, meta = {}) {
  const client = { res, meta };
  clients.add(client);
  res.on('close', () => clients.delete(client));
  return client;
}

export const clientCount = () => clients.size;

/** Difunde un evento a todos los clientes conectados. */
export function broadcast(payload) {
  const data = `event: change\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const c of clients) {
    try { c.res.write(data); } catch { clients.delete(c); }
  }
}

/** Ping periodico para mantener viva la conexion (proxies cortan inactivas). */
setInterval(() => {
  for (const c of clients) {
    try { c.res.write(': ping\n\n'); } catch { clients.delete(c); }
  }
}, 25000);
