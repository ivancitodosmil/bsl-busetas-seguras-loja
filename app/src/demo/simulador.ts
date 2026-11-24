// Buseta simulada para el modo demostración. Recorre la ruta por las calles, parada por parada,
// y publica su posición como lo haría el GPS del chofer.
//  · Con el chofer conectado: llega a la parada y espera a que él marque Abordó o Entregado.
//  · Con otra persona conectada (un representante): el "chofer automático" marca las paradas
//    solo, para ver el recorrido completo desde el lado de la familia.
import type { Coordenada, Parada } from '../tipos';
import { distanciaM } from '../utils';
import { demo, servidorDemo } from './cliente';

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Ritmo de la simulación (las pruebas automáticas lo aceleran). */
export const ritmo = { ticMs: 1400, metrosPorTic: 75 };
const LLEGADA_M = 28;
const ESPERA_TICS = 2; // tics que el chofer automático se queda en cada parada

interface Opciones {
  trazar: (puntos: Coordenada[]) => Promise<{ linea: Coordenada[] }>;
  alMover?: (p: Coordenada) => void;
}

let reloj: ReturnType<typeof setInterval> | null = null;
let viajeId: string | null = null;
let pos: Coordenada | null = null;
let camino: Coordenada[] = [];
let destinoId: string | null = null;
let trazando = false;
let espera = 0;
let opciones: Opciones | null = null;
let recorrido: Coordenada[] = []; // por dónde ha pasado (para pintar la estela)

const eventos = (tripId: string) => demo.tablas().trip_events.filter((e) => e.trip_id === tripId);
const punto = (p: Parada): Coordenada => ({ latitude: p.latitude as number, longitude: p.longitude as number });
const esCasa = (p: Parada) => p.kind === 'pickup_home' || p.kind === 'dropoff_home';

function hecha(p: Parada, snap: Parada[], ev: any[]): boolean {
  const tiene = (sid: string | null, tipo: string) => ev.some((e) => e.student_id === sid && e.type === tipo);
  const deLaEscuela = () => snap.filter((s) => esCasa(s) && s.school_id === p.school_id && s.student_id);
  switch (p.kind) {
    case 'pickup_home': return tiene(p.student_id, 'boarded');
    case 'dropoff_home': return tiene(p.student_id, 'dropped');
    case 'dropoff_school': return deLaEscuela().filter((s) => tiene(s.student_id, 'boarded')).every((s) => tiene(s.student_id, 'school_arrival'));
    case 'pickup_school': return deLaEscuela().every((s) => tiene(s.student_id, 'boarded'));
  }
}

function saltada(p: Parada, snap: Parada[]): boolean {
  return simulador.saltadas.some((id) => {
    const s = snap.find((x) => x.stop_id === id);
    return !!s && s.kind === p.kind && s.latitude != null && p.latitude != null && distanciaM(punto(s), punto(p)) < 30;
  });
}

/** Lo que el chofer haría al llegar a la parada. */
function atender(trip: any, p: Parada, snap: Parada[], ev: any[]) {
  const registrar = (type: string, s: Parada, extra: Record<string, unknown> = {}) => {
    try {
      servidorDemo.insertar('trip_events', { trip_id: trip.id, type, student_id: s.student_id, stop_id: p.stop_id, latitude: pos?.latitude, longitude: pos?.longitude, ...extra });
    } catch { /* ya estaba marcado */ }
  };
  const aqui = snap.filter((s) => s.kind === p.kind && s.latitude != null && distanciaM(punto(s), punto(p)) < 30);
  const deLaEscuela = snap.filter((s) => esCasa(s) && s.school_id === p.school_id && s.student_id);
  servidorDemo.como(trip.driver_id, () => {
    if (p.kind === 'pickup_home') aqui.forEach((s) => registrar('boarded', s, { payload: { place: s.label } }));
    if (p.kind === 'dropoff_home') aqui.forEach((s) => registrar('dropped', s, { payload: { place: s.label } }));
    if (p.kind === 'pickup_school') deLaEscuela.forEach((s) => registrar('boarded', s, { school_id: p.school_id, payload: { place: p.school_short ?? p.label } }));
    if (p.kind === 'dropoff_school') {
      deLaEscuela.filter((s) => ev.some((e) => e.student_id === s.student_id && e.type === 'boarded'))
        .forEach((s) => registrar('school_arrival', s, { school_id: p.school_id, payload: { place: p.school_short ?? p.label } }));
    }
  });
}

function avanzar(metros: number) {
  if (!pos) return;
  let resto = metros;
  while (resto > 0 && camino.length > 0) {
    const d = distanciaM(pos, camino[0]);
    if (d <= resto) {
      pos = camino.shift() as Coordenada;
      resto -= d;
    } else {
      const f = resto / d;
      pos = { latitude: pos.latitude + (camino[0].latitude - pos.latitude) * f, longitude: pos.longitude + (camino[0].longitude - pos.longitude) * f };
      resto = 0;
    }
  }
}

function publicar(trip: any) {
  if (!pos) return;
  recorrido.push(pos);
  const p = pos;
  servidorDemo.como(trip.driver_id, () => {
    try {
      servidorDemo.insertar('trip_locations', { trip_id: trip.id, latitude: p.latitude, longitude: p.longitude, speed: 8, heading: null });
    } catch { /* viaje cerrado */ }
  });
  opciones?.alMover?.(p);
}

function tic() {
  const trip = demo.tablas().trips.find((t) => t.id === viajeId);
  if (!trip || trip.status === 'finished') return simulador.detener();
  if (trip.status === 'paused') return; // en pausa la buseta no se mueve

  const snap = (trip.planned_stops_snapshot as Parada[]).filter((p) => p.latitude != null);
  const ev = eventos(trip.id);
  const automatico = demo.usuarioActual() !== trip.driver_id;
  const destino = snap.find((p) => !hecha(p, snap, ev) && !saltada(p, snap));

  if (!destino) {
    // Ya no quedan paradas: el chofer automático cierra el recorrido; el chofer real lo finaliza él.
    if (automatico) {
      servidorDemo.como(trip.driver_id, () => {
        try { servidorDemo.insertar('trip_events', { trip_id: trip.id, type: 'trip_finished' }); } catch { /* ya finalizado */ }
      });
      simulador.detener();
    }
    return;
  }

  if (!pos) {
    // La buseta arranca a poco más de un kilómetro de la primera parada.
    pos = { latitude: destino.latitude as number - 0.011, longitude: destino.longitude as number + 0.003 };
  }

  if (destinoId !== destino.stop_id) {
    destinoId = destino.stop_id;
    camino = [punto(destino)]; // línea recta mientras llega el trazado por calles
    espera = 0;
    if (!trazando && opciones) {
      trazando = true;
      const pedido = destino.stop_id;
      opciones.trazar([pos, punto(destino)])
        .then((t) => {
          if (destinoId === pedido && t.linea.length > 1) camino = [...t.linea.slice(1), punto(destino)];
        })
        .catch(() => {})
        .finally(() => { trazando = false; });
    }
  }

  const falta = distanciaM(pos, punto(destino));
  if (falta > LLEGADA_M) {
    avanzar(Math.min(ritmo.metrosPorTic, falta));
    publicar(trip);
    return;
  }

  // En la parada
  pos = punto(destino);
  publicar(trip);
  if (automatico) {
    espera += 1;
    if (espera >= ESPERA_TICS) atender(trip, destino, snap, ev);
  }
}

export const simulador = {
  /** Paradas que el chofer decidió saltar en la pantalla del recorrido. */
  saltadas: [] as string[],

  iniciar(tripId: string, o: Opciones) {
    opciones = o;
    if (viajeId === tripId && reloj) return; // ya está rodando: solo se actualizan los oyentes
    this.detener();
    viajeId = tripId;
    pos = null;
    camino = [];
    destinoId = null;
    espera = 0;
    recorrido = [];
    this.saltadas = [];
    // Si el viaje ya tenía posiciones (se retomó), la buseta sigue desde la última.
    const previas = demo.tablas().trip_locations.filter((l) => l.trip_id === tripId);
    const ultima = previas[previas.length - 1];
    if (ultima) pos = { latitude: ultima.latitude, longitude: ultima.longitude };
    reloj = setInterval(tic, ritmo.ticMs);
    tic();
  },

  detener() {
    if (reloj) clearInterval(reloj);
    reloj = null;
    viajeId = null;
    destinoId = null;
  },

  posicion: () => pos,
  viaje: () => viajeId,
  activo: () => reloj !== null,
};
