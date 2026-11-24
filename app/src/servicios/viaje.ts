// Recorrido en vivo: iniciar, eventos (con cola sin conexión), GPS en segundo plano, tiempo real
// y trazado por calles (OSRM, gratuito y sin clave).
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { modoDemo, pedir, supabase } from '../config/supabase';
import { simulador } from '../demo/simulador';
import type { Coordenada, EventoViaje, Parada, PosicionViaje, TipoEvento, Viaje } from '../tipos';
import { aMinutos, deMinutos, distanciaM, esErrorDeRed, uuid } from '../utils';

const TAREA_GPS = 'bsl-transmitir-recorrido';
const CLAVE_VIAJE = 'bsl_viaje_transmitiendo';
const CLAVE_COLA = 'bsl_cola_eventos';
const CLAVE_GPS_COLA = 'bsl_cola_gps';

export const INTERVALO_GPS = 5000; // normal
export const INTERVALO_GPS_BAJO = 15000; // modo bajo consumo
export const RADIO_ENTREGA_M = 300; // "Entregado" solo a ≤ 300 m de la parada
export const RADIO_ESCUELA_M = 100; // geocerca que propone confirmar la entrega
export const RETRASO_MIN = 10;

// ── Posición del chofer: se envía al servidor y se avisa a la pantalla abierta ──
type OyentePosicion = (p: Coordenada & { speed: number | null; heading: number | null }) => void;
const oyentes = new Set<OyentePosicion>();
export function alMoverse(f: OyentePosicion) {
  oyentes.add(f);
  return () => { oyentes.delete(f); };
}

async function enviarPosiciones(tripId: string, locs: Location.LocationObject[]) {
  const filas = locs.map((l) => ({
    trip_id: tripId,
    latitude: l.coords.latitude,
    longitude: l.coords.longitude,
    speed: l.coords.speed ?? null,
    heading: l.coords.heading ?? null,
    recorded_at: new Date(l.timestamp).toISOString(),
  }));
  const ultima = locs[locs.length - 1];
  if (ultima) oyentes.forEach((f) => f({ latitude: ultima.coords.latitude, longitude: ultima.coords.longitude, speed: ultima.coords.speed ?? null, heading: ultima.coords.heading ?? null }));
  // Lo que quedó sin enviar por falta de señal sale junto con lo nuevo.
  let pendientes: typeof filas = [];
  try {
    pendientes = JSON.parse((await AsyncStorage.getItem(CLAVE_GPS_COLA)) ?? '[]');
  } catch { /* cola ilegible: se descarta */ }
  const lote = [...pendientes.filter((p) => p.trip_id === tripId), ...filas];
  const { error } = await supabase.from('trip_locations').insert(lote);
  if (error && esErrorDeRed(error)) {
    await AsyncStorage.setItem(CLAVE_GPS_COLA, JSON.stringify(lote.slice(-120)));
  } else if (pendientes.length > 0) {
    await AsyncStorage.removeItem(CLAVE_GPS_COLA);
  }
}

// La tarea debe definirse al cargar el módulo (se importa desde App.tsx).
TaskManager.defineTask(TAREA_GPS, async ({ data, error }) => {
  if (error || !data) return;
  const tripId = await AsyncStorage.getItem(CLAVE_VIAJE);
  const { locations } = data as { locations: Location.LocationObject[] };
  if (tripId && locations?.length) await enviarPosiciones(tripId, locations).catch(() => {});
});

let vigilancia: Location.LocationSubscription | null = null;

export const transmision = {
  /** Estado de los permisos de ubicación. */
  async permisos() {
    if (modoDemo) return { primerPlano: true, segundoPlano: true, puedePreguntar: true }; // la buseta es simulada
    const pp = await Location.getForegroundPermissionsAsync();
    const sp = await Location.getBackgroundPermissionsAsync().catch(() => ({ granted: false }));
    return { primerPlano: pp.granted, segundoPlano: sp.granted, puedePreguntar: pp.canAskAgain };
  },
  async pedirPrimerPlano() {
    if (modoDemo) return true;
    return (await Location.requestForegroundPermissionsAsync()).granted;
  },
  /** Llamar solo después de mostrar la divulgación destacada (pantalla de ubicación en segundo plano). */
  async pedirSegundoPlano() {
    if (modoDemo) return true;
    try {
      return (await Location.requestBackgroundPermissionsAsync()).granted;
    } catch {
      return false; // Expo Go no permite el permiso "todo el tiempo"
    }
  },
  async posicionActual(): Promise<Coordenada | null> {
    if (modoDemo) return simulador.posicion();
    try {
      const l = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      return l ? { latitude: l.coords.latitude, longitude: l.coords.longitude } : null;
    } catch {
      return null;
    }
  },

  /**
   * Empieza a transmitir. Con permiso "todo el tiempo" sigue en segundo plano (notificación
   * persistente); sin él, transmite mientras la app esté abierta.
   */
  async iniciar(tripId: string, bajoConsumo: boolean): Promise<'segundo_plano' | 'primer_plano' | 'sin_permiso'> {
    if (modoDemo) {
      // Sin GPS real: una buseta simulada recorre la ruta y espera en cada parada.
      await AsyncStorage.setItem(CLAVE_VIAJE, tripId);
      simulador.iniciar(tripId, { trazar, alMover: (p) => oyentes.forEach((f) => f({ ...p, speed: null, heading: null })) });
      return 'primer_plano';
    }
    const p = await this.permisos();
    if (!p.primerPlano) return 'sin_permiso';
    await AsyncStorage.setItem(CLAVE_VIAJE, tripId);
    const intervalo = bajoConsumo ? INTERVALO_GPS_BAJO : INTERVALO_GPS;
    await this.detener(false);
    if (p.segundoPlano) {
      try {
        await Location.startLocationUpdatesAsync(TAREA_GPS, {
          accuracy: bajoConsumo ? Location.Accuracy.Balanced : Location.Accuracy.High,
          timeInterval: intervalo,
          distanceInterval: 0,
          pausesUpdatesAutomatically: false,
          showsBackgroundLocationIndicator: true,
          activityType: Location.ActivityType.AutomotiveNavigation,
          foregroundService: {
            notificationTitle: 'BSL está transmitiendo tu recorrido',
            notificationBody: `Cada ${intervalo / 1000} s. Toca para volver`,
            notificationColor: '#1B4D89',
          },
        });
        return 'segundo_plano';
      } catch { /* cae al modo de primer plano */ }
    }
    vigilancia = await Location.watchPositionAsync(
      { accuracy: bajoConsumo ? Location.Accuracy.Balanced : Location.Accuracy.High, timeInterval: intervalo, distanceInterval: 0 },
      (l) => { enviarPosiciones(tripId, [l]).catch(() => {}); },
    );
    return 'primer_plano';
  },

  async detener(olvidar = true) {
    if (modoDemo && olvidar) simulador.detener();
    vigilancia?.remove();
    vigilancia = null;
    try {
      if (await Location.hasStartedLocationUpdatesAsync(TAREA_GPS)) await Location.stopLocationUpdatesAsync(TAREA_GPS);
    } catch { /* la tarea no estaba registrada */ }
    if (olvidar) await AsyncStorage.removeItem(CLAVE_VIAJE);
  },

  viajeActivo: () => AsyncStorage.getItem(CLAVE_VIAJE),
};

// ── Cola de eventos sin conexión (idempotente por client_id) ────────────────
interface EventoNuevo {
  trip_id: string;
  type: TipoEvento;
  student_id?: string | null;
  school_id?: string | null;
  stop_id?: string | null;
  payload?: EventoViaje['payload'];
  latitude?: number | null;
  longitude?: number | null;
}
type EnCola =
  | { op: 'insertar'; fila: EventoNuevo & { client_id: string; created_at: string } }
  | { op: 'borrar'; trip_id: string; student_id: string; type: TipoEvento };

async function leerCola(): Promise<EnCola[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(CLAVE_COLA)) ?? '[]');
  } catch {
    return [];
  }
}
const guardarCola = (c: EnCola[]) => AsyncStorage.setItem(CLAVE_COLA, JSON.stringify(c));

async function ejecutar(a: EnCola) {
  if (a.op === 'insertar') {
    const { error } = await supabase.from('trip_events').insert(a.fila);
    // 23505 = ya estaba registrado (reintento o doble toque): cuenta como hecho.
    if (error && error.code !== '23505') throw new Error(error.message);
  } else {
    const { error } = await supabase.from('trip_events').delete().eq('trip_id', a.trip_id).eq('student_id', a.student_id).eq('type', a.type);
    if (error) throw new Error(error.message);
  }
}

let sincronizando = false;
const oyentesCola = new Set<(n: number) => void>();
const avisarCola = (n: number) => oyentesCola.forEach((f) => f(n));

export const viaje = {
  /** Crea el recorrido de hoy (o devuelve el que ya está en curso). */
  iniciar: (routeId: string) => pedir<Viaje>(supabase.rpc('iniciar_recorrido', { p_route: routeId })),

  obtener: (id: string) => pedir<Viaje>(supabase.from('trips').select('*').eq('id', id).single()),

  eventos: (tripId: string) =>
    pedir<EventoViaje[]>(supabase.from('trip_events').select('*').eq('trip_id', tripId).order('created_at')),

  posiciones: (tripId: string) =>
    pedir<PosicionViaje[]>(supabase.from('trip_locations').select('*').eq('trip_id', tripId).order('recorded_at').limit(2000)),

  async ultimaPosicion(tripId: string) {
    const r = await pedir<PosicionViaje[]>(
      supabase.from('trip_locations').select('*').eq('trip_id', tripId).order('recorded_at', { ascending: false }).limit(1),
    );
    return r[0] ?? null;
  },

  /**
   * Registra un evento del viaje. Si no hay señal queda en cola y se envía solo al volver.
   * Devuelve true si llegó al servidor y false si quedó pendiente.
   */
  async registrar(e: EventoNuevo): Promise<boolean> {
    const accion: EnCola = { op: 'insertar', fila: { ...e, payload: e.payload ?? {}, client_id: uuid(), created_at: new Date().toISOString() } };
    return this.encolarOEjecutar(accion);
  },

  /** Deshace un abordaje o una entrega marcados por error. */
  async deshacer(tripId: string, studentId: string, tipo: 'boarded' | 'dropped' | 'school_arrival'): Promise<boolean> {
    return this.encolarOEjecutar({ op: 'borrar', trip_id: tripId, student_id: studentId, type: tipo });
  },

  async encolarOEjecutar(accion: EnCola): Promise<boolean> {
    const cola = await leerCola();
    if (cola.length === 0) {
      try {
        await ejecutar(accion);
        return true;
      } catch (err) {
        if (!esErrorDeRed(err)) throw err;
      }
    }
    cola.push(accion);
    await guardarCola(cola);
    avisarCola(cola.length);
    return false;
  },

  pendientes: async () => (await leerCola()).length,

  alCambiarCola(f: (n: number) => void) {
    oyentesCola.add(f);
    return () => { oyentesCola.delete(f); };
  },

  /** Envía en orden lo que quedó en cola. Se llama al recuperar la señal y al volver a la app. */
  async sincronizar(): Promise<number> {
    if (sincronizando) return 0;
    sincronizando = true;
    let hechos = 0;
    try {
      let cola = await leerCola();
      while (cola.length > 0) {
        try {
          await ejecutar(cola[0]);
          hechos++;
        } catch (err) {
          if (esErrorDeRed(err)) break; // seguimos sin señal
          // error permanente (viaje ya cerrado, sin permiso): se descarta para no trabar la cola
        }
        cola = cola.slice(1);
        await guardarCola(cola);
        avisarCola(cola.length);
      }
    } finally {
      sincronizando = false;
    }
    return hechos;
  },

  /** Tiempo real de un viaje: posiciones, eventos y cambios de estado. Devuelve cómo cancelar. */
  suscribir(
    tripId: string,
    f: { onPosicion?: (p: PosicionViaje) => void; onEvento?: (e: EventoViaje, borrado: boolean) => void; onViaje?: (v: Viaje) => void },
  ) {
    const canal = supabase
      .channel(`viaje-${tripId}-${uuid().slice(0, 8)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trip_locations', filter: `trip_id=eq.${tripId}` }, (c) => f.onPosicion?.(c.new as PosicionViaje))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trip_events', filter: `trip_id=eq.${tripId}` }, (c) => f.onEvento?.(c.new as EventoViaje, false))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'trip_events' }, (c) => f.onEvento?.(c.old as EventoViaje, true))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'trips', filter: `id=eq.${tripId}` }, (c) => f.onViaje?.(c.new as Viaje))
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  },

  /** Avisa cuando cambia cualquier viaje, ausencia, cancelación o sustitución visible (para refrescar Inicio). */
  suscribirCambiosDelDia(alCambiar: () => void) {
    let reloj: ReturnType<typeof setTimeout> | null = null;
    const agrupado = () => {
      if (reloj) clearTimeout(reloj);
      reloj = setTimeout(alCambiar, 400);
    };
    const canal = supabase.channel(`dia-${uuid().slice(0, 8)}`);
    for (const tabla of ['trips', 'absences', 'route_cancellations', 'driver_substitutions', 'student_guardians', 'drivers']) {
      canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla }, agrupado);
    }
    canal.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trip_events' }, agrupado);
    canal.subscribe();
    return () => {
      if (reloj) clearTimeout(reloj);
      supabase.removeChannel(canal);
    };
  },
};

// ── Trazado y horarios ──────────────────────────────────────────────────────
function decodificar(str: string): Coordenada[] {
  let i = 0, lat = 0, lng = 0;
  const puntos: Coordenada[] = [];
  while (i < str.length) {
    let b: number, shift = 0, r = 0;
    do { b = str.charCodeAt(i++) - 63; r |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += r & 1 ? ~(r >> 1) : r >> 1;
    shift = 0; r = 0;
    do { b = str.charCodeAt(i++) - 63; r |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += r & 1 ? ~(r >> 1) : r >> 1;
    puntos.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return puntos;
}

export interface Trazado {
  linea: Coordenada[];
  tramosM: number[]; // metros entre cada par de puntos consecutivos
}

/** Ruta por calles entre los puntos, en orden. Si OSRM no responde, líneas rectas. */
export async function trazar(puntos: Coordenada[]): Promise<Trazado> {
  const v = puntos.filter((p) => p && typeof p.latitude === 'number' && typeof p.longitude === 'number');
  const recto: Trazado = { linea: v, tramosM: v.slice(1).map((p, i) => distanciaM(v[i], p) * 1.3) };
  if (v.length < 2) return recto;
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), 8000);
  try {
    const coords = v.map((p) => `${p.longitude},${p.latitude}`).join(';');
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=polyline`, { signal: control.signal });
    const d = await r.json();
    const ruta = d?.routes?.[0];
    if (d?.code !== 'Ok' || !ruta?.geometry) return recto;
    return { linea: decodificar(ruta.geometry), tramosM: (ruta.legs ?? []).map((l: { distance: number }) => l.distance) };
  } catch {
    return recto;
  } finally {
    clearTimeout(reloj);
  }
}

/** Hora estimada de cada parada: 25 km/h por calles + 1 minuto por parada. */
export function calcularHorarios(salida: string, tramosM: number[], nParadas: number, desdeGaraje = 8): string[] {
  const horas: string[] = [];
  let t = aMinutos(salida) + desdeGaraje; // minutos hasta la primera parada si no se conoce el punto de salida
  for (let i = 0; i < nParadas; i++) {
    if (i > 0) t += ((tramosM[i - 1] ?? 0) / 1000 / 25) * 60 + 1;
    horas.push(deMinutos(t));
  }
  return horas;
}

/** Orden sugerido para la ida: casas por cercanía y cada escuela después de todos sus niños. */
export function ordenSugerido<T extends { kind: Parada['kind']; school_id: string | null; latitude: number | null; longitude: number | null }>(paradas: T[], sentido: 'pickup' | 'dropoff'): T[] {
  const conPunto = (p: T) => p.latitude != null && p.longitude != null;
  const escuelas = paradas.filter((p) => p.kind === 'dropoff_school' || p.kind === 'pickup_school');
  const casas = paradas.filter((p) => p.kind === 'pickup_home' || p.kind === 'dropoff_home');
  const d = (a: T, b: T) => (conPunto(a) && conPunto(b) ? distanciaM(a as unknown as Coordenada, b as unknown as Coordenada) : 0);
  const orden: T[] = [];
  const resto = new Set(casas);
  // Las escuelas se visitan de la más lejana a la más cercana al grupo de casas en la ida, y al revés en la vuelta.
  const esc = [...escuelas];
  if (sentido === 'pickup') {
    for (const e of esc) {
      const suyas = [...resto].filter((c) => c.school_id === e.school_id);
      let actual: T = orden[orden.length - 1] ?? suyas.reduce((lejos, c) => (d(c, e) > d(lejos, e) ? c : lejos), suyas[0] ?? e);
      while (suyas.length > 0) {
        suyas.sort((a, b) => d(actual, a) - d(actual, b));
        actual = suyas.shift() as T;
        resto.delete(actual);
        orden.push(actual);
      }
      orden.push(e);
    }
    orden.push(...resto);
  } else {
    for (const e of esc) {
      orden.push(e);
      const suyas = [...resto].filter((c) => c.school_id === e.school_id);
      let actual: T = e;
      while (suyas.length > 0) {
        suyas.sort((a, b) => d(actual, a) - d(actual, b));
        actual = suyas.shift() as T;
        resto.delete(actual);
        orden.push(actual);
      }
    }
    orden.push(...resto);
  }
  return orden;
}

type ParadaOrdenable = { kind: Parada['kind']; school_id: string | null; latitude: number | null; longitude: number | null };
const esEscuelaParada = (k: Parada['kind']) => k === 'dropoff_school' || k === 'pickup_school';
const tienePunto = (p: ParadaOrdenable) => p.latitude != null && p.longitude != null;

/** Ordena las casas de un tramo por tiempo real de manejo (OSRM trip) entre una escuela de inicio y/o de fin. */
async function ordenarTramo<T extends ParadaOrdenable>(inicio: T | null, casas: T[], fin: T | null): Promise<T[] | null> {
  const conPunto = casas.filter(tienePunto);
  const sinPunto = casas.filter((p) => !tienePunto(p));
  if (conPunto.length < 2) return [...conPunto, ...sinPunto];
  const ini = inicio && tienePunto(inicio) ? inicio : null;
  const fn = fin && tienePunto(fin) ? fin : null;
  if (!ini && !fn) return null; // OSRM no resuelve un tramo abierto por los dos lados
  const lista = [...(ini ? [ini] : []), ...conPunto, ...(fn ? [fn] : [])];
  const coords = lista.map((p) => `${p.longitude},${p.latitude}`).join(';');
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), 10000);
  try {
    const r = await fetch(
      `https://router.project-osrm.org/trip/v1/driving/${coords}?roundtrip=false&source=${ini ? 'first' : 'any'}&destination=${fn ? 'last' : 'any'}&overview=false`,
      { signal: control.signal },
    );
    const d = await r.json();
    if (d?.code !== 'Ok' || !Array.isArray(d.waypoints) || d.waypoints.length !== lista.length) return null;
    const posicion = new Map<T, number>(lista.map((p, i) => [p, Number(d.waypoints[i].waypoint_index)]));
    return [...conPunto.sort((a, b) => (posicion.get(a) ?? 0) - (posicion.get(b) ?? 0)), ...sinPunto];
  } catch {
    return null;
  } finally {
    clearTimeout(reloj);
  }
}

/**
 * Orden óptimo por calles: respeta que cada escuela vaya después de sus niños (ida) o antes (vuelta)
 * y, entre escuela y escuela, ordena las casas por el menor tiempo de manejo real.
 * Si no hay internet, se queda con el orden por cercanía en línea recta.
 */
export async function optimizarOrden<T extends ParadaOrdenable>(paradas: T[], sentido: 'pickup' | 'dropoff'): Promise<{ orden: T[]; porCalles: boolean }> {
  const base = ordenSugerido(paradas, sentido);
  const orden: T[] = [];
  let porCalles = true;
  let i = 0;
  while (i < base.length) {
    if (esEscuelaParada(base[i].kind)) {
      orden.push(base[i]);
      i++;
      continue;
    }
    let j = i;
    while (j < base.length && !esEscuelaParada(base[j].kind)) j++;
    const casas = base.slice(i, j);
    const inicio = i > 0 ? base[i - 1] : null;
    const fin = j < base.length ? base[j] : null;
    const ordenadas = casas.length > 1 ? await ordenarTramo(inicio, casas, fin) : casas;
    if (!ordenadas) porCalles = false;
    orden.push(...(ordenadas ?? casas));
    i = j;
  }
  return { orden, porCalles };
}

/** Agrupa paradas de casa consecutivas que están en el mismo sitio (hermanos): una tarjeta, varios niños. */
export function agruparParadas(paradas: Parada[]): { clave: string; principal: Parada; paradas: Parada[] }[] {
  const grupos: { clave: string; principal: Parada; paradas: Parada[] }[] = [];
  for (const p of paradas) {
    const ultimo = grupos[grupos.length - 1];
    const esCasa = p.kind === 'pickup_home' || p.kind === 'dropoff_home';
    if (
      ultimo && esCasa && ultimo.principal.kind === p.kind && p.latitude != null && ultimo.principal.latitude != null &&
      distanciaM({ latitude: p.latitude, longitude: p.longitude as number }, { latitude: ultimo.principal.latitude, longitude: ultimo.principal.longitude as number }) < 30
    ) {
      ultimo.paradas.push(p);
    } else {
      grupos.push({ clave: p.stop_id, principal: p, paradas: [p] });
    }
  }
  return grupos;
}
