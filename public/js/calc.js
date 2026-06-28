/**
 * calc.js — Logica de negocio financiera (calculos puros).
 * Replica las formulas del Excel "Sistema Diario": flujo por Etapa, desglose
 * por categoria, comisiones por vendedor y corte diario.
 */

import { ingresos, gastos, cortes, skvoIngresos, skvoGastos } from './store.js';
import { toNum } from './utils.js';
import {
  FLUJO_GRUPOS_INGRESO, VENDEDORES, FLUJO_ETAPAS, RESUMEN_CONCEPTOS,
  FLUJO_COMISION_CATS, FLUJO_GENERALES, FLUJO_ASIGNADOS, FLUJO_ETAPAS_COMPARTIDAS,
  SKVO_ETAPA_DEFAULT,
} from './config.js';

const sum = (list) => list.reduce((acc, x) => acc + toNum(x.monto), 0);

// Comparacion de texto insensible a mayusculas/espacios (como SUMIFS/COUNTIFS de Excel).
const ci = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

/** Filtra una lista por etapa (o todas si etapa es falsy/"Todas") y rango de fechas. */
function filtrar(list, { etapa, desde, hasta } = {}) {
  return list.filter((x) => {
    if (etapa && etapa !== 'Todas' && !ci(x.etapa, etapa)) return false;
    if (desde && x.fecha < desde) return false;
    if (hasta && x.fecha > hasta) return false;
    return true;
  });
}

/**
 * Resumen de un dia (base del Dashboard y Corte).
 * @param {string} iso fecha YYYY-MM-DD
 * @param {string} [etapa] opcional, filtra por etapa
 */
export function resumenDia(iso, etapa) {
  const ins = filtrar(ingresos.byDate(iso), { etapa });
  const gas = filtrar(gastos.byDate(iso), { etapa });

  const inEfectivo = sum(ins.filter((x) => x.metodo === 'Efectivo'));
  const inDeposito = sum(ins.filter((x) => x.metodo === 'Depósito'));
  const totalIngresos = inEfectivo + inDeposito;

  const gastosEfectivo = sum(gas.filter((x) => x.metodo === 'Efectivo'));
  const totalGastos = sum(gas);

  // SKVO: su caja en efectivo forma parte del Corte del Flujo del día. Es un
  // concepto de DÍA COMPLETO (no se reparte por etapa), así que solo entra
  // cuando no se filtra por etapa (el corte siempre es del día entero).
  const skvoIns = etapa ? [] : skvoIngresos.byDate(iso);
  const skvoGas = etapa ? [] : skvoGastos.byDate(iso);
  const skvoInEfectivo = sum(skvoIns.filter((x) => x.metodo === 'Efectivo'));
  const skvoGastosEfectivo = sum(skvoGas.filter((x) => x.metodo === 'Efectivo'));

  const neto = totalIngresos - totalGastos;
  const efectivoEsperado = (inEfectivo + skvoInEfectivo) - (gastosEfectivo + skvoGastosEfectivo);

  const corte = cortes.byDate(iso);
  const efectivoContado = corte ? toNum(corte.contado) : null;
  // Diferencia segun Excel: esperado (Corte del Flujo) - contado.
  const diferenciaCaja = corte ? efectivoEsperado - efectivoContado : null;

  return {
    fecha: iso, etapa: etapa || 'Todas',
    ingresos: { efectivo: inEfectivo, deposito: inDeposito, total: totalIngresos },
    gastos: { total: totalGastos, efectivo: gastosEfectivo },
    neto, efectivoEsperado, efectivoContado, diferenciaCaja, corte,
    skvo: { inEfectivo: skvoInEfectivo, gastosEfectivo: skvoGastosEfectivo },
    conteos: { ingresos: ins.length, gastos: gas.length },
  };
}

/**
 * Flujo de efectivo por Etapa (replica la hoja FLUJO del Excel).
 * @param {string} etapa
 * @param {{desde?:string,hasta?:string}} [periodo]
 */
export function flujoEtapa(etapa, periodo = {}) {
  const insEtapa = filtrar(ingresos.all(), { etapa, ...periodo });
  const gasEtapa = filtrar(gastos.all(), { etapa, ...periodo });
  const gasTodos = filtrar(gastos.all(), { ...periodo }); // sin filtro de etapa (para generales)

  // --- INGRESOS ---
  const efectivo = sum(insEtapa.filter((x) => x.metodo === 'Efectivo'));
  const deposito = sum(insEtapa.filter((x) => x.metodo === 'Depósito'));
  const totalIngresos = efectivo + deposito;

  const desglose = FLUJO_GRUPOS_INGRESO.map((g) => ({
    label: g.label,
    monto: sum(insEtapa.filter((x) => g.cats.some((c) => ci(c, x.categoria)))),
  }));
  const totalDesglose = desglose.reduce((a, d) => a + d.monto, 0);
  const conciliacion = totalIngresos - totalDesglose; // debe ser 0

  // --- COMISIONES (por vendedor, filtrado por etapa): Comisión + Base ---
  const comisiones = VENDEDORES.map((v) => {
    const comision = sum(gasEtapa.filter((x) => ci(x.recibe, v) && ci(x.categoria, 'Comisión')));
    const base = sum(gasEtapa.filter((x) => ci(x.recibe, v) && ci(x.categoria, 'Base')));
    const lotes = insEtapa.filter((x) => ci(x.vendedor, v) && ci(x.categoria, 'Enganche')).length;
    return { vendedor: v, comision, base, lotes };
  }).filter((c) => c.comision || c.base || c.lotes);
  const totalComision = sum(gasEtapa.filter((x) => ci(x.categoria, 'Comisión')));
  const totalBase = sum(gasEtapa.filter((x) => ci(x.categoria, 'Base')));
  const totalComisiones = totalComision + totalBase;

  // --- OPERACIÓN: Gastos Generales (compartidos ÷N) + Asignados a la etapa ---
  // Solo las etapas con bloque de flujo comparten los generales (San Jose -> 0).
  const comparteGenerales = FLUJO_ETAPAS.some((e) => ci(e, etapa));
  const cumple = (g, m) => Object.entries(m).every(([k, val]) => ci(g[k], val));
  const generales = FLUJO_GENERALES.map((row) => ({
    label: row.label,
    monto: comparteGenerales
      ? sum(gasTodos.filter((g) => cumple(g, row.match))) / FLUJO_ETAPAS_COMPARTIDAS
      : 0,
  }));
  const totalGenerales = generales.reduce((a, d) => a + d.monto, 0);

  const asignados = FLUJO_ASIGNADOS.map((cat) => ({
    label: cat,
    monto: sum(gasEtapa.filter((x) => ci(x.categoria, cat))),
  }));
  const totalAsignados = asignados.reduce((a, d) => a + d.monto, 0);

  const totalOperacion = totalGenerales + totalAsignados;

  // --- SKVO asignado a esta etapa (por REGISTRO; cada ingreso/gasto SKVO lleva
  // su etapa). Los registros sin etapa caen a la etapa por defecto (Etapa 3). ---
  const enPeriodo = (x) => (!periodo.desde || x.fecha >= periodo.desde) && (!periodo.hasta || x.fecha <= periodo.hasta);
  const asignadaAqui = (x) => ci(x.etapa || SKVO_ETAPA_DEFAULT, etapa);
  const skvoIns = skvoIngresos.all().filter((x) => enPeriodo(x) && asignadaAqui(x));
  const skvoGas = skvoGastos.all().filter((x) => enPeriodo(x) && asignadaAqui(x));
  const skvoIngreso = sum(skvoIns);
  const skvoGasto = sum(skvoGas);
  const mGas = new Map();
  skvoGas.forEach((x) => mGas.set(x.categoria || '—', (mGas.get(x.categoria || '—') || 0) + toNum(x.monto)));
  const skvoGastoPorCat = [...mGas.entries()].map(([label, monto]) => ({ label, monto })).sort((a, b) => b.monto - a.monto);

  const totalEgresos = totalComisiones + totalOperacion + skvoGasto;
  const ingresosConSkvo = totalIngresos + skvoIngreso;

  return {
    etapa,
    ingresos: { efectivo, deposito, total: totalIngresos },
    desglose, conciliacion,
    comisiones, totalComision, totalBase, totalComisiones,
    generales, totalGenerales,
    asignados, totalAsignados,
    skvo: { ingreso: skvoIngreso, gasto: skvoGasto, gastoPorCat: skvoGastoPorCat },
    totalOperacion, totalEgresos, ingresosConSkvo,
    utilidad: ingresosConSkvo - totalEgresos,
  };
}

/* ============================================================================
 * SKVO — métricas para el Dashboard (operación de maquinaria, caja propia).
 * ==========================================================================*/

/** Resumen SKVO de un día: totales, efectivo neto y lista de movimientos. */
export function resumenSkvoDia(iso) {
  const ins = skvoIngresos.byDate(iso);
  const gas = skvoGastos.byDate(iso);
  const inEf = sum(ins.filter((x) => x.metodo === 'Efectivo'));
  const gaEf = sum(gas.filter((x) => x.metodo === 'Efectivo'));
  const totIn = sum(ins), totGa = sum(gas);
  return {
    ingresos: { efectivo: inEf, total: totIn },
    gastos: { efectivo: gaEf, total: totGa },
    neto: totIn - totGa, efectivoNeto: inEf - gaEf, // efectivoNeto = aporte al Corte del Flujo
    movimientos: [
      ...ins.map((x) => ({ ...x, tipo: 'Ingreso' })),
      ...gas.map((x) => ({ ...x, tipo: 'Gasto' })),
    ],
  };
}

/** Serie diaria de ingresos/gastos SKVO del mes (gráfica del Dashboard). */
export function serieSkvoMes(mes) {
  const { dias } = rangoMes(mes);
  const labels = [], ing = [], gas = [];
  for (let d = 1; d <= dias; d++) {
    const iso = `${mes}-${String(d).padStart(2, '0')}`;
    labels.push(String(d));
    ing.push(sum(skvoIngresos.byDate(iso)));
    gas.push(sum(skvoGastos.byDate(iso)));
  }
  return { labels, ingresos: ing, gastos: gas };
}

/** Resumen SKVO del mes: totales, efectivo neto y desglose de gastos por categoría. */
export function resumenSkvoMes(mes) {
  const { desde, hasta } = rangoMes(mes);
  const inRango = (x) => x.fecha >= desde && x.fecha <= hasta;
  const ins = skvoIngresos.all().filter(inRango);
  const gas = skvoGastos.all().filter(inRango);
  const porCategoria = (list) => {
    const m = new Map();
    list.forEach((x) => m.set(x.categoria || '—', (m.get(x.categoria || '—') || 0) + toNum(x.monto)));
    return [...m.entries()].map(([label, monto]) => ({ label, monto })).sort((a, b) => b.monto - a.monto);
  };
  const inEf = sum(ins.filter((x) => x.metodo === 'Efectivo'));
  const gaEf = sum(gas.filter((x) => x.metodo === 'Efectivo'));
  const totIn = sum(ins), totGa = sum(gas);
  return {
    ingresos: totIn, gastos: totGa, neto: totIn - totGa,
    efectivoNeto: inEf - gaEf,
    gastosPorCat: porCategoria(gas), ingresosPorCat: porCategoria(ins),
    conteos: { ingresos: ins.length, gastos: gas.length },
  };
}

/** Rango de fechas (desde/hasta) de un mes 'YYYY-MM'. */
function rangoMes(mes) {
  const [y, m] = mes.split('-').map(Number);
  return { desde: mes + '-01', hasta: `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`, dias: new Date(y, m, 0).getDate() };
}

/**
 * Serie de ingresos y gastos por día del mes (para la gráfica del dashboard).
 * @param {string} mes 'YYYY-MM'
 * @param {string[]} etapasList etapas a sumar (1 etapa o varias para "general")
 */
export function serieMesPorDia(mes, etapasList) {
  const { dias } = rangoMes(mes);
  const labels = [], ing = [], gas = [];
  for (let d = 1; d <= dias; d++) {
    const iso = `${mes}-${String(d).padStart(2, '0')}`;
    let i = 0, g = 0;
    for (const etapa of etapasList) {
      i += sum(filtrar(ingresos.byDate(iso), { etapa }));
      g += sum(filtrar(gastos.byDate(iso), { etapa }));
    }
    labels.push(String(d)); ing.push(i); gas.push(g);
  }
  return { labels, ingresos: ing, gastos: gas };
}

/**
 * Resumen del mes (dashboard): conceptos de ingreso, P&L, SKVO y conteos.
 * @param {string} mes 'YYYY-MM'
 * @param {string[]} etapasList etapas a agregar (1 etapa o FLUJO_ETAPAS para general)
 */
export function resumenMes(mes, etapasList) {
  const periodo = rangoMes(mes);
  let ingr = 0, egresos = 0, utilidad = 0, vendidos = 0, abonos = 0, devoluciones = 0;
  const conceptos = RESUMEN_CONCEPTOS.map((c) => ({ label: c.label, monto: 0 }));

  for (const etapa of etapasList) {
    const f = flujoEtapa(etapa, { desde: periodo.desde, hasta: periodo.hasta });
    ingr += f.ingresos.total;
    egresos += f.totalEgresos;
    utilidad += f.utilidad;
    vendidos += f.comisiones.reduce((a, c) => a + c.lotes, 0);

    const insM = filtrar(ingresos.all(), { etapa, desde: periodo.desde, hasta: periodo.hasta });
    const gasM = filtrar(gastos.all(), { etapa, desde: periodo.desde, hasta: periodo.hasta });
    abonos += insM.filter((x) => ci(x.categoria, 'Abono')).length;
    devoluciones += gasM.filter((x) => ci(x.categoria, 'Devolución')).length;
    RESUMEN_CONCEPTOS.forEach((c, i) => {
      conceptos[i].monto += sum(insM.filter((x) => c.cats.some((cat) => ci(cat, x.categoria))));
    });
  }

  return {
    mes, conceptos,
    ingresos: ingr, egresos, utilidad,
    abonos, devoluciones, vendidos,
  };
}

/**
 * Conciliacion mensual (replica la hoja CONCILIACION del Excel):
 * matriz de conceptos de ingreso x Etapa para un mes dado.
 * @param {string} mes formato 'YYYY-MM'
 * @param {string[]} etapasList etapas a incluir como columnas
 */
export function conciliacionMensual(mes, etapasList) {
  const desde = mes + '-01';
  const [y, m] = mes.split('-').map(Number);
  const hasta = mes + '-' + String(new Date(y, m, 0).getDate()).padStart(2, '0');

  // Un flujo por etapa restringido al mes.
  const porEtapa = etapasList.map((e) => ({ etapa: e, flujo: flujoEtapa(e, { desde, hasta }) }));

  // Filas = grupos de concepto; columnas = etapas + total.
  const filas = FLUJO_GRUPOS_INGRESO.map((g, i) => {
    const valores = porEtapa.map((p) => p.flujo.desglose[i].monto);
    return { label: g.label, valores, total: valores.reduce((a, b) => a + b, 0) };
  });

  const totalIngresos = porEtapa.map((p) => p.flujo.ingresos.total);
  const totalEfectivo = porEtapa.map((p) => p.flujo.ingresos.efectivo);
  const totalDeposito = porEtapa.map((p) => p.flujo.ingresos.deposito);
  const totalEgresos = porEtapa.map((p) => p.flujo.totalEgresos);
  const utilidad = porEtapa.map((p) => p.flujo.utilidad);
  const conciliacion = porEtapa.map((p) => p.flujo.conciliacion);

  const sumArr = (a) => a.reduce((x, y) => x + y, 0);
  return {
    mes, desde, hasta, etapas: etapasList,
    filas,
    totalEfectivo, totalDeposito, totalIngresos, totalEgresos, utilidad, conciliacion,
    granTotalIngresos: sumArr(totalIngresos),
    granTotalEgresos: sumArr(totalEgresos),
    granUtilidad: sumArr(utilidad),
  };
}

/**
 * Estado de conciliacion del corte (semaforo).
 * @returns {{estado:string, color:'green'|'red'|'yellow', label:string}}
 */
export function estadoConciliacion(resumen) {
  if (!resumen.corte) return { estado: 'Pendiente', color: 'yellow', label: 'Corte pendiente' };
  if (Math.abs(resumen.diferenciaCaja) < 0.01) return { estado: 'Conciliado', color: 'green', label: 'Conciliado' };
  return { estado: 'Con diferencia', color: 'red', label: 'Con diferencia' };
}

/**
 * Serie de ingresos vs gastos de los ultimos N dias (para el grafico).
 * Termina en `hastaISO` (por defecto hoy). Devuelve labels y dos series.
 */
export function serieUltimosDias(n = 7, hastaISO) {
  const base = hastaISO ? new Date(hastaISO + 'T00:00:00') : new Date();
  const labels = [], ingresoSerie = [], gastoSerie = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    labels.push(d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' }));
    ingresoSerie.push(sum(ingresos.byDate(iso)));
    gastoSerie.push(sum(gastos.byDate(iso)));
  }
  return { labels, ingresoSerie, gastoSerie };
}

/** Ultimos N movimientos (ingresos + gastos) por fecha de creacion. */
export function ultimosMovimientos(n = 5) {
  const ins = ingresos.all().map((x) => ({ ...x, tipo: 'Ingreso' }));
  const gas = gastos.all().map((x) => ({ ...x, tipo: 'Gasto' }));
  return [...ins, ...gas]
    .sort((a, b) => (b.creado || '').localeCompare(a.creado || ''))
    .slice(0, n);
}
