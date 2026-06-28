/**
 * maestra.js — Motor de la Base de Datos Maestra (Etapa 3) · master-driven.
 *
 * FUENTE DE VERDAD HÍBRIDA (decisión del usuario):
 *   • BASE: el Excel maestro migrado (colecciones `lotes`, `contratos`, `pagos`).
 *     Pagó/Debe/Retraso/Estado vienen YA calculados y cuadrados al corte (asOf).
 *   • DELTAS EN VIVO: los `ingresos` del Sistema Diario con etapa = Etapa 3 y
 *     fecha POSTERIOR al corte del Excel. Suman al pago, reducen el saldo y
 *     recalculan el retraso EN TIEMPO REAL (mismo canal SSE). Sin doble conteo
 *     (los pagos hasta el corte ya están en la base del Excel).
 *
 * La Maestra NO captura pagos (Regla de Oro #1): los nuevos llegan del Diario.
 * Arquitectura multi-etapa: todo cuelga de `etapaActiva()`.
 */

import {
  ingresos, gastos, lotes, contratos, vendedores,
  cobranza as cobranzaCol, pagos as pagosCol, maestraAsOf,
} from './store.js';
import { toNum, todayISO } from './utils.js';
import { ETAPA_MAESTRA_DEFAULT, ETAPAS_MAESTRA, STORAGE_ETAPA_MAESTRA, AGING_BUCKETS, CAT_ENGANCHE, CAT_ABONA_LOTE, CAT_VENTA_LOTE, MAESTRA_ASOF } from './config.js';

// ---------- Etapa activa (selector multi-etapa, recordada en localStorage) ----------
function _etapaInicial() {
  try {
    const guardada = localStorage.getItem(STORAGE_ETAPA_MAESTRA);
    if (guardada && ETAPAS_MAESTRA.includes(guardada)) return guardada;
  } catch {}
  return ETAPA_MAESTRA_DEFAULT;
}
let _etapa = _etapaInicial();
export const etapaActiva = () => _etapa;
export const setEtapa = (e) => {
  _etapa = e;
  try { localStorage.setItem(STORAGE_ETAPA_MAESTRA, e); } catch {}
};

// ---------- Helpers ----------
const ci = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
const keyOf = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const sum = (list, f = (x) => x.monto) => list.reduce((a, x) => a + toNum(f(x)), 0);
const asof = () => maestraAsOf() || MAESTRA_ASOF;
const groupBy = (list, keyfn) => {
  const m = new Map();
  for (const x of list) { const k = keyfn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return m;
};

/** Días entre dos fechas ISO (b − a). */
export function diasEntre(aISO, bISO = todayISO()) {
  if (!aISO) return null;
  return Math.round((new Date(bISO + 'T00:00:00') - new Date(aISO + 'T00:00:00')) / 86400000);
}

/** Segmento de morosidad a partir de meses de atraso (1 mes ≈ 30 días). */
export function bucketMeses(meses) {
  const dias = (meses || 0) * 30;
  return AGING_BUCKETS.find((b) => dias >= b.min && dias <= b.max) || AGING_BUCKETS[0];
}

// ---------- Conjuntos base ----------
export const lotesEtapa = () => lotes.all().filter((l) => !l.etapa || ci(l.etapa, _etapa));

/** Pagos NUEVOS del Diario (Etapa 3) posteriores al corte del Excel. */
export const pagosLive = () => ingresos.all().filter((x) => ci(x.etapa, _etapa) && (x.fecha || '') > asof());

/** Historial migrado del Excel (pagos hasta el corte). */
export const pagosHist = () => pagosCol.all().filter((p) => !p.etapa || ci(p.etapa, _etapa));

// índices por clave de lote (se recalculan en cada llamada; baratos para este volumen)
const idxLive = () => groupBy(pagosLive(), (p) => keyOf(p.lote));
const idxHist = () => groupBy(pagosHist(), (p) => keyOf(p.lote));

// ---------- Clientes (base Excel + deltas vivos) ----------
export function clientes() {
  const vendidos = lotesEtapa().filter((l) => ci(l.estado, 'Vendido') && l.cliente);
  const live = idxLive();
  const hist = idxHist();
  const byCli = new Map();

  for (const l of vendidos) {
    const lk = keyOf(l.numero);
    const liveL = live.get(lk) || [];
    const extra = sum(liveL);                       // pagos nuevos del Diario para este lote
    const mens = toNum(l.mensualidad);
    const pago = toNum(l.pago) + extra;
    const debe = Math.max(0, toNum(l.debe) - extra);
    const retr = Math.max(0, (Number(l.retrasoMeses) || 0) - (mens > 0 ? Math.floor(extra / mens) : 0));

    // última fecha de pago (histórico + vivo)
    let ultimo = '';
    for (const p of (hist.get(lk) || [])) if (p.fecha > ultimo) ultimo = p.fecha;
    for (const p of liveL) if ((p.fecha || '') > ultimo) ultimo = p.fecha;

    const k = keyOf(l.cliente);
    if (!byCli.has(k)) {
      byCli.set(k, {
        key: k, nombre: (l.cliente || '').trim(), lotes: [], vendedor: l.vendedor || '',
        telefono: l.telefono || '', totalPagado: 0, saldo: 0, precio: 0, enganche: 0,
        mensualidad: 0, plazo: 0, retrasoMeses: 0, ultimoPago: '', contrato: null,
      });
    }
    const c = byCli.get(k);
    c.lotes.push(l.numero);
    c.totalPagado += pago;
    c.saldo += debe;
    c.precio += toNum(l.precio);
    c.enganche += toNum(l.enganche);
    c.mensualidad += toNum(l.mensualidad);
    c.plazo = Math.max(c.plazo, Number(l.plazo) || 0);
    c.retrasoMeses = Math.max(c.retrasoMeses, retr);
    if (ultimo > c.ultimoPago) c.ultimoPago = ultimo;
    if (l.vendedor) c.vendedor = l.vendedor;
    if (l.telefono && l.telefono !== 'Sin Registro') c.telefono = l.telefono;
  }

  const ctrByCli = groupBy(contratos.all(), (x) => keyOf(x.cliente));
  return [...byCli.values()].map((c) => {
    const liquidado = c.saldo <= 0.01;
    const atrasoMeses = liquidado ? 0 : c.retrasoMeses;
    return {
      ...c,
      atrasoMeses,
      atraso: atrasoMeses * 30,                  // equivalente en días (para buckets)
      bucket: bucketMeses(atrasoMeses),
      estado: liquidado ? 'Liquidado' : (atrasoMeses > 0 ? 'Moroso' : 'Activo'),
      contrato: (ctrByCli.get(c.key) || [])[0] || null,
      numLotes: c.lotes.length,
    };
  }).sort((a, b) => a.nombre.localeCompare(b.nombre));
}

export const clientePorKey = (k) => clientes().find((c) => c.key === k) || null;

// ---------- Estado de cuenta ----------
export function estadoCuenta(clienteKey) {
  const c = clientePorKey(clienteKey);
  if (!c) return null;
  const ctr = c.contrato;
  const cut = asof();

  // Historial completo: pagos del Excel + pagos nuevos del Diario, de sus lotes.
  const claves = new Set(c.lotes.map(keyOf));
  const hist = pagosHist().filter((p) => claves.has(keyOf(p.lote)))
    .map((p) => ({ fecha: p.fecha, categoria: p.categoria, lote: p.lote, monto: toNum(p.monto), metodo: '', recibo: '', origen: 'Excel' }));
  const live = pagosLive().filter((p) => claves.has(keyOf(p.lote)))
    .map((p) => ({ fecha: p.fecha, categoria: p.categoria, lote: p.lote, monto: toNum(p.monto), metodo: p.metodo || '', recibo: p.recibo || '', saldo: p.saldo, origen: 'Diario' }));
  const pagos = [...hist, ...live].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  const intereses = sum(live.filter((p) => ci(p.categoria, 'Recargo')));
  const fechaEnganche = hist.filter((p) => ci(p.categoria, 'Enganche')).map((p) => p.fecha).sort()[0] || '';

  // --- Mensualidades: pagadas / por pagar (consistente con saldo y atraso) ---
  const mensualidad = c.mensualidad || (ctr ? toNum(ctr.mensualidad) : 0);
  const plazo = c.plazo || (ctr ? Number(ctr.plazo) || 0 : 0);
  const mesesPagados = mensualidad > 0
    ? Math.max(0, Math.round((c.totalPagado - c.enganche) / mensualidad)) : 0;
  const mesesRestantes = mensualidad > 0 ? Math.ceil(c.saldo / mensualidad) : 0;
  const plazoTotal = plazo || (mesesPagados + mesesRestantes);

  // --- ¿Va adelantado? Comparar lo pagado contra lo exigible por el tiempo transcurrido ---
  // "Monto del plazo transcurrido" = enganche + mensualidad × meses desde el inicio.
  const inicio = (fechaEnganche || (ctr && ctr.fechaFirma) || c.primerPago || '').slice(0, 7);
  const mesesTranscurridos = inicio ? Math.max(0, mesesEntre(inicio + '-01', todayISO())) : 0;
  const montoEsperado = Math.min(c.precio, c.enganche + mensualidad * mesesTranscurridos);
  const excedenteAdelanto = Math.max(0, c.totalPagado - montoEsperado);
  const adelantoMeses = mensualidad > 0 ? excedenteAdelanto / mensualidad : 0;
  const adelantado = excedenteAdelanto > 0.01 && c.saldo > 0.01 && c.atrasoMeses === 0;

  // Próximo vencimiento: el mes siguiente a las mensualidades ya cubiertas por completo
  // (si el cliente va adelantado, se recorre hacia adelante automáticamente).
  let proximoVencimiento = null;
  if (c.saldo > 0.01) {
    const cubiertas = mensualidad > 0 ? Math.floor((c.totalPagado - c.enganche) / mensualidad) : 0;
    if (inicio) {
      const d = new Date(inicio + '-01T00:00:00'); d.setMonth(d.getMonth() + cubiertas + 1);
      proximoVencimiento = d.toISOString().slice(0, 10);
    } else if (c.ultimoPago) {
      const d = new Date(c.ultimoPago + 'T00:00:00'); d.setMonth(d.getMonth() + 1);
      proximoVencimiento = d.toISOString().slice(0, 10);
    }
  }

  return {
    cliente: c, lotes: c.lotes,
    // Suma de los lotes del cliente (un cliente puede tener varios lotes/contratos).
    precioTotal: c.precio,
    enganche: c.enganche, fechaEnganche,
    totalPagado: c.totalPagado, saldo: c.saldo,
    mensualidad, plazo: plazoTotal,
    mesesPagados, mesesRestantes, mesesTranscurridos,
    adelantado, adelantoMeses, excedenteAdelanto,
    intereses, proximoVencimiento,
    atrasoMeses: c.atrasoMeses, bucket: c.bucket, estado: c.estado,
    pagos, calendario: calendarioPagos(c, pagos, mensualidad, mesesRestantes), asOf: cut,
    nuevosDelDiario: live.length,
  };
}

/** Meses entre dos fechas ISO (b − a). */
function mesesEntre(aISO, bISO) {
  const [ay, am] = aISO.split('-').map(Number);
  const [by, bm] = bISO.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}

/**
 * Calendario de mensualidades: los pagos reales (verde) + las mensualidades que
 * faltan, marcando como VENCIDAS (rojo, monto que debe) tantas como meses de
 * atraso, y el resto PENDIENTES (gris). Así coincide con el estado/atraso.
 */
function calendarioPagos(c, pagos, mensualidad, mesesRestantes) {
  const rows = pagos.slice().sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''))
    .map((p) => ({ fecha: p.fecha, concepto: p.categoria, metodo: p.metodo || '', monto: p.monto, estado: 'pagado' }));
  if (mensualidad > 0 && c.saldo > 0.01 && mesesRestantes > 0) {
    const base = (c.ultimoPago || c.fechaEnganche || todayISO()) + 'T00:00:00';
    for (let j = 1; j <= mesesRestantes; j++) {
      const d = new Date(base); d.setDate(1); d.setMonth(d.getMonth() + j);
      const restante = c.saldo - mensualidad * (j - 1);
      rows.push({
        fecha: d.toISOString().slice(0, 10),
        concepto: 'Mensualidad', metodo: '',
        monto: Math.max(0, Math.min(mensualidad, restante)),
        estado: j <= c.atrasoMeses ? 'vencido' : 'pendiente',
      });
    }
  }
  return rows;
}

// ---------- Cobranza ----------
export function cobranza() {
  const conSaldo = clientes().filter((c) => c.saldo > 0.01);
  const segmentos = AGING_BUCKETS.map((b) => {
    const lista = conSaldo.filter((c) => c.bucket.key === b.key);
    return { ...b, clientes: lista, total: sum(lista, (c) => c.saldo) };
  });
  const morosos = conSaldo.filter((c) => c.atrasoMeses > 0);
  return {
    segmentos,
    totalCartera: sum(conSaldo, (c) => c.saldo),
    porCobrarVencido: sum(morosos, (c) => c.saldo),
    clientesConSaldo: conSaldo.length, morosos: morosos.length,
  };
}

export const notasDe = (clienteKey) =>
  cobranzaCol.all().filter((n) => n.clienteKey === clienteKey)
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

// ---------- Lotes (catálogo completo + estado de venta) ----------
export function lotesResumen() {
  const live = idxLive();
  return lotesEtapa().map((l) => {
    const extra = sum(live.get(keyOf(l.numero)) || []);
    const abonado = toNum(l.pago) + extra;
    const saldo = Math.max(0, toNum(l.debe) - extra);
    return {
      ...l, enCatalogo: true,
      abonado, saldo, conVentas: ci(l.estado, 'Vendido'),
      estado: l.estado || 'Disponible',
    };
  }).sort((a, b) => String(a.numero).localeCompare(String(b.numero), 'es', { numeric: true }));
}

// ---------- Vendedores ----------
export function vendedoresResumen() {
  const vendidos = lotesEtapa().filter((l) => ci(l.estado, 'Vendido') && l.vendedor && !ci(l.vendedor, 'Seleccionar'));
  const live = idxLive();
  const reg = vendedores.all();
  const grupos = groupBy(vendidos, (l) => keyOf(l.vendedor));

  return [...grupos.entries()].map(([k, lts]) => {
    const nombre = lts[0].vendedor;
    const master = reg.find((v) => keyOf(v.nombre) === k) || null;
    const ingresosGen = lts.reduce((a, l) => a + toNum(l.pago) + sum(live.get(keyOf(l.numero)) || []), 0);
    const comisionMonto = sum(lts, (l) => l.comisionMonto);
    const clientesACargo = new Set(lts.map((l) => keyOf(l.cliente))).size;
    const pct = master ? toNum(master.comision) : (toNum(lts[0].comisionPct) || 0);
    return {
      nombre, master, lotesVendidos: lts.length, clientesACargo,
      ingresosGenerados: ingresosGen, pctComision: pct, comisionEstimada: comisionMonto,
    };
  }).sort((a, b) => b.ingresosGenerados - a.ingresosGenerados);
}

// ---------- Pagos unificados (para reportes / historial general) ----------
export function pagosEtapa() {
  const hist = pagosHist().map((p) => ({ fecha: p.fecha, recibo: '', cliente: p.cliente, lote: p.lote, categoria: p.categoria, metodo: 'Excel', monto: toNum(p.monto), saldo: '' }));
  const live = pagosLive().map((p) => ({ fecha: p.fecha, recibo: p.recibo || '', cliente: p.cliente, lote: p.lote, categoria: p.categoria, metodo: p.metodo || '', monto: toNum(p.monto), saldo: p.saldo ?? '' }));
  return [...hist, ...live].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
}

// ---------- Catálogo para autocompletar la captura del Control Diario ----------
/**
 * Índices del maestro para sugerir/autocompletar en los formularios del Diario:
 *  - nombres: clientes únicos (datalist)
 *  - lotesAll: claves de lote únicas (datalist)
 *  - porCliente: cliente → { nombre, lotes:Set, vendedor }
 *  - porLote: clave → { numero, cliente, vendedor }
 */
export function catalogoCaptura() {
  const porCliente = new Map();
  const porLote = new Map();
  const addCli = (nombre, lote, vendedor) => {
    const k = keyOf(nombre);
    if (!k) return;
    if (!porCliente.has(k)) porCliente.set(k, { nombre: String(nombre).trim(), lotes: new Set(), vendedor: '' });
    const r = porCliente.get(k);
    if (lote) r.lotes.add(lote);
    if (vendedor) r.vendedor = vendedor;
  };
  for (const l of lotesEtapa()) {
    porLote.set(keyOf(l.numero), { numero: l.numero, cliente: l.cliente || '', vendedor: l.vendedor || '' });
    if (l.cliente && ci(l.estado, 'Vendido')) addCli(l.cliente, l.numero, l.vendedor);
  }
  for (const c of contratos.all()) { addCli(c.cliente, c.lote, c.vendedor); }
  const nombres = [...porCliente.values()].map((r) => r.nombre).sort((a, b) => a.localeCompare(b));
  const lotesAll = [...porLote.values()].map((r) => r.numero)
    .sort((a, b) => String(a).localeCompare(String(b), 'es', { numeric: true }));
  return { porCliente, porLote, nombres, lotesAll };
}

/** Clientes con los que ha trabajado un vendedor (para el detalle de Vendedores). */
export function clientesDeVendedor(nombre) {
  const k = keyOf(nombre);
  return clientes().filter((c) => keyOf(c.vendedor) === k);
}

// ---------- Dashboard ----------
export function dashboard(mes = todayISO().slice(0, 7)) {
  const cli = clientes();
  const cob = cobranza();
  const lts = lotesEtapa();
  const pagosMes = pagosEtapa().filter((p) => (p.fecha || '').slice(0, 7) === mes);
  const contratosList = contratos.all();

  return {
    etapa: _etapa, mes, asOf: asof(),
    clientes: {
      total: cli.length,
      activos: cli.filter((c) => c.estado !== 'Liquidado').length,
      morosos: cob.morosos,
      liquidados: cli.filter((c) => c.estado === 'Liquidado').length,
    },
    cobranza: { cartera: cob.totalCartera, vencido: cob.porCobrarVencido, segmentos: cob.segmentos },
    ingresos: {
      mes: sum(pagosMes),
      enganche: sum(pagosMes.filter((p) => CAT_ENGANCHE.some((e) => ci(e, p.categoria)) || ci(p.categoria, 'Enganche'))),
      abonos: sum(pagosMes.filter((p) => ci(p.categoria, 'Abono'))),
      acumulado: sum(cli, (c) => c.totalPagado),
    },
    lotes: {
      total: lts.length,
      vendidos: lts.filter((l) => ci(l.estado, 'Vendido')).length,
      disponibles: lts.filter((l) => ci(l.estado, 'Disponible')).length,
      inactivos: lts.filter((l) => ci(l.estado, 'Inactivo')).length,
    },
    contratos: {
      total: contratosList.length,
      activos: contratosList.filter((c) => ci(c.estado, 'Activo')).length,
      liquidados: contratosList.filter((c) => ci(c.estado, 'Liquidado')).length,
    },
    serieIngresosMes: serieIngresosPorDia(mes),
  };
}

/** Serie de ingresos por día del mes (pagos del Excel + del Diario). */
export function serieIngresosPorDia(mes) {
  const [y, m] = mes.split('-').map(Number);
  const dias = new Date(y, m, 0).getDate();
  const pagosMes = pagosEtapa().filter((p) => (p.fecha || '').slice(0, 7) === mes);
  const labels = [], data = [];
  for (let d = 1; d <= dias; d++) {
    const iso = `${mes}-${String(d).padStart(2, '0')}`;
    labels.push(String(d));
    data.push(sum(pagosMes.filter((p) => p.fecha === iso)));
  }
  return { labels, data };
}

/**
 * Da de alta / actualiza el LOTE como "Vendido" a partir de una venta capturada
 * en el Diario (categorías Enganche / Promo 1er Mes / Contado). Así el cliente
 * nuevo entra al padrón de la Maestra (que se deriva de los lotes Vendido) sin
 * doble captura. NO sobreescribe un cliente ya asignado al lote.
 *
 * Datos comerciales (teléfono, email, precio, mensualidad) se guardan cuando se
 * proveen. Cliente/vendedor/fechaVenta solo se rellenan si están vacíos (no se
 * sobreescribe un cliente ya asignado).
 *
 * @param {{lote:string, cliente:string, vendedor?:string, etapa?:string, fecha?:string,
 *          telefono?:string, email?:string, precio?:number, mensualidad?:number}} v
 * @returns {Promise<{action:'create'|'update'|'none', numero:string, cliente:string}|null>}
 */
export async function registrarVentaLote({
  lote, cliente, vendedor = '', etapa = '', fecha = '',
  telefono = '', email = '', precio, mensualidad,
} = {}) {
  const numero = String(lote || '').trim();
  const nombre = String(cliente || '').trim();
  if (!numero || !nombre) return null; // sin lote o sin cliente no hay nada que registrar

  const tel = String(telefono || '').trim();
  const mail = String(email || '').trim();
  const pre = Number(precio) || 0;
  const mens = Number(mensualidad) || 0;
  const lk = keyOf(numero);
  const existente = lotes.all().find((l) => keyOf(l.numero) === lk);

  if (existente) {
    const patch = {};
    if (!ci(existente.estado, 'Vendido')) patch.estado = 'Vendido';
    if (!String(existente.cliente || '').trim()) patch.cliente = nombre;
    if (vendedor && !String(existente.vendedor || '').trim()) patch.vendedor = vendedor;
    if (fecha && !existente.fechaVenta) patch.fechaVenta = fecha;
    if (tel) patch.telefono = tel;
    if (mail) patch.email = mail;
    if (pre) patch.precio = pre;
    if (mens) patch.mensualidad = mens;
    if (!Object.keys(patch).length) return { action: 'none', numero, cliente: existente.cliente || nombre };
    await lotes.update(existente.id, patch);
    return { action: 'update', numero, cliente: patch.cliente || existente.cliente || nombre };
  }

  // Lote nuevo: lo creamos ya marcado como Vendido.
  await lotes.create({
    numero,
    manzana: numero.split('-')[0] || '',
    cliente: nombre,
    vendedor: vendedor || '',
    estado: 'Vendido',
    etapa: etapa || ETAPA_MAESTRA_DEFAULT,
    fechaVenta: fecha || '',
    telefono: tel,
    email: mail,
    precio: pre || undefined,
    mensualidad: mens || undefined,
    origen: 'diario',
  });
  return { action: 'create', numero, cliente: nombre };
}

/**
 * Información de un lote para una DEVOLUCIÓN: estado/venta, cliente, cuánto ha
 * pagado, saldo y comisión pagada (maestro + Diario). Alimenta el banner del
 * formulario de Devolución (igual que el de disponibilidad en Venta).
 * @param {string} clave clave de lote (p.ej. "M39-L25")
 */
export function infoLoteVenta(clave) {
  const k = keyOf(clave);
  const gasLote = gastos.all().filter((x) => keyOf(x.lote) === k);
  const comisionDiario = sum(gasLote.filter((x) => ci(x.categoria, 'Comisión')));
  const l = lotesResumen().find((x) => keyOf(x.numero) === k);
  if (l) {
    return {
      existe: true,
      estado: l.estado,
      vendido: ci(l.estado, 'Vendido'),
      cliente: l.cliente || '',
      vendedor: /seleccionar/i.test(l.vendedor || '') ? '' : (l.vendedor || ''),
      etapa: l.etapa || ETAPA_MAESTRA_DEFAULT,
      pagado: l.abonado,
      saldo: l.saldo,
      comision: toNum(l.comisionMonto) + comisionDiario,
    };
  }
  // No está en el maestro (lote de otra etapa o creado desde el Diario): derivar.
  const insLote = ingresos.all().filter((x) => keyOf(x.lote) === k);
  const pagado = sum(insLote.filter((x) => CAT_ABONA_LOTE.some((c) => ci(c, x.categoria))));
  const venta = insLote.filter((x) => CAT_VENTA_LOTE.some((c) => ci(c, x.categoria)));
  const ref = venta[0] || insLote[0] || {};
  return {
    existe: insLote.length > 0,
    estado: venta.length ? 'Vendido' : (insLote.length ? 'Con pagos' : 'Disponible'),
    vendido: venta.length > 0,
    cliente: ref.cliente || '',
    vendedor: ref.vendedor || '',
    etapa: ref.etapa || '',
    pagado,
    saldo: 0,
    comision: comisionDiario,
  };
}

/**
 * Cancela la venta de un lote (DEVOLUCIÓN): lo regresa a `Disponible` y limpia
 * los datos de la venta. Conserva precio/manzana/superficie (datos del lote en
 * sí) y NO toca los ingresos ya registrados (el dinero entró; la devolución se
 * registra aparte como gasto). Decisión del usuario: sin guardar historial del
 * cliente anterior en el lote.
 * @param {string} clave clave de lote
 */
export async function cancelarVentaLote(clave) {
  const k = keyOf(clave);
  const l = lotes.all().find((x) => keyOf(x.numero) === k);
  if (!l) return { action: 'none', numero: String(clave || '').trim() };
  await lotes.update(l.id, {
    estado: 'Disponible',
    cliente: '', vendedor: '', telefono: '', email: '',
    fechaVenta: '', fechaCompra: '', fechaTermino: '',
    pago: 0, debe: 0, abonado: 0, retrasoMeses: 0,
    enganche: 0, mensualidad: 0, plazo: 0,
    comisionMonto: 0, comisionPct: 0,
  });
  return { action: 'liberado', numero: l.numero };
}

export { ci, keyOf };
