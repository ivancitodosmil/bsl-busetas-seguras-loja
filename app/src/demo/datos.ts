// Datos quemados del modo demostración (los mismos de supabase/03_datos_demo.sql).
// Viven en memoria: se reinician al cerrar la app o con "Reiniciar datos" en el panel Demo.
import { hoyISO, sumarDias } from '../utils';

export const CLAVE_DEMO = 'Bsl2026demo';
export const CODIGO_SMS_DEMO = '123456';

export const ID = {
  chofer: 'c0000000-0000-4000-8000-000000000001',
  maria: 'c0000000-0000-4000-8000-000000000002',
  diego: 'c0000000-0000-4000-8000-000000000003',
  luis: 'c0000000-0000-4000-8000-000000000004',
  seb: 'e0000000-0000-4000-8000-000000000001',
  pinos: 'e0000000-0000-4000-8000-000000000002',
  ida: 'd0000000-0000-4000-8000-000000000001',
  vuelta: 'd0000000-0000-4000-8000-000000000002',
  emilia: 'a0000000-0000-4000-8000-000000000001',
  mateo: 'a0000000-0000-4000-8000-000000000002',
  sofia: 'a0000000-0000-4000-8000-000000000003',
  vale: 'a0000000-0000-4000-8000-000000000004',
  juan: 'a0000000-0000-4000-8000-000000000005',
  nico: 'a0000000-0000-4000-8000-000000000006',
};

const D = {
  seb: 'f1000000-0000-4000-8000-000000000001',
  pinos: 'f1000000-0000-4000-8000-000000000002',
  jar: 'f1000000-0000-4000-8000-000000000003',
  jar2: 'f1000000-0000-4000-8000-000000000004',
  abuelos: 'f1000000-0000-4000-8000-000000000005',
  cueva: 'f1000000-0000-4000-8000-000000000006',
  ochoa: 'f1000000-0000-4000-8000-000000000007',
  rios: 'f1000000-0000-4000-8000-000000000008',
  torres: 'f1000000-0000-4000-8000-000000000009',
};

export type Tablas = Record<string, any[]>;

export interface CuentaDemo { id: string; email: string; nombre: string; rol: string }
export const CUENTAS_DEMO: CuentaDemo[] = [
  { id: ID.chofer, email: 'chofer@bsl.app', nombre: 'Carlos Ortega', rol: 'Chofer con Ruta Norte' },
  { id: ID.maria, email: 'maria@bsl.app', nombre: 'María Jaramillo', rol: 'Mamá de Emilia y Mateo' },
  { id: ID.diego, email: 'diego@bsl.app', nombre: 'Diego Armijos', rol: 'Papá de Emilia y Mateo' },
  { id: ID.luis, email: 'sustituto@bsl.app', nombre: 'Luis Carrión', rol: 'Chofer sustituto, sin rutas' },
];

export function datosIniciales(): Tablas {
  const ahora = new Date().toISOString();
  const hoy = hoyISO();
  const usuario = (id: string, role: string, first_name: string, last_name: string, phone: string, email: string) => ({
    id, role, first_name, last_name, phone, email, photo_url: null, locale: 'es-EC', created_at: ahora,
  });
  const chofer = (id: string, marca: string, modelo: string, anio: number, color: string, placa: string, cap: number) => ({
    id, vehicle_brand: marca, vehicle_model: modelo, vehicle_year: anio, vehicle_color: color, plate_number: placa,
    vehicle_capacity: cap, verification_status: 'verified', verified_at: ahora, reviewer_note: null, low_power_mode: false,
    absence_cutoff_time: '05:30:00', quick_messages: ['Tráfico pesado', 'Llego en 5 min'], created_at: ahora,
  });
  const dir = (id: string, student_id: string | null, label: string, kind: string, main_street: string, cross_street: string,
    neighborhood: string, reference: string, latitude: number, longitude: number, extra: Record<string, unknown> = {}) => ({
    id, driver_id: ID.chofer, student_id, created_by: ID.chofer, label, kind, main_street, cross_street, house_number: null,
    neighborhood, reference, receiver_note: null, city: 'Loja', latitude, longitude, gps_accuracy_m: null, created_at: ahora, ...extra,
  });
  const nino = (id: string, first_name: string, last_name: string, nickname: string | null, birth_date: string, school_id: string,
    grade: string, notes: string | null, origen: string, destino: string) => ({
    id, driver_id: ID.chofer, first_name, last_name, nickname, birth_date, school_id, grade, notes, photo_path: null,
    default_pickup_address_id: origen, default_dropoff_address_id: destino, monthly_fee: 35, created_at: ahora,
  });
  let n = 0;
  const parada = (route_id: string, position: number, kind: string, student_id: string | null, school_id: string | null, hora: string) => ({
    id: `b0000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, route_id, position, kind, student_id, school_id, address_id: null, estimated_time: `${hora}:00`,
  });
  const periodo = hoy.slice(0, 8) + '01';

  const tablas: Tablas = {
    users: [
      usuario(ID.chofer, 'driver', 'Carlos', 'Ortega', '+593987654321', 'chofer@bsl.app'),
      usuario(ID.maria, 'guardian', 'María', 'Jaramillo', '+593991234567', 'maria@bsl.app'),
      usuario(ID.diego, 'guardian', 'Diego', 'Armijos', '+593991112233', 'diego@bsl.app'),
      usuario(ID.luis, 'driver', 'Luis', 'Carrión', '+593995551212', 'sustituto@bsl.app'),
    ],
    drivers: [
      chofer(ID.chofer, 'Hyundai', 'H1', 2019, 'Blanca', 'LBA-1234', 15),
      chofer(ID.luis, 'Kia', 'Pregio', 2018, 'Gris', 'LBB-5678', 14),
    ],
    driver_private: [
      { driver_id: ID.chofer, license_number: '1104567890', license_type: 'E', license_expiry: '2028-03-31' },
      { driver_id: ID.luis, license_number: '1103334445', license_type: 'D', license_expiry: '2027-09-30' },
    ],
    driver_documents: [],
    addresses: [
      dir(D.seb, null, 'U.E. San Sebastián', 'school', 'Calle Mercadillo', 'Bolívar', 'San Sebastián', 'Puerta de la calle Mercadillo', -4.00452, -79.20118),
      dir(D.pinos, null, 'Colegio Los Pinos', 'school', 'Av. Universitaria', 'Rocafuerte', 'Centro', 'Portón principal, av. Universitaria', -3.99662, -79.20489),
      dir(D.jar, ID.emilia, 'Casa', 'both', 'Av. Pío Jaramillo Alvarado', 'Juan de Salinas', 'La Argelia', 'Portón negro frente a la panadería', -4.0331, -79.20215, { house_number: '14-22' }),
      dir(D.jar2, ID.mateo, 'Casa', 'both', 'Av. Pío Jaramillo Alvarado', 'Juan de Salinas', 'La Argelia', 'Portón negro frente a la panadería', -4.0331, -79.20215, { house_number: '14-22' }),
      dir(D.abuelos, ID.emilia, 'Casa de los abuelos', 'dropoff', 'Calle Azuay', 'Bolívar', 'San Sebastián', 'Junto al parque', -3.99905, -79.20205, { receiver_note: 'La recibe Rosa Vivanco, abuela' }),
      dir(D.cueva, ID.sofia, 'Casa', 'both', 'Calle Lourdes', 'Bolívar', 'San Sebastián', 'Casa esquinera de dos pisos', -4.0027, -79.2014),
      dir(D.ochoa, ID.vale, 'Casa', 'both', 'Av. Universitaria', 'Mercadillo', 'Centro', 'Edificio beige, timbre 3', -4.00395, -79.2047),
      dir(D.rios, ID.juan, 'Casa', 'both', 'Calle Guayaquil', 'Zoilo Rodríguez', 'El Valle', 'Reja verde', -3.9852, -79.2031),
      dir(D.torres, ID.nico, 'Casa', 'both', 'Calle Quito', 'Cuxibamba', 'Gran Colombia', 'Frente a la tienda Don Lucho', -3.9899, -79.2056),
    ],
    schools: [
      { id: ID.seb, driver_id: ID.chofer, name: 'U.E. San Sebastián', short_name: 'San Sebastián', color: '#14A3A0', address_id: D.seb, entry_time: '07:00:00', exit_time: '13:00:00', gate_reference: 'Puerta de la calle Mercadillo', archived_at: null, created_at: ahora },
      { id: ID.pinos, driver_id: ID.chofer, name: 'Colegio Los Pinos', short_name: 'Los Pinos', color: '#7B5CE0', address_id: D.pinos, entry_time: '07:20:00', exit_time: '13:30:00', gate_reference: 'Portón principal, av. Universitaria', archived_at: null, created_at: ahora },
    ],
    students: [
      nino(ID.emilia, 'Emilia', 'Jaramillo', null, '2019-03-14', ID.seb, '3.º de básica', 'Alérgica al maní. En la tarde la recibe su abuela Rosa Vivanco.', D.jar, D.jar),
      nino(ID.mateo, 'Mateo', 'Jaramillo', null, '2015-08-02', ID.pinos, '7.º de básica', null, D.jar2, D.jar2),
      nino(ID.sofia, 'Sofía', 'Cueva', null, '2018-11-20', ID.seb, '4.º de básica', null, D.cueva, D.cueva),
      nino(ID.vale, 'Valentina', 'Ochoa', 'Vale', '2017-05-09', ID.seb, '5.º de básica', null, D.ochoa, D.ochoa),
      nino(ID.juan, 'Juan Pablo', 'Ríos', null, '2014-01-27', ID.pinos, '8.º de básica', 'Baja solo si lo espera un adulto.', D.rios, D.rios),
      nino(ID.nico, 'Nicolás', 'Torres', 'Nico', '2015-12-12', ID.pinos, '7.º de básica', null, D.torres, D.torres),
    ],
    student_guardians: [
      { student_id: ID.emilia, user_id: ID.maria, relationship: 'Mamá', is_primary: true, can_report_absence: true, receives_notifications: true, created_at: ahora },
      { student_id: ID.mateo, user_id: ID.maria, relationship: 'Mamá', is_primary: true, can_report_absence: true, receives_notifications: true, created_at: ahora },
      { student_id: ID.emilia, user_id: ID.diego, relationship: 'Papá', is_primary: false, can_report_absence: true, receives_notifications: true, created_at: ahora },
      { student_id: ID.mateo, user_id: ID.diego, relationship: 'Papá', is_primary: false, can_report_absence: true, receives_notifications: true, created_at: ahora },
    ],
    student_address_schedule: [
      { student_id: ID.emilia, weekday: 2, direction: 'dropoff', address_id: D.abuelos },
      { student_id: ID.emilia, weekday: 4, direction: 'dropoff', address_id: D.abuelos },
    ],
    invitations: [
      { id: 'f2000000-0000-4000-8000-000000000001', student_id: ID.sofia, created_by: ID.chofer, code: 'BSL-9H4T-6L2M', guardian_name: 'Representante de Sofía', guardian_phone: '+593984104410', relationship: 'Mamá', is_primary: true, expires_at: new Date(Date.now() + 31 * 3600e3).toISOString(), redeemed_by: null, redeemed_at: null, created_at: ahora },
      { id: 'f2000000-0000-4000-8000-000000000002', student_id: ID.juan, created_by: ID.chofer, code: 'BSL-7K2M-9Q4D', guardian_name: 'Representante de Juan Pablo', guardian_phone: null, relationship: 'Papá', is_primary: true, expires_at: new Date(Date.now() - 48 * 3600e3).toISOString(), redeemed_by: null, redeemed_at: null, created_at: ahora },
      { id: 'f2000000-0000-4000-8000-000000000003', student_id: ID.nico, created_by: ID.chofer, code: 'BSL-DEMO-2026', guardian_name: 'Representante de Nicolás', guardian_phone: null, relationship: 'Mamá', is_primary: true, expires_at: new Date(Date.now() + 30 * 86400e3).toISOString(), redeemed_by: null, redeemed_at: null, created_at: ahora },
    ],
    routes: [
      { id: ID.ida, driver_id: ID.chofer, name: 'Ruta Norte Ida', color: '#1B4D89', direction: 'pickup', departure_time: '06:15:00', days_of_week: [1, 2, 3, 4, 5, 6, 7], polyline: null, created_at: ahora },
      { id: ID.vuelta, driver_id: ID.chofer, name: 'Ruta Norte Vuelta', color: '#F5A524', direction: 'dropoff', departure_time: '13:00:00', days_of_week: [1, 2, 3, 4, 5, 6, 7], polyline: null, created_at: ahora },
    ],
    route_stops: [
      parada(ID.ida, 1, 'pickup_home', ID.emilia, null, '06:38'),
      parada(ID.ida, 2, 'pickup_home', ID.mateo, null, '06:38'),
      parada(ID.ida, 3, 'pickup_home', ID.sofia, null, '06:47'),
      parada(ID.ida, 4, 'pickup_home', ID.vale, null, '06:51'),
      parada(ID.ida, 5, 'dropoff_school', null, ID.seb, '06:56'),
      parada(ID.ida, 6, 'pickup_home', ID.juan, null, '07:05'),
      parada(ID.ida, 7, 'pickup_home', ID.nico, null, '07:10'),
      parada(ID.ida, 8, 'dropoff_school', null, ID.pinos, '07:16'),
      parada(ID.vuelta, 1, 'pickup_school', null, ID.seb, '13:00'),
      parada(ID.vuelta, 2, 'dropoff_home', ID.vale, null, '13:06'),
      parada(ID.vuelta, 3, 'dropoff_home', ID.sofia, null, '13:10'),
      parada(ID.vuelta, 4, 'pickup_school', null, ID.pinos, '13:30'),
      parada(ID.vuelta, 5, 'dropoff_home', ID.juan, null, '13:40'),
      parada(ID.vuelta, 6, 'dropoff_home', ID.nico, null, '13:46'),
      parada(ID.vuelta, 7, 'dropoff_home', ID.emilia, null, '13:58'),
      parada(ID.vuelta, 8, 'dropoff_home', ID.mateo, null, '13:58'),
    ],
    trips: [],
    trip_events: [],
    trip_locations: [],
    absences: [],
    route_cancellations: [],
    driver_substitutions: [],
    messages: [],
    notifications: [
      { id: 'f3000000-0000-4000-8000-000000000001', user_id: ID.maria, type: 'welcome', channel: 'messages', title: 'Bienvenida a BSL', body: 'Aquí verás cada paso del recorrido de Emilia y Mateo.', student_id: null, trip_id: null, route_id: null, data: {}, read_at: null, created_at: ahora },
      { id: 'f3000000-0000-4000-8000-000000000002', user_id: ID.diego, type: 'welcome', channel: 'messages', title: 'Bienvenido a BSL', body: 'Aquí verás cada paso del recorrido de Emilia y Mateo.', student_id: null, trip_id: null, route_id: null, data: {}, read_at: null, created_at: ahora },
      { id: 'f3000000-0000-4000-8000-000000000003', user_id: ID.chofer, type: 'welcome', channel: 'messages', title: 'Tu cuenta está verificada', body: 'Ya puedes iniciar recorridos y ser chofer sustituto.', student_id: null, trip_id: null, route_id: null, data: {}, read_at: null, created_at: ahora },
    ],
    notification_preferences: [],
    push_tokens: [],
    payments: [ID.emilia, ID.mateo, ID.sofia, ID.vale, ID.juan, ID.nico].map((student_id, i) => {
      const pagado = student_id !== ID.mateo && student_id !== ID.vale;
      return { id: `f4000000-0000-4000-8000-00000000000${i + 1}`, student_id, driver_id: ID.chofer, period: periodo, amount: 35, status: pagado ? 'paid' : 'pending', paid_at: pagado ? `${periodo.slice(0, 8)}04T14:12:00.000Z` : null };
    }),
  };

  // Historial: recorridos de ida de los 3 días anteriores, con sus eventos.
  for (let d = 1; d <= 3; d++) {
    const fecha = sumarDias(hoy, -d);
    const t0 = new Date(`${fecha}T11:15:00.000Z`).getTime(); // 06:15 en Loja
    const tripId = `f5000000-0000-4000-8000-00000000000${d}`;
    const min = (m: number) => new Date(t0 + m * 60000).toISOString();
    const ev = (type: string, m: number, extra: Record<string, unknown> = {}) => ({
      id: `f6000000-0000-4000-8000-${String(tablas.trip_events.length + 1).padStart(12, '0')}`, trip_id: tripId, type, student_id: null, school_id: null,
      stop_id: null, payload: {}, latitude: null, longitude: null, client_id: null, created_by: ID.chofer, created_at: min(m), ...extra,
    });
    tablas.trip_events.push(ev('trip_started', 0));
    const ninos = tablas.students;
    ninos.forEach((s, i) => tablas.trip_events.push(ev('boarded', 22 + i * 5 + d, { student_id: s.id, payload: { place: `Casa ${s.last_name}` } })));
    if (d === 2) tablas.trip_events.push(ev('message', 26, { payload: { body: 'Pequeño retraso', template_key: 'small_delay' } }));
    ninos.forEach((s) => tablas.trip_events.push(ev('school_arrival', (s.school_id === ID.seb ? 43 : 63) + d, { student_id: s.id, school_id: s.school_id })));
    tablas.trip_events.push(ev('trip_finished', 66 + d));
    tablas.trips.push({
      id: tripId, route_id: ID.ida, driver_id: ID.chofer, date: fecha, direction: 'pickup', status: 'finished', started_at: min(0), finished_at: min(66 + d),
      planned_stops_snapshot: [],
      summary: { stops: 8, students: 6, boarded: 6, delivered: 6, absent: 0, pending: [], messages: d === 2 ? ['Pequeño retraso'] : [], delay_min: null, duration_min: 66 + d },
    });
  }
  return tablas;
}
