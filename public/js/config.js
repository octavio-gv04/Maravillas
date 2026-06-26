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

// Etapas (proyectos / fases del fraccionamiento).
export const ETAPAS_INGRESO = ['Etapa 1 y 2', 'Etapa 3', 'San Jose', 'Santa Mónica'];
export const ETAPAS_GASTO = ['General', 'Etapa 1 y 2', 'Etapa 3', 'San Jose', 'Santa Mónica'];

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

// Quien recibe/entrega el corte del dia.
export const RECIBIO_CORTE = ['Sergio', 'Javier'];

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
 * Etapas que tienen bloque de FLUJO en el Excel y comparten los gastos generales.
 * (El Excel solo modela el flujo de estas dos.) "San Jose" no tiene flujo.
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
  capturista: { label: 'Capturista', can: ['ver', 'crear', 'editar'] },
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
export const WORKSPACES = {
  diario: {
    key: 'diario', group: 'diario',
    label: 'Control Diario', icon: '💰',
    desc: 'Captura diaria: ingresos, gastos, recibos, corte y conciliación.',
    home: 'dashboard',
  },
  maestra: {
    key: 'maestra', group: 'maestra',
    label: 'Base de Datos Maestra', icon: '🏗️',
    desc: 'Administración de Etapa 3: clientes, lotes, contratos, estado de cuenta y cobranza.',
    home: 'm/dashboard',
  },
};
export const STORAGE_WORKSPACE = 'af.v2.workspace';

// Etapa activa de la Maestra. Arquitectura lista para Etapa 1 y 2 (Fases 2-4):
// basta con agregarlas aquí; todo deriva de esta lista sin tocar la lógica.
export const ETAPA_MAESTRA_DEFAULT = 'Etapa 3';
export const ETAPAS_MAESTRA = ['Etapa 3']; // futuras: 'Etapa 1 y 2', etc.

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

