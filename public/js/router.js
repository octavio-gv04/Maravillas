/**
 * router.js — Enrutador por hash (#/ruta). Estandar, sin dependencias.
 * Cada ruta tiene: titulo, icono, grupo (espacio de trabajo) y una funcion
 * render(container) que pinta la vista.
 *
 * GRUPOS: la app aloja dos espacios de trabajo en la misma SPA —
 *   'diario'  → Sistema Diario (captura)
 *   'maestra' → Base de Datos Maestra (consulta/administración Etapa 3)
 * Se eligen al iniciar sesión; el menú lateral solo muestra el grupo activo.
 */

const routes = new Map();
let current = null; // funcion de limpieza de la vista activa (si la hay)
let home = 'dashboard'; // ruta por defecto del espacio de trabajo activo

/** Registra una ruta. `def` puede incluir { title, icon, render, group }. */
export function route(path, def) {
  routes.set(path, def);
}

/** Define la ruta de inicio (la del espacio de trabajo activo). */
export const setHome = (path) => { home = path; };
export const getHome = () => home;

/** Lista de rutas, opcionalmente filtrada por grupo (para el menu lateral). */
export const getRoutes = (group) =>
  [...routes.entries()].filter(([, def]) => !group || def.group === group);

/** Ruta actual (sin el #/ ni la query). Cae al inicio del espacio activo. */
export const currentPath = () =>
  (location.hash.replace(/^#\//, '').split('?')[0] || home);

/** Lee un parámetro de la query del hash (#/ruta?clave=valor). */
export function queryParam(name) {
  const q = location.hash.split('?')[1] || '';
  return new URLSearchParams(q).get(name);
}

/** Navega a una ruta (admite query: navigate('m/estado-cuenta', {k:'...'})). */
export const navigate = (path, params) => {
  const q = params ? '?' + new URLSearchParams(params).toString() : '';
  location.hash = '#/' + path + q;
};

/**
 * Despacha la vista actual al contenedor.
 * Llama a la limpieza de la vista anterior (desuscripciones) si existe.
 */
export function render(container, onChange) {
  const path = currentPath();
  const def = routes.get(path) || routes.get(home);

  if (typeof current === 'function') { try { current(); } catch {} }

  container.innerHTML = '';
  // render puede devolver una funcion de limpieza.
  current = def.render(container) || null;
  onChange?.(def, path);
}

/** Arranca el router. */
export function startRouter(container, onChange) {
  const handler = () => render(container, onChange);
  window.addEventListener('hashchange', handler);
  handler();
}
