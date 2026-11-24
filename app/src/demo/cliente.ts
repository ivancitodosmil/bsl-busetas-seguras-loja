// Cliente de demostración: imita la parte de Supabase que usa la app (consultas, funciones,
// sesión, tiempo real y archivos) sobre una base en memoria. Así la app completa se puede probar
// sin servidor. Reproduce también la lógica del servidor: avisos automáticos, estado del recorrido,
// "buseta cerca", invitaciones, sustituto y verificación.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { diaISO, distanciaM, hoyISO, hora, sumarDias, uuid } from '../utils';
import { CLAVE_DEMO, CODIGO_SMS_DEMO, datosIniciales, type Tablas } from './datos';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Fila = Record<string, any>;
interface ErrorDemo { message: string; code?: string }
const fallo = (message: string, code?: string): ErrorDemo => ({ message, code });
const copia = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

let db: Tablas = datosIniciales();
let yo: string | null = null; // identidad con la que se ejecuta la operación en curso
let sesion: string | null = null; // usuario que realmente tiene la sesión abierta en el teléfono
const CLAVE_SESION = 'bsl_demo_sesion';

export const demo = {
  tablas: () => db,
  usuarioActual: () => sesion,
  /** Vuelve a los datos del primer día (conserva la sesión). */
  reiniciar() {
    db = datosIniciales();
    for (const t of ['trips', 'notifications', 'absences', 'students', 'routes']) emitir(t, 'UPDATE', {}, {});
  },
};

// ── Tiempo real ─────────────────────────────────────────────────────────────
interface Oyente { canal: object; event: string; table: string; filter?: string; cb: (c: { new: Fila; old: Fila; eventType: string }) => void }
let oyentes: Oyente[] = [];

function emitir(table: string, eventType: 'INSERT' | 'UPDATE' | 'DELETE', nueva: Fila, vieja: Fila) {
  const fila = eventType === 'DELETE' ? vieja : nueva;
  for (const o of [...oyentes]) {
    if (o.table !== table || (o.event !== '*' && o.event !== eventType)) continue;
    if (o.filter && eventType !== 'DELETE') {
      const m = o.filter.match(/^(\w+)=eq\.(.+)$/);
      if (m && String(fila[m[1]]) !== m[2]) continue;
    }
    if (eventType !== 'DELETE' && !visiblePara(sesion, table, fila)) continue;
    const carga = { new: copia(nueva), old: eventType === 'DELETE' ? { id: vieja.id } : copia(vieja), eventType };
    setTimeout(() => o.cb(carga), 0);
  }
}

// ── Quién ve qué (lo que en el servidor hace la seguridad por filas) ────────
const rol = () => db.users.find((u) => u.id === yo)?.role as string | undefined;
const misHijos = () => db.student_guardians.filter((g) => g.user_id === yo).map((g) => g.student_id as string);
function choferesQueConduzco(): string[] {
  const hoy = hoyISO();
  return [yo as string, ...db.driver_substitutions.filter((d) => d.substitute_id === yo && d.status === 'accepted' && d.date === hoy).map((d) => d.driver_id as string)];
}

/** Lo que ve el usuario con sesión, aunque la operación la ejecute el chofer automático. */
function visiblePara(quien: string | null, tabla: string, f: Fila): boolean {
  const antes = yo;
  yo = quien;
  try {
    return visible(tabla, f);
  } finally {
    yo = antes;
  }
}

function visible(tabla: string, f: Fila): boolean {
  if (!yo) return false;
  const chofer = rol() === 'driver';
  switch (tabla) {
    case 'notifications':
    case 'notification_preferences':
    case 'push_tokens':
      return f.user_id === yo;
    case 'driver_private':
    case 'driver_documents':
      return f.driver_id === yo;
    case 'invitations':
      return f.created_by === yo;
    case 'students':
      return chofer ? choferesQueConduzco().includes(f.driver_id) : misHijos().includes(f.id);
    case 'schools':
    case 'routes':
      return chofer ? choferesQueConduzco().includes(f.driver_id) : true;
    case 'addresses':
      return chofer ? choferesQueConduzco().includes(f.driver_id) : f.student_id === null || misHijos().includes(f.student_id);
    case 'route_stops':
      return chofer ? true : f.school_id !== null || misHijos().includes(f.student_id);
    case 'trip_events':
      return chofer ? true : f.student_id === null || misHijos().includes(f.student_id);
    case 'absences':
      return chofer ? true : misHijos().includes(f.student_id);
    case 'driver_substitutions':
      return chofer ? f.driver_id === yo || f.substitute_id === yo : f.status === 'accepted';
    case 'payments':
      return chofer ? f.driver_id === yo : misHijos().includes(f.student_id);
    case 'messages':
      return chofer ? choferesQueConduzco().includes(db.routes.find((r) => r.id === f.route_id)?.driver_id) : true;
    default:
      return true;
  }
}

// ── Avisos (lo que en el servidor hacen los disparadores) ───────────────────
function avisar(user_id: string, type: string, channel: string, title: string, body: string, extra: Fila = {}) {
  const fila = {
    id: uuid(), user_id, type, channel, title: title.slice(0, 60), body: body.slice(0, 140), student_id: null, trip_id: null, route_id: null,
    data: {}, read_at: null, created_at: new Date().toISOString(), ...extra,
  };
  db.notifications.push(fila);
  emitir('notifications', 'INSERT', fila, {});
}
function representantesDe(studentId: string): string[] {
  return db.student_guardians.filter((g) => g.student_id === studentId && g.receives_notifications).map((g) => g.user_id);
}
function representantesDeRuta(routeId: string): string[] {
  const ninos = db.route_stops.filter((s) => s.route_id === routeId && s.student_id).map((s) => s.student_id);
  return [...new Set(db.student_guardians.filter((g) => ninos.includes(g.student_id) && g.receives_notifications).map((g) => g.user_id as string))];
}
const avisarRuta = (routeId: string, type: string, channel: string, title: string, body: string, trip_id: string | null = null) =>
  representantesDeRuta(routeId).forEach((u) => avisar(u, type, channel, title, body, { trip_id, route_id: routeId }));
const avisarNino = (studentId: string, type: string, channel: string, title: string, body: string, trip_id: string | null, route_id: string | null) =>
  representantesDe(studentId).forEach((u) => avisar(u, type, channel, title, body, { student_id: studentId, trip_id, route_id }));

const nombreCorto = (id: string) => {
  const s = db.students.find((x) => x.id === id);
  return s ? (s.nickname ?? s.first_name) : '';
};
const nombreDe = (id: string | null | undefined) => {
  const u = db.users.find((x) => x.id === id);
  return u ? `${u.first_name} ${u.last_name}`.trim() : '';
};
const diaTexto = (fecha: string) => (fecha === hoyISO() ? 'hoy' : fecha === sumarDias(hoyISO(), 1) ? 'mañana' : `el ${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`);
const hhmm = (t: string | null | undefined) => (t ? String(t).slice(0, 5) : null);

// ── Funciones del servidor ──────────────────────────────────────────────────
function paradasDeRuta(routeId: string, fecha = hoyISO()): Fila[] {
  const ruta = db.routes.find((r) => r.id === routeId);
  if (!ruta) return [];
  const completo = rol() === 'driver';
  const dow = diaISO(fecha);
  return db.route_stops
    .filter((rs) => rs.route_id === routeId)
    .filter((rs) => completo || rs.school_id || misHijos().includes(rs.student_id))
    .sort((a, b) => a.position - b.position)
    .map((rs) => {
      const st = db.students.find((s) => s.id === rs.student_id);
      const sc = db.schools.find((s) => s.id === rs.school_id);
      const ss = st ? db.schools.find((s) => s.id === st.school_id) : null;
      const excepcion = st ? db.student_address_schedule.find((e) => e.student_id === st.id && e.weekday === dow && e.direction === ruta.direction) : null;
      const idDir = excepcion?.address_id ?? rs.address_id ??
        (st ? (ruta.direction === 'pickup' ? st.default_pickup_address_id : st.default_dropoff_address_id ?? st.default_pickup_address_id) : sc?.address_id);
      const a = db.addresses.find((d) => d.id === idDir);
      const ab = st ? db.absences.find((x) => x.student_id === st.id && x.date === fecha && (x.scope === 'all' || x.scope === ruta.direction)) : null;
      const escuela = sc ?? ss;
      return {
        stop_id: rs.id, position: rs.position, kind: rs.kind, student_id: rs.student_id, school_id: rs.school_id ?? st?.school_id ?? null,
        student_name: st ? (st.nickname ?? st.first_name) : null,
        student_full_name: st ? `${st.first_name} ${st.last_name}`.trim() : null,
        student_photo: st?.photo_path ?? null,
        notes: completo ? st?.notes ?? null : null,
        school_name: escuela?.name ?? null, school_short: escuela?.short_name ?? null, school_color: escuela?.color ?? null,
        school_time: sc ? hhmm(ruta.direction === 'pickup' ? sc.entry_time : sc.exit_time) : null,
        label: sc ? sc.name : !a || String(a.label).toLowerCase() === 'casa' ? `Casa ${st?.last_name ?? ''}`.trim() : a.label,
        street: a ? [a.main_street, a.cross_street].filter(Boolean).join(' y ') || null : null,
        reference: sc ? sc.gate_reference ?? a?.reference ?? null : a?.reference ?? null,
        address_id: a?.id ?? null, latitude: a?.latitude ?? null, longitude: a?.longitude ?? null,
        estimated_time: hhmm(rs.estimated_time),
        absent: !!ab, absence_reason: ab?.reason ?? null, absence_scope: ab?.scope ?? null,
        absence_by: ab ? db.users.find((u) => u.id === ab.registered_by)?.first_name ?? null : null,
      };
    });
}

function fichaChofer(id: string | null | undefined): Fila | null {
  const u = db.users.find((x) => x.id === id);
  if (!u) return null;
  const d = db.drivers.find((x) => x.id === id);
  return {
    id: u.id, name: `${u.first_name} ${u.last_name}`.trim(), first_name: u.first_name, photo_url: u.photo_url, phone: u.phone,
    vehicle: [d?.vehicle_brand, d?.vehicle_model, d?.vehicle_year].filter(Boolean).join(' ') || null,
    color: d?.vehicle_color ?? null, plate: d?.plate_number ?? null, verified: d?.verification_status === 'verified',
  };
}

const viajeBreve = (routeId: string, fecha: string) => {
  const t = db.trips.find((x) => x.route_id === routeId && x.date === fecha);
  return t ? { id: t.id, status: t.status, started_at: t.started_at, finished_at: t.finished_at, driver_id: t.driver_id } : null;
};

function resumenRepresentante(fecha = hoyISO()): Fila {
  const dow = diaISO(fecha);
  const hijos = misHijos();
  const children = db.student_guardians
    .filter((g) => g.user_id === yo)
    .map((g) => {
      const s = db.students.find((x) => x.id === g.student_id)!;
      const sc = db.schools.find((x) => x.id === s.school_id);
      const ab = db.absences.find((x) => x.student_id === s.id && x.date === fecha);
      return {
        id: s.id, first_name: s.first_name, last_name: s.last_name, name: s.nickname ?? s.first_name, grade: s.grade, birth_date: s.birth_date,
        photo_path: s.photo_path, driver_id: s.driver_id, relationship: g.relationship, is_primary: g.is_primary, can_report_absence: g.can_report_absence, has_home: !!s.default_pickup_address_id,
        school: sc ? { id: sc.id, name: sc.name, short_name: sc.short_name, color: sc.color, entry_time: hhmm(sc.entry_time), exit_time: hhmm(sc.exit_time) } : null,
        absence: ab ? { id: ab.id, scope: ab.scope, reason: ab.reason } : null,
      };
    })
    .sort((a, b) => String(a.birth_date ?? '9').localeCompare(String(b.birth_date ?? '9')));

  const routes = db.routes
    .filter((r) => db.route_stops.some((rs) => rs.route_id === r.id && hijos.includes(rs.student_id)))
    .sort((a, b) => String(a.departure_time).localeCompare(String(b.departure_time)))
    .map((r) => {
      const trip = db.trips.find((x) => x.route_id === r.id && x.date === fecha);
      const sust = db.driver_substitutions.find((d) => d.driver_id === r.driver_id && d.date === fecha && d.status === 'accepted' && (d.scope === 'all' || d.scope === r.direction));
      const canc = db.route_cancellations.find((c) => c.route_id === r.id && c.date === fecha);
      return {
        id: r.id, name: r.name, color: r.color, direction: r.direction, departure_time: hhmm(r.departure_time), days_of_week: r.days_of_week,
        runs_today: r.days_of_week.includes(dow), driver: fichaChofer(r.driver_id), substitute: sust ? fichaChofer(sust.substitute_id) : null,
        cancellation: canc ? { reason: canc.reason } : null, trip: viajeBreve(r.id, fecha),
        children: db.route_stops
          .filter((rs) => rs.route_id === r.id && hijos.includes(rs.student_id))
          .sort((a, b) => a.position - b.position)
          .map((rs) => {
            const st = db.students.find((s) => s.id === rs.student_id)!;
            const ev = trip ? db.trip_events.filter((e) => e.trip_id === trip.id && e.student_id === rs.student_id) : [];
            const entregado = ev.filter((e) => (r.direction === 'pickup' ? e.type === 'school_arrival' : e.type === 'dropped'));
            const abordo = ev.find((e) => e.type === 'boarded');
            return {
              student_id: rs.student_id, stop_id: rs.id, kind: rs.kind, estimated_time: hhmm(rs.estimated_time),
              school_time: hhmm(db.route_stops.find((x) => x.route_id === r.id && x.school_id === st.school_id)?.estimated_time),
              absent: db.absences.some((a) => a.student_id === rs.student_id && a.date === fecha && (a.scope === 'all' || a.scope === r.direction)),
              status: entregado.length ? 'delivered' : abordo ? 'boarded' : ev.some((e) => e.type === 'bus_near' || e.type === 'bus_arriving') ? 'near' : 'pending',
              boarded_at: abordo?.created_at ?? null, delivered_at: entregado[entregado.length - 1]?.created_at ?? null,
            };
          }),
      };
    });
  return { date: fecha, children, routes };
}

function resumenChofer(fecha = hoyISO()): Fila {
  const dow = diaISO(fecha);
  const d = db.drivers.find((x) => x.id === yo);
  const mios = db.students.filter((s) => s.driver_id === yo);
  const absences = db.absences
    .filter((a) => a.date === fecha && mios.some((s) => s.id === a.student_id))
    .map((a) => {
      const s = mios.find((x) => x.id === a.student_id)!;
      const sc = db.schools.find((x) => x.id === s.school_id);
      return {
        id: a.id, student_id: s.id, name: `${s.first_name} ${s.last_name}`.trim(), short_name: s.nickname ?? s.first_name, scope: a.scope, reason: a.reason,
        by: db.users.find((u) => u.id === a.registered_by)?.first_name ?? null, school_short: sc?.short_name ?? null, school_color: sc?.color ?? null,
      };
    });
  const sustituyo = db.driver_substitutions.filter((s) => s.substitute_id === yo && s.date === fecha && s.status === 'accepted');
  const routes = db.routes
    .filter((r) => r.driver_id === yo || sustituyo.some((s) => s.driver_id === r.driver_id && (s.scope === 'all' || s.scope === r.direction)))
    .sort((a, b) => String(a.departure_time).localeCompare(String(b.departure_time)))
    .map((r) => {
      const paradas = db.route_stops.filter((rs) => rs.route_id === r.id).sort((a, b) => a.position - b.position);
      const ausente = (sid: string | null) => !!sid && db.absences.some((a) => a.student_id === sid && a.date === fecha && (a.scope === 'all' || a.scope === r.direction));
      const canc = db.route_cancellations.find((c) => c.route_id === r.id && c.date === fecha);
      const sust = db.driver_substitutions.find((s) => s.driver_id === r.driver_id && s.date === fecha && ['requested', 'accepted'].includes(s.status) && (s.scope === 'all' || s.scope === r.direction));
      return {
        id: r.id, name: r.name, color: r.color, direction: r.direction, departure_time: hhmm(r.departure_time), days_of_week: r.days_of_week,
        runs_today: r.days_of_week.includes(dow), own: r.driver_id === yo, titular: r.driver_id !== yo ? nombreDe(r.driver_id) : null,
        stops: paradas.length, active_stops: paradas.filter((p) => !ausente(p.student_id)).length, students: paradas.filter((p) => p.student_id).length,
        schools: paradas.filter((p) => p.school_id).map((p) => {
          const sc = db.schools.find((x) => x.id === p.school_id)!;
          return { id: sc.id, short_name: sc.short_name, color: sc.color, time: hhmm(r.direction === 'pickup' ? sc.entry_time : sc.exit_time) };
        }),
        trip: viajeBreve(r.id, fecha), cancellation: canc ? { id: canc.id, reason: canc.reason } : null,
        substitute: sust ? { id: sust.id, status: sust.status, name: nombreDe(sust.substitute_id) } : null,
      };
    });
  const substitution_requests = db.driver_substitutions
    .filter((s) => s.substitute_id === yo && s.date >= hoyISO() && ['requested', 'accepted'].includes(s.status))
    .map((s) => ({
      id: s.id, date: s.date, scope: s.scope, status: s.status, driver: fichaChofer(s.driver_id),
      routes: db.routes.filter((r) => r.driver_id === s.driver_id && (s.scope === 'all' || s.scope === r.direction)).map((r) => ({ name: r.name, direction: r.direction, departure_time: hhmm(r.departure_time) })),
      students: db.students.filter((x) => x.driver_id === s.driver_id).length,
    }));
  const activo = db.trips.filter((t) => t.driver_id === yo && t.status !== 'finished').sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)))[0];
  return {
    date: fecha,
    driver: d ? {
      verification_status: d.verification_status, reviewer_note: d.reviewer_note, plate: d.plate_number, low_power_mode: d.low_power_mode,
      absence_cutoff_time: hhmm(d.absence_cutoff_time), schools: db.schools.filter((s) => s.driver_id === yo && !s.archived_at).length,
    } : null,
    totals: { students: mios.length, absent: absences.length, active: Math.max(mios.length - absences.length, 0) },
    absences, routes, substitution_requests, active_trip_id: activo?.id ?? null,
  };
}

function iniciarRecorrido(routeId: string): Fila {
  const ruta = db.routes.find((r) => r.id === routeId);
  if (!ruta || !choferesQueConduzco().includes(ruta.driver_id)) throw fallo('NO_AUTORIZADO');
  if (db.drivers.find((d) => d.id === yo)?.verification_status !== 'verified') throw fallo('CHOFER_NO_VERIFICADO');
  const hoy = hoyISO();
  if (db.route_cancellations.some((c) => c.route_id === routeId && c.date === hoy)) throw fallo('SERVICIO_CANCELADO');
  const previo = db.trips.find((t) => t.route_id === routeId && t.date === hoy);
  if (previo) {
    if (previo.status === 'finished') throw fallo('RECORRIDO_YA_FINALIZADO');
    return previo;
  }
  if (db.trips.some((t) => t.driver_id === yo && t.status !== 'finished')) throw fallo('OTRO_RECORRIDO_EN_CURSO');
  const snapshot = paradasDeRuta(routeId, hoy).filter((p) => !p.absent);
  if (snapshot.length === 0) throw fallo('RUTA_SIN_PARADAS');
  const trip = {
    id: uuid(), route_id: routeId, driver_id: yo, date: hoy, direction: ruta.direction, status: 'in_progress', started_at: new Date().toISOString(),
    finished_at: null, planned_stops_snapshot: snapshot, summary: null,
  };
  db.trips.push(trip);
  emitir('trips', 'INSERT', trip, {});
  insertar('trip_events', { trip_id: trip.id, type: 'trip_started' });
  return trip;
}

function crearInvitacion(p: Fila): Fila {
  if (!db.students.some((s) => s.id === p.p_student && s.driver_id === yo)) throw fallo('NO_AUTORIZADO');
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const azar = (n: number) => Array.from({ length: n }, () => abc[Math.floor(Math.random() * abc.length)]).join('');
  const inv = {
    id: uuid(), student_id: p.p_student, created_by: yo, code: `BSL-${azar(4)}-${azar(4)}`, guardian_name: p.p_name || null, guardian_phone: p.p_phone || null,
    relationship: p.p_relationship || 'Representante', is_primary: !!p.p_primary, expires_at: new Date(Date.now() + 48 * 3600e3).toISOString(),
    redeemed_by: null, redeemed_at: null, created_at: new Date().toISOString(),
  };
  db.invitations.push(inv);
  return inv;
}

function canjearInvitacion(codigo: string): Fila {
  if (rol() !== 'guardian') throw fallo('SOLO_REPRESENTANTES');
  const inv = db.invitations.find((i) => i.code === String(codigo ?? '').toUpperCase().replace(/\s/g, ''));
  if (!inv) throw fallo('INVITACION_INVALIDA');
  if (inv.redeemed_by && inv.redeemed_by !== yo) throw fallo('INVITACION_USADA');
  const st = db.students.find((s) => s.id === inv.student_id)!;
  if (!inv.redeemed_by) {
    if (new Date(inv.expires_at).getTime() < Date.now()) throw fallo('INVITACION_EXPIRADA');
    const primero = !db.student_guardians.some((g) => g.student_id === inv.student_id);
    if (!db.student_guardians.some((g) => g.student_id === inv.student_id && g.user_id === yo)) {
      const g = { student_id: inv.student_id, user_id: yo, relationship: inv.relationship, is_primary: inv.is_primary || primero, can_report_absence: true, receives_notifications: true, created_at: new Date().toISOString() };
      db.student_guardians.push(g);
      emitir('student_guardians', 'INSERT', g, {});
    }
    inv.redeemed_by = yo;
    inv.redeemed_at = new Date().toISOString();
    avisar(st.driver_id, 'guardian_linked', 'messages', `${nombreDe(yo)} se vinculó`, `Ya recibe los avisos de ${nombreCorto(st.id)}.`, { student_id: st.id });
  }
  const sc = db.schools.find((x) => x.id === st.school_id);
  return {
    student_id: st.id, first_name: st.nickname ?? st.first_name, full_name: `${st.first_name} ${st.last_name}`.trim(), grade: st.grade,
    school: sc?.name ?? null, school_color: sc?.color ?? null, driver_name: nombreDe(st.driver_id), plate: db.drivers.find((d) => d.id === st.driver_id)?.plate_number ?? null,
  };
}

function guardarParadas(routeId: string, paradas: Fila[]): number {
  const ruta = db.routes.find((r) => r.id === routeId && r.driver_id === yo);
  if (!ruta) throw fallo('NO_AUTORIZADO');
  if (!paradas?.length || paradas.length > 50) throw fallo('PARADAS_FUERA_DE_RANGO');
  if (db.trips.some((t) => t.route_id === routeId && t.status !== 'finished')) throw fallo('RECORRIDO_EN_CURSO');
  db.route_stops = db.route_stops.filter((s) => s.route_id !== routeId);
  paradas.forEach((p, i) => db.route_stops.push({
    id: uuid(), route_id: routeId, position: i + 1, kind: p.kind, student_id: p.student_id || null, school_id: p.school_id || null,
    address_id: p.address_id || null, estimated_time: p.estimated_time ? `${String(p.estimated_time).slice(0, 5)}:00` : null,
  }));
  avisarRuta(routeId, 'route_changed', 'messages', 'Tu ruta fue actualizada', `${ruta.name} cambió. Revisa la nueva hora de paso.`);
  return paradas.length;
}

function buscarChofer(q: string): Fila[] {
  const texto = String(q ?? '').trim().toLowerCase();
  const digitos = texto.replace(/\D/g, '').slice(-9);
  if (texto.length < 6) return [];
  return db.users
    .filter((u) => u.role === 'driver' && u.id !== yo && db.drivers.find((d) => d.id === u.id)?.verification_status === 'verified')
    .filter((u) => String(u.email ?? '').toLowerCase() === texto || (digitos.length === 9 && String(u.phone ?? '').replace(/\D/g, '').slice(-9) === digitos))
    .map((u) => {
      const f = fichaChofer(u.id)!;
      return { id: u.id, name: f.name, photo_url: f.photo_url, vehicle: f.vehicle ?? '', color: f.color, plate: f.plate };
    });
}

function eliminarCuenta() {
  const id = yo;
  if (!id) throw fallo('NO_AUTENTICADO');
  const ninos = db.students.filter((s) => s.driver_id === id).map((s) => s.id);
  const rutas = db.routes.filter((r) => r.driver_id === id).map((r) => r.id);
  const quitar = (t: string, f: (x: Fila) => boolean) => { db[t] = db[t].filter((x) => !f(x)); };
  quitar('users', (x) => x.id === id);
  quitar('drivers', (x) => x.id === id);
  quitar('student_guardians', (x) => x.user_id === id || ninos.includes(x.student_id));
  quitar('notifications', (x) => x.user_id === id);
  quitar('students', (x) => x.driver_id === id);
  quitar('schools', (x) => x.driver_id === id);
  quitar('addresses', (x) => x.driver_id === id);
  quitar('routes', (x) => x.driver_id === id);
  quitar('route_stops', (x) => rutas.includes(x.route_id));
  quitar('trips', (x) => rutas.includes(x.route_id));
}

const FUNCIONES: Record<string, (p: Fila) => unknown> = {
  resumen_representante: (p) => resumenRepresentante(p.p_date),
  resumen_chofer: (p) => resumenChofer(p.p_date),
  paradas_de_ruta: (p) => paradasDeRuta(p.p_route, p.p_date),
  guardar_paradas: (p) => guardarParadas(p.p_route, p.p_stops),
  // Igual que public.fijar_casa: el representante elige la casa del niño y se actualizan sus paradas de casa.
  fijar_casa: (p) => {
    const sentido = (p.p_sentido as string) ?? 'both';
    const st = (db.students as Fila[]).find((s) => s.id === p.p_student);
    if (!st) throw new Error('NO_ES_REPRESENTANTE');
    if (sentido !== 'dropoff') st.default_pickup_address_id = p.p_address;
    if (sentido !== 'pickup') st.default_dropoff_address_id = p.p_address;
    for (const rs of db.route_stops as Fila[]) {
      if (rs.student_id !== p.p_student) continue;
      if ((rs.kind === 'pickup_home' && sentido !== 'dropoff') || (rs.kind === 'dropoff_home' && sentido !== 'pickup')) rs.address_id = p.p_address;
    }
    return null;
  },
  iniciar_recorrido: (p) => iniciarRecorrido(p.p_route),
  crear_invitacion: (p) => crearInvitacion(p),
  canjear_invitacion: (p) => canjearInvitacion(p.p_code),
  buscar_chofer_verificado: (p) => buscarChofer(p.p_q),
  ficha_chofer: (p) => fichaChofer(p.p_driver),
  eliminar_mi_cuenta: () => eliminarCuenta(),
  registrar_token_push: () => null,
};

// ── Escrituras con sus efectos ──────────────────────────────────────────────
const UNA_VEZ_POR_NINO = ['bus_near', 'bus_arriving', 'boarded', 'dropped', 'school_arrival'];
const UNA_VEZ_POR_VIAJE = ['trip_started', 'trip_finished', 'delay', 'deviation'];
let serieGps = 0;
const RADIO_CERCA_M = 1000; // "La buseta está a 1 km"
const RADIO_LLEGANDO_M = 500; // "La buseta está a 500 m"

function porDefecto(tabla: string, f: Fila): Fila {
  const ahora = new Date().toISOString();
  const base: Record<string, Fila> = {
    addresses: { student_id: null, created_by: yo, label: 'Casa', kind: 'both', main_street: '', cross_street: null, house_number: null, neighborhood: null, reference: null, receiver_note: null, city: 'Loja', gps_accuracy_m: null },
    schools: { color: '#14A3A0', address_id: null, entry_time: '07:00:00', exit_time: '13:00:00', gate_reference: null, archived_at: null },
    students: { last_name: '', nickname: null, birth_date: null, school_id: null, grade: null, notes: null, photo_path: null, default_pickup_address_id: null, default_dropoff_address_id: null, monthly_fee: 35 },
    routes: { color: '#1B4D89', departure_time: '06:15:00', days_of_week: [1, 2, 3, 4, 5], polyline: null },
    trip_events: { student_id: null, school_id: null, stop_id: null, payload: {}, latitude: null, longitude: null, client_id: null, created_by: yo },
    trip_locations: { speed: null, heading: null, recorded_at: ahora },
    absences: { scope: 'all', reason: null, registered_by: yo },
    route_cancellations: { reason: 'Otro', created_by: yo },
    driver_substitutions: { scope: 'all', status: 'requested', responded_at: null },
    messages: { trip_id: null, template_key: null, recipients: 0 },
    notification_preferences: { student_id: null, urgent: true, trip: true, messages: true, quiet_from: null, quiet_to: null },
    payments: { amount: 35, status: 'pending', paid_at: null },
    driver_documents: { status: 'uploaded', reviewer_note: null },
  };
  const fila: Fila = { ...(base[tabla] ?? {}), ...f };
  if (tabla === 'trip_locations') fila.id = fila.id ?? ++serieGps;
  else if (!['student_guardians', 'student_address_schedule', 'driver_private', 'push_tokens'].includes(tabla)) fila.id = fila.id ?? uuid();
  if (!['trip_locations', 'student_address_schedule', 'driver_private', 'payments', 'notification_preferences'].includes(tabla)) fila.created_at = fila.created_at ?? ahora;
  return fila;
}

function insertar(tabla: string, datos: Fila): Fila {
  const f = porDefecto(tabla, datos);

  if (tabla === 'trip_events') {
    if (f.client_id && db.trip_events.some((e) => e.client_id === f.client_id)) throw fallo('duplicate key value', '23505');
    if (UNA_VEZ_POR_NINO.includes(f.type) && db.trip_events.some((e) => e.trip_id === f.trip_id && e.student_id === f.student_id && e.type === f.type)) throw fallo('duplicate key value', '23505');
    if (UNA_VEZ_POR_VIAJE.includes(f.type) && db.trip_events.some((e) => e.trip_id === f.trip_id && e.type === f.type)) throw fallo('duplicate key value', '23505');
  }
  if (tabla === 'absences') {
    if (f.date < hoyISO()) throw fallo('FECHA_PASADA');
    validarAusenciaDeHoy(f, null);
  }
  if (tabla === 'route_cancellations' && db.trips.some((t) => t.route_id === f.route_id && t.date === f.date)) throw fallo('RECORRIDO_YA_INICIO');
  if (tabla === 'driver_substitutions') {
    if (f.date < hoyISO()) throw fallo('FECHA_PASADA');
    if (db.drivers.find((d) => d.id === f.substitute_id)?.verification_status !== 'verified') throw fallo('SUSTITUTO_NO_VERIFICADO');
  }
  if (tabla === 'messages') {
    f.sender_id = yo ?? f.sender_id;
    f.recipients = representantesDeRuta(f.route_id).length;
  }

  db[tabla] = db[tabla] ?? [];
  db[tabla].push(f);
  emitir(tabla, 'INSERT', f, {});
  despues(tabla, 'INSERT', f, null);
  return f;
}

function validarAusenciaDeHoy(nueva: Fila, vieja: Fila | null) {
  if (nueva.date !== hoyISO()) return;
  const dirs = (s: string) => (s === 'all' ? ['pickup', 'dropoff'] : [s]);
  const antes = vieja && vieja.date === nueva.date ? dirs(vieja.scope) : [];
  const nuevos = dirs(nueva.scope).filter((d) => !antes.includes(d));
  const iniciado = db.trips.some((t) => t.date === nueva.date && nuevos.includes(t.direction) && db.route_stops.some((rs) => rs.route_id === t.route_id && rs.student_id === nueva.student_id));
  if (iniciado) throw fallo('RECORRIDO_YA_INICIO');
}

function resumenDelViaje(trip: Fila, fin: string): Fila {
  const ev = db.trip_events.filter((e) => e.trip_id === trip.id);
  const abordo = ev.filter((e) => e.type === 'boarded');
  const entregados = ev.filter((e) => e.type === 'dropped' || e.type === 'school_arrival');
  const retrasos = ev.filter((e) => e.type === 'delay').map((e) => Number(e.payload?.minutes ?? 0));
  const snap: Fila[] = trip.planned_stops_snapshot ?? [];
  return {
    stops: snap.length,
    students: new Set(snap.filter((s) => s.student_id).map((s) => s.student_id)).size,
    boarded: abordo.length, delivered: entregados.length,
    absent: db.absences.filter((a) => a.date === trip.date && (a.scope === 'all' || a.scope === trip.direction) && db.route_stops.some((rs) => rs.route_id === trip.route_id && rs.student_id === a.student_id)).length,
    pending: abordo.filter((b) => !entregados.some((d) => d.student_id === b.student_id)).map((b) => nombreCorto(b.student_id)),
    messages: ev.filter((e) => e.type === 'message').map((e) => e.payload?.body ?? ''),
    delay_min: retrasos.length ? Math.max(...retrasos) : null,
    duration_min: Math.max(1, Math.round((new Date(fin).getTime() - new Date(trip.started_at).getTime()) / 60000)),
  };
}

function cambiarViaje(trip: Fila, cambios: Fila) {
  const antes = { ...trip };
  Object.assign(trip, cambios);
  emitir('trips', 'UPDATE', trip, antes);
}

function despues(tabla: string, op: 'INSERT' | 'UPDATE' | 'DELETE', f: Fila, vieja: Fila | null) {
  if (tabla === 'trip_events' && op === 'INSERT') {
    const trip = db.trips.find((t) => t.id === f.trip_id);
    const ruta = db.routes.find((r) => r.id === trip?.route_id);
    if (!trip || !ruta) return;
    const h = hora(f.created_at);
    const nino = f.student_id ? nombreCorto(f.student_id) : '';
    const chofer = db.users.find((u) => u.id === trip.driver_id)?.first_name ?? 'El chofer';
    const lugar = f.payload?.place as string | undefined;
    switch (f.type) {
      case 'trip_started': avisarRuta(ruta.id, 'trip_started', 'trip', 'La buseta salió', `${ruta.name} salió a las ${h}. Te avisamos cuando esté cerca.`, trip.id); break;
      case 'bus_near': avisarNino(f.student_id, 'bus_near', 'urgent', 'La buseta está a 1 km', `Prepara a ${nino}. La buseta llega a tu parada en unos minutos.`, trip.id, ruta.id); break;
      case 'bus_arriving': avisarNino(f.student_id, 'bus_arriving', 'urgent', 'La buseta está a 500 m', `Sal con ${nino}. La buseta está por llegar a tu parada.`, trip.id, ruta.id); break;
      case 'boarded': avisarNino(f.student_id, 'student_boarded', 'trip', `${nino} subió a la buseta`, `Abordó a las ${h}${lugar ? ` en ${lugar}` : ''}.`, trip.id, ruta.id); break;
      case 'dropped': avisarNino(f.student_id, 'student_dropped', 'trip', `${nino} llegó a ${lugar ?? 'su destino'}`, `La entrega fue a las ${h}.`, trip.id, ruta.id); break;
      case 'school_arrival': avisarNino(f.student_id, 'school_arrival', 'trip', `${nino} llegó a ${db.schools.find((s) => s.id === f.school_id)?.short_name ?? 'la escuela'}`, `Entró a las ${h}.`, trip.id, ruta.id); break;
      case 'paused':
        if (trip.status === 'in_progress') cambiarViaje(trip, { status: 'paused' });
        avisarRuta(ruta.id, 'trip_paused', 'trip', 'Recorrido en pausa', `${chofer} pausó ${ruta.name}${f.payload?.reason ? `. Motivo: ${f.payload.reason}` : ''}.`, trip.id);
        break;
      case 'resumed':
        if (trip.status === 'paused') cambiarViaje(trip, { status: 'in_progress' });
        avisarRuta(ruta.id, 'trip_resumed', 'trip', 'El recorrido continúa', `${ruta.name} retomó la marcha a las ${h}.`, trip.id);
        break;
      case 'delay': avisarRuta(ruta.id, 'delay', 'urgent', `Retraso de ${f.payload?.minutes ?? 10} min`, `${ruta.name} va más tarde de lo previsto. Toca Visto para no repetir.`, trip.id); break;
      case 'deviation': avisarRuta(ruta.id, 'deviation', 'urgent', 'La buseta cambió de camino', 'Se apartó más de 300 m de la ruta. Te mostramos dónde va.', trip.id); break;
      case 'message': avisarRuta(ruta.id, 'message', 'messages', `${chofer}: «${f.payload?.body ?? ''}»`, `${ruta.name}, ${h}`, trip.id); break;
      case 'trip_finished':
        cambiarViaje(trip, { status: 'finished', finished_at: f.created_at, summary: resumenDelViaje(trip, f.created_at) });
        avisarRuta(ruta.id, 'trip_finished', 'trip', 'Recorrido terminado', `${ruta.name} terminó a las ${h}.`, trip.id);
        break;
    }
  }
  if (tabla === 'trip_events' && op === 'DELETE') {
    const tipo = f.type === 'boarded' ? 'student_boarded' : f.type === 'dropped' ? 'student_dropped' : f.type;
    const fuera = db.notifications.filter((n) => n.trip_id === f.trip_id && n.student_id === f.student_id && n.type === tipo);
    db.notifications = db.notifications.filter((n) => !fuera.includes(n));
    fuera.forEach((n) => emitir('notifications', 'DELETE', {}, n));
  }
  if (tabla === 'trip_locations' && op === 'INSERT') {
    const trip = db.trips.find((t) => t.id === f.trip_id);
    if (!trip || trip.status !== 'in_progress') return;
    const hecho = trip.direction === 'pickup' ? 'boarded' : 'dropped';
    for (const s of trip.planned_stops_snapshot as Fila[]) {
      if (!s.student_id || s.latitude == null || !['pickup_home', 'dropoff_home'].includes(s.kind)) continue;
      const ev = db.trip_events.filter((e) => e.trip_id === trip.id && e.student_id === s.student_id);
      // Igual que tg_trip_location_near: aviso a 1 km y a 500 m, una vez cada uno.
      if (ev.some((e) => e.type === hecho || e.type === 'bus_arriving')) continue;
      if (trip.direction === 'dropoff' && !ev.some((e) => e.type === 'boarded')) continue;
      const metros = distanciaM(f as never, s as never);
      const tipo = metros <= RADIO_LLEGANDO_M ? 'bus_arriving' : metros <= RADIO_CERCA_M && !ev.some((e) => e.type === 'bus_near') ? 'bus_near' : null;
      if (tipo) {
        try {
          insertar('trip_events', { trip_id: trip.id, type: tipo, student_id: s.student_id, stop_id: s.stop_id, latitude: f.latitude, longitude: f.longitude, payload: { place: s.label, meters: Math.round(metros) }, created_by: null });
        } catch { /* ya avisado */ }
      }
    }
  }
  if (tabla === 'absences') {
    const st = db.students.find((s) => s.id === f.student_id);
    if (!st) return;
    const que = f.scope === 'pickup' ? 'solo ida' : f.scope === 'dropoff' ? 'solo vuelta' : 'todo el día';
    const quien = nombreDe(yo ?? f.registered_by);
    if (op === 'DELETE') avisar(st.driver_id, 'absence_removed', 'trip', `${nombreCorto(st.id)} sí va ${diaTexto(f.date)}`, `Se retiró la ausencia (${que}). Avisó ${quien}.`, { student_id: st.id });
    else avisar(st.driver_id, 'absence_received', 'trip', `Ausencia: ${nombreCorto(st.id)} no va ${diaTexto(f.date)}`, `${que}${f.reason ? `, ${f.reason}` : ''}, avisó ${quien}`, { student_id: st.id });
  }
  if (tabla === 'route_cancellations' && op !== 'UPDATE') {
    const ruta = db.routes.find((r) => r.id === f.route_id);
    if (!ruta) return;
    if (op === 'INSERT') avisarRuta(ruta.id, 'service_cancelled', 'urgent', `Servicio cancelado ${diaTexto(f.date)}`, `${ruta.name} no pasará. Motivo: ${String(f.reason).toLowerCase()}.`);
    else avisarRuta(ruta.id, 'service_restored', 'urgent', `El servicio sí pasa ${diaTexto(f.date)}`, `${ruta.name} vuelve a su horario normal.`);
  }
  if (tabla === 'driver_substitutions' && op !== 'DELETE') {
    if (op === 'UPDATE' && vieja && vieja.status === f.status && vieja.substitute_id === f.substitute_id) return;
    const titular = nombreDe(f.driver_id);
    const sust = nombreDe(f.substitute_id);
    const dia = diaTexto(f.date);
    if (f.status === 'requested') avisar(f.substitute_id, 'substitute_request', 'urgent', `${titular} te pide conducir`, `Sus rutas ${dia}. Acepta o rechaza.`, { data: { substitution_id: f.id } });
    if (f.status === 'accepted') {
      avisar(f.driver_id, 'substitute_accepted', 'urgent', `${sust} aceptó`, `Conducirá tus rutas ${dia}. Los representantes ya fueron avisados.`);
      const veh = fichaChofer(f.substitute_id);
      db.routes.filter((r) => r.driver_id === f.driver_id && (f.scope === 'all' || f.scope === r.direction))
        .forEach((r) => avisarRuta(r.id, 'substitute_assigned', 'urgent', `${dia.charAt(0).toUpperCase() + dia.slice(1)} conduce ${sust}`, `${r.name}${veh?.plate ? `, ${veh.plate}` : ''}.`));
    }
    if (f.status === 'rejected') avisar(f.driver_id, 'substitute_rejected', 'urgent', `${sust} no puede`, `Rechazó conducir tus rutas ${dia}. Busca a otro chofer.`);
    if (f.status === 'revoked') avisar(f.substitute_id, 'substitute_revoked', 'urgent', 'Autorización retirada', `${titular} ya no necesita que conduzcas ${dia}.`);
  }
  if (tabla === 'messages' && op === 'INSERT') {
    if (f.trip_id) insertar('trip_events', { trip_id: f.trip_id, type: 'message', payload: { body: f.body, template_key: f.template_key }, created_by: f.sender_id });
    else avisarRuta(f.route_id, 'message', 'messages', `${db.users.find((u) => u.id === f.sender_id)?.first_name ?? 'El chofer'}: «${f.body}»`, db.routes.find((r) => r.id === f.route_id)?.name ?? '');
  }
  if (tabla === 'addresses' && op !== 'DELETE' && f.student_id && yo && yo !== f.driver_id) {
    avisar(f.driver_id, 'address_changed', 'messages', `Cambio de dirección de ${nombreCorto(f.student_id)}`, `${db.users.find((u) => u.id === yo)?.first_name ?? ''} actualizó «${f.label}». Revisa el orden de tus paradas.`, { student_id: f.student_id });
  }
}

function actualizar(tabla: string, fila: Fila, cambios: Fila) {
  const antes = { ...fila };
  const nueva = { ...fila, ...cambios };
  if (tabla === 'absences') {
    if (nueva.date < hoyISO()) throw fallo('FECHA_PASADA');
    validarAusenciaDeHoy(nueva, antes);
  }
  if (tabla === 'drivers') {
    if (nueva.plate_number) {
      nueva.plate_number = String(nueva.plate_number).toUpperCase();
      if (!/^[A-Z]{3}-[0-9]{3,4}$/.test(nueva.plate_number)) throw fallo('violates check constraint "drivers_plate_number_check"', '23514');
    }
    if (nueva.verification_status !== antes.verification_status) {
      if (nueva.verification_status !== 'in_review' || antes.verification_status === 'verified') throw fallo('CAMBIO_DE_ESTADO_NO_PERMITIDO');
      nueva.verification_status = 'verified'; // modo demostración: se aprueba sola
      nueva.verified_at = new Date().toISOString();
      avisar(nueva.id, 'verification_result', 'urgent', 'Tu cuenta está verificada', 'Ya puedes iniciar recorridos y ser chofer sustituto.');
    }
  }
  if (tabla === 'driver_substitutions' && nueva.status === 'requested') nueva.responded_at = null;
  if (tabla === 'driver_substitutions' && ['accepted', 'rejected'].includes(nueva.status) && antes.status === 'requested') nueva.responded_at = new Date().toISOString();
  Object.assign(fila, nueva);
  emitir(tabla, 'UPDATE', fila, antes);
  despues(tabla, 'UPDATE', fila, antes);
}

function borrar(tabla: string, fila: Fila) {
  db[tabla] = db[tabla].filter((x) => x !== fila);
  // borrado en cascada de lo que cuelga de la fila
  const cascada: Record<string, [string, string][]> = {
    students: [['route_stops', 'student_id'], ['addresses', 'student_id'], ['student_guardians', 'student_id'], ['invitations', 'student_id'], ['absences', 'student_id'], ['payments', 'student_id'], ['student_address_schedule', 'student_id']],
    routes: [['route_stops', 'route_id'], ['trips', 'route_id'], ['route_cancellations', 'route_id'], ['messages', 'route_id']],
    addresses: [['student_address_schedule', 'address_id']],
  };
  for (const [t, col] of cascada[tabla] ?? []) db[t] = db[t].filter((x) => x[col] !== fila.id);
  emitir(tabla, 'DELETE', {}, fila);
  despues(tabla, 'DELETE', fila, fila);
}

// ── Lectura con relaciones embebidas: 'a, b, alias:tabla(cols), tabla(cols)' ─
function partir(cols: string): string[] {
  const partes: string[] = [];
  let nivel = 0, actual = '';
  for (const ch of cols) {
    if (ch === '(') nivel++;
    if (ch === ')') nivel--;
    if (ch === ',' && nivel === 0) { partes.push(actual.trim()); actual = ''; } else actual += ch;
  }
  if (actual.trim()) partes.push(actual.trim());
  return partes;
}
const singular = (t: string) => (t === 'addresses' ? 'address' : t.replace(/s$/, ''));
const HIJOS: Record<string, string> = { 'students>student_guardians': 'student_id', 'routes>route_stops': 'route_id', 'students>invitations': 'student_id' };

function proyectar(tabla: string, fila: Fila, cols: string): Fila {
  const salida: Fila = {};
  for (const parte of partir(cols)) {
    const m = parte.match(/^(?:(\w+):)?(\w+)(?:!\w+)?\((.*)\)$/s);
    if (!m) {
      if (parte === '*') Object.assign(salida, fila);
      else salida[parte] = fila[parte] ?? null;
      continue;
    }
    const [, alias, destino, internas] = m;
    const nombre = alias ?? destino;
    const fk = [`${nombre}_id`, `${singular(destino)}_id`].find((k) => k in fila);
    if (fk) {
      const rel = (db[destino] ?? []).find((x) => x.id === fila[fk]);
      salida[nombre] = rel ? proyectar(destino, rel, internas) : null;
    } else {
      const col = HIJOS[`${tabla}>${destino}`] ?? `${singular(tabla)}_id`;
      salida[nombre] = (db[destino] ?? []).filter((x) => x[col] === fila.id).map((x) => proyectar(destino, x, internas));
    }
  }
  return salida;
}

class Consulta {
  private op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  private cols: string | null = null;
  private filtros: ((f: Fila) => boolean)[] = [];
  private ordenes: { col: string; asc: boolean }[] = [];
  private tope: number | null = null;
  private uno: 'single' | 'maybe' | null = null;
  private datos: Fila | Fila[] | null = null;
  private opciones: { onConflict?: string; ignoreDuplicates?: boolean } = {};

  constructor(private tabla: string) {}

  select(cols = '*') { this.cols = cols; return this; }
  insert(d: Fila | Fila[]) { this.op = 'insert'; this.datos = d; return this; }
  update(d: Fila) { this.op = 'update'; this.datos = d; return this; }
  upsert(d: Fila | Fila[], o: { onConflict?: string; ignoreDuplicates?: boolean } = {}) { this.op = 'upsert'; this.datos = d; this.opciones = o; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c: string, v: unknown) { this.filtros.push((f) => f[c] === v); return this; }
  in(c: string, v: unknown[]) { this.filtros.push((f) => v.includes(f[c])); return this; }
  gte(c: string, v: any) { this.filtros.push((f) => f[c] >= v); return this; }
  lte(c: string, v: any) { this.filtros.push((f) => f[c] <= v); return this; }
  is(c: string, v: unknown) { this.filtros.push((f) => (f[c] ?? null) === v); return this; }
  order(col: string, o: { ascending?: boolean } = {}) { this.ordenes.push({ col, asc: o.ascending !== false }); return this; }
  limit(n: number) { this.tope = n; return this; }
  single() { this.uno = 'single'; return this; }
  maybeSingle() { this.uno = 'maybe'; return this; }

  then<A, B>(ok: (r: { data: any; error: ErrorDemo | null }) => A, mal?: (e: unknown) => B) {
    // Un respiro mínimo para que la interfaz muestre sus estados de carga como con un servidor real.
    return new Promise<{ data: any; error: ErrorDemo | null }>((resolver) => setTimeout(() => resolver(this.ejecutar()), 120)).then(ok, mal);
  }

  private coincidentes(): Fila[] {
    return (db[this.tabla] ?? []).filter((f) => visible(this.tabla, f) && this.filtros.every((p) => p(f)));
  }

  private ejecutar(): { data: any; error: ErrorDemo | null } {
    try {
      let filas: Fila[];
      if (this.op === 'select') {
        filas = this.coincidentes();
        for (const o of [...this.ordenes].reverse()) {
          filas = [...filas].sort((a, b) => {
            const x = a[o.col], y = b[o.col];
            const r = x == null && y == null ? 0 : x == null ? 1 : y == null ? -1 : typeof x === 'number' ? x - y : typeof x === 'boolean' ? Number(x) - Number(y) : String(x).localeCompare(String(y));
            return o.asc ? r : -r;
          });
        }
        if (this.tope != null) filas = filas.slice(0, this.tope);
      } else if (this.op === 'insert') {
        filas = (Array.isArray(this.datos) ? this.datos : [this.datos as Fila]).map((d) => insertar(this.tabla, d));
      } else if (this.op === 'upsert') {
        const claves = (this.opciones.onConflict ?? 'id').split(',').map((s) => s.trim());
        filas = [];
        for (const d of Array.isArray(this.datos) ? this.datos : [this.datos as Fila]) {
          const existente = (db[this.tabla] ?? []).find((f) => claves.every((k) => f[k] === d[k]));
          if (!existente) filas.push(insertar(this.tabla, d));
          else if (!this.opciones.ignoreDuplicates) { actualizar(this.tabla, existente, d); filas.push(existente); }
        }
      } else if (this.op === 'update') {
        filas = this.coincidentes();
        filas.forEach((f) => actualizar(this.tabla, f, this.datos as Fila));
      } else {
        filas = this.coincidentes();
        filas.forEach((f) => borrar(this.tabla, f));
      }

      if (this.op !== 'select' && this.cols === null) return { data: null, error: null };
      const salida = filas.map((f) => copia(proyectar(this.tabla, f, this.cols ?? '*')));
      if (this.uno === 'single') {
        if (salida.length !== 1) return { data: null, error: fallo('No se encontró el registro.', 'PGRST116') };
        return { data: salida[0], error: null };
      }
      if (this.uno === 'maybe') return { data: salida[0] ?? null, error: null };
      return { data: salida, error: null };
    } catch (e) {
      const err = e as ErrorDemo;
      return { data: null, error: { message: err?.message ?? 'Error', code: err?.code } };
    }
  }
}

// ── Sesión ──────────────────────────────────────────────────────────────────
type OyenteSesion = (evento: string, sesion: { user: { id: string } } | null) => void;
const oyentesSesion = new Set<OyenteSesion>();
const sesionDe = (id: string | null) => (id ? { user: { id } } : null);

function cambiarSesion(id: string | null, evento: string) {
  yo = id;
  sesion = id;
  if (id) AsyncStorage.setItem(CLAVE_SESION, id).catch(() => {});
  else AsyncStorage.removeItem(CLAVE_SESION).catch(() => {});
  oyentesSesion.forEach((f) => f(evento, sesionDe(id)));
}

function crearUsuario(email: string | null, meta: Fila, phone: string | null): string {
  const id = uuid();
  const esChofer = meta?.role === 'driver';
  db.users.push({
    id, role: esChofer ? 'driver' : 'guardian', first_name: meta?.first_name ?? '', last_name: meta?.last_name ?? '',
    phone: phone ?? (meta?.phone || null), email, photo_url: null, locale: 'es-EC', created_at: new Date().toISOString(),
  });
  if (esChofer) {
    db.drivers.push({
      id, vehicle_brand: null, vehicle_model: null, vehicle_year: null, vehicle_color: null, plate_number: null, vehicle_capacity: null,
      verification_status: 'pending', verified_at: null, reviewer_note: null, low_power_mode: false, absence_cutoff_time: '05:30:00',
      quick_messages: ['Tráfico pesado', 'Llego en 5 min'], created_at: new Date().toISOString(),
    });
    db.driver_private.push({ driver_id: id, license_number: meta?.license_number || null, license_type: null, license_expiry: null });
  }
  claves.set(id, CLAVE_DEMO);
  return id;
}
const claves = new Map<string, string>(); // contraseñas de las cuentas creadas durante la demostración

const auth = {
  onAuthStateChange(cb: OyenteSesion) {
    oyentesSesion.add(cb);
    AsyncStorage.getItem(CLAVE_SESION)
      .then((id) => {
        yo = id && db.users.some((u) => u.id === id) ? id : null;
        sesion = yo;
        cb('INITIAL_SESSION', sesionDe(yo));
      })
      .catch(() => cb('INITIAL_SESSION', null));
    return { data: { subscription: { unsubscribe: () => { oyentesSesion.delete(cb); } } } };
  },
  async signInWithPassword({ email, password }: { email: string; password: string }) {
    const u = db.users.find((x) => String(x.email ?? '').toLowerCase() === email.toLowerCase());
    if (!u || password !== (claves.get(u.id) ?? CLAVE_DEMO)) return { data: { session: null }, error: fallo('Invalid login credentials') };
    cambiarSesion(u.id, 'SIGNED_IN');
    return { data: { session: sesionDe(u.id) }, error: null };
  },
  async signUp({ email, password, options }: { email: string; password: string; options?: { data?: Fila } }) {
    if (db.users.some((x) => String(x.email ?? '').toLowerCase() === email.toLowerCase())) return { data: { session: null }, error: fallo('User already registered') };
    if (password.length < 6) return { data: { session: null }, error: fallo('Password should be at least 6 characters') };
    const id = crearUsuario(email, options?.data ?? {}, null);
    claves.set(id, password);
    cambiarSesion(id, 'SIGNED_IN');
    return { data: { session: sesionDe(id) }, error: null };
  },
  async signInWithOtp({ phone, options }: { phone: string; options?: { data?: Fila; shouldCreateUser?: boolean } }) {
    const existe = db.users.some((u) => u.phone === phone);
    if (!existe && options?.shouldCreateUser === false) return { data: {}, error: fallo('Signups not allowed for otp') };
    if (!existe) pendientesOtp.set(phone, options?.data ?? {});
    return { data: {}, error: null };
  },
  async verifyOtp({ phone, token }: { phone: string; token: string }) {
    if (token !== CODIGO_SMS_DEMO) return { data: { session: null }, error: fallo('Token has expired or is invalid') };
    const u = db.users.find((x) => x.phone === phone);
    const id = u?.id ?? crearUsuario(null, pendientesOtp.get(phone) ?? {}, phone);
    cambiarSesion(id, 'SIGNED_IN');
    return { data: { session: sesionDe(id) }, error: null };
  },
  async resetPasswordForEmail(_email: string) {
    return { data: {}, error: null };
  },
  async signOut() {
    cambiarSesion(null, 'SIGNED_OUT');
    return { error: null };
  },
  /** Solo demostración: entra directo con una de las cuentas quemadas. */
  entrarComo(id: string) {
    if (db.users.some((u) => u.id === id)) cambiarSesion(id, 'SIGNED_IN');
  },
};
const pendientesOtp = new Map<string, Fila>();

// ── Canales de tiempo real ──────────────────────────────────────────────────
function crearCanal() {
  const canal = {
    on(_tipo: string, f: { event: string; table: string; filter?: string }, cb: Oyente['cb']) {
      oyentes.push({ canal, event: f.event, table: f.table, filter: f.filter, cb });
      return canal;
    },
    subscribe(cb?: (estado: string) => void) {
      setTimeout(() => cb?.('SUBSCRIBED'), 0);
      return canal;
    },
    unsubscribe() {
      oyentes = oyentes.filter((o) => o.canal !== canal);
    },
  };
  return canal;
}

export function crearClienteDemo() {
  return {
    from: (tabla: string) => new Consulta(tabla),
    rpc(nombre: string, params: Fila = {}) {
      return new Promise<{ data: any; error: ErrorDemo | null }>((resolver) => {
        setTimeout(() => {
          try {
            const f = FUNCIONES[nombre];
            if (!f) return resolver({ data: null, error: fallo(`Función ${nombre} no disponible en la demostración`) });
            resolver({ data: copia(f(params)) ?? null, error: null });
          } catch (e) {
            const err = e as ErrorDemo;
            resolver({ data: null, error: { message: err?.message ?? 'Error', code: err?.code } });
          }
        }, 150);
      });
    },
    auth,
    channel: (_nombre: string) => crearCanal(),
    removeChannel(canal: { unsubscribe: () => void }) {
      canal.unsubscribe();
    },
    storage: {
      from: (_bucket: string) => ({
        upload: async (_ruta: string, _cuerpo: unknown, _o?: unknown) => ({ data: { path: _ruta }, error: null }),
        getPublicUrl: (_ruta: string) => ({ data: { publicUrl: '' } }),
        createSignedUrl: async (_ruta: string, _seg: number) => ({ data: null, error: null }),
      }),
    },
    functions: {
      invoke: async (_nombre: string, _o?: unknown) => ({ data: null, error: fallo('Sin servidor en la demostración') }),
    },
  };
}

/** Atajos para el simulador y el panel Demo (escriben como lo haría el servidor). */
export const servidorDemo = {
  insertar,
  paradasDeRuta,
  entrarComo: auth.entrarComo,
  /** Ejecuta algo con la identidad de otro usuario (el "chofer automático" del simulador). */
  como<T>(id: string, f: () => T): T {
    const antes = yo;
    yo = id;
    try {
      return f();
    } finally {
      yo = antes;
    }
  },
  iniciarRecorrido,
};
