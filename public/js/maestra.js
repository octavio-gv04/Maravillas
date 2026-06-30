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
  cobranza as cobranzaCol, pagos as pagosCol, sobres as sobresCol, maestraAsOf,
} from './store.js';
import { toNum, todayISO, esc } from './utils.js';
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

// ---------- Selector de etapa reutilizable (para cualquier vista de la Maestra) ----------
/**
 * Barra de pestañas de etapa para colocar justo debajo del encabezado de una
 * sección, y así cambiar de etapa sin volver al Dashboard. Usar con wireEtapaBar().
 */
export function etapaBar() {
  return `
    <p class="text-xs uppercase tracking-wide text-gray-500 mb-2">Elige la etapa</p>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 md:gap-3 mb-5" data-etapa-bar>
      ${ETAPAS_MAESTRA.map((e) => `
        <button type="button" data-etapa="${esc(e)}"
          class="px-4 py-3 rounded-xl border text-sm font-semibold text-center transition ${e === _etapa
            ? 'bg-brand text-white border-brand shadow'
            : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:border-brand hover:shadow-sm'}">${esc(e)}</button>`).join('')}
    </div>`;
}

/** Conecta la barra de etapa: al hacer clic cambia la etapa activa y redibuja. */
export function wireEtapaBar(container, redraw) {
  container.querySelectorAll('[data-etapa-bar] [data-etapa]').forEach((b) =>
    b.addEventListener('click', () => { setEtapa(b.dataset.etapa); if (redraw) redraw(); }));
}

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

/** Contratos de la etapa activa (mismo criterio que lotesEtapa). */
export const contratosEtapa = () => contratos.all().filter((c) => !c.etapa || ci(c.etapa, _etapa));

/** Pagos NUEVOS del Diario (Etapa 3) posteriores al corte del Excel. */
export const pagosLive = () => ingresos.all().filter((x) => ci(x.etapa, _etapa) && (x.fecha || '') > asof());

/** Historial migrado del Excel (pagos hasta el corte). */
export const pagosHist = () => pagosCol.all().filter((p) => !p.etapa || ci(p.etapa, _etapa));

// índices por clave de lote (se recalculan en cada llamada; baratos para este volumen)
const idxLive = () => groupBy(pagosLive(), (p) => keyOf(p.lote));
const idxHist = () => groupBy(pagosHist(), (p) => keyOf(p.lote));

// ---------- Revisión de Sobres (itemización real mes a mes del sobre físico) ----------
/** Índice clave de lote → último sobre REVISADO (corrige historial y atraso). */
const idxSobres = () => {
  const m = new Map();
  for (const s of sobresCol.all()) {
    if (!s || !s.revisado || !s.lote) continue;
    const k = keyOf(s.lote);
    const prev = m.get(k);
    if (!prev || (s.fecha || '') >= (prev.fecha || '')) m.set(k, s);
  }
  return m;
};
/** Sobre revisado de un lote (o null). */
export const sobreDe = (loteClave) => idxSobres().get(keyOf(loteClave)) || null;

/**
 * Atraso derivado de la línea de tiempo: compara lo exigible por el tiempo
 * transcurrido (enganche + mensualidad × meses desde el inicio) contra lo pagado.
 * Reemplaza el `retrasoMeses` del Excel cuando el sobre ya fue revisado.
 */
function retrasoDerivado({ inicioMes, mens, precio, enganche, totalPagado, hoy = todayISO() }) {
  if (mens <= 0) return 0;
  const debe = Math.max(0, precio - totalPagado);
  if (debe <= 0.01) return 0;
  const transc = mensualidadesExigibles(inicioMes, hoy);
  const esperado = Math.min(precio, enganche + mens * transc);
  const deficit = Math.max(0, esperado - totalPagado);
  const retr = Math.ceil(deficit / mens - 1e-9);
  const maxMeses = Math.ceil(debe / mens - 1e-9);   // no puede deber más meses que su saldo
  return Math.max(0, Math.min(retr, maxMeses));
}

// ---------- Cálculo financiero POR LOTE (base Excel + deltas vivos) ----------
/**
 * Estado financiero de un lote vendido cruzando la base del Excel con los pagos
 * nuevos del Diario: pago acumulado, saldo, meses de atraso y última fecha de
 * pago. Es la unidad de cálculo común para `clientes()` (agregado) y para la
 * cobranza/morosidad POR LOTE.
 */
function calcLote(l, live, hist, sobs) {
  const lk = keyOf(l.numero);
  const liveL = live.get(lk) || [];
  const extra = sum(liveL);                       // pagos nuevos del Diario para este lote
  const mens = toNum(l.mensualidad);
  const sob = sobs ? sobs.get(lk) : null;

  // Lote con SOBRE REVISADO: el sobre guarda el TOTAL verificado (lo que el cliente
  // físicamente ha pagado, según su sobre). Ese total es la VERDAD del lote: de ahí
  // salen saldo y atraso (vs la línea de tiempo). Los pagos del Diario son solo para
  // el corte de caja y NO se vuelven a sumar aquí (evita doble conteo).
  if (sob) {
    const precio = toNum(l.precio);
    const eng = toNum(l.enganche);                 // enganche contratado (para el "esperado")
    // Total verificado del sobre. Compat: sobres viejos traían meses + ajuste.
    const total = sob.total != null
      ? toNum(sob.total)
      : toNum(sob.enganche ?? l.enganche) + sum(sob.meses || [], (m) => m.monto) + toNum(sob.ajuste);
    const pago = total;
    const debe = Math.max(0, precio - pago);
    const inicioMes = (sob.inicio || (sob.fechaEnganche || '').slice(0, 7) || '');
    const retr = retrasoDerivado({ inicioMes, mens, precio, enganche: eng, totalPagado: pago });
    let ultimo = sob.fecha || sob.fechaEnganche || '';
    for (const p of liveL) if ((p.fecha || '') > ultimo) ultimo = p.fecha;
    return { mens, pago, debe, retr, ultimo, revisado: true };
  }

  const pago = toNum(l.pago) + extra;
  const debe = Math.max(0, toNum(l.debe) - extra);
  const retr = Math.max(0, (Number(l.retrasoMeses) || 0) - (mens > 0 ? Math.floor(extra / mens) : 0));

  // última fecha de pago (histórico + vivo)
  let ultimo = '';
  for (const p of (hist.get(lk) || [])) if (p.fecha > ultimo) ultimo = p.fecha;
  for (const p of liveL) if ((p.fecha || '') > ultimo) ultimo = p.fecha;

  return { mens, pago, debe, retr, ultimo, revisado: false };
}

/**
 * Cada lote vendido como fila independiente de cobranza (saldo/atraso propios).
 * A diferencia de `clientes()`, NO agrega los lotes de un mismo cliente: cada
 * lote refleja su propia situación. `clienteKey` permite ligar las notas de
 * gestión, que se guardan por cliente.
 */
export function lotesCliente() {
  const vendidos = lotesEtapa().filter((l) => ci(l.estado, 'Vendido') && l.cliente);
  const live = idxLive();
  const hist = idxHist();
  const sobs = idxSobres();
  return vendidos.map((l) => {
    const { mens, pago, debe, retr, ultimo, revisado } = calcLote(l, live, hist, sobs);
    const liquidado = debe <= 0.01;
    const atrasoMeses = liquidado ? 0 : retr;
    const lk = keyOf(l.numero);
    return {
      key: keyOf(l.cliente) + '|' + lk,        // único por lote (selección de fila)
      clienteKey: keyOf(l.cliente),            // para ligar notas (se guardan por cliente)
      nombre: (l.cliente || '').trim(),
      lote: l.numero, lotes: [l.numero],
      vendedor: /seleccionar/i.test(l.vendedor || '') ? '' : (l.vendedor || ''),
      telefono: l.telefono && l.telefono !== 'Sin Registro' ? l.telefono : '',
      totalPagado: pago, saldo: debe, mensualidad: mens,
      precio: toNum(l.precio), enganche: toNum(l.enganche), plazo: Number(l.plazo) || 0,
      atrasoMeses, atraso: atrasoMeses * 30,
      bucket: bucketMeses(atrasoMeses),
      estado: liquidado ? 'Liquidado' : (atrasoMeses > 0 ? 'Moroso' : 'Activo'),
      ultimoPago: ultimo, sobreRevisado: !!revisado,
    };
  }).sort((a, b) => a.nombre.localeCompare(b.nombre)
    || String(a.lote).localeCompare(String(b.lote), 'es', { numeric: true }));
}

// ---------- Clientes (base Excel + deltas vivos) ----------
export function clientes() {
  const vendidos = lotesEtapa().filter((l) => ci(l.estado, 'Vendido') && l.cliente);
  const live = idxLive();
  const hist = idxHist();
  const sobs = idxSobres();
  const byCli = new Map();

  for (const l of vendidos) {
    const { pago, debe, retr, ultimo } = calcLote(l, live, hist, sobs);

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

  const ctrByCli = groupBy(contratosEtapa(), (x) => keyOf(x.cliente));
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
/** Estado de cuenta agregado de un cliente (suma de todos sus lotes). */
export function estadoCuenta(clienteKey) {
  const c = clientePorKey(clienteKey);
  return c ? estadoDeCuenta(c) : null;
}

/** Estado de cuenta de UN solo lote (mismo cálculo, alcance de un lote). */
export function estadoCuentaLote(loteClave) {
  const c = lotesCliente().find((x) => keyOf(x.lote) === keyOf(loteClave));
  return c ? estadoDeCuenta(c) : null;
}

/**
 * Estado de cuenta de CADA lote de un cliente + la deuda total agregada.
 * Para mostrar el detalle por lote y la deuda total cuando un cliente tiene varios.
 */
export function cuentasDeCliente(clienteKey) {
  const ks = String(clienteKey ?? '');
  const cuentas = lotesCliente().filter((l) => l.clienteKey === ks).map((l) => estadoDeCuenta(l));
  return {
    cuentas,
    numLotes: cuentas.length,
    deudaTotal: cuentas.reduce((a, ec) => a + ec.saldo, 0),
    pagadoTotal: cuentas.reduce((a, ec) => a + ec.totalPagado, 0),
    precioTotal: cuentas.reduce((a, ec) => a + ec.precioTotal, 0),
  };
}

/**
 * Núcleo del estado de cuenta. `c` es una "cuenta" con: lotes[], precio, enganche,
 * mensualidad, plazo, totalPagado, saldo, atrasoMeses, ultimoPago, bucket, estado
 * y opcionalmente contrato. Sirve igual para un cliente (suma de lotes) o un lote.
 */
function estadoDeCuenta(c) {
  const ctr = c.contrato || null;
  const cut = asof();

  // Historial completo: para lotes con SOBRE REVISADO se usa la itemización real
  // del sobre; para el resto, los pagos del Excel. Más los pagos vivos del Diario.
  const claves = [...new Set(c.lotes.map(keyOf))];
  const sobs = idxSobres();
  const hist = [];
  for (const k of claves) {
    const sob = sobs.get(k);
    if (sob && sob.total != null) {
      // Sobre "solo total": una sola línea con el total verificado (no hay detalle mensual).
      hist.push({ fecha: sob.fecha || sob.fechaEnganche || '', categoria: 'Sobre (total verificado)', lote: sob.lote, monto: toNum(sob.total), metodo: 'Sobre', recibo: '', origen: 'Sobre' });
    } else if (sob) {
      // Compat: sobres viejos con itemización mensual.
      if (toNum(sob.enganche) > 0) hist.push({ fecha: sob.fechaEnganche || '', categoria: 'Enganche', lote: sob.lote, monto: toNum(sob.enganche), metodo: 'Sobre', recibo: '', origen: 'Sobre' });
      for (const m of (sob.meses || [])) if (toNum(m.monto) > 0) hist.push({ fecha: (m.periodo || '') + '-01', categoria: 'Abono', lote: sob.lote, monto: toNum(m.monto), metodo: 'Sobre', recibo: m.recibo || '', origen: 'Sobre' });
      if (toNum(sob.ajuste) > 0) hist.push({ fecha: sob.fechaEnganche || '', categoria: 'Ajuste', lote: sob.lote, monto: toNum(sob.ajuste), metodo: 'Sobre', recibo: '', origen: 'Sobre' });
    } else {
      for (const p of pagosHist()) if (keyOf(p.lote) === k) hist.push({ fecha: p.fecha, categoria: p.categoria, lote: p.lote, monto: toNum(p.monto), metodo: '', recibo: '', origen: 'Excel' });
    }
  }
  const live = pagosLive().filter((p) => claves.includes(keyOf(p.lote)))
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
  const mesesTranscurridos = mensualidadesExigibles(inicio);
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
 * Mensualidades EXIGIBLES a la fecha (para atraso / vencido / "adelantado").
 * Regla de negocio: la mensualidad del mes EN CURSO NO se exige ni cuenta como
 * vencida hasta que el mes termina y "brinca" al siguiente. `mesesEntre` ya
 * incrementa el conteo el día 1 del mes corriente, así que se descuenta 1 para
 * dejar fuera el mes en curso.
 */
function mensualidadesExigibles(inicioMes, hoy = todayISO()) {
  if (!inicioMes || inicioMes.length < 7) return 0;
  return Math.max(0, mesesEntre(inicioMes + '-01', hoy) - 1);
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
// "Vencido" en PESOS = el faltante REAL a la fecha: lo esperado (enganche +
// mensualidad × meses exigibles, SIN contar el mes en curso) menos lo pagado.
// NO son meses redondeados × mensualidad (eso inflaba el número). Coincide con el
// criterio del Excel: suma del déficit de cada cuenta "Con Deuda".
const vencidoPesos = (ec) => ec
  ? Math.max(0, Math.min(ec.precioTotal, ec.enganche + ec.mensualidad * ec.mesesTranscurridos) - ec.totalPagado)
  : 0;

// Total "Vencido" en pesos, sumado POR LOTE (cada lote con su propio déficit, sin
// netear contra otros lotes del mismo cliente). Es el mismo criterio del Excel y la
// única fuente de verdad para todas las vistas (General, Cobranza, Morosos, Dashboard).
// Llama a estadoDeCuenta() directo sobre cada fila (no estadoCuentaLote, que
// reconstruía toda la lista en cada llamada → O(n²)).
const vencidoTotalPorLote = () =>
  sum(lotesCliente().filter((l) => l.saldo > 0.01), (l) => vencidoPesos(estadoDeCuenta(l)));

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
    porCobrarVencido: vencidoTotalPorLote(),
    clientesConSaldo: conSaldo.length, morosos: morosos.length,
  };
}

/**
 * Cobranza segmentada POR LOTE (mismos buckets que `cobranza()`, pero cada lote
 * con su propio saldo/atraso, sin agregar por cliente). Para la vista de Morosos.
 */
export function cobranzaPorLote() {
  const conSaldo = lotesCliente().filter((c) => c.saldo > 0.01);
  const segmentos = AGING_BUCKETS.map((b) => {
    const lista = conSaldo.filter((c) => c.bucket.key === b.key);
    return { ...b, clientes: lista, total: sum(lista, (c) => c.saldo) };
  });
  const morosos = conSaldo.filter((c) => c.atrasoMeses > 0);
  return {
    segmentos,
    totalCartera: sum(conSaldo, (c) => c.saldo),
    porCobrarVencido: vencidoTotalPorLote(),
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
/** % de comisión por defecto registrado de un vendedor (o null si no está dado de alta). */
export function comisionVendedor(nombre) {
  const v = vendedores.all().find((x) => keyOf(x.nombre) === keyOf(nombre));
  return v ? toNum(v.comision) : null;
}

export function vendedoresResumen() {
  const vendidos = lotesEtapa().filter((l) => ci(l.estado, 'Vendido') && l.vendedor && !ci(l.vendedor, 'Seleccionar'));
  const live = idxLive();
  const reg = vendedores.all();
  const pagadoPorLote = new Map(lotesCliente().map((x) => [keyOf(x.lote), x.totalPagado]));
  const grupos = groupBy(vendidos, (l) => keyOf(l.vendedor));

  return [...grupos.entries()].map(([k, lts]) => {
    const nombre = lts[0].vendedor;
    const master = reg.find((v) => keyOf(v.nombre) === k) || null;
    const ingresosGen = lts.reduce((a, l) => a + toNum(l.pago) + sum(live.get(keyOf(l.numero)) || []), 0);
    const ventaTotal = sum(lts, (l) => toNum(l.precio));
    const comisionTotal = sum(lts, (l) => l.comisionMonto);
    // Comisión EXIGIBLE = la de ventas con el enganche ya cubierto (cliente pagó ≥ enganche):
    // es la regla de pago al vendedor.
    const comisionExigible = lts.reduce((a, l) => {
      const pagado = pagadoPorLote.get(keyOf(l.numero)) ?? (toNum(l.pago) + sum(live.get(keyOf(l.numero)) || []));
      return a + (pagado >= toNum(l.enganche) ? toNum(l.comisionMonto) : 0);
    }, 0);
    const clientesACargo = new Set(lts.map((l) => keyOf(l.cliente))).size;
    const pctEfectivo = ventaTotal ? Math.round(comisionTotal / ventaTotal * 1000) / 10 : 0;
    return {
      nombre, master, lotesVendidos: lts.length, clientesACargo,
      ingresosGenerados: ingresosGen, ventaTotal,
      comisionTotal, comisionExigible, pctEfectivo,
      pctDefault: master ? toNum(master.comision) : 0,
    };
  }).sort((a, b) => b.comisionTotal - a.comisionTotal);
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
  for (const c of contratosEtapa()) { addCli(c.cliente, c.lote, c.vendedor); }
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
  const contratosList = contratosEtapa();

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
  telefono = '', email = '', precio, mensualidad, comisionPct,
} = {}) {
  const numero = String(lote || '').trim();
  const nombre = String(cliente || '').trim();
  if (!numero || !nombre) return null; // sin lote o sin cliente no hay nada que registrar

  const tel = String(telefono || '').trim();
  const mail = String(email || '').trim();
  const pre = Number(precio) || 0;
  const mens = Number(mensualidad) || 0;
  const comPct = Number(comisionPct) || 0;   // % de comisión de ESTA venta
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
    if (comPct > 0) {
      const precioBase = pre || toNum(existente.precio);
      patch.comisionPct = comPct;
      patch.comisionMonto = Math.round(precioBase * comPct / 100);   // comisión = precio × %
    }
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
    comisionPct: comPct || undefined,
    comisionMonto: comPct ? Math.round(pre * comPct / 100) : undefined,   // comisión = precio × %
    origen: 'diario',
  });
  return { action: 'create', numero, cliente: nombre };
}

/**
 * Revierte la venta de un lote (al BORRAR el ingreso que la originó). Si el lote
 * lo creó el Diario (`origen: 'diario'`) se elimina; si venía del catálogo (Excel)
 * se regresa a Disponible y se limpian los datos del comprador. Solo debe llamarse
 * cuando el lote ya NO tiene otros pagos asociados (lo verifica quien la invoca).
 */
export async function revertirVentaLote(loteClave) {
  const lk = keyOf(loteClave);
  const l = lotes.all().find((x) => keyOf(x.numero) === lk);
  if (!l) return null;
  if (ci(l.origen, 'diario')) {
    await lotes.remove(l.id);
    return { action: 'delete', numero: l.numero };
  }
  await lotes.update(l.id, {
    estado: 'Disponible', cliente: '', vendedor: '',
    fechaVenta: '', telefono: '', email: '',
  });
  return { action: 'free', numero: l.numero };
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

// ---------- Revisión de Sobres: rejilla mensual + avance ----------
/**
 * Rejilla mensual para capturar/corregir un sobre: una fila por mes desde el
 * mes siguiente al enganche hasta el corte (asOf). Pre-llena con el sobre ya
 * revisado si existe; si no, con el itemizado del Excel agrupado por mes.
 * @param {string} loteClave clave de lote (p.ej. "M38-L01")
 */
export function gridSobre(loteClave) {
  const lk = keyOf(loteClave);
  const l = lotesEtapa().find((x) => keyOf(x.numero) === lk);
  if (!l) return null;
  const mens = toNum(l.mensualidad);
  const enganche = toNum(l.enganche);
  const precio = toNum(l.precio);
  const ctr = contratosEtapa().find((c) => keyOf(c.lote) === lk) || null;
  const histLote = pagosHist().filter((p) => keyOf(p.lote) === lk);
  const fechaEnganche = histLote.filter((p) => ci(p.categoria, 'Enganche')).map((p) => p.fecha).sort()[0]
    || l.fechaVenta || (ctr && ctr.fechaFirma) || '';
  const corte = asof();
  const startMes = (fechaEnganche || corte).slice(0, 7);
  const endMes = corte.slice(0, 7);
  const existente = sobreDe(lk);

  // Pre-llenado: del sobre revisado si existe; si no, del Excel (abonos por mes).
  const prefill = new Map();
  if (existente) {
    for (const m of existente.meses || []) prefill.set(m.periodo, { monto: toNum(m.monto), recibo: m.recibo || '', nota: m.nota || '' });
  } else {
    for (const p of histLote) {
      if (ci(p.categoria, 'Enganche')) continue;
      const per = (p.fecha || '').slice(0, 7);
      const cur = prefill.get(per) || { monto: 0, recibo: '', nota: '' };
      cur.monto += toNum(p.monto);
      prefill.set(per, cur);
    }
  }

  // La rejilla arranca el mes siguiente al enganche, PERO si hubiera un abono
  // anterior a eso (mismo mes del enganche, etc.) se incluye para no dejar fuera
  // ningún pago del itemizado (que el pre-llenado cuadre con el total).
  const periodos = [];
  const d = new Date(startMes + '-01T00:00:00');
  d.setMonth(d.getMonth() + 1);
  const primerPrefill = [...prefill.keys()].sort()[0];
  if (primerPrefill && primerPrefill < d.toISOString().slice(0, 7)) d.setTime(new Date(primerPrefill + '-01T00:00:00').getTime());
  const fin = new Date(endMes + '-01T00:00:00');
  while (d <= fin) {
    const per = d.toISOString().slice(0, 7);
    const pf = prefill.get(per) || { monto: 0, recibo: '', nota: '' };
    periodos.push({ periodo: per, esperado: mens, monto: pf.monto, recibo: pf.recibo, nota: pf.nota });
    d.setMonth(d.getMonth() + 1);
  }

  return {
    lote: l.numero, cliente: (l.cliente || '').trim(),
    etapa: l.etapa || _etapa,
    mensualidad: mens, precio, enganche, fechaEnganche,
    inicio: startMes, corte,
    totalConciliado: toNum(l.pago),                       // total que confía hoy el sistema (data)
    abonadoConciliado: Math.max(0, toNum(l.pago) - enganche),
    // Total verificado ya guardado del sobre (para precargar el campo). Compat con
    // sobres viejos que traían meses + ajuste.
    totalSobre: existente
      ? (existente.total != null
          ? toNum(existente.total)
          : toNum(existente.enganche ?? enganche) + sum(existente.meses || [], (m) => m.monto) + toNum(existente.ajuste))
      : null,
    periodos, sobre: existente || null,
    revisado: !!existente,
  };
}

/** Avance de la revisión de sobres (para el tablero del módulo). */
export function revisionSobresResumen() {
  const vend = lotesEtapa().filter((l) => ci(l.estado, 'Vendido') && l.cliente);
  const sobs = idxSobres();
  const revisados = vend.filter((l) => sobs.has(keyOf(l.numero))).length;
  return { total: vend.length, revisados, pendientes: vend.length - revisados };
}

export { ci, keyOf };
