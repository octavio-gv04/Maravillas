/**
 * config.js — Constantes y catalogos del sistema.
 *
 * Los catalogos replican EXACTAMENTE las listas de validacion del Excel
 * "Sistema Diario" (Administración Las Maravillas). Centralizarlos aqui
 * facilita la futura migracion a API/SQL.
 */

export const APP = {
  name: 'Admin Financiera',
  org: 'Administración Las Maravillas',
  currency: 'MXN',
  locale: 'es-MX',
};

// Claves de localStorage (versionadas para permitir migraciones futuras).
export const STORAGE_KEYS = {
  ingresos: 'af.v2.ingresos',
  gastos: 'af.v2.gastos',
  cortes: 'af.v2.cortes',
  recibos: 'af.v2.recibos_seq',
  folioIngreso: 'af.v2.folio_ingreso',
  folioGasto: 'af.v2.folio_gasto',
  historial: 'af.v2.historial',
  session: 'af.v2.session',
  theme: 'af.v2.theme',
  cache: 'af.v2.cache',   // respaldo local de la caché (lectura offline)
  queue: 'af.v2.queue',   // cola de cambios pendientes de sincronizar
};

// Zonas de venta (proyectos / fases del fraccionamiento). Fuente única de verdad:
// cada zona se captura y se reporta por separado (dashboard, flujo, conciliación);
// "General" globaliza las cuatro. Para agregar/quitar una zona basta con editar
// esta lista — los catálogos de abajo y las vistas se derivan de ella.
export const ZONAS = ['Etapa 1 y 2', 'Etapa 3', 'San José', 'Santa Mónica'];

// Liquidación de socios: beneficiario de la utilidad de cada zona. Los DEPÓSITOS
// de TODAS las zonas caen en la cuenta de Sergio; Javier se queda con Etapa 3.
// El cierre del mes: efectivo a Sergio = (utilidad de sus zonas) − (depósitos totales).
export const BENEFICIARIOS = {
  'Etapa 3': 'Javier',
  'Etapa 1 y 2': 'Sergio',
  'San José': 'Sergio',
  'Santa Mónica': 'Sergio',
};
export const BENEFICIARIO_DEPOSITOS = 'Sergio';

// Etapas seleccionables al capturar. Ingreso = zonas; Gasto = zonas + "General".
export const ETAPAS_INGRESO = [...ZONAS];
export const ETAPAS_GASTO = ['General', ...ZONAS];

// Metodo de pago real del Excel: Efectivo / Depósito (gastos admiten "Otro").
export const METODOS_INGRESO = ['Efectivo', 'Depósito'];
export const METODOS_GASTO = ['Efectivo', 'Depósito', 'Otro'];

// Categorias de ingreso (columna "Pago" del Excel).
export const CAT_INGRESOS = [
  'Abono', 'Enganche', 'Enganche Parcial', 'Recargo',
  'Promo 1er Mes', 'Promo 2do Mes', 'Promo 3er Mes',
  'Conexión Eléctrica', 'Número Oficial', 'Cambio Propietario',
  'Servicios', 'Contado',
];

// Categorias de gasto (columna "Categoría" del Excel).
export const CAT_GASTOS = [
  'Comisión', 'Administración', 'Construcción', 'Ingeniería', 'Trámites',
  'Contrato', 'Pago', 'Base', 'Conexión Eléctrica', 'Renta',
  'Devolución', 'Perros', 'Otro',
];

// Vendedores / personas (comisiones y campo "Recibe").
export const VENDEDORES = [
  'Mónica', 'Laura', 'Gonzalo', 'Ricardo', 'Erika', 'Juan',
  'Leo', 'Sergio', 'Javier', 'Hillary', 'Goyo', 'Ing. Manuel', 'Administración',
];

// Quien recibe/entrega el corte del dia. "Otro" habilita un campo para especificar.
export const RECIBIO_CORTE = ['Sergio', 'Javier', 'Otro'];

/* ============================================================================
 * SKVO — Operación de maquinaria (retro, bulldozer, Tacoma). Caja en efectivo
 * propia: su efectivo entra/sale del mismo cajón, por eso forma parte del
 * Corte del Flujo (ver calc.js: resumenDia incluye el efectivo SKVO).
 * ==========================================================================*/

// Categorías de GASTO SKVO (combustible, refacciones por máquina, pagos semanales).
export const SKVO_CAT_GASTO = [
  'Diesel', 'Gasolina Tacoma',
  'Refacciones Retro', 'Refacciones Tacoma', 'Refacciones Bulldozer',
  'Semana Juan', 'Semana Leo', 'Otro',
];

// Categorías de INGRESO SKVO (servicios externos: limpieza, etc.).
export const SKVO_CAT_INGRESO = ['Limpieza', 'Servicio', 'Otro'];

// Quién entrega/captura el efectivo SKVO.
export const SKVO_ENTREGO = ['Hillary', 'Sergio', 'Otro'];

// Etapas/destino de un ingreso SKVO ("Externo" para trabajos fuera del fracc.).
export const SKVO_ETAPAS = [...ZONAS, 'Externo'];

// Etapa a la que se asigna el efectivo SKVO en el FLUJO si el mes no tiene
// una asignación explícita (el usuario puede cambiarla por mes en el módulo SKVO).
export const SKVO_ETAPA_DEFAULT = 'Etapa 3';

// Agrupacion de categorias de ingreso para el desglose del FLUJO
// (igual que las celdas E4:E12 del Excel: Promoción agrupa los 3 meses, etc.).
export const FLUJO_GRUPOS_INGRESO = [
  { label: 'Abono', cats: ['Abono'] },
  { label: 'Enganche', cats: ['Enganche', 'Enganche Parcial'] },
  { label: 'Promoción', cats: ['Promo 1er Mes', 'Promo 2do Mes', 'Promo 3er Mes'] },
  { label: 'Contado', cats: ['Contado'] },
  { label: 'Recargos', cats: ['Recargo'] },
  { label: 'Cambio Propietario', cats: ['Cambio Propietario'] },
  { label: 'Número Oficial', cats: ['Número Oficial'] },
  { label: 'Conexión Eléctrica', cats: ['Conexión Eléctrica'] },
  { label: 'Servicios', cats: ['Servicios'] },
];

/**
 * EGRESOS del FLUJO — replican EXACTAMENTE las fórmulas de la hoja FLUJO del Excel.
 *
 * Comisiones (por vendedor, filtrado por etapa): suma de Categoría "Comisión"
 * más Categoría "Base". El total de comisiones = total Comisión + total Base.
 */
export const FLUJO_COMISION_CATS = ['Comisión', 'Base'];

/**
 * Zonas que COMPARTEN los gastos generales en el modelo del Excel (se dividen
 * ÷N entre ellas). El Excel solo reparte generales entre estas dos; "San José"
 * y "Santa Mónica" se reportan por separado pero NO absorben gastos generales.
 * OJO: esta lista es solo el divisor de generales, NO la lista de zonas a mostrar
 * (esa es ZONAS). Las vistas separan por ZONAS; el flujo reparte generales por aquí.
 */
export const FLUJO_ETAPAS = ['Etapa 1 y 2', 'Etapa 3'];

/**
 * Gastos Generales: compartidos entre las etapas del flujo, por eso se dividen
 * entre el número de etapas (=2, como el Excel) y NO se filtran por etapa.
 * `match` define el criterio sobre cada gasto (categoria / recibe / etapa).
 */
export const FLUJO_ETAPAS_COMPARTIDAS = FLUJO_ETAPAS.length;
export const FLUJO_GENERALES = [
  { label: 'Otro', match: { categoria: 'Otro' } },
  { label: 'Sueldo Hillary', match: { recibe: 'Hillary', categoria: 'Pago' } },
  { label: 'Sueldo Mónica', match: { recibe: 'Mónica', categoria: 'Pago' } },
  { label: 'Sueldo Goyo', match: { recibe: 'Goyo', categoria: 'Pago' } },
  { label: 'Perros', match: { categoria: 'Perros' } },
  { label: 'Renta', match: { categoria: 'Renta' } },
  { label: 'Administración', match: { categoria: 'Administración', etapa: 'General' } },
];

/** Gastos asignados a la etapa: estas categorías sí se filtran por etapa. */
export const FLUJO_ASIGNADOS = [
  'Devolución', 'Administración', 'Construcción',
  'Trámites', 'Ingeniería', 'Contrato', 'Conexión Eléctrica',
];

/**
 * Resumen del mes (dashboard): agrupación de conceptos de ingreso.
 * "Enganches" agrupa enganche + parcial + promociones (igual que el Excel).
 */
export const RESUMEN_CONCEPTOS = [
  { label: 'Abonos', cats: ['Abono'] },
  { label: 'Enganches', cats: ['Enganche', 'Enganche Parcial', 'Promo 1er Mes', 'Promo 2do Mes', 'Promo 3er Mes'] },
  { label: 'Contado', cats: ['Contado'] },
  { label: 'Recargos', cats: ['Recargo'] },
  { label: 'Servicios', cats: ['Servicios'] },
];

// Estados del corte diario.
export const ESTADOS_CORTE = ['Pendiente', 'Conciliado', 'Con diferencia'];

// Roles y permisos basicos del MVP.
export const ROLES = {
  admin: { label: 'Administrador', can: ['ver', 'crear', 'editar', 'eliminar', 'revisar'] },
  capturista: { label: 'Capturista', can: ['ver', 'crear', 'editar', 'eliminar'] },
  supervisor: { label: 'Supervisor', can: ['ver', 'revisar'] },
};

// Usuarios demo (FASE 1). En Fase 2 esto lo reemplaza /api/login con JWT firmado.
export const DEMO_USERS = [
  { user: 'admin', pass: 'admin123', name: 'Administrador', role: 'admin' },
  { user: 'capturista', pass: 'captura123', name: 'Capturista Demo', role: 'capturista' },
];

/* ============================================================================
 * BASE DE DATOS MAESTRA — Etapa 3 (segundo espacio de trabajo de la misma app).
 *
 * La Maestra NO captura pagos: los deriva en tiempo real de los `ingresos` del
 * Sistema Diario filtrados por etapa (Regla de Oro #1). Su data propia (lotes,
 * contratos, vendedores, notas de cobranza) sí se administra aquí.
 * ==========================================================================*/

// Espacios de trabajo seleccionables al iniciar sesión.
//
// `roles` define quién puede ENTRAR a cada espacio. La capturista (Hillary)
// solo ve "Captura Diaria"; los administradores ven "Control Mensual" + la
// Base de Datos. Si un usuario tiene un único espacio permitido se entra
// directo, sin mostrar el selector (ver app.js → enterAfterLogin()).
export const WORKSPACES = {
  captura: {
    key: 'captura', group: 'captura',
    label: 'Captura Diaria', icon: '🧾',
    desc: 'Captura del día: ingresos, gastos, recibos y corte de caja.',
    home: 'ingresos',
    roles: ['capturista'],
  },
  diario: {
    key: 'diario', group: 'diario',
    label: 'Control Mensual', icon: '💰',
    desc: 'Revisión y auditoría mensual: ingresos, gastos, flujo, corte y conciliación.',
    home: 'dashboard',
    roles: ['admin', 'supervisor'],
  },
  maestra: {
    key: 'maestra', group: 'maestra',
    label: 'Base de Datos', icon: '🏗️',
    desc: 'Administración de Etapa 3: clientes, lotes, contratos, estado de cuenta y cobranza.',
    home: 'm/dashboard',
    roles: ['admin', 'supervisor'],
  },
};
export const STORAGE_WORKSPACE = 'af.v2.workspace';

// Etapa activa de la Maestra. Arquitectura lista para Etapa 1 y 2 (Fases 2-4):
// basta con agregarlas aquí; todo deriva de esta lista sin tocar la lógica.
export const ETAPA_MAESTRA_DEFAULT = 'Etapa 3';
// Etapas seleccionables en el dashboard de la Maestra (mismas que el Control Diario).
export const ETAPAS_MAESTRA = [...ZONAS];
export const STORAGE_ETAPA_MAESTRA = 'af.v2.etapa_maestra'; // recuerda la etapa elegida

// Estados de catálogo.
export const ESTADOS_LOTE = ['Disponible', 'Apartado', 'Vendido', 'Cancelado'];
export const ESTADOS_CONTRATO = ['Activo', 'Liquidado', 'Vencido', 'Cancelado'];

// Categorías de ingreso que abonan al saldo del lote (para "total pagado").
// Recargo/Servicios/Conexión no reducen el precio del lote.
export const CAT_ABONA_LOTE = [
  'Abono', 'Enganche', 'Enganche Parcial', 'Contado',
  'Promo 1er Mes', 'Promo 2do Mes', 'Promo 3er Mes',
];
export const CAT_ENGANCHE = ['Enganche', 'Enganche Parcial'];

// Categorías que marcan la VENTA de un lote nuevo (cuentan en "VENDIDOS" del
// dashboard, una sola vez por lote). El registro de la venta ocurre con:
//  • 'Enganche'      → venta normal (enganche completo / cliente y lote nuevos),
//  • 'Promo 1er Mes' → venta con enganche diferido en 3 pagos (Promo 2do/3er Mes
//                      son parcialidades posteriores y NO cuentan),
//  • 'Contado'       → compra de contado (lote pagado por completo de una vez).
// 'Enganche Parcial' son abonos previos al enganche completo → NO cuentan aquí
// (la venta se contabiliza cuando se registra el 'Enganche').
export const CAT_VENTA_LOTE = ['Enganche', 'Promo 1er Mes', 'Contado'];

// Categorías que se capturan desde el formulario "Venta" del Diario (alta de
// cliente + lote nuevo). El resto de categorías se capturan como "Pago".
// Coincide con CAT_VENTA_LOTE: toda venta (incluido Contado) se captura en Venta.
export const CAT_VENTA_FORM = ['Enganche', 'Promo 1er Mes', 'Contado'];

/**
 * Fecha de corte del Excel maestro: los pagos del Control Diario con fecha
 * posterior se consideran NUEVOS y actualizan la Maestra (evita doble conteo).
 * El servidor expone el valor real del seed; este es el respaldo.
 */
export const MAESTRA_ASOF = '2026-06-17';

/**
 * Segmentación de cartera por MESES de atraso (la hoja del Excel mide el retraso
 * en meses/mensualidades). Los límites están en días equivalentes (mes ≈ 30 d)
 * para reutilizar el mismo motor de buckets. 1 mes → 30, 2 → 60, etc.
 */
export const COBRANZA_GRACIA_DIAS = 30; // un ciclo mensual de tolerancia
export const AGING_BUCKETS = [
  { key: 'corriente', label: 'Al corriente',     min: 0,  max: 0,        color: 'green' },
  { key: 'a30',   label: 'Atraso 1 mes',         min: 1,  max: 30,       color: 'yellow' },
  { key: 'a60',   label: 'Atraso 2 meses',       min: 31, max: 60,       color: 'yellow' },
  { key: 'a90',   label: 'Atraso 3 meses',       min: 61, max: 90,       color: 'red' },
  { key: 'mas90', label: 'Atraso 4+ meses',      min: 91, max: Infinity, color: 'red' },
];

