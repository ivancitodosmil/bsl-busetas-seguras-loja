// Datos del chofer: resumen, verificación, escuelas, estudiantes, invitaciones, rutas, paradas,
// cancelaciones, sustituto, mensajes rápidos, pagos e historial.
import { pedir, supabase } from '../config/supabase';
import type {
  AlcanceAusencia, Cancelacion, ChoferEncontrado, ChoferPrivado, Direccion, DireccionNueva, DocumentoChofer, Escuela,
  Estudiante, EstadoInvitacion, ExcepcionDireccion, Invitacion, Mensaje, Pago, Parada, ParadaBorrador, Representante,
  ResumenChofer, Ruta, Sentido, Sustitucion, TipoDocumento, Viaje,
} from '../tipos';

export interface EstudianteLista extends Estudiante {
  guardians: { user_id: string }[];
  invitations: Pick<Invitacion, 'id' | 'expires_at' | 'redeemed_at'>[];
}

export interface RutaLista extends Ruta {
  stops: { id: string; kind: string; student_id: string | null; school: Pick<Escuela, 'id' | 'short_name' | 'color' | 'entry_time' | 'exit_time'> | null }[];
}

/** Vinculado si hay algún representante; si no, según la última invitación. */
export function estadoVinculacion(e: EstudianteLista): EstadoInvitacion {
  if (e.guardians.length > 0) return 'vinculado';
  const vigente = e.invitations.some((i) => !i.redeemed_at && new Date(i.expires_at).getTime() > Date.now());
  return vigente || e.invitations.length === 0 ? 'pendiente' : 'expirado';
}
export function estadoInvitacion(i: Pick<Invitacion, 'expires_at' | 'redeemed_at'>): EstadoInvitacion {
  if (i.redeemed_at) return 'vinculado';
  return new Date(i.expires_at).getTime() > Date.now() ? 'pendiente' : 'expirado';
}

export const chofer = {
  resumen: (fecha?: string) => pedir<ResumenChofer>(supabase.rpc('resumen_chofer', fecha ? { p_date: fecha } : {})),

  // ── Verificación ──
  datosPrivados: (id: string) =>
    pedir<ChoferPrivado | null>(supabase.from('driver_private').select('*').eq('driver_id', id).maybeSingle()),

  guardarDatosPrivados: (d: ChoferPrivado) =>
    pedir<ChoferPrivado>(supabase.from('driver_private').upsert(d, { onConflict: 'driver_id' }).select().single()),

  documentos: (id: string) =>
    pedir<DocumentoChofer[]>(supabase.from('driver_documents').select('*').eq('driver_id', id).order('created_at')),

  /** Sube el archivo al bucket privado y registra el documento. */
  async subirDocumento(driverId: string, tipo: TipoDocumento, uri: string) {
    const ext = (uri.split('?')[0].split('.').pop() || 'jpg').toLowerCase().slice(0, 4);
    const ruta = `${driverId}/${tipo}-${Date.now()}.${ext}`;
    const cuerpo = await (await fetch(uri)).arrayBuffer();
    const { error } = await supabase.storage.from('driver-documents').upload(ruta, cuerpo, {
      contentType: ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'image/jpeg',
      upsert: true,
    });
    if (error) throw new Error(error.message);
    return pedir<DocumentoChofer>(
      supabase.from('driver_documents')
        .upsert({ driver_id: driverId, kind: tipo, file_path: ruta, status: 'uploaded', reviewer_note: null }, { onConflict: 'driver_id,kind' })
        .select().single(),
    );
  },

  // ── Escuelas ──
  escuelas: () =>
    pedir<Escuela[]>(supabase.from('schools').select('*, address:addresses(*)').is('archived_at', null).order('entry_time')),

  /** Guarda la escuela junto con la dirección de su portón. */
  async guardarEscuela(
    driverId: string,
    e: Pick<Escuela, 'name' | 'short_name' | 'color' | 'entry_time' | 'exit_time' | 'gate_reference'> & { id?: string; address_id?: string | null },
    dir: Pick<Direccion, 'main_street' | 'cross_street' | 'latitude' | 'longitude'>,
  ) {
    const datosDir = { driver_id: driverId, student_id: null, label: e.name, kind: 'school' as const, reference: e.gate_reference, ...dir };
    const direccion = e.address_id
      ? await pedir<Direccion>(supabase.from('addresses').update(datosDir).eq('id', e.address_id).select().single())
      : await pedir<Direccion>(supabase.from('addresses').insert(datosDir).select().single());
    const { id, ...resto } = e;
    const datos = { ...resto, driver_id: driverId, address_id: direccion.id };
    return id
      ? pedir<Escuela>(supabase.from('schools').update(datos).eq('id', id).select().single())
      : pedir<Escuela>(supabase.from('schools').insert(datos).select().single());
  },

  archivarEscuela: (id: string) =>
    pedir<null>(supabase.from('schools').update({ archived_at: new Date().toISOString() }).eq('id', id)),

  // ── Estudiantes ──
  estudiantes: () =>
    pedir<EstudianteLista[]>(
      supabase.from('students')
        .select('*, school:schools(*), guardians:student_guardians(user_id), invitations(id, expires_at, redeemed_at)')
        .order('first_name'),
    ),

  async fichaEstudiante(id: string) {
    const [estudiante, direcciones, excepciones, representantes, invitaciones, rutas] = await Promise.all([
      pedir<Estudiante>(supabase.from('students').select('*, school:schools(*)').eq('id', id).single()),
      pedir<Direccion[]>(supabase.from('addresses').select('*').eq('student_id', id).order('created_at')),
      pedir<ExcepcionDireccion[]>(supabase.from('student_address_schedule').select('*').eq('student_id', id)),
      pedir<Representante[]>(
        supabase.from('student_guardians').select('*, user:users(id, first_name, last_name, phone, photo_url)').eq('student_id', id).order('is_primary', { ascending: false }),
      ),
      pedir<Invitacion[]>(supabase.from('invitations').select('*').eq('student_id', id).order('created_at', { ascending: false })),
      pedir<{ route: Ruta | null }[]>(supabase.from('route_stops').select('route:routes(*)').eq('student_id', id)),
    ]);
    return { estudiante, direcciones, excepciones, representantes, invitaciones, rutas: rutas.map((r) => r.route).filter(Boolean) as Ruta[] };
  },

  guardarEstudiante: (
    e: Partial<Pick<Estudiante, 'first_name' | 'last_name' | 'nickname' | 'birth_date' | 'school_id' | 'grade' | 'notes' | 'photo_path' | 'default_pickup_address_id' | 'default_dropoff_address_id' | 'monthly_fee'>> & { id?: string; driver_id: string },
  ) => {
    const { id, ...resto } = e;
    return id
      ? pedir<Estudiante>(supabase.from('students').update(resto).eq('id', id).select().single())
      : pedir<Estudiante>(supabase.from('students').insert(resto).select().single());
  },

  /** Borra al estudiante con sus paradas, direcciones e invitaciones. */
  eliminarEstudiante: (id: string) => pedir<null>(supabase.from('students').delete().eq('id', id)),

  guardarDireccion: (d: DireccionNueva) => {
    const { id, ...resto } = d;
    return id
      ? pedir<Direccion>(supabase.from('addresses').update(resto).eq('id', id).select().single())
      : pedir<Direccion>(supabase.from('addresses').insert(resto).select().single());
  },

  eliminarDireccion: (id: string) => pedir<null>(supabase.from('addresses').delete().eq('id', id)),

  quitarRepresentante: (studentId: string, userId: string) =>
    pedir<null>(supabase.from('student_guardians').delete().eq('student_id', studentId).eq('user_id', userId)),

  // ── Invitaciones ──
  invitaciones: (studentId: string) =>
    pedir<Invitacion[]>(supabase.from('invitations').select('*').eq('student_id', studentId).order('created_at', { ascending: false })),

  /** Genera un código BSL-XXXX-XXXX válido 48 horas y de un solo uso. */
  crearInvitacion: (studentId: string, d: { nombre?: string; celular?: string | null; parentesco?: string; principal?: boolean } = {}) =>
    pedir<Invitacion>(
      supabase.rpc('crear_invitacion', {
        p_student: studentId, p_name: d.nombre ?? null, p_phone: d.celular ?? null,
        p_relationship: d.parentesco ?? 'Representante', p_primary: d.principal ?? false,
      }),
    ),

  // ── Rutas y paradas ──
  rutas: () =>
    pedir<RutaLista[]>(
      supabase.from('routes')
        .select('*, stops:route_stops(id, kind, student_id, school:schools(id, short_name, color, entry_time, exit_time))')
        .order('departure_time'),
    ),

  ruta: (id: string) => pedir<Ruta>(supabase.from('routes').select('*').eq('id', id).single()),

  guardarRuta: (r: Pick<Ruta, 'name' | 'color' | 'direction' | 'departure_time' | 'days_of_week'> & { id?: string; driver_id: string; polyline?: Ruta['polyline'] }) => {
    const { id, ...resto } = r;
    return id
      ? pedir<Ruta>(supabase.from('routes').update(resto).eq('id', id).select().single())
      : pedir<Ruta>(supabase.from('routes').insert(resto).select().single());
  },

  guardarTrazado: (id: string, polyline: Ruta['polyline']) => pedir<null>(supabase.from('routes').update({ polyline }).eq('id', id)),

  eliminarRuta: (id: string) => pedir<null>(supabase.from('routes').delete().eq('id', id)),

  /** Paradas con su dirección del día y los ausentes marcados. */
  paradas: (routeId: string, fecha?: string) =>
    pedir<Parada[]>(supabase.rpc('paradas_de_ruta', { p_route: routeId, ...(fecha ? { p_date: fecha } : {}) })),

  /** Reemplaza todas las paradas (1 a 50) y avisa a los representantes de la ruta. */
  guardarParadas: (routeId: string, paradas: ParadaBorrador[]) =>
    pedir<number>(supabase.rpc('guardar_paradas', { p_route: routeId, p_stops: paradas })),

  // ── Cancelar el servicio de un día ──
  async cancelarServicio(rutas: string[], fecha: string, motivo: string) {
    return pedir<Cancelacion[]>(
      supabase.from('route_cancellations')
        .upsert(rutas.map((route_id) => ({ route_id, date: fecha, reason: motivo })), { onConflict: 'route_id,date', ignoreDuplicates: true })
        .select(),
    );
  },

  deshacerCancelacion: (id: string) => pedir<null>(supabase.from('route_cancellations').delete().eq('id', id)),

  // ── Sustituto ──
  buscarSustituto: (texto: string) => pedir<ChoferEncontrado[]>(supabase.rpc('buscar_chofer_verificado', { p_q: texto })),

  sustituciones: (driverId: string, desde: string) =>
    pedir<(Sustitucion & { substitute: { first_name: string; last_name: string; photo_url: string | null } | null })[]>(
      supabase.from('driver_substitutions')
        .select('*, substitute:users!driver_substitutions_substitute_id_fkey(first_name, last_name, photo_url)')
        .eq('driver_id', driverId).gte('date', desde).order('date'),
    ),

  /** Pide a otro chofer verificado que conduzca ese día (una solicitud por fecha). */
  solicitarSustituto: (driverId: string, substituteId: string, fecha: string, alcance: AlcanceAusencia) =>
    pedir<Sustitucion>(
      supabase.from('driver_substitutions')
        .upsert({ driver_id: driverId, substitute_id: substituteId, date: fecha, scope: alcance, status: 'requested' }, { onConflict: 'driver_id,date' })
        .select().single(),
    ),

  responderSustitucion: (id: string, aceptar: boolean) =>
    pedir<Sustitucion>(supabase.from('driver_substitutions').update({ status: aceptar ? 'accepted' : 'rejected' }).eq('id', id).select().single()),

  revocarSustitucion: (id: string) =>
    pedir<Sustitucion>(supabase.from('driver_substitutions').update({ status: 'revoked' }).eq('id', id).select().single()),

  // ── Mensajes rápidos ──
  enviarMensaje: (routeId: string, tripId: string | null, senderId: string, texto: string, clave?: string) =>
    pedir<Mensaje>(
      supabase.from('messages').insert({ route_id: routeId, trip_id: tripId, sender_id: senderId, body: texto, template_key: clave ?? null }).select().single(),
    ),

  mensajes: (limite = 40) =>
    pedir<(Mensaje & { route: { name: string } | null })[]>(
      supabase.from('messages').select('*, route:routes(name)').order('created_at', { ascending: false }).limit(limite),
    ),

  // ── Pagos (registro manual) ──
  pagos: (periodo: string) => pedir<Pago[]>(supabase.from('payments').select('*').eq('period', periodo)),

  marcarPago: (driverId: string, studentId: string, periodo: string, pagado: boolean, monto: number) =>
    pedir<Pago>(
      supabase.from('payments')
        .upsert(
          { driver_id: driverId, student_id: studentId, period: periodo, amount: monto, status: pagado ? 'paid' : 'pending', paid_at: pagado ? new Date().toISOString() : null },
          { onConflict: 'student_id,period' },
        )
        .select().single(),
    ),

  // ── Historial ──
  historial: (desde: string, hasta: string, sentido?: Sentido) => {
    let q = supabase.from('trips').select('*, route:routes(id, name, direction, color)').gte('date', desde).lte('date', hasta);
    if (sentido) q = q.eq('direction', sentido);
    return pedir<(Viaje & { route: Pick<Ruta, 'id' | 'name' | 'direction' | 'color'> | null })[]>(
      q.order('date', { ascending: false }).order('started_at', { ascending: false }),
    );
  },

  cancelacionesEntre: (desde: string, hasta: string) =>
    pedir<(Cancelacion & { route: { name: string } | null })[]>(
      supabase.from('route_cancellations').select('*, route:routes(name)').gte('date', desde).lte('date', hasta).order('date', { ascending: false }),
    ),
};

export const MENSAJES_FIJOS = [
  { clave: 'outside', texto: 'Ya estoy afuera' },
  { clave: 'small_delay', texto: 'Pequeño retraso' },
  { clave: 'arrived', texto: 'Llegamos' },
] as const;

export const MOTIVOS_CANCELACION = ['Mantenimiento', 'Enfermedad', 'Feriado', 'Otro'] as const;
export const MOTIVOS_AUSENCIA = ['Cita médica', 'Enfermedad', 'Viaje', 'Otro'] as const;
