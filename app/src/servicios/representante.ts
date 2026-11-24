// Datos del representante: resumen del día, vínculos, ausencias, direcciones, historial y preferencias.
import { pedir, supabase } from '../config/supabase';
import type {
  AlcanceAusencia, Ausencia, Cancelacion, Direccion, DireccionNueva, Estudiante, EventoViaje, ExcepcionDireccion,
  PreferenciaAvisos, Representante, ResumenRepresentante, Ruta, Viaje, VinculoCreado,
} from '../tipos';

export const representante = {
  /** Hijos, rutas del día, estado de cada niño, chofer, sustituto y cancelaciones. */
  resumen: (fecha?: string) =>
    pedir<ResumenRepresentante>(supabase.rpc('resumen_representante', fecha ? { p_date: fecha } : {})),

  /** Vincula a un hijo con el código BSL-XXXX-XXXX (o el contenido de un QR o enlace). */
  canjearInvitacion: (codigo: string) =>
    pedir<VinculoCreado>(supabase.rpc('canjear_invitacion', { p_code: extraerCodigo(codigo) })),

  // ── Ausencias ──
  ausencias: (ids: string[], desde: string, hasta: string) =>
    pedir<Ausencia[]>(supabase.from('absences').select('*').in('student_id', ids).gte('date', desde).lte('date', hasta).order('date')),

  /** Crea o cambia la ausencia de ese día (una por niño y fecha). */
  guardarAusencia: (a: { student_id: string; date: string; scope: AlcanceAusencia; reason?: string | null }) =>
    pedir<Ausencia>(
      supabase.from('absences').upsert({ ...a, reason: a.reason || null }, { onConflict: 'student_id,date' }).select().single(),
    ),

  quitarAusencia: (id: string) => pedir<null>(supabase.from('absences').delete().eq('id', id)),

  cancelaciones: (rutas: string[], desde: string, hasta: string) =>
    rutas.length === 0
      ? Promise.resolve([] as Cancelacion[])
      : pedir<Cancelacion[]>(supabase.from('route_cancellations').select('*').in('route_id', rutas).gte('date', desde).lte('date', hasta)),

  // ── Ficha del hijo ──
  async ficha(studentId: string) {
    const [estudiante, direcciones, excepciones, representantes, rutas] = await Promise.all([
      pedir<Estudiante>(supabase.from('students').select('*, school:schools(*)').eq('id', studentId).single()),
      pedir<Direccion[]>(supabase.from('addresses').select('*').eq('student_id', studentId).order('created_at')),
      pedir<ExcepcionDireccion[]>(supabase.from('student_address_schedule').select('*').eq('student_id', studentId)),
      pedir<Representante[]>(
        supabase.from('student_guardians').select('*, user:users(id, first_name, last_name, phone, photo_url)').eq('student_id', studentId).order('is_primary', { ascending: false }),
      ),
      pedir<{ route: Ruta | null }[]>(supabase.from('route_stops').select('route:routes(*)').eq('student_id', studentId)),
    ]);
    return { estudiante, direcciones, excepciones, representantes, rutas: rutas.map((r) => r.route).filter(Boolean) as Ruta[] };
  },

  guardarDireccion: (d: DireccionNueva) => {
    const { id, ...resto } = d;
    return id
      ? pedir<Direccion>(supabase.from('addresses').update(resto).eq('id', id).select().single())
      : pedir<Direccion>(supabase.from('addresses').insert(resto).select().single());
  },

  eliminarDireccion: (id: string) => pedir<null>(supabase.from('addresses').delete().eq('id', id)),

  /** El representante elige qué dirección es la casa del niño (recoger, dejar o ambas). Actualiza su parada en la ruta del chofer. */
  fijarCasa: (studentId: string, addressId: string, sentido: 'pickup' | 'dropoff' | 'both' = 'both') =>
    pedir<null>(supabase.rpc('fijar_casa', { p_student: studentId, p_address: addressId, p_sentido: sentido })),

  /** Reemplaza las excepciones por día de un niño ("martes y jueves donde los abuelos"). */
  async guardarExcepciones(studentId: string, lista: Omit<ExcepcionDireccion, 'student_id'>[]) {
    await pedir(supabase.from('student_address_schedule').delete().eq('student_id', studentId));
    if (lista.length > 0) {
      await pedir(supabase.from('student_address_schedule').insert(lista.map((e) => ({ ...e, student_id: studentId }))));
    }
  },

  // ── Historial (90 días) ──
  /** Recorridos terminados desde una fecha, con los eventos visibles para este representante. */
  async historial(desde: string) {
    const viajes = await pedir<(Viaje & { route: Pick<Ruta, 'id' | 'name' | 'direction' | 'color'> | null })[]>(
      supabase.from('trips').select('*, route:routes(id, name, direction, color)').gte('date', desde).order('date', { ascending: false }).order('started_at', { ascending: false }),
    );
    if (viajes.length === 0) return [];
    const eventos = await pedir<EventoViaje[]>(
      supabase.from('trip_events').select('*').in('trip_id', viajes.map((v) => v.id)).order('created_at'),
    );
    return viajes.map((v) => ({ ...v, eventos: eventos.filter((e) => e.trip_id === v.id) }));
  },

  // ── Preferencias de avisos (en el servidor: valen en todos los dispositivos) ──
  preferencias: (userId: string) =>
    pedir<PreferenciaAvisos[]>(supabase.from('notification_preferences').select('*').eq('user_id', userId)),

  async guardarPreferencia(p: PreferenciaAvisos) {
    const existentes = await pedir<PreferenciaAvisos[]>(
      p.student_id
        ? supabase.from('notification_preferences').select('*').eq('user_id', p.user_id).eq('student_id', p.student_id)
        : supabase.from('notification_preferences').select('*').eq('user_id', p.user_id).is('student_id', null),
    );
    const { id: _id, ...datos } = p;
    return existentes[0]?.id
      ? pedir<PreferenciaAvisos>(supabase.from('notification_preferences').update(datos).eq('id', existentes[0].id).select().single())
      : pedir<PreferenciaAvisos>(supabase.from('notification_preferences').insert(datos).select().single());
  },

  /** El representante deja de estar vinculado a un hijo. */
  desvincular: (studentId: string, userId: string) =>
    pedir<null>(supabase.from('student_guardians').delete().eq('student_id', studentId).eq('user_id', userId)),
};

/** Acepta "bsl-9h4t-6l2m", "BSL9H4T6L2M", un enlace bsl.app/i/9H4T6L2M o bsl://i/…; devuelve BSL-XXXX-XXXX. */
export function extraerCodigo(texto: string): string {
  const limpio = texto.trim().toUpperCase();
  const enlace = limpio.match(/\/I\/([A-Z0-9-]{8,13})/);
  let cuerpo = (enlace ? enlace[1] : limpio).replace(/[^A-Z0-9]/g, '');
  if (cuerpo.startsWith('BSL')) cuerpo = cuerpo.slice(3);
  return cuerpo.length === 8 ? `BSL-${cuerpo.slice(0, 4)}-${cuerpo.slice(4)}` : limpio;
}

/** Da formato mientras se escribe: "bsl9h4t" → "BSL-9H4T". */
export function formatearCodigo(texto: string): string {
  let cuerpo = texto.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cuerpo.startsWith('BSL')) cuerpo = cuerpo.slice(3);
  cuerpo = cuerpo.slice(0, 8);
  if (cuerpo.length === 0) return texto.toUpperCase().startsWith('B') ? texto.toUpperCase().slice(0, 3) : '';
  return `BSL-${cuerpo.slice(0, 4)}${cuerpo.length > 4 ? '-' + cuerpo.slice(4) : ''}`;
}
