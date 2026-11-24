# BSL · Busetas Seguras Loja

App de transporte escolar para Loja, Ecuador. El chofer transmite la ubicación de la buseta y marca cuándo sube y llega cada niño. El representante ve la buseta en vivo, recibe un aviso a 1 km y a 500 m de su casa y puede registrar las ausencias de sus hijos.

Proyecto de la asignatura Emprendimiento de Base Tecnológica II (UTPL), paralelo A.

**MVP web:** https://ivancitodosmil.github.io/bsl-busetas-seguras-loja/

## Cuentas de prueba

Todas usan la contraseña `Bsl2026demo`.

| Rol | Correo |
|---|---|
| Representante | monica@bsl.app (Mónica León, madre de Martín y Sofía) |
| Chofer | rodrigo@bsl.app (Rodrigo González, Ruta mañanas) |

## Qué hay en este repositorio

```
app/           la app (React Native 0.88 + Expo SDK 58 + TypeScript), para Android, iOS y web
supabase/      el servidor: esquema, funciones, seguridad por filas (RLS) y datos de ejemplo
arquitectura/  diagramas de la arquitectura
```

- **Servidor:** Supabase (PostgreSQL, Auth, Realtime y Storage), región São Paulo.
- **Mapas:** Google Maps en el celular; OpenStreetMap con Leaflet en la web. OSRM traza el camino por calles y ordena las paradas.
- **Avisos:** Expo Notifications, con alarma a pantalla completa a 1 km y a 500 m.

## Correr la app

```
cd app
npm install
cp .env.example .env      # y pega la URL y la clave publicable de tu proyecto de Supabase
npm start -- -c           # abre con Expo Go (SDK 58) escaneando el QR
```

Versión web:

```
npx expo export --platform web
```

## Base de datos

En el SQL Editor de Supabase, ejecuta en orden:

1. `supabase/01_esquema.sql`
2. `supabase/02_funciones_y_seguridad.sql`
3. (opcional) `supabase/03_datos_demo.sql` o `supabase/06_datos_ejemplo.sql`

## Equipo

Iván Patricio González Castro, Rubén Alejandro Condoy Cabrera, Lenin Andrés Cuenca Cuenca y Cristian Miguel Jiménez Robles.
