# Guía de despliegue en la nube (Render)

Objetivo: poner la app en internet con una URL fija (HTTPS) para que Hillary la
use desde su oficina remota. **Todos** (tú y Hillary) se conectan al **mismo
servidor**, para que los datos nunca se separen.

Costo: ~**$7 USD/mes** (plan Starter de Render: siempre encendido + disco persistente).

---

## Paso 0 — Descarga tu respaldo actual (en tu Mac)

1. Abre la app como ahora (admin).
2. Ve a **Historial → botón "Respaldo"**. Se descarga un archivo `.json` con
   TODOS tus datos (junio ya cargado, entregas, etc.). Guárdalo bien.

## Paso 1 — Crea la cuenta y el servicio en Render

1. Entra a **render.com** y crea una cuenta (puedes usar tu GitHub).
2. Conecta tu GitHub y dale acceso al repo **Maravillas**.
3. Clic en **New → Blueprint**. Elige el repo. Render leerá `render.yaml` solo.
4. Te pedirá el plan: confirma **Starter** (el que trae disco).

## Paso 2 — Configura los usuarios y contraseñas

Antes de terminar el deploy, en la sección de variables de entorno pega en
**`USERS_JSON`** un texto como este (con TUS contraseñas, en una sola línea):

```json
[{"user":"admin","pass":"TU_CONTRASEÑA_FUERTE","name":"Javier","role":"admin"},{"user":"hillary","pass":"CONTRASEÑA_DE_HILLARY","role":"capturista","name":"Hillary"}]
```

- `admin` = tú (acceso total). `hillary` = captura diaria.
- `JWT_SECRET` lo genera Render solo (no lo toques).
- **Nunca** compartas este texto ni lo subas a GitHub.

## Paso 3 — Despliega y obtén la URL

1. Dale **Deploy / Apply**. Espera a que el estado diga **"Live"** (unos minutos).
2. Copia la URL que te da Render (ej. `https://maravillas.onrender.com`).

## Paso 4 — Restaura tus datos

1. Abre la URL, entra como **admin**.
2. Ve a **Historial → botón "Restaurar"** y sube el archivo del Paso 0.
3. Verifica que junio, entregas, etc. estén ahí. ¡Listo, migración hecha!

## Paso 5 — Dale acceso a Hillary

- Mándale la URL, su usuario (`hillary`) y su contraseña.
- Ella entra y usa **Captura Diaria** (su rol solo ve/edita lo que le toca).

---

## Notas importantes

- **Un solo servidor:** de aquí en adelante todos usan la URL de Render (ya no
  tu copia local). Si quieres seguir usando tu Mac para pruebas, hazlo con datos
  aparte, no en producción.
- **Respaldos:** de vez en cuando usa Historial → "Respaldo" para guardar una
  copia (por si acaso).
- **Actualizaciones:** cada vez que se haga `git push` a `main`, Render
  redepliega solo (con tus datos intactos en el disco).
- **Contraseñas:** para cambiarlas, edita `USERS_JSON` en Render → Environment.
