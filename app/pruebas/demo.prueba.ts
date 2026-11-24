// Prueba del modo demostración: ejecuta los servicios reales de la app contra los datos quemados
// y deja que la buseta simulada complete un recorrido. Uso: npm run probar:demo
import { modoDemo, supabase } from '../src/config/supabase';
import { chofer } from '../src/servicios/chofer';
import { representante } from '../src/servicios/representante';
import { transmision, trazar, viaje } from '../src/servicios/viaje';
import { demo, servidorDemo } from '../src/demo/cliente';
import { ID } from '../src/demo/datos';
import { ritmo, simulador } from '../src/demo/simulador';
import { distanciaM, hoyISO, sumarDias } from '../src/utils';
import type { Aviso, Coordenada, PosicionViaje } from '../src/tipos';

let fallos = 0;
function espera(ok: unknown, texto: string) {
  if (ok) console.log('ok   ' + texto);
  else {
    fallos++;
    console.log('FALLO ' + texto);
  }
}
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function hasta(cond: () => boolean, ms: number) {
  const fin = Date.now() + ms;
  while (!cond() && Date.now() < fin) await dormir(20);
  return cond();
}
const entrar = async (email: string) => {
  const { error } = await supabase.auth.signInWithPassword({ email, password: 'Bsl2026demo' });
  if (error) throw new Error(error.message);
};
const estadoViaje = (id: string) => demo.tablas().trips.find((t) => t.id === id)?.status;

async function main() {
  ritmo.ticMs = 4;
  ritmo.metrosPorTic = 90;
  // Sin red en la prueba: el trazado cae a líneas rectas.
  (globalThis as { fetch: unknown }).fetch = async () => {
    throw new Error('Network request failed');
  };

  espera(modoDemo, 'sin .env la app arranca en modo demostración');
  const mal = await supabase.auth.signInWithPassword({ email: 'chofer@bsl.app', password: 'otra' });
  espera(mal.error?.message === 'Invalid login credentials', 'contraseña incorrecta rechazada');

  // ── Chofer ──
  await entrar('chofer@bsl.app');
  const rc = await chofer.resumen();
  espera(rc.totals.students === 6 && rc.routes.length === 2 && rc.driver?.verification_status === 'verified', 'chofer: resumen con 6 estudiantes y 2 rutas');
  const est = await chofer.estudiantes();
  espera(est.length === 6 && est[0].school?.short_name && est.find((e) => e.id === ID.emilia)?.guardians.length === 2, 'chofer: estudiantes con escuela y representantes');
  const rutas = await chofer.rutas();
  espera(rutas.length === 2 && rutas[0].stops.length === 8 && rutas[0].stops.some((s) => s.school?.short_name === 'Los Pinos'), 'chofer: rutas con paradas y escuelas');
  espera((await chofer.escuelas()).every((e) => e.address?.latitude), 'chofer: escuelas con dirección');
  const ficha = await chofer.fichaEstudiante(ID.emilia);
  espera(ficha.direcciones.length === 2 && ficha.representantes[0].user?.first_name === 'María' && ficha.rutas.length === 2 && ficha.excepciones.length === 2, 'chofer: ficha de Emilia completa');
  const paradas = await chofer.paradas(ID.ida);
  espera(paradas.length === 8 && paradas[0].label === 'Casa Jaramillo' && paradas[4].label === 'U.E. San Sebastián' && paradas[0].notes, 'chofer: paradas resueltas con etiqueta y notas');
  const inv = await chofer.crearInvitacion(ID.sofia, { nombre: 'Tía', parentesco: 'Tía' });
  espera(/^BSL-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(inv.code), 'chofer: invitación con formato BSL-XXXX-XXXX');
  const periodo = hoyISO().slice(0, 8) + '01';
  const pago = await chofer.marcarPago(ID.chofer, ID.mateo, periodo, true, 35);
  espera(pago.status === 'paid' && (await chofer.pagos(periodo)).length === 6, 'chofer: marcar pago');
  espera((await chofer.historial(sumarDias(hoyISO(), -10), hoyISO())).length === 3, 'chofer: historial de 3 recorridos');
  espera((await chofer.buscarSustituto('+593 99 555 1212')).length === 1, 'chofer: buscar sustituto por celular');

  // ── Representante: ausencia de Mateo en la vuelta ──
  await entrar('maria@bsl.app');
  let rr = await representante.resumen();
  espera(rr.children.length === 2 && rr.routes.length === 2 && rr.routes[0].driver?.plate === 'LBA-1234' && rr.routes[0].children.length === 2, 'María: resumen con 2 hijos y 2 rutas');
  const pr = (await supabase.rpc('paradas_de_ruta', { p_route: ID.ida })).data as unknown[];
  espera(pr.length === 4, 'María: solo ve sus paradas y las escuelas');
  await representante.guardarAusencia({ student_id: ID.mateo, date: hoyISO(), scope: 'dropoff', reason: 'Cita médica' });
  const fh = await representante.ficha(ID.emilia);
  espera(fh.estudiante.school?.name && fh.direcciones.length === 2 && fh.representantes.length === 2, 'María: ficha de Emilia');
  const hist = await representante.historial(sumarDias(hoyISO(), -90));
  espera(hist.length === 3 && hist.every((v) => v.eventos.every((e) => !e.student_id || [ID.emilia, ID.mateo].includes(e.student_id))), 'María: historial sin eventos de otros niños');

  // ── Chofer: inicia la ida y la buseta simulada llega a la primera parada ──
  await entrar('chofer@bsl.app');
  const rc2 = await chofer.resumen();
  espera(rc2.absences.length === 1 && rc2.absences[0].by === 'María', 'chofer: ve la ausencia de Mateo y quién avisó');
  const avisosChofer = (await supabase.from('notifications').select('*')).data as Aviso[];
  espera(avisosChofer.some((a) => a.type === 'absence_received'), 'chofer: recibió el aviso de ausencia');
  const trip = await viaje.iniciar(ID.ida);
  espera(trip.status === 'in_progress' && trip.planned_stops_snapshot.length === 8, 'chofer: recorrido de ida iniciado con 8 paradas');
  const posiciones: PosicionViaje[] = [];
  const cancelar = viaje.suscribir(trip.id, { onPosicion: (p) => posiciones.push(p) });
  espera((await transmision.iniciar(trip.id, false)) === 'primer_plano', 'chofer: transmisión simulada en marcha');
  const casa = trip.planned_stops_snapshot[0];
  const puntoCasa = casa as unknown as Coordenada;
  const cerca = () => {
    const p = simulador.posicion();
    return !!p && distanciaM(p, puntoCasa) < 30;
  };
  const llego = await hasta(cerca, 8000);
  espera(llego && posiciones.length > 5, `la buseta llegó a ${casa.label} y publicó ${posiciones.length} posiciones en vivo`);
  await dormir(100);
  espera(cerca(), 'la buseta espera a que el chofer marque Abordó');
  espera(await viaje.registrar({ trip_id: trip.id, type: 'boarded', student_id: ID.emilia, stop_id: casa.stop_id, payload: { place: casa.label } }), 'chofer: Emilia abordó');
  await viaje.registrar({ trip_id: trip.id, type: 'boarded', student_id: ID.emilia, stop_id: casa.stop_id });
  await viaje.registrar({ trip_id: trip.id, type: 'boarded', student_id: ID.mateo, stop_id: trip.planned_stops_snapshot[1].stop_id, payload: { place: casa.label } });
  espera((await viaje.eventos(trip.id)).filter((e) => e.type === 'boarded').length === 2, 'abordaje idempotente (doble toque no duplica)');
  const msg = await chofer.enviarMensaje(ID.ida, trip.id, ID.chofer, 'Pequeño retraso', 'small_delay');
  espera(msg.recipients === 2, 'mensaje rápido a 2 representantes');
  await viaje.registrar({ trip_id: trip.id, type: 'paused', payload: { reason: 'Combustible' } });
  espera((await viaje.obtener(trip.id)).status === 'paused', 'pausar cambia el estado');
  await viaje.registrar({ trip_id: trip.id, type: 'resumed' });
  cancelar();

  // ── María mira el resto del recorrido: el chofer automático lo completa ──
  const llegados: Aviso[] = [];
  servidorDemo.entrarComo(ID.maria);
  const canal = supabase
    .channel('prueba')
    .on('postgres_changes' as never, { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${ID.maria}` }, (c: { new: Aviso }) => llegados.push(c.new))
    .subscribe();
  espera(await hasta(() => estadoViaje(trip.id) === 'finished', 20000), 'el chofer automático completó y finalizó el recorrido');
  await dormir(300);
  const v = await viaje.obtener(trip.id);
  espera(v.summary?.boarded === 6 && v.summary?.delivered === 6 && v.summary.messages[0] === 'Pequeño retraso' && v.summary.pending.length === 0, `resumen del viaje: ${JSON.stringify(v.summary)}`);
  const tipos = ((await supabase.from('notifications').select('*').eq('trip_id', trip.id)).data as Aviso[]).map((a) => a.type);
  espera(['trip_started', 'student_boarded', 'message', 'trip_paused', 'trip_resumed', 'school_arrival', 'trip_finished'].every((t) => tipos.includes(t)), 'María recibió todos los avisos del viaje');
  espera(llegados.some((a) => a.type === 'school_arrival') && llegados.some((a) => a.type === 'trip_finished'), 'los avisos llegan en tiempo real');
  espera((await viaje.eventos(trip.id)).every((e) => !e.student_id || [ID.emilia, ID.mateo].includes(e.student_id)), 'María no ve eventos de otros niños');
  rr = await representante.resumen();
  const ida = rr.routes.find((r) => r.id === ID.ida);
  espera(ida?.trip?.status === 'finished' && ida.children.every((c) => c.status === 'delivered'), 'resumen de María: ida finalizada, ambos hijos entregados');
  espera(rr.routes.find((r) => r.id === ID.vuelta)?.children.find((c) => c.student_id === ID.mateo)?.absent, 'resumen de María: Mateo ausente en la vuelta');
  espera((await viaje.posiciones(trip.id)).length > 50, 'posiciones guardadas para reproducir el recorrido');
  supabase.removeChannel(canal);

  // ── Vuelta simulada completa, como desde el panel Demo (excluye a Mateo) ──
  const vuelta = servidorDemo.como(ID.chofer, () => servidorDemo.iniciarRecorrido(ID.vuelta));
  espera(vuelta.planned_stops_snapshot.length === 7, 'vuelta: 7 paradas, sin Mateo');
  simulador.iniciar(vuelta.id, { trazar });
  espera(await hasta(() => estadoViaje(vuelta.id) === 'finished', 20000), 'vuelta simulada completa');
  const sv = (await viaje.obtener(vuelta.id)).summary;
  espera(sv?.boarded === 5 && sv?.delivered === 5 && sv?.absent === 1, `resumen de la vuelta: ${JSON.stringify(sv)}`);
  const cercaVuelta = ((await supabase.from('notifications').select('*').eq('trip_id', vuelta.id)).data as Aviso[]).filter((a) => a.type === 'bus_near');
  espera(cercaVuelta.length === 1, 'vuelta: un solo aviso "a 1 km" (Emilia)');
  const llegandoVuelta = ((await supabase.from('notifications').select('*').eq('trip_id', vuelta.id)).data as Aviso[]).filter((a) => a.type === 'bus_arriving');
  espera(llegandoVuelta.length === 1, 'vuelta: un solo aviso "a 500 m" (Emilia)');
  espera(new Date(cercaVuelta[0]?.created_at ?? 0) <= new Date(llegandoVuelta[0]?.created_at ?? 0), 'vuelta: primero suena el de 1 km y después el de 500 m');

  // ── Cuentas nuevas: registro, invitación y chofer nuevo ──
  const alta = await supabase.auth.signUp({ email: 'nueva@correo.com', password: 'secreta1', options: { data: { role: 'guardian', first_name: 'Rosa', last_name: 'Vivanco' } } });
  espera(!!alta.data.session, 'registro de representante con sesión inmediata');
  let error = '';
  try {
    await representante.canjearInvitacion('bsl-7k2m-9q4d');
  } catch (e) {
    error = (e as Error).message;
  }
  espera(error.includes('INVITACION_EXPIRADA'), 'código vencido rechazado');
  const vinc = await representante.canjearInvitacion('BSLDEMO2026');
  espera(vinc.first_name === 'Nico' && (await representante.resumen()).children.length === 1, 'invitación BSL-DEMO-2026 vincula a Nicolás');
  await supabase.auth.signUp({ email: 'chofer2@correo.com', password: 'secreta1', options: { data: { role: 'driver', first_name: 'Jorge', last_name: 'Paredes', license_number: '110' } } });
  const yo = demo.usuarioActual() as string;
  const { data: nuevo } = await supabase.from('drivers').update({ plate_number: 'lbc-4410', vehicle_capacity: 12 }).eq('id', yo).select().single();
  espera(nuevo?.plate_number === 'LBC-4410', 'chofer nuevo: placa normalizada');
  const { data: ver } = await supabase.from('drivers').update({ verification_status: 'in_review' }).eq('id', yo).select().single();
  espera(ver?.verification_status === 'verified' && (await chofer.resumen()).routes.length === 0 && (await chofer.estudiantes()).length === 0, 'chofer nuevo: verificado en modo demo y sin datos de otros');

  console.log(fallos === 0 ? '\nTODO EL MODO DEMOSTRACIÓN FUNCIONA' : `\n${fallos} FALLOS`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('ERROR', e);
  process.exit(1);
});
