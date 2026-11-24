// Utilidades de fecha, formato, distancia y mensajes de error. Zona horaria fija: Loja (UTC−5).
import type { AlcanceAusencia, Coordenada, Sentido } from '../tipos';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const LETRAS_DIA = ['L', 'M', 'M', 'J', 'V', 'S', 'D']; // índice 0 = lunes (weekday 1)
export const NOMBRES_DIA_ISO = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

const DESFASE_MS = 5 * 60 * 60 * 1000;

/** Fecha y hora de Loja como si fuera UTC (para leer sus partes con getUTC*). */
function enLoja(d: Date | string | number = new Date()): Date {
  return new Date(new Date(d).getTime() - DESFASE_MS);
}

const p2 = (n: number) => String(n).padStart(2, '0');

/** Hoy en Loja, AAAA-MM-DD. */
export function hoyISO(): string {
  return aISO(enLoja());
}
function aISO(d: Date): string {
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
}
/** Suma días a una fecha AAAA-MM-DD. */
export function sumarDias(iso: string, dias: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return aISO(d);
}
/** Día de la semana ISO (1 = lunes … 7 = domingo) de una fecha AAAA-MM-DD. */
export function diaISO(iso: string): number {
  const n = new Date(iso + 'T00:00:00Z').getUTCDay();
  return n === 0 ? 7 : n;
}
/** "Martes 10 de noviembre" */
export function fechaLarga(iso: string = hoyISO(), mayuscula = true): string {
  const d = new Date(iso + 'T00:00:00Z');
  const t = `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
  return mayuscula ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}
/** "Lun 9 nov" */
export function fechaCorta(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  const t = `${DIAS_CORTOS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()].slice(0, 3)}`;
  return t.charAt(0).toUpperCase() + t.slice(1);
}
/** "hoy", "mañana" o "el jueves 12" */
export function diaRelativo(iso: string): string {
  const hoy = hoyISO();
  if (iso === hoy) return 'hoy';
  if (iso === sumarDias(hoy, 1)) return 'mañana';
  const d = new Date(iso + 'T00:00:00Z');
  return `el ${DIAS[d.getUTCDay()]} ${d.getUTCDate()}`;
}
/** Hora local de Loja "06:38" a partir de una marca de tiempo. */
export function hora(ts: string | Date | number | null | undefined): string {
  if (!ts) return '';
  const d = enLoja(ts);
  return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}
/** Recorta "06:15:00" a "06:15". */
export function hhmm(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : '';
}
/** Minutos desde medianoche de "HH:MM". */
export function aMinutos(t: string | null | undefined): number {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}
export function deMinutos(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${p2(Math.floor(m / 60))}:${p2(m % 60)}`;
}
/** Minutos transcurridos del día en Loja. */
export function minutosAhora(): number {
  const d = enLoja();
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
/** Fecha AAAA-MM-DD (Loja) de una marca de tiempo. */
export function fechaDe(ts: string | Date | number): string {
  return aISO(enLoja(ts));
}
/** "hace 3 min", "06:41" si es de hoy, "Lun 9 nov" si es anterior. */
export function haceCuanto(ts: string): string {
  const min = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  if (fechaDe(ts) === hoyISO()) return hora(ts);
  return fechaCorta(fechaDe(ts));
}
/** Edad en años a partir de la fecha de nacimiento. */
export function edad(nacimiento: string | null | undefined): number | null {
  if (!nacimiento) return null;
  const hoy = hoyISO();
  let a = Number(hoy.slice(0, 4)) - Number(nacimiento.slice(0, 4));
  if (hoy.slice(5) < nacimiento.slice(5)) a -= 1;
  return a >= 0 ? a : null;
}
/** "L M M J V" a partir de [1,2,3,4,5]; "Todos los días" si son los 7. */
export function diasTexto(dias: number[]): string {
  const o = [...dias].sort((a, b) => a - b);
  if (o.length === 7) return 'Todos los días';
  if (o.join() === '1,2,3,4,5') return 'Lunes a viernes';
  return o.map((d) => LETRAS_DIA[d - 1]).join(' ');
}

export const textoSentido = (s: Sentido) => (s === 'pickup' ? 'Ida' : 'Vuelta');
export const textoAlcance = (a: AlcanceAusencia) =>
  a === 'pickup' ? 'Solo ida' : a === 'dropoff' ? 'Solo vuelta' : 'Todo el día';

export function nombreCompleto(u: { first_name?: string | null; last_name?: string | null } | null | undefined): string {
  return `${u?.first_name ?? ''} ${u?.last_name ?? ''}`.trim();
}
export function iniciales(nombre: string | null | undefined): string {
  const partes = (nombre ?? '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].charAt(0).toUpperCase();
  return (partes[0].charAt(0) + partes[partes.length - 1].charAt(0)).toUpperCase();
}
/** "Emilia y Mateo", "Emilia, Mateo y Sofía" */
export function listaNombres(nombres: string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? '';
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}
export function dinero(n: number): string {
  return '$' + Number(n).toFixed(2).replace('.', ',');
}

// ── Celular ecuatoriano ─────────────────────────────────────────────────────
/** Convierte "099 123 4567" o "991234567" a E.164 (+593991234567). null si no es válido. */
export function celularE164(texto: string): string | null {
  let d = texto.replace(/\D/g, '');
  if (d.startsWith('593')) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);
  return /^9\d{8}$/.test(d) ? `+593${d}` : null;
}
/** "+593 99 123 4567" */
export function celularBonito(e164: string | null | undefined): string {
  if (!e164) return '';
  const m = e164.match(/^\+593(\d{2})(\d{3})(\d{4})$/);
  return m ? `+593 ${m[1]} ${m[2]} ${m[3]}` : e164;
}
export const correoValido = (t: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t.trim());
/** Normaliza una placa a "ABC-1234"; null si no cumple el formato ecuatoriano. */
export function placaValida(texto: string): string | null {
  const t = texto.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = t.match(/^([A-Z]{3})(\d{3,4})$/);
  return m ? `${m[1]}-${m[2]}` : null;
}

// ── Distancias ──────────────────────────────────────────────────────────────
export function distanciaM(a: Coordenada, b: Coordenada): number {
  const R = 6371000;
  const r = (g: number) => (g * Math.PI) / 180;
  const h =
    Math.sin(r(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(r(a.latitude)) * Math.cos(r(b.latitude)) * Math.sin(r(b.longitude - a.longitude) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
/** "650 m" o "9,7 km" */
export function distanciaTexto(m: number): string {
  if (m < 950) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}
/** Minutos estimados a 25 km/h con un factor de calles de 1,3. */
export function minutosDeViaje(metros: number): number {
  return Math.max(1, Math.round(((metros * 1.3) / 1000 / 25) * 60));
}
/** Distancia mínima (m) de un punto a una poligonal. */
export function distanciaARuta(p: Coordenada, linea: Coordenada[]): number {
  if (linea.length === 0) return 0;
  let min = Infinity;
  const kLat = 111320;
  const kLon = 111320 * Math.cos((p.latitude * Math.PI) / 180);
  for (let i = 0; i < linea.length - 1; i++) {
    const ax = (linea[i].longitude - p.longitude) * kLon;
    const ay = (linea[i].latitude - p.latitude) * kLat;
    const bx = (linea[i + 1].longitude - p.longitude) * kLon;
    const by = (linea[i + 1].latitude - p.latitude) * kLat;
    const dx = bx - ax;
    const dy = by - ay;
    const l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2));
    min = Math.min(min, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return linea.length === 1 ? distanciaM(p, linea[0]) : min;
}
/** Región de mapa que encuadra una lista de puntos. */
export function regionDe(puntos: Coordenada[]) {
  const v = puntos.filter((x) => x && typeof x.latitude === 'number');
  if (v.length === 0) return { ...LOJA, latitudeDelta: 0.06, longitudeDelta: 0.06 };
  const lats = v.map((x) => x.latitude);
  const lons = v.map((x) => x.longitude);
  const minLa = Math.min(...lats), maxLa = Math.max(...lats), minLo = Math.min(...lons), maxLo = Math.max(...lons);
  return {
    latitude: (minLa + maxLa) / 2,
    longitude: (minLo + maxLo) / 2,
    latitudeDelta: Math.max(0.008, (maxLa - minLa) * 1.5),
    longitudeDelta: Math.max(0.008, (maxLo - minLo) * 1.5),
  };
}
export const LOJA: Coordenada = { latitude: -3.99313, longitude: -79.20422 };

/** UUID v4 para las acciones de la cola sin conexión. */
export function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── Errores ─────────────────────────────────────────────────────────────────
const MENSAJES: Record<string, string> = {
  INVITACION_INVALIDA: 'No encontramos ese código. Revisa que esté completo.',
  INVITACION_EXPIRADA: 'Este código venció. Pídele uno nuevo al chofer.',
  INVITACION_USADA: 'Este código ya fue usado por otra persona. Pídele uno nuevo al chofer.',
  SOLO_REPRESENTANTES: 'Los códigos de invitación son para cuentas de representante.',
  NO_AUTORIZADO: 'Tu cuenta no tiene permiso para hacer esto.',
  NO_AUTENTICADO: 'Tu sesión expiró. Vuelve a entrar.',
  CHOFER_NO_VERIFICADO: 'Tu cuenta aún no está verificada. Podrás iniciar recorridos cuando lo esté.',
  SERVICIO_CANCELADO: 'El servicio de hoy está cancelado. Deshaz la cancelación para iniciar.',
  RECORRIDO_YA_FINALIZADO: 'Este recorrido ya se hizo hoy.',
  OTRO_RECORRIDO_EN_CURSO: 'Tienes otro recorrido en curso. Finalízalo antes de iniciar este.',
  RUTA_SIN_PARADAS: 'Esta ruta no tiene paradas activas hoy.',
  PARADAS_FUERA_DE_RANGO: 'Una ruta necesita entre 1 y 50 paradas.',
  RECORRIDO_EN_CURSO: 'No puedes cambiar las paradas con un recorrido en curso.',
  FECHA_PASADA: 'No se puede registrar en una fecha que ya pasó.',
  RECORRIDO_YA_INICIO: 'El recorrido de ese día ya inició. Llama al chofer para avisarle.',
  SUSTITUTO_NO_VERIFICADO: 'Ese chofer todavía no tiene la cuenta verificada.',
  CAMBIO_DE_ESTADO_NO_PERMITIDO: 'Ese cambio no está permitido.',
};

/** true si el error es de red (la acción puede quedar en cola). */
export function esErrorDeRed(e: any): boolean {
  const m = String(e?.message ?? e ?? '').toLowerCase();
  return (
    m.includes('network request failed') || m.includes('failed to fetch') || m.includes('fetch failed') ||
    m.includes('networkerror') || m.includes('tiempo de espera') || m.includes('timeout') || e?.name === 'AbortError'
  );
}

/** Convierte cualquier error (Supabase, red, validación) en una frase clara para el usuario. */
export function mensajeError(e: any, respaldo = 'Algo salió mal. Inténtalo de nuevo.'): string {
  const bruto = String(e?.message ?? e ?? '');
  for (const clave of Object.keys(MENSAJES)) if (bruto.includes(clave)) return MENSAJES[clave];
  if (esErrorDeRed(e)) return 'No hay conexión a internet. Revisa tu señal e inténtalo de nuevo.';
  const m = bruto.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (m.includes('email not confirmed')) return 'Confirma tu correo con el enlace que te enviamos y vuelve a entrar.';
  if (m.includes('user already registered') || m.includes('already been registered')) return 'Ya existe una cuenta con ese correo. Inicia sesión.';
  if (m.includes('password should be at least')) return 'La contraseña debe tener al menos 6 caracteres.';
  if (m.includes('rate limit') || m.includes('too many') || m.includes('security purposes')) return 'Demasiados intentos. Espera un minuto y vuelve a probar.';
  if (m.includes('token has expired') || m.includes('otp') && m.includes('invalid')) return 'El código no es válido o ya venció. Pide uno nuevo.';
  if (m.includes('unsupported phone provider') || m.includes('phone provider') || m.includes('sms')) return 'El ingreso por celular aún no está activado. Usa tu correo.';
  if (m.includes('signups not allowed') || m.includes('signup is disabled')) return 'El registro está desactivado en el servidor.';
  if (m.includes('duplicate key') && m.includes('phone')) return 'Ese celular ya está registrado en otra cuenta.';
  if (m.includes('duplicate key')) return 'Ese dato ya está registrado.';
  if (m.includes('row-level security') || m.includes('permission denied')) return 'Tu cuenta no tiene permiso para hacer esto.';
  if (m.includes('jwt') || m.includes('refresh token')) return 'Tu sesión expiró. Vuelve a entrar.';
  if (m.includes('plate_number')) return 'La placa debe tener el formato ABC-1234.';
  return respaldo;
}
