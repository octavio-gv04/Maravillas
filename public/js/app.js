/**
 * app.js — Punto de entrada. Orquesta autenticación, selección de espacio de
 * trabajo (Sistema Diario / Base de Datos Maestra), tema, navegación y router.
 *
 * Una sola SPA aloja DOS espacios de trabajo sobre el mismo servidor y datos:
 *   • Sistema Diario  → captura diaria (ingresos, gastos, corte…).
 *   • Base de Datos Maestra → administración Etapa 3 (clientes, lotes,
 *     contratos, estado de cuenta, cobranza) derivada en tiempo real del Diario.
 * Al iniciar sesión se elige cuál abrir; se puede cambiar sin cerrar sesión.
 */

import { STORAGE_KEYS, WORKSPACES, STORAGE_WORKSPACE } from './config.js';
import { $, prettyDate, todayISO, esc, localizeFormValidation, installMoneyInputs } from './utils.js';
import { isLogged, login, logout, getSession } from './auth.js';
import { init as initStore, onStatus } from './store.js';
import { route, startRouter, navigate, getRoutes, setHome, setGuard } from './router.js';
import { getMes, setMes, onMes } from './periodo.js';
import { iconChip, svgIcon, NAV_ICONS, WORKSPACE_ICONS } from './icons.js';

// --- Vistas del Sistema Diario ---
import { render as dashboard } from './views/dashboard.js';
import { render as ingresos } from './views/ingresos.js';
import { render as gastos } from './views/gastos.js';
import { render as flujo } from './views/flujo.js';
import { render as corte } from './views/corte.js';
import { render as skvo } from './views/skvo.js';
import { render as conciliacion } from './views/conciliacion.js';
import { render as historial } from './views/historial.js';
import { render as morosos } from './views/captura/morosos.js';
import { render as sobres } from './views/captura/sobres.js';

// --- Vistas de la Base de Datos Maestra (Etapa 3) ---
import { render as mDashboard } from './views/maestra/dashboard.js';
import { render as mGeneral } from './views/maestra/general.js';
import { render as mClientes } from './views/maestra/clientes.js';
import { render as mLotes } from './views/maestra/lotes.js';
import { render as mContratos } from './views/maestra/contratos.js';
import { render as mEstadoCuenta } from './views/maestra/estado-cuenta.js';
import { render as mCobranza } from './views/maestra/cobranza.js';
import { render as mVendedores } from './views/maestra/vendedores.js';
import { render as mReportes } from './views/maestra/reportes.js';
import { render as mSync } from './views/maestra/sync.js';
import { render as mAuditoria } from './views/maestra/auditoria.js';

// ---------- Registro de rutas (group define a qué espacio pertenecen) ----------
// `groups` (en plural) registra una ruta en VARIOS espacios. Las vistas de
// captura (Ingresos, Gastos, Corte, SKVO) se comparten entre "Captura Diaria"
// (capturista) y "Control Mensual" (admin); el resto es solo del admin.
route('dashboard', { title: 'Dashboard', icon: '🏠', render: dashboard, group: 'diario' });
route('ingresos', { title: 'Ingresos', icon: '📈', render: ingresos, groups: ['diario', 'captura'] });
route('gastos', { title: 'Gastos', icon: '📉', render: gastos, groups: ['diario', 'captura'] });
route('flujo', { title: 'Flujo de efectivo', icon: '💵', render: flujo, group: 'diario' });
route('corte', { title: 'Corte', icon: '🧮', render: corte, groups: ['diario', 'captura'] });
route('skvo', { title: 'SKVO', icon: '⚙️', render: skvo, groups: ['diario', 'captura'] });
route('conciliacion', { title: 'Conciliación', icon: '🔗', render: conciliacion, group: 'diario' });
route('historial', { title: 'Historial', icon: '🕑', render: historial, group: 'diario' });
// Morosos: seguimiento de cobranza acotado, exclusivo de Captura Diaria
// (el admin usa la Cobranza completa en la Base de Datos Maestra).
route('morosos', { title: 'Morosos', icon: '💳', render: morosos, group: 'captura' });

route('m/dashboard', { title: 'Dashboard', icon: '🏠', render: mDashboard, group: 'maestra' });
// Vista General: la "vista de pájaro" de toda la etapa (réplica de la hoja GENERAL).
route('m/general', { title: 'General', icon: '🗂️', render: mGeneral, group: 'maestra' });
route('m/clientes', { title: 'Clientes', icon: '👥', render: mClientes, group: 'maestra' });
// Revisión de Sobres: conciliación mes a mes del sobre físico (corrige historial
// y recalcula atraso). Disponible para ambos roles (captura y maestra/admin).
// Registrada tras Clientes para que aparezca debajo de Clientes en Base de Datos.
// Sobre: la LISTA de revisión vive en el menú de Captura (Hillary). En la Maestra
// (admin) NO va en el menú —se revisa por lote desde el Estado de cuenta del
// cliente—, pero la ruta sigue accesible para que ese botón funcione.
route('sobres', { title: 'Sobre', icon: '✉️', render: sobres, groups: ['captura', 'maestra'], hideInMenu: ['maestra'] });
route('m/lotes', { title: 'Lotes', icon: '🏠', render: mLotes, group: 'maestra' });
route('m/contratos', { title: 'Contratos', icon: '📄', render: mContratos, group: 'maestra' });
// Estado de cuenta: NO es un módulo del menú, es el detalle 360° de UN cliente.
// Se abre desde Clientes (y desde General/Cobranza/Morosos al hacer clic en una
// fila). `hidden: true` lo mantiene como ruta navegable pero fuera del menú lateral.
route('m/estado-cuenta', { title: 'Estado de cuenta', icon: '🧾', hidden: true, render: mEstadoCuenta, group: 'maestra' });
route('m/cobranza', { title: 'Cobranza', icon: '💳', render: mCobranza, group: 'maestra' });
route('m/vendedores', { title: 'Vendedores', icon: '🤝', render: mVendedores, group: 'maestra' });
route('m/reportes', { title: 'Reportes', icon: '📊', render: mReportes, group: 'maestra' });
route('m/sync', { title: 'Sincronización', icon: '🔄', render: mSync, group: 'maestra' });
route('m/auditoria', { title: 'Auditoría', icon: '🛡️', render: mAuditoria, group: 'maestra' });

let started = false;       // store + router inicializados una sola vez
let currentGroup = 'diario';

// ---------- Espacios permitidos según el rol de la sesión ----------
// Un espacio sin `roles` lo ve cualquiera; con `roles`, solo esos roles.
function allowedWorkspaces() {
  const role = getSession()?.role;
  return Object.values(WORKSPACES).filter((ws) => !ws.roles || ws.roles.includes(role));
}

// Tras iniciar sesión: si solo hay un espacio permitido se entra directo
// (caso capturista → Captura Diaria); si hay varios, se muestra el selector.
function enterAfterLogin() {
  const allowed = allowedWorkspaces();
  if (allowed.length === 1) bootApp(allowed[0].key);
  else showWorkspaceChooser();
}

// ---------- Tema claro/oscuro ----------
function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  localStorage.setItem(STORAGE_KEYS.theme, theme);
  $('#theme-toggle').innerHTML = svgIcon(theme === 'dark' ? 'sun' : 'moon', 'w-5 h-5');
}
function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEYS.theme)
    || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyTheme(saved);
}

// ---------- Pantalla de login ----------
function showLogin() {
  $('#app-shell').classList.add('hidden');
  const screen = $('#login-screen');
  screen.classList.remove('hidden');
  screen.innerHTML = `
    <div class="w-full max-w-sm bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-8">
      <div class="text-center mb-6">
        <div class="flex justify-center">${iconChip('building', 'bg-amber-500', 'w-14 h-14', 'w-8 h-8')}</div>
        <h1 class="text-xl font-bold mt-2">Administración Las Maravillas</h1>
        <p class="text-sm text-gray-500">Inicia sesión para continuar</p>
      </div>
      <form id="login-form" class="space-y-4">
        <label class="block">
          <span class="text-xs font-medium text-gray-600 dark:text-gray-300">Usuario</span>
          <input class="field mt-1" name="user" value="admin" autocomplete="username" required />
        </label>
        <label class="block">
          <span class="text-xs font-medium text-gray-600 dark:text-gray-300">Contraseña</span>
          <input class="field mt-1" name="pass" type="password" value="admin123" autocomplete="current-password" required />
        </label>
        <button class="w-full bg-brand hover:bg-brand-dark text-white py-2.5 rounded-lg font-medium transition" type="submit">
          Entrar
        </button>
        <p id="login-err" class="text-sm text-red-600 text-center hidden">Usuario o contraseña incorrectos</p>
      </form>
      <div class="mt-6 text-xs text-gray-400 border-t border-gray-200 dark:border-gray-700 pt-3">
        <p class="font-medium mb-1">Usuarios demo:</p>
        <p>admin / admin123 &nbsp;·&nbsp; capturista / captura123</p>
      </div>
    </div>`;

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const btn = f.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Entrando…';
    try {
      if (await login(f.user.value.trim(), f.pass.value)) enterAfterLogin();
      else $('#login-err').classList.remove('hidden');
    } catch {
      $('#login-err').textContent = 'No se pudo conectar con el servidor';
      $('#login-err').classList.remove('hidden');
    } finally { btn.disabled = false; btn.textContent = 'Entrar'; }
  });
}

// ---------- Selección de espacio de trabajo ----------
function showWorkspaceChooser() {
  $('#app-shell').classList.add('hidden');
  const screen = $('#login-screen');
  screen.classList.remove('hidden');
  const s = getSession();
  const cardWs = (ws) => {
    const wi = WORKSPACE_ICONS[ws.key];
    return `
    <button data-ws="${ws.key}" class="text-left bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6 hover:border-brand hover:shadow-xl transition w-full">
      <div class="mb-3">${wi ? iconChip(wi.name, wi.color, 'w-12 h-12', 'w-7 h-7') : `<span class="text-4xl">${ws.icon}</span>`}</div>
      <h2 class="text-lg font-bold">${esc(ws.label)}</h2>
      <p class="text-sm text-gray-500 mt-1">${esc(ws.desc)}</p>
      <span class="inline-block mt-4 text-brand text-sm font-medium">Entrar →</span>
    </button>`;
  };
  screen.innerHTML = `
    <div class="w-full max-w-3xl">
      <div class="text-center mb-6">
        <h1 class="text-2xl font-bold">Hola, ${esc(s?.name || '')}</h1>
        <p class="text-gray-500">Elige el sistema que quieres abrir</p>
      </div>
      <div class="grid sm:grid-cols-2 gap-4">
        ${allowedWorkspaces().map(cardWs).join('')}
      </div>
      <p class="text-center text-xs text-gray-400 mt-6">Podrás cambiar de sistema en cualquier momento desde el menú lateral.</p>
    </div>`;
  screen.querySelectorAll('[data-ws]').forEach((b) =>
    b.addEventListener('click', () => bootApp(b.dataset.ws)));
}

// ---------- Menú lateral (según el espacio de trabajo activo) ----------
function buildNav(group) {
  const nav = $('#nav-menu');
  nav.innerHTML = getRoutes(group)
    // `hidden`: ruta navegable pero fuera de TODO menú (p.ej. estado-cuenta).
    // `hideInMenu`: oculta solo en ciertos grupos (p.ej. Sobre fuera del menú de admin).
    .filter(([, def]) => def.icon && !def.hidden && !(def.hideInMenu || []).includes(group))
    .map(([path, def]) => {
      const ic = NAV_ICONS[path];
      const icono = ic ? iconChip(ic.name, ic.color) : `<span>${def.icon}</span>`;
      return `
      <a class="nav-link" data-path="${path}" href="#/${path}">
        ${icono}<span>${esc(def.title)}</span>
      </a>`;
    }).join('');
  nav.querySelectorAll('.nav-link').forEach((a) => a.addEventListener('click', () => closeSidebar()));

  const s = getSession();
  $('#nav-user').innerHTML = s
    ? `<div class="flex items-center gap-2">
         ${iconChip('user', 'bg-slate-500')}
         <div class="leading-tight"><strong>${esc(s.name)}</strong><br><span class="opacity-70">${esc(s.role)}</span></div>
       </div>` : '';

  // Iconos de los botones del pie (estilo chip, igual que el menú).
  // "Cambiar sistema" solo tiene sentido si el rol puede entrar a más de un espacio.
  const switchBtn = $('#switch-ws');
  switchBtn.style.display = allowedWorkspaces().length > 1 ? '' : 'none';
  switchBtn.innerHTML = `${iconChip('refresh', 'bg-sky-500')}<span>Cambiar sistema</span>`;
  $('#logout-btn').innerHTML = `${iconChip('logout', 'bg-rose-500')}<span>Cerrar sesión</span>`;
}

function highlightNav(path) {
  $('#nav-menu').querySelectorAll('.nav-link').forEach((a) =>
    a.classList.toggle('active', a.dataset.path === path));
}

// ---------- Sidebar mobile ----------
const openSidebar = () => {
  $('#sidebar').classList.remove('-translate-x-full');
  $('#sidebar-overlay').classList.remove('hidden');
};
const closeSidebar = () => {
  $('#sidebar').classList.add('-translate-x-full');
  $('#sidebar-overlay').classList.add('hidden');
};

// ---------- Indicador de conexión (tiempo real) ----------
function wireStatus() {
  const el = $('#conn-status');
  if (!el) return;
  onStatus((s) => {
    if (s.online) {
      el.innerHTML = '<span class="dot dot-green"></span> En línea' + (s.pending ? ` · ${s.pending} por sincronizar` : '');
      el.title = 'Conectado · cambios en tiempo real';
    } else {
      el.innerHTML = '<span class="dot dot-yellow"></span> Sin conexión' + (s.pending ? ` · ${s.pending} pendientes` : '');
      el.title = 'Trabajando sin conexión; se sincronizará al reconectar';
    }
  });
}

// ---------- Aplica un espacio de trabajo (branding, rutas, menú) ----------
function applyWorkspace(wsKey) {
  const ws = WORKSPACES[wsKey] || WORKSPACES.diario;
  currentGroup = ws.group;
  localStorage.setItem(STORAGE_WORKSPACE, ws.key);
  const wi = WORKSPACE_ICONS[ws.key];
  $('#brand-icon').innerHTML = wi ? iconChip(wi.name, wi.color, 'w-8 h-8', 'w-5 h-5') : ws.icon;
  $('#brand-name').textContent = ws.label;
  setHome(ws.home);
  buildNav(ws.group);
  // El selector de mes global solo aplica al Control Mensual (revisión/auditoría).
  const pbar = $('#periodo-bar');
  if (pbar) {
    const show = ws.group === 'diario';
    pbar.classList.toggle('hidden', !show);
    pbar.classList.toggle('flex', show);
    if (show) $('#periodo-mes').value = getMes();
  }
  navigate(ws.home);
}

// ---------- Arranque de la app autenticada ----------
async function bootApp(wsKey) {
  $('#login-screen').classList.add('hidden');
  $('#app-shell').classList.remove('hidden');
  $('#today-label').innerHTML = `<span class="inline-flex items-center gap-1.5">${svgIcon('calendar', 'w-4 h-4')} ${prettyDate(todayISO())}</span>`;

  if (!started) {
    await initStore();   // hidrata caché + abre stream SSE (una sola vez)
    wireStatus();
  }
  applyWorkspace(wsKey);
  if (!started) {
    started = true;
    startRouter($('#view'), (def, path) => {
      $('#page-title').textContent = def.title;
      highlightNav(path);
    });
  }
}

// ---------- Listeners globales (una sola vez) ----------
function wireGlobal() {
  localizeFormValidation(); // globos de validación nativos en español
  installMoneyInputs();     // campos de dinero: muestran $1,234.00, editan número plano

  // Guard del router: una ruta solo es accesible si pertenece al espacio activo.
  // Así un capturista en "Captura Diaria" no puede abrir #/flujo, #/dashboard, etc.
  setGuard((path, def) => {
    const groups = def.groups || (def.group ? [def.group] : []);
    return groups.includes(currentGroup);
  });

  // Selector de mes global (Control Mensual): mantiene sincronizado el input con
  // el periodo compartido, lo cambie quien lo cambie (input o navegador de mes).
  const periodoInput = $('#periodo-mes');
  if (periodoInput) {
    periodoInput.value = getMes();
    periodoInput.addEventListener('change', () => setMes(periodoInput.value || getMes()));
    onMes((m) => { if (periodoInput.value !== m) periodoInput.value = m; });
  }

  $('#theme-toggle').addEventListener('click', () =>
    applyTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark'));

  $('#sidebar-toggle').addEventListener('click', openSidebar);
  $('#sidebar-overlay').addEventListener('click', closeSidebar);

  $('#switch-ws').addEventListener('click', () => { closeSidebar(); showWorkspaceChooser(); });

  $('#logout-btn').addEventListener('click', () => {
    logout();
    location.hash = '';
    showLogin();
  });
}

// ---------- Init ----------
initTheme();
wireGlobal();
if (isLogged()) {
  // Sesión viva: restaura el último espacio usado SOLO si el rol aún lo permite;
  // si no, decide según los espacios permitidos (directo o selector).
  const last = localStorage.getItem(STORAGE_WORKSPACE);
  const ok = last && WORKSPACES[last] && allowedWorkspaces().some((w) => w.key === last);
  if (ok) bootApp(last);
  else enterAfterLogin();
} else {
  showLogin();
}
