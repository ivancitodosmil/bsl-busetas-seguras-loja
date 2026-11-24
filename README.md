# BSL · Busetas Seguras Loja · versión 2.0

App móvil de transporte escolar (chofer ↔ representante). React Native + Expo 54 + TypeScript, con Supabase (Postgres, Auth, Realtime y Storage).

```
BSL/
├── app/                 la app móvil
├── supabase/            el servidor: 3 archivos SQL + 2 funciones opcionales
│   ├── 01_esquema.sql
│   ├── 02_funciones_y_seguridad.sql
│   ├── 03_datos_demo.sql
│   ├── functions/       send-push y chatbot (opcionales)
│   └── pruebas/         prueba automática del esquema en un PostgreSQL local
├── figma-import/        fuentes del diseño (fase 1)
└── arquitectura/
```

Este proyecto es independiente de VSL 1.0: no toca su repositorio ni su proyecto de Supabase.

---

## Probarla ya, sin Supabase (modo demostración)

Mientras `app/.env` tenga los valores de ejemplo, la app arranca sola en **modo demostración**: usuarios y datos quemados en el teléfono y una buseta simulada que recorre la ruta por las calles de Loja.

```
cd app
npm start -- -c      # elige sola la IP del Wi-Fi (si no conecta: npm run tunel)
```

Abre con **Expo Go** (SDK 54). En la pantalla de ingreso toca una de las cuentas de demostración, o usa el botón ámbar **Demo** del borde derecho para:

- **Entrar como** Carlos (chofer), María o Diego (representantes) o Luis (sustituto), con un toque.
- **Simular ida / Simular vuelta**: la buseta sale sola, recoge y entrega. Entra como María y mira la pestaña Mapa.
- **Reiniciar datos**.

Si entras como Carlos e inicias tú el recorrido, la buseta llega a cada parada y espera a que marques Abordó o Entregado.

Los datos de la demostración se reinician al cerrar la app y no salen del teléfono. Contraseña de todas las cuentas: `Bsl2026demo`; código SMS: `123456`; invitación: `BSL-DEMO-2026`.

Prueba automática de este modo: `npm run probar:demo` (dentro de `app`).

---

## Conectarla a Supabase (unos 10 minutos)

### 1. Crea el proyecto en Supabase

1. Entra a https://supabase.com/dashboard y crea un proyecto nuevo (nombre `bsl`, región São Paulo). Guarda la contraseña de la base.
2. Abre **SQL Editor** y ejecuta, en este orden, el contenido completo de:
   1. `supabase/01_esquema.sql`
   2. `supabase/02_funciones_y_seguridad.sql`
   3. `supabase/03_datos_demo.sql`
3. En **Authentication → Sign In / Providers → Email**, desactiva **Confirm email**. Así las cuentas nuevas entran sin abrir un correo (para producción se vuelve a activar).

### 2. Conecta la app

En **Project Settings → API** copia la *Project URL* y la clave *anon public*, y pégalas en `app/.env`:

```
EXPO_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### 3. Ábrela en el teléfono

```
cd app
npm start -- -c      # elige sola la IP del Wi-Fi (si no conecta: npm run tunel)
```

Instala **Expo Go** (SDK 54) en el teléfono y escanea el QR. Para probar los dos roles a la vez, usa dos teléfonos, o un teléfono y un emulador.

### Cuentas de demostración

Contraseña de todas: `Bsl2026demo`

| Correo | Quién es |
|---|---|
| `chofer@bsl.app` | Carlos Ortega, chofer verificado con Ruta Norte (ida y vuelta), 2 escuelas y 6 estudiantes |
| `maria@bsl.app` | María Jaramillo, mamá de Emilia y Mateo |
| `diego@bsl.app` | Diego Armijos, papá de Emilia y Mateo |
| `sustituto@bsl.app` | Luis Carrión, chofer verificado sin rutas (para probar el sustituto; búscalo por `+593 99 555 1212`) |

Código de invitación para probar el vínculo con una cuenta nueva de representante: `BSL-DEMO-2026` (Nicolás Torres).

### Recorrido de prueba sugerido

1. Teléfono A: entra con `maria@bsl.app`. Verás a Emilia y Mateo con la ruta programada.
2. Teléfono B: entra con `chofer@bsl.app` → **Iniciar recorrido** → acepta el permiso de ubicación → **Confirmar e iniciar**.
3. En A aparece "La buseta salió" y la buseta en la pestaña **Mapa**.
4. En B toca **Abordó** en cada niño, envía un mensaje rápido, entrega en la escuela y **Finalizar**.
5. En A revisa **Avisos**, la **Línea de tiempo** y luego el **Historial**.
6. En A reporta una ausencia para mañana; en B aparece tachada en Inicio.

---

## Qué funciona en Expo Go y qué necesita compilar

| Función | Expo Go | App compilada (`eas build`) |
|---|---|---|
| Todo el flujo de chofer y representante, mapa en vivo, avisos dentro de la app | sí | sí |
| Notificación del sistema con la app abierta o recién minimizada | sí | sí |
| Notificación **push con la app cerrada** | no | sí (requiere desplegar `send-push`) |
| GPS del chofer **en segundo plano** (al abrir Google Maps o Waze) | no: transmite solo con BSL abierta | sí |

Para compilar el APK de pruebas: `npx eas build -p android --profile preview` (antes, `npx eas init` para obtener el `projectId` y ponerlo en `app.json`, y la clave de Google Maps en `app/.env`).

---

## Modo demostración de la verificación

En `03`/`02` queda `auto_verify_drivers = true`: cuando un chofer nuevo toca **Enviar a revisión**, su cuenta se verifica sola, para poder probar el flujo completo. Para trabajar con revisión real:

```sql
update public.app_config set value = 'false' where key = 'auto_verify_drivers';
-- aprobar o rechazar a mano:
update public.drivers set verification_status = 'verified' where id = '<uuid>';
update public.drivers set verification_status = 'rejected', reviewer_note = 'La foto de la licencia está borrosa.' where id = '<uuid>';
```

## Funciones opcionales

- **`send-push`**: avisos con la app cerrada. Las instrucciones están al inicio de `supabase/functions/send-push/index.ts`.
- **`chatbot`**: respuestas con Gemini para lo que no esté en las preguntas frecuentes. Sin desplegarla, el soporte responde las preguntas frecuentes y ofrece contacto humano.
- **Ingreso por celular (SMS)**: configura un proveedor de SMS en Supabase Auth → Phone y pon `EXPO_PUBLIC_PHONE_AUTH=1` en `app/.env`.

## Probar el esquema sin Supabase

Con PostgreSQL instalado en la máquina:

```
powershell -File supabase\pruebas\probar_local.ps1
```

Crea la base `bsl_test`, ejecuta los tres archivos y recorre 10 escenarios con la seguridad por filas activa (registro, lo que ve cada rol, ausencias, recorrido completo, "buseta cerca", sustituto, invitaciones, verificación, cancelación y borrado de cuenta).

## Fuera de esta versión

- Cobro en línea, planes y suscripciones (fase 3). Pagos es solo el registro manual del chofer.
- Panel web de administración: la verificación de choferes se hace desde el panel de Supabase.
- Ingreso con Google y con huella.
- Alerta de tráfico con ruta alterna (pantalla 81) y enlace temporal de seguimiento para terceros (pantalla 39, nivel 2).
