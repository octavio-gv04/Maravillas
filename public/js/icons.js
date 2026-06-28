/**
 * icons.js — Set central de iconos SVG (trazo blanco / currentColor).
 *
 * Estilo unificado: icono de línea calado sobre un chip de color sólido
 * (el mismo de los KPIs del Dashboard). Centralizado para reutilizar en el
 * menú lateral, selección de espacio de trabajo, barra superior y vistas.
 */

// Trazos de cada icono (viewBox 0 0 24 24). currentColor + stroke.
export const ICONS = {
  // KPIs / flujo de dinero
  ingreso:    '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
  gasto:      '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  resultado:  '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
  calculator: '<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="16" y1="14" x2="16" y2="18"/><path d="M8 10h.01"/><path d="M12 10h.01"/><path d="M16 10h.01"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/>',
  // Navegación
  home:       '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  trendingUp: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
  trendingDown:'<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>',
  cash:       '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01"/><path d="M18 12h.01"/>',
  cog:        '<circle cx="12" cy="12" r="3.2"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/><path d="m4.9 4.9 2.1 2.1"/><path d="m17 17 2.1 2.1"/><path d="M19.1 4.9 17 7"/><path d="M7 17l-2.1 2.1"/>',
  // Excavadora (maquinaria SKVO): orugas + cabina + brazo + cucharón.
  excavator:  '<rect x="1.5" y="15.5" width="11" height="4" rx="2"/><path d="M5 15.5v-3a1 1 0 0 1 1-1h3v4"/><path d="M9 12.5 15 9.5l3 4.5"/><path d="M18 14c1 .3 2 1 2 2.5"/>',
  link:       '<path d="M9 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M15 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5"/>',
  clock:      '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>',
  users:      '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  grid:       '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  doc:        '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><polyline points="14 3 14 8 19 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/>',
  receipt:    '<path d="M5 3v18l2-1.5L9 21l2-1.5L13 21l2-1.5L17 21l2-1.5V3l-2 1.5L15 3l-2 1.5L11 3 9 4.5 7 3z"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="16" y2="13"/>',
  creditCard: '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>',
  userCheck:  '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/>',
  chartBar:   '<line x1="6" y1="20" x2="6" y2="12"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="18" y1="20" x2="18" y2="9"/>',
  refresh:    '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.5 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M1 14l4.65 4.36A9 9 0 0 0 20.5 15"/>',
  shield:     '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  wallet:     '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><circle cx="17" cy="14" r="1.3"/>',
  building:   '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M10 21v-3h4v3"/><path d="M9 7h.01"/><path d="M12 7h.01"/><path d="M15 7h.01"/><path d="M9 11h.01"/><path d="M12 11h.01"/><path d="M15 11h.01"/>',
  // Encabezados / acciones
  scale:      '<path d="M12 3v18"/><path d="M5 7h14"/><path d="M7 7l-3 6a3 3 0 0 0 6 0z"/><path d="M17 7l-3 6a3 3 0 0 0 6 0z"/><path d="M8 21h8"/>',
  checkCircle:'<circle cx="12" cy="12" r="9"/><polyline points="8.5 12.5 11 15 16 9"/>',
  plus:       '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  pencil:     '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash:      '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
  printer:    '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  search:     '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  tag:        '<path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
  map:        '<polygon points="1 6 8 3 16 6 23 3 23 18 16 21 8 18 1 21"/><line x1="8" y1="3" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="21"/>',
  alertTriangle:'<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  phone:      '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  download:   '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  upload:     '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  calendar:   '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  database:   '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6a8 3 0 0 0 16 0V5"/><path d="M4 11v6a8 3 0 0 0 16 0v-6"/>',
  list:       '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  // Sesión / tema
  user:       '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  logout:     '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  sun:        '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.9 4.9 1.4 1.4"/><path d="m17.7 17.7 1.4 1.4"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m4.9 19.1 1.4-1.4"/><path d="m17.7 6.3 1.4-1.4"/>',
  moon:       '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
};

/** Devuelve un <svg> de trazo (currentColor) con el icono `name`. */
export const svgIcon = (name, cls = 'w-5 h-5') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${cls}">${ICONS[name] || ''}</svg>`;

/**
 * Logo SKVO (wordmark vectorial, public/img/skvo-logo.svg). Se renderiza RELLENO
 * con currentColor → blanco sobre el chip. Es ancho, así que se ajusta por ancho.
 */
const SKVO_LOGO = `<path d="M236.559,32.686c-.412-.05-.829-.084-1.254-.084h-.855c-.012,0-.024-.001-.036-.001-.015,0-.03.001-.045.001h-24.268c-5.69-.001-10.303,4.612-10.303,10.302h0c0,5.69,4.613,10.303,10.303,10.303h25.203c.019,0,.038-.002.057-.002,4.765.475,8.487,4.496,8.487,9.386,0,5.21-4.224,9.433-9.434,9.433-2.491,0-4.749-.973-6.436-2.55l-.07.064-.722-.722c-4.024-4.024-10.547-4.024-14.571,0h0c-3.969,3.969-4.015,10.365-.155,14.4,5.458,5.691,13.445,9.364,21.953,9.364,16.563,0,29.99-13.426,29.99-29.989,0-15.841-12.284-28.804-27.845-29.905Z"/><path d="M20.602,69.615h46.899c5.69,0,10.303,4.613,10.303,10.303h0c0,5.69-4.613,10.303-10.303,10.303H0l20.602-20.606Z"/><rect x="48.862" y="-7.12" width="20.606" height="88.86" rx="10.303" ry="10.303" transform="translate(96.474 -21.856) rotate(90)"/><rect x="35.94" y="18.247" width="20.606" height="80.787" rx="10.303" ry="10.303" transform="translate(-27.921 49.874) rotate(-45)"/><rect x="82.989" y="0" width="20.606" height="90.221" rx="10.303" ry="10.303"/><rect x="102.819" y="21.741" width="20.606" height="76.694" rx="10.303" ry="10.303" transform="translate(75.622 -62.39) rotate(45)"/><rect x="112.745" y="45.703" width="20.606" height="48.621" rx="10.303" ry="10.303" transform="translate(-13.468 107.513) rotate(-44.999)"/><rect x="142.878" y="21.742" width="20.606" height="76.694" rx="10.303" ry="10.303" transform="translate(2.376 125.914) rotate(-45)"/><rect x="181.25" y="24.954" width="20.606" height="72.93" rx="10.303" ry="10.303" transform="translate(283.569 240.298) rotate(-134.999)"/><circle cx="131.612" cy="9.434" r="9.434"/>`;
export const skvoLogo = (cls = 'w-5') =>
  `<svg viewBox="0 0 264.404 92.58" fill="currentColor" preserveAspectRatio="xMidYMid meet" class="${cls}">${SKVO_LOGO}</svg>`;

/** Chip de color sólido con el icono blanco calado (estilo KPI del Dashboard). */
export const iconChip = (name, bg = 'bg-brand', sizeCls = 'w-7 h-7', iconCls = 'w-4 h-4') =>
  `<span class="${sizeCls} shrink-0 rounded-lg flex items-center justify-center text-white ${bg}">${name === 'skvoLogo' ? skvoLogo() : svgIcon(name, iconCls)}</span>`;

/** Icono + color de cada ruta del menú lateral (por `path`). */
export const NAV_ICONS = {
  dashboard:        { name: 'home',        color: 'bg-blue-500' },
  ingresos:         { name: 'trendingUp',  color: 'bg-green-500' },
  gastos:           { name: 'trendingDown',color: 'bg-red-500' },
  flujo:            { name: 'cash',        color: 'bg-emerald-500' },
  corte:            { name: 'calculator',  color: 'bg-blue-500' },
  skvo:             { name: 'skvoLogo',    color: 'bg-amber-500' },
  conciliacion:     { name: 'link',        color: 'bg-violet-500' },
  historial:        { name: 'clock',       color: 'bg-orange-500' },
  'm/dashboard':    { name: 'home',        color: 'bg-blue-500' },
  'm/clientes':     { name: 'users',       color: 'bg-sky-500' },
  'm/lotes':        { name: 'grid',        color: 'bg-green-500' },
  'm/contratos':    { name: 'doc',         color: 'bg-indigo-500' },
  'm/estado-cuenta':{ name: 'receipt',     color: 'bg-teal-500' },
  'm/cobranza':     { name: 'creditCard',  color: 'bg-amber-500' },
  'm/vendedores':   { name: 'userCheck',   color: 'bg-cyan-500' },
  'm/reportes':     { name: 'chartBar',    color: 'bg-violet-500' },
  'm/sync':         { name: 'refresh',     color: 'bg-sky-500' },
  'm/auditoria':    { name: 'shield',      color: 'bg-rose-500' },
};

/** Icono + color de cada espacio de trabajo (por `key`). */
export const WORKSPACE_ICONS = {
  diario:  { name: 'wallet',   color: 'bg-green-500' },
  maestra: { name: 'building', color: 'bg-amber-500' },
};
