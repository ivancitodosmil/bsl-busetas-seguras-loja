// Tipos del modelo BSL 2.0 (reflejan supabase/01_esquema.sql y las funciones de 02).

export type Rol = 'driver' | 'guardian' | 'admin';
export type Sentido = 'pickup' | 'dropoff'; // pickup = ida (casas → escuelas), dropoff = vuelta
export type AlcanceAusencia = 'pickup' | 'dropoff' | 'all';
export type EstadoVerificacion = 'pending' | 'in_review' | 'verified' | 'rejected';
export type EstadoViaje = 'in_progress' | 'paused' | 'finished';
export type TipoParada = 'pickup_home' | 'dropoff_school' | 'pickup_school' | 'dropoff_home';
export type CanalAviso = 'urgent' | 'trip' | 'messages';
export type TipoEvento =
  | 'trip_started' | 'bus_near' | 'bus_arriving' | 'boarded' | 'dropped' | 'school_arrival'
  | 'paused' | 'resumed' | 'delay' | 'deviation' | 'message' | 'trip_finished';

export interface Coordenada {
  latitude: number;
  longitude: number;
}

export interface Usuario {
  id: string;
  role: Rol;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  photo_url: string | null;
}

export interface Chofer {
  id: string;
  vehicle_brand: string | null;
  vehicle_model: string | null;
  vehicle_year: number | null;
  vehicle_color: string | null;
  plate_number: string | null;
  vehicle_capacity: number | null;
  verification_status: EstadoVerificacion;
  verified_at: string | null;
  reviewer_note: string | null;
  low_power_mode: boolean;
  absence_cutoff_time: string; // HH:MM:SS
  quick_messages: string[];
}

export interface ChoferPrivado {
  driver_id: string;
  license_number: string | null;
  license_type: string | null;
  license_expiry: string | null;
}

export type TipoDocumento = 'license' | 'registration' | 'vehicle_photo' | 'profile_photo';
export interface DocumentoChofer {
  id: string;
  driver_id: string;
  kind: TipoDocumento;
  file_path: string;
  status: 'uploaded' | 'approved' | 'rejected';
  reviewer_note: string | null;
  created_at: string;
}

export interface Direccion {
  id: string;
  driver_id: string;
  student_id: string | null;
  label: string;
  kind: 'pickup' | 'dropoff' | 'both' | 'school';
  main_street: string;
  cross_street: string | null;
  house_number: string | null;
  neighborhood: string | null;
  reference: string | null;
  receiver_note: string | null;
  city: string;
  latitude: number;
  longitude: number;
  gps_accuracy_m: number | null;
}
export type DireccionNueva = Omit<Direccion, 'id' | 'city'> & { id?: string; city?: string };

export interface Escuela {
  id: string;
  driver_id: string;
  name: string;
  short_name: string;
  color: string;
  address_id: string | null;
  entry_time: string; // HH:MM:SS
  exit_time: string;
  gate_reference: string | null;
  archived_at: string | null;
  address?: Direccion | null;
}

export interface Estudiante {
  id: string;
  driver_id: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  birth_date: string | null;
  school_id: string | null;
  grade: string | null;
  notes: string | null;
  photo_path: string | null;
  default_pickup_address_id: string | null;
  default_dropoff_address_id: string | null;
  monthly_fee: number;
  school?: Escuela | null;
}

export interface Representante {
  student_id: string;
  user_id: string;
  relationship: string;
  is_primary: boolean;
  can_report_absence: boolean;
  receives_notifications: boolean;
  user?: Pick<Usuario, 'id' | 'first_name' | 'last_name' | 'phone' | 'photo_url'> | null;
}

export interface ExcepcionDireccion {
  student_id: string;
  weekday: number; // 1 = lunes … 7 = domingo
  direction: Sentido;
  address_id: string;
}

export interface Invitacion {
  id: string;
  student_id: string;
  code: string;
  guardian_name: string | null;
  guardian_phone: string | null;
  relationship: string;
  is_primary: boolean;
  expires_at: string;
  redeemed_by: string | null;
  redeemed_at: string | null;
  created_at: string;
}
export type EstadoInvitacion = 'vinculado' | 'pendiente' | 'expirado';

export interface Ruta {
  id: string;
  driver_id: string;
  name: string;
  color: string;
  direction: Sentido;
  departure_time: string; // HH:MM:SS
  days_of_week: number[];
  polyline: Coordenada[] | null;
}

// Parada resuelta que devuelve paradas_de_ruta() y que se guarda en trips.planned_stops_snapshot.
export interface Parada {
  stop_id: string;
  position: number;
  kind: TipoParada;
  student_id: string | null;
  school_id: string | null;
  student_name: string | null;
  student_full_name: string | null;
  student_photo: string | null;
  notes: string | null;
  school_name: string | null;
  school_short: string | null;
  school_color: string | null;
  school_time: string | null; // HH:MM (entrada en la ida, salida en la vuelta)
  label: string;
  street: string | null;
  reference: string | null;
  address_id: string | null;
  latitude: number | null;
  longitude: number | null;
  estimated_time: string | null; // HH:MM
  absent: boolean;
  absence_reason: string | null;
  absence_scope: AlcanceAusencia | null;
  absence_by: string | null;
}

// Lo que se envía a guardar_paradas().
export interface ParadaBorrador {
  kind: TipoParada;
  student_id?: string | null;
  school_id?: string | null;
  address_id?: string | null;
  estimated_time?: string | null;
}

export interface Viaje {
  id: string;
  route_id: string;
  driver_id: string;
  date: string;
  direction: Sentido;
  status: EstadoViaje;
  started_at: string;
  finished_at: string | null;
  planned_stops_snapshot: Parada[];
  summary: ResumenViaje | null;
}

export interface ResumenViaje {
  stops: number;
  students: number;
  boarded: number;
  delivered: number;
  absent: number;
  pending: string[];
  messages: string[];
  delay_min: number | null;
  duration_min: number;
}

export interface EventoViaje {
  id: string;
  trip_id: string;
  type: TipoEvento;
  student_id: string | null;
  school_id: string | null;
  stop_id: string | null;
  payload: { place?: string; body?: string; minutes?: number; reason?: string; template_key?: string };
  latitude: number | null;
  longitude: number | null;
  client_id: string | null;
  created_at: string;
}

export interface PosicionViaje {
  id: number;
  trip_id: string;
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  recorded_at: string;
}

export interface Ausencia {
  id: string;
  student_id: string;
  date: string; // AAAA-MM-DD
  scope: AlcanceAusencia;
  reason: string | null;
  registered_by: string | null;
}

export interface Cancelacion {
  id: string;
  route_id: string;
  date: string;
  reason: string;
}

export interface Sustitucion {
  id: string;
  driver_id: string;
  substitute_id: string;
  date: string;
  scope: AlcanceAusencia;
  status: 'requested' | 'accepted' | 'rejected' | 'revoked';
  created_at: string;
  responded_at: string | null;
}

export interface Mensaje {
  id: string;
  route_id: string;
  trip_id: string | null;
  template_key: string | null;
  body: string;
  recipients: number;
  created_at: string;
}

export interface Aviso {
  id: string;
  user_id: string;
  type: string;
  channel: CanalAviso;
  title: string;
  body: string;
  student_id: string | null;
  trip_id: string | null;
  route_id: string | null;
  data: Record<string, any>;
  read_at: string | null;
  created_at: string;
}

export interface PreferenciaAvisos {
  id?: string;
  user_id: string;
  student_id: string | null;
  urgent: boolean;
  trip: boolean;
  messages: boolean;
  quiet_from: string | null;
  quiet_to: string | null;
}

export interface Pago {
  id: string;
  student_id: string;
  driver_id: string;
  period: string;
  amount: number;
  status: 'paid' | 'pending';
  paid_at: string | null;
}

// ── Respuestas de las funciones de resumen ───────────────────────────────────

export interface FichaChofer {
  id: string;
  name: string;
  first_name: string;
  photo_url: string | null;
  phone: string | null;
  vehicle: string | null;
  color: string | null;
  plate: string | null;
  verified: boolean;
}

export interface ViajeBreve {
  id: string;
  status: EstadoViaje;
  started_at: string;
  finished_at: string | null;
  driver_id: string;
}

export type EstadoNino = 'pending' | 'near' | 'boarded' | 'delivered';

export interface HijoResumen {
  id: string;
  first_name: string;
  last_name: string;
  name: string; // apodo o nombre
  grade: string | null;
  birth_date: string | null;
  photo_path: string | null;
  driver_id: string;
  relationship: string;
  is_primary: boolean;
  can_report_absence: boolean;
  has_home: boolean; // el representante ya marcó la casa en el mapa
  school: { id: string; name: string; short_name: string; color: string; entry_time: string; exit_time: string } | null;
  absence: { id: string; scope: AlcanceAusencia; reason: string | null } | null;
}

export interface NinoEnRuta {
  student_id: string;
  stop_id: string;
  kind: TipoParada;
  estimated_time: string | null; // hora de paso por su casa
  school_time: string | null; // hora estimada en su escuela
  absent: boolean;
  status: EstadoNino;
  boarded_at: string | null;
  delivered_at: string | null;
}

export interface RutaRepresentante {
  id: string;
  name: string;
  color: string;
  direction: Sentido;
  departure_time: string; // HH:MM
  days_of_week: number[];
  runs_today: boolean;
  driver: FichaChofer | null;
  substitute: FichaChofer | null;
  cancellation: { reason: string } | null;
  trip: ViajeBreve | null;
  children: NinoEnRuta[];
}

export interface ResumenRepresentante {
  date: string;
  children: HijoResumen[];
  routes: RutaRepresentante[];
}

export interface RutaChofer {
  id: string;
  name: string;
  color: string;
  direction: Sentido;
  departure_time: string; // HH:MM
  days_of_week: number[];
  runs_today: boolean;
  own: boolean;
  titular: string | null;
  stops: number;
  active_stops: number;
  students: number;
  schools: { id: string; short_name: string; color: string; time: string }[];
  trip: ViajeBreve | null;
  cancellation: { id: string; reason: string } | null;
  substitute: { id: string; status: 'requested' | 'accepted'; name: string } | null;
}

export interface AusenteHoy {
  id: string;
  student_id: string;
  name: string;
  short_name: string;
  scope: AlcanceAusencia;
  reason: string | null;
  by: string | null;
  school_short: string | null;
  school_color: string | null;
}

export interface SolicitudSustituto {
  id: string;
  date: string;
  scope: AlcanceAusencia;
  status: 'requested' | 'accepted';
  driver: FichaChofer | null;
  routes: { name: string; direction: Sentido; departure_time: string }[];
  students: number;
}

export interface ResumenChofer {
  date: string;
  driver: {
    verification_status: EstadoVerificacion;
    reviewer_note: string | null;
    plate: string | null;
    low_power_mode: boolean;
    absence_cutoff_time: string;
    schools: number;
  } | null;
  totals: { students: number; absent: number; active: number };
  absences: AusenteHoy[];
  routes: RutaChofer[];
  substitution_requests: SolicitudSustituto[];
  active_trip_id: string | null;
}

export interface ChoferEncontrado {
  id: string;
  name: string;
  photo_url: string | null;
  vehicle: string;
  color: string | null;
  plate: string | null;
}

export interface VinculoCreado {
  student_id: string;
  first_name: string;
  full_name: string;
  grade: string | null;
  school: string | null;
  school_color: string | null;
  driver_name: string | null;
  plate: string | null;
}
