# 💰 Admin Financiera — Sistema Diario de Administración Financiera

Aplicación web responsive que reemplaza el Excel/Numbers de administración diaria
(ingresos, gastos, flujo de efectivo y cortes de caja).

**Multiusuario en tiempo real**: un servidor central comparte los datos y, cuando
cualquier usuario registra o edita algo, **todos los demás lo ven al instante**
(vía Server-Sent Events). Sigue siendo **offline-first**: cada equipo guarda una
caché local para seguir consultando sin conexión y los cambios hechos offline se
**sincronizan automáticamente al reconectar**.

> **Estado:** Fases 1, 2 y 3 (multiusuario remoto) completas y verificadas.

---

## 🚀 Ejecutar

```bash
cd admin-financiera
npm install
npm start
```

- **En este equipo:** http://localhost:3000
- **Otros equipos en la misma red:** http://`IP-del-servidor`:3000 (el servidor
  muestra la IP de red al arrancar). Para acceso por internet, ver
  [Acceso remoto](#-acceso-remoto-multiusuario).

### Usuarios (editar en `server/auth.js` o variable `USERS_JSON`)
| Usuario | Contraseña | Rol |
|--------------|-------------|-------------|
| `admin` | `admin123` | Administrador (todo, incluye eliminar/importar) |
| `capturista` | `captura123` | Capturista (registrar/editar) |
| `supervisor` | `super123` | Supervisor (ver/revisar) |

> ⚠️ **Cambia estas contraseñas** antes de exponer el servidor.

---

## ✅ Qué incluye la Fase 1 (MVP)

> Estructura basada en el Excel real **"Sistema Diario" (Administración Las Maravillas)**:
> manejo por **Etapa** (Etapa 1 y 2 / Etapa 3 / San José), categorías reales,
> comisiones por vendedor y corte diario de efectivo.

- **Dashboard** — métricas del día en tiempo real (ingresos, gastos, neto, efectivo,
  depósitos, diferencia de caja), estado de conciliación con semáforo y últimos 5 movimientos.
- **Ingresos** — CRUD completo con campos reales: Folio, Fecha, **Etapa**, Lote, Cliente,
  Vendedor, Pago (categoría), Tipo (Efectivo/Depósito), Cantidad, Verificado, Saldo,
  Observaciones. Recibo y folio consecutivos automáticos. Filtro por etapa + búsqueda.
- **Gastos** — CRUD con: Folio, Fecha, Etapa, Categoría, Cantidad, Lote, Recibe (persona),
  Tipo, Concepto, Beneficiario. Filtro por etapa + búsqueda.
- **Flujo de efectivo** — replica la hoja FLUJO **por Etapa**: ingresos efectivo/depósito,
  desglose por concepto (Abono, Enganche, Promoción, Contado, Recargos, Cambio Propietario,
  Número Oficial, Conexión Eléctrica, Servicios), **conciliación = Total − desglose (= 0)**,
  egresos por comisiones (por vendedor) y operación, y **Balance/Utilidad**. Filtro por rango de fechas.
- **Corte diario** — Corte del Flujo (efectivo esperado automático) vs contado (manual),
  diferencia automática `esperado − contado` con indicador **SI/NO**, campo "Recibió"
  (Sergio/Javier), estados Pendiente/Conciliado/Con diferencia y alerta roja.
- **Conciliación** — automática a partir del corte (semáforo verde/rojo/amarillo).
- **Historial** — bitácora de acciones + respaldo/restauración en JSON.
- **Autenticación** — login con sesión tipo JWT (demo, lado cliente).
- **UI/UX** — sidebar colapsable, tema claro/oscuro, mobile-first, emojis, Retina-ready.

### Catálogos (idénticos al Excel)
- **Etapas:** Etapa 1 y 2, Etapa 3, San José (gastos añaden "General").
- **Método de pago:** Efectivo, Depósito (gastos: + Otro).
- **Categorías de ingreso:** Abono, Enganche, Enganche Parcial, Recargo, Promo 1er/2do/3er Mes,
  Conexión Eléctrica, Número Oficial, Cambio Propietario, Servicios, Contado.
- **Categorías de gasto:** Comisión, Administración, Construcción, Ingeniería, Trámites,
  Contrato, Pago, Base, Conexión Eléctrica, Renta, Devolución, Perros, Otro.

---

## 🧱 Arquitectura

```
admin-financiera/
├── server.js              Express: API REST + SSE + login JWT + sirve la SPA
├── Dockerfile             Para desplegar en la nube
├── server/
│   ├── db.js              ⭐ Datos compartidos (JSON, escritura atómica) + bitácora
│   ├── auth.js            Login + JWT firmado (node:crypto) + permisos por rol
│   └── realtime.js        Tiempo real (Server-Sent Events): difunde cada cambio
├── data/                  (se crea solo) db.json compartido + .secret  [NO versionar]
└── public/
    ├── index.html         Shell de la SPA (sidebar, topbar, indicador de conexión)
    ├── css/styles.css
    ├── data/seed.json     Datos reales migrados del Excel (269 ingresos, 34 gastos)
    └── js/
        ├── config.js       Catálogos, claves de caché y roles
        ├── store.js        ⭐ Caché + API REST + stream SSE + cola offline
        ├── calc.js         ⭐ Lógica financiera pura (resumen, flujo, conciliación)
        ├── auth.js         Login contra el servidor + token + permisos
        ├── ui.js · utils.js · router.js
        ├── app.js          Bootstrap: login, tema, navegación, init del store
        └── views/          dashboard, ingresos, gastos, flujo, corte, conciliación, historial
```

### Cómo funciona la sincronización en tiempo real
1. El **servidor** (`server/db.js`) es la única fuente de verdad (archivo `data/db.json`).
2. Cada cliente, al entrar, **hidrata** su caché desde `GET /api/state` y abre un
   **stream SSE** (`GET /api/stream`).
3. Al crear/editar/borrar, el cliente llama a la API; el servidor guarda y **difunde**
   el cambio por SSE a **todos** los clientes conectados, que actualizan su vista al instante.
4. **Sin conexión:** las escrituras se aplican localmente y se **encolan**; al volver la
   red, la cola se reenvía y la caché se reconcilia con el servidor. El indicador de la
   barra superior muestra *En línea* / *Sin conexión* y cuántos cambios faltan sincronizar.
5. **Folios y recibos** los asigna el servidor (consecutivos sin colisiones entre usuarios).

**Principios clave**
- Sin compilación: **ES Modules** + **TailwindCSS/Chart.js por CDN**. Compatible con
  Safari (macOS/iPad/iPhone), Chrome, Firefox y Edge.
- Las vistas **nunca** hablan con la red directamente; todo pasa por `store.js`.
  Migrable a SQL cambiando solo `server/db.js`.

---

## 🌐 Acceso remoto (multiusuario)

El servidor escucha en `0.0.0.0`, listo para accederse desde otros equipos.

**1) Misma red (oficina / Wi-Fi):** arranca con `npm start` y comparte la URL de red
que imprime (ej. `http://192.168.1.50:3000`). Los demás solo abren esa dirección.

**2) Por internet, rápido (túnel):** sin desplegar nada, expón tu equipo con un túnel:
```bash
npx cloudflared tunnel --url http://localhost:3000     # o: ngrok http 3000
```
Te da una URL HTTPS pública temporal que cualquiera puede usar.

**3) Por internet, permanente (nube):** despliega en Render / Railway / Fly.io / un VPS
usando el `Dockerfile` incluido. **Importante:**
- Monta un **volumen persistente en `/app/data`** (ahí vive `db.json`).
- Define las variables de entorno **`JWT_SECRET`** (una cadena larga aleatoria) y, si
  quieres, **`USERS_JSON`** con tus usuarios reales.

> 🔐 **Seguridad:** cambia las contraseñas demo, usa HTTPS (los túneles y la nube lo dan)
> y define `JWT_SECRET`. La autenticación es JWT firmado en el servidor.

### Agregar / cambiar usuarios
Edita el arreglo `USERS` en [`server/auth.js`](server/auth.js), o define la variable
de entorno `USERS_JSON`, por ejemplo:
```bash
USERS_JSON='[{"user":"ana","pass":"clave-fuerte","name":"Ana","role":"capturista"}]' npm start
```

---

## ✅ Fases entregadas

**Fase 2** — 📊 Gráfica Chart.js · 🔗 Conciliación mensual · 📥 Migración del Excel.
**Fase 3 (multiusuario remoto)** — 🖥️ Servidor central con API REST · 🔄 Sincronización
en tiempo real (SSE) · 🔐 Login JWT en el servidor con roles · 📶 Offline con cola de
sincronización · 🌐 Acceso remoto (LAN / túnel / nube con Docker).

## 🔭 Roadmap siguiente

- 🧾 Recibos en **PDF** con monto en letra.
- 📑 Reporte tabular (hoja REPORTE) con filtros y exportación.
- 👷 Control de sueldos/nómina (hoja SKVO).
- 🗄️ Base de datos **SQL** (hoy es JSON; migrable cambiando solo `server/db.js`).

---

## ⚠️ Seguridad — antes de exponerlo
- **Cambia las contraseñas demo** (`server/auth.js` o `USERS_JSON`).
- Define **`JWT_SECRET`** (cadena larga aleatoria) como variable de entorno.
- Usa **HTTPS** (los túneles cloudflared/ngrok y los proveedores de nube ya lo dan).
- Respalda `data/db.json` periódicamente (o usa **Historial → ⬇️ Respaldo**).
