# Sistema de diseño BSL: "La ruta"

Fuente de verdad en código: `src/tema/index.tsx` (tokens) y `src/ui/` (componentes). Reemplaza a "Madrugada lojana" (cielo con cerros), que el usuario descartó el 2026-11-23 por verse poco profesional, sobre todo con el teléfono en modo oscuro.

## Idea
Desde el 2026-11-24 la app usa la paleta y la tipografía del Figma «BSL 2.0, Diseño completo» (pedido del usuario: «mejor están los colores del Figma»), que reemplaza a los colores de Predir. Fuente de los valores: `ESPECIFICACION_DISENO_VSL2.md`. Se mantienen la línea de la ruta (LineaParadas), la buseta que avanza sobre ella y las reglas de abajo.

## Modo claro por defecto
La app arranca en claro aunque el teléfono esté en modo oscuro (clave `bsl_modo_tema_v2`). El oscuro se elige a mano en Perfil.

## Color
| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| bg / surface / surface2 / border | #F3F6FA / #FFFFFF / #EAF0F7 / #DCE3EC | #0B1220 / #131C2E / #1A2539 / #24304A | fondos y bordes |
| text / text2 / text3 | #0F1B2D / #3A4A60 / #5A6A80 | #EEF3FA / #B9C6D8 / #93A3B8 | texto |
| primary / primaryStrong | #1B4D89 / #123A68 | #6EA8F0 / #9CC4F5 | marca, enlaces, pestaña activa, confirmar; cabeceras |
| accent (onAccent #0F1B2D) | #F5A524 | #F5A524 | acción principal, "en curso", la buseta |
| success / warning / danger | #1E9E62 / #E07A10 / #C53A3A | #3DBE84 / #F0952F / #E46161 | subió y llegó / pausa y pendiente / alarma de 500 m |
| escuelas | #14A3A0 (San Sebastián), #7B5CE0 (Los Pinos) | igual | chips y mapa |

La alarma de 500 m va en rojo y la de 1 km en azul marino, ambas con texto blanco.

## Tipografía
Manrope 700 y 800 para títulos y cifras; Inter 400 a 700 para la lectura (escala 28 / 22 / 18 / 16 / 14 / 12).

## Forma
Base 4. Radios: 10 campos, 14 tarjetas y botones, 20 hojas, 999 píldoras. Sombras teñidas de azul marino.

## Pantallas clave
- **Ingreso** (primera pantalla sin sesión y al cerrar sesión): marca, "Inicia sesión", selector deslizable Padre de familia / Chofer (`SelectorRol`), Usuario y Contraseña, Ingresar, código por SMS como alternativa, "¿No tienes cuenta? Regístrate" (al registro del rol elegido) y "Desarrollado por Predir".
- **Inicio del representante**: tarjeta azul de próxima llegada con hora grande y barra de avance de la buseta hacia la casa (`Pantalla cielo enCielo progreso`).
- Sin datos ni cuentas de ejemplo en la app: sin Supabase configurado se muestra "Falta conectar el servidor". El modo demostración (`src/demo`) solo existe para `npm run probar:demo`.

## Movimiento (motion)
- Ingreso: la buseta se desliza una vez de Casa hacia Escuela por la línea de la ruta.
- Inicio: la ruta se dibuja sola al aparecer (línea que crece, paradas que aparecen en orden, menos de 900 ms, una vez).
- Tu casa late suave mientras la buseta va en camino (estado en vivo).
- (La tarjeta de llegada arriba del Inicio se quitó a pedido del usuario; la llegada se lee en la fila de tu casa: "Llega en N min".)
- La píldora de la pestaña activa crece al tocarla (220 ms).
- Todo respeta "reducir movimiento": con él activo, todo aparece completo y quieto.

## Reglas
- La casa la marca solo el representante (pin en el portón y referencia, pantalla Direcciones). El chofer crea al estudiante sin dirección y solo la ve; las escuelas sí las marca el chofer. Mientras falte la casa, el Inicio del representante muestra "Marca la casa de X". La base lo garantiza (políticas de addresses y función fijar_casa).
- La buseta a 1 km y a 500 m suena como alarma: pantalla completa (AlarmaBuseta) que vibra hasta "Entendido" (30 s máx.) y canal de Android "Alarma de la buseta" para la notificación del sistema.
- Nunca una hora de llegada estimada ni "llega en N min": no hay forma honesta de predecirla. Solo se muestran horas reales (salida programada, salió, subió, llegó) y avisos por distancia del GPS (a menos de 1 km y a menos de 500 m). El chofer ve la distancia a la próxima parada, sin minutos ni retraso calculado.
- Íconos Lucide, trazo 2. Cero emojis. Sin el separador "·" en los textos.
- Áreas táctiles de 48 o más; 56 en conducción.
- Ninguna decisión en un Alert nativo.
- Toda pantalla con datos tiene cargando, vacío, error y sin conexión.
