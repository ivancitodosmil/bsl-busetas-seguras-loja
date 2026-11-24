// Inicio del chofer: recorrido en curso, solicitudes, ausentes y rutas de hoy.
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Bell, CalendarOff, CircleCheck, Play, UserCheck } from 'lucide-react-native';
import {
  Avatar, BannerAlerta, Boton, BotonIcono, ChipEscuela, EsqueletoLista, EstadoError, Pantalla, PasosNumerados, PillEstado,
  Tarjeta, Texto, TituloSeccion, useToast, type Estado,
} from '../../ui';
import { esp, fuentes, useTema } from '../../tema';
import { chofer } from '../../servicios/chofer';
import { transmision, viaje } from '../../servicios/viaje';
import { useSesion } from '../../estado/sesion';
import { useSinLeer } from '../../estado/avisos';
import type { NavChofer } from '../../navegacion/tipos';
import type { ResumenChofer, RutaChofer, SolicitudSustituto } from '../../tipos';
import { diaRelativo, fechaLarga, hora, mensajeError, textoAlcance, textoSentido } from '../../utils';
import { useCarga } from './_c1Partes';

export default function Inicio() {
  const nav = useNavigation<NavChofer>();
  const { c } = useTema();
  const toast = useToast();
  const usuario = useSesion((s) => s.usuario);
  const sinLeer = useSinLeer();
  const { datos, cargando, refrescando, error, recargar, refrescar } = useCarga<ResumenChofer>(() => chofer.resumen());
  const [ocupado, setOcupado] = useState<string | null>(null);

  useEffect(() => viaje.suscribirCambiosDelDia(() => recargar()), [recargar]);

  const verificado = datos?.driver?.verification_status === 'verified';
  const rutasHoy = (datos?.routes ?? []).filter((r) => r.runs_today);
  const rutaEnCurso = datos?.routes.find((r) => r.trip && r.trip.id === datos.active_trip_id);
  const canceladas = rutasHoy.filter((r) => r.cancellation);

  async function responder(s: SolicitudSustituto, aceptar: boolean) {
    setOcupado(s.id);
    try {
      await chofer.responderSustitucion(s.id, aceptar);
      toast.mostrar(aceptar ? 'Aceptaste. Los representantes ya fueron avisados.' : 'Solicitud rechazada.', { tipo: aceptar ? 'exito' : 'info' });
      await recargar();
    } catch (e) {
      toast.mostrar(mensajeError(e), { tipo: 'error' });
    } finally {
      setOcupado(null);
    }
  }

  async function deshacerCancelaciones() {
    try {
      await Promise.all(canceladas.map((r) => chofer.deshacerCancelacion(r.cancellation!.id)));
      toast.mostrar('El servicio de hoy vuelve a estar activo.', { tipo: 'exito' });
      await recargar();
    } catch (e) {
      toast.mostrar(mensajeError(e), { tipo: 'error' });
    }
  }

  async function iniciar(r: RutaChofer) {
    const p = await transmision.permisos();
    if (!p.primerPlano) nav.navigate('PermisoUbicacion', { routeId: r.id });
    else nav.navigate('IniciarRecorrido', { routeId: r.id });
  }

  function empezar() {
    if (!datos) return;
    if ((datos.driver?.schools ?? 0) === 0) nav.navigate('Escuelas');
    else if (datos.totals.students === 0) nav.navigate('EditarEstudiante');
    else nav.navigate('EditarRuta');
  }

  const bannerCuenta = () => {
    const e = datos?.driver?.verification_status;
    if (!e || e === 'verified') return null;
    const t = e === 'in_review'
      ? { titulo: 'Tu cuenta está en revisión', texto: 'Prepara todo. Podrás iniciar recorridos al ser verificado.', tipo: 'info' as const }
      : e === 'rejected'
        ? { titulo: 'Necesitamos un cambio', texto: datos?.driver?.reviewer_note ?? 'Revisa tus documentos y vuelve a enviarlos.', tipo: 'urgente' as const }
        : { titulo: 'Faltan documentos', texto: 'Súbelos para enviar tu cuenta a revisión.', tipo: 'aviso' as const };
    return <BannerAlerta tipo={t.tipo} titulo={t.titulo} texto={t.texto} accion="Ver" onAccion={() => nav.navigate('EstadoCuenta')} />;
  };

  const conCifras = !!datos && (datos.routes.length > 0 || datos.totals.students > 0);

  return (
    <Pantalla
      marino
      solape={conCifras ? 44 : 0}
      titulo={usuario?.first_name ? `Hola, ${usuario.first_name.split(' ')[0]}` : 'Hola'}
      sobretitulo={fechaLarga()}
      conBarra
      refrescando={refrescando}
      onRefrescar={refrescar}
      derecha={<BotonIcono icono={Bell} etiqueta="Avisos" sobreHero contador={sinLeer} onPress={() => nav.navigate('AvisosChofer')} />}
    >
      {cargando && !datos ? (
        <EsqueletoLista filas={3} />
      ) : error && !datos ? (
        <Tarjeta><EstadoError texto={mensajeError(error)} onReintentar={refrescar} onSoporte={() => nav.navigate('Soporte')} /></Tarjeta>
      ) : datos ? (
        <>
          {conCifras ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {([
                [datos.totals.students, 'estudiantes', false],
                [datos.totals.absent, 'no van hoy', datos.totals.absent > 0],
                [rutasHoy.length, 'rutas hoy', false],
              ] as const).map(([n, etiqueta, resaltar]) => (
                <Tarjeta key={etiqueta} elevacion={2} estilo={{ flex: 1, padding: 12 }}>
                  <View accessible accessibilityLabel={`${n} ${etiqueta}`}>
                    <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fuentes.titulo, fontSize: 26, lineHeight: 32, color: resaltar ? c.warning : c.text, fontVariant: ['tabular-nums'] }}>{n}</Text>
                    <Texto v="nota" color="text3" numberOfLines={1} style={{ fontFamily: fuentes.medio }}>{etiqueta}</Texto>
                  </View>
                </Tarjeta>
              ))}
            </View>
          ) : null}

          {rutaEnCurso ? (
            <Tarjeta elevacion={2} estilo={{ gap: esp.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Texto v="seccion" style={{ fontFamily: fuentes.titulo }}>{rutaEnCurso.name}</Texto>
                  <Texto v="nota" color="text3" style={{ fontFamily: fuentes.medio }}>Salió a las {hora(rutaEnCurso.trip!.started_at)}, {rutaEnCurso.active_stops} paradas activas</Texto>
                </View>
                <PillEstado estado={rutaEnCurso.trip!.status === 'paused' ? 'en_pausa' : 'en_curso'} />
              </View>
              <Boton titulo="Continuar recorrido" variante="acento" icono={Play} tamano="conduccion" estilo={{ height: 58 }} onPress={() => nav.navigate('RutaActiva', { tripId: rutaEnCurso.trip!.id })} />
            </Tarjeta>
          ) : null}

          {datos.substitution_requests.map((s) =>
            s.status === 'requested' ? (
              <Tarjeta key={s.id} elevacion={rutaEnCurso ? 1 : 2} estilo={{ gap: esp.md }}>
                <Texto v="nota" color="warningInk" style={{ fontFamily: 'Inter_700Bold' }}>Solicitud de sustituto</Texto>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <Avatar nombre={s.driver?.name} foto={s.driver?.photo_url} tam={44} />
                  <View style={{ flex: 1 }}>
                    <Texto v="fuerte">{s.driver?.name ?? 'Un chofer'} te pide conducir</Texto>
                    <Texto v="medio" color="text2">
                      {s.routes.map((r) => `${r.name} ${r.departure_time}`).join(', ') || 'Sus rutas'}
                    </Texto>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', backgroundColor: c.surface2, borderRadius: 12, paddingVertical: 10 }}>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Texto v="seccion">{diaRelativo(s.date)}</Texto>
                    <Texto v="nota" color="text2">fecha</Texto>
                  </View>
                  <View style={{ width: 1, backgroundColor: c.border }} />
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Texto v="seccion">{s.students}</Texto>
                    <Texto v="nota" color="text2">estudiantes</Texto>
                  </View>
                  <View style={{ width: 1, backgroundColor: c.border }} />
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Texto v="seccion">{s.scope === 'all' ? 'Ida y vuelta' : textoAlcance(s.scope)}</Texto>
                    <Texto v="nota" color="text2">recorridos</Texto>
                  </View>
                </View>
                <Texto v="nota" color="text2">Ese día verás la ruta en tu Inicio con las paradas, las direcciones con referencia y las notas de cada niño.</Texto>
                <View style={{ flexDirection: 'row', gap: esp.sm }}>
                  <Boton titulo="Rechazar" variante="secundario" estilo={{ flex: 1 }} deshabilitado={ocupado === s.id} onPress={() => responder(s, false)} />
                  <Boton titulo="Aceptar" estilo={{ flex: 1 }} cargando={ocupado === s.id} onPress={() => responder(s, true)} />
                </View>
              </Tarjeta>
            ) : (
              <BannerAlerta key={s.id} tipo="info" icono={UserCheck} titulo={`Conduces las rutas de ${s.driver?.name ?? 'otro chofer'} ${diaRelativo(s.date)}`} texto="Aparecen en tus rutas de ese día. Las inicias como si fueran tuyas." />
            ),
          )}

          {bannerCuenta()}

          {canceladas.length > 0 ? (
            <BannerAlerta
              tipo="urgente"
              icono={CalendarOff}
              titulo={canceladas.length === rutasHoy.length ? 'Servicio cancelado hoy' : `${canceladas.map((r) => r.name).join(', ')}: cancelado hoy`}
              texto={`${canceladas[0].cancellation!.reason}, los representantes ya fueron avisados`}
              accion="Deshacer"
              onAccion={deshacerCancelaciones}
            />
          ) : null}

          {datos.absences.length > 0 ? (
            <View style={{ gap: esp.sm }}>
              <TituloSeccion titulo="Ausentes hoy" />
              <Tarjeta estilo={{ paddingVertical: 4 }}>
                {datos.absences.map((a, i) => (
                  <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.border }}>
                    <Avatar nombre={a.name} color={a.school_color} tam={40} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Texto v="fuerte" color="text2" style={{ textDecorationLine: 'line-through' }}>{a.name}</Texto>
                      <Texto v="nota" color="text2">
                        {[textoAlcance(a.scope), a.reason, a.by ? `avisó ${a.by}` : null].filter(Boolean).join(', ')}
                      </Texto>
                    </View>
                    <ChipEscuela nombre={a.school_short} color={a.school_color} />
                  </View>
                ))}
              </Tarjeta>
            </View>
          ) : null}

          {datos.routes.length === 0 ? (
            <Tarjeta estilo={{ gap: esp.lg }}>
              <View style={{ gap: 4 }}>
                <Texto v="subtitulo">Aún no tienes rutas</Texto>
                <Texto v="medio" color="text2">Arma tu primera ruta en tres pasos.</Texto>
              </View>
              <PasosNumerados
                pasos={[
                  { texto: 'Registra las escuelas', hecho: (datos.driver?.schools ?? 0) > 0 },
                  { texto: 'Agrega a tus estudiantes', hecho: datos.totals.students > 0 },
                  { texto: 'Crea la ruta y ordena las paradas' },
                ]}
              />
              <Boton titulo="Empezar" onPress={empezar} />
            </Tarjeta>
          ) : (
            <View style={{ gap: esp.sm }}>
              <TituloSeccion titulo="Rutas de hoy" accion="Ver todas" onAccion={() => nav.navigate('Pestanas', { screen: 'Rutas' })} />
              {rutasHoy.length === 0 ? (
                <Tarjeta><Texto v="medio" color="text2">Hoy no tienes recorridos programados.</Texto></Tarjeta>
              ) : (
                rutasHoy.map((r) => (
                  <TarjetaRuta
                    key={r.id}
                    r={r}
                    verificado={verificado}
                    hayOtroEnCurso={!!datos.active_trip_id}
                    onIniciar={() => iniciar(r)}
                    onContinuar={() => r.trip && nav.navigate('RutaActiva', { tripId: r.trip.id })}
                    onResumen={() => r.trip && nav.navigate('Resumen', { tripId: r.trip.id })}
                  />
                ))
              )}
            </View>
          )}

          {datos.routes.length > 0 ? (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 4, paddingVertical: 4 }}>
              {verificado ? <CircleCheck size={16} color={c.success} strokeWidth={2.2} /> : null}
              <Texto v="nota" color="text3" style={{ flex: 1, fontFamily: fuentes.medio }}>
                {verificado ? 'Cuenta verificada. ' : ''}Tu ubicación solo se comparte durante el recorrido.
              </Texto>
            </View>
          ) : null}
        </>
      ) : null}
    </Pantalla>
  );
}

function TarjetaRuta({
  r, verificado, hayOtroEnCurso, onIniciar, onContinuar, onResumen,
}: { r: RutaChofer; verificado: boolean; hayOtroEnCurso: boolean; onIniciar: () => void; onContinuar: () => void; onResumen: () => void }) {
  const { c } = useTema();
  const estado: Estado = r.cancellation
    ? 'cancelado'
    : !r.trip ? 'programado' : r.trip.status === 'finished' ? 'finalizado' : r.trip.status === 'paused' ? 'en_pausa' : 'en_curso';
  const finalizado = estado === 'finalizado';
  const textoPill: Partial<Record<Estado, string>> = { programado: 'Programada', finalizado: 'Finalizada', cancelado: 'Cancelada' };
  return (
    <Tarjeta elevacion={2} onPress={finalizado ? onResumen : undefined} etiqueta={finalizado ? `${r.name}, finalizada. Ver resumen` : undefined} estilo={{ gap: esp.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Texto v="seccion" style={{ fontFamily: fuentes.titulo }}>{r.name}</Texto>
          <Texto v="nota" color="text3" style={{ fontFamily: fuentes.medio }}>
            Sale a las {r.departure_time}, {r.active_stops} {r.active_stops === 1 ? 'parada' : 'paradas'}
          </Texto>
          {!r.own && r.titular ? <Texto v="nota" color="accentInk">Ruta de {r.titular}, {textoSentido(r.direction)}</Texto> : null}
          {r.own && r.substitute ? (
            <Texto v="nota" color="accentInk">
              {r.substitute.status === 'accepted' ? `Hoy conduce ${r.substitute.name}` : `Sustituto pendiente: ${r.substitute.name}`}
            </Texto>
          ) : null}
        </View>
        <PillEstado estado={estado} texto={textoPill[estado]} />
      </View>
      {r.schools.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {r.schools.map((s) => <ChipEscuela key={s.id} nombre={`${s.short_name} ${s.time}`} color={s.color} />)}
        </View>
      ) : null}
      {estado === 'programado' ? (
        r.own && r.substitute?.status === 'accepted' ? (
          <Texto v="medio" color="text2">La inicia tu sustituto.</Texto>
        ) : !verificado ? (
          <Texto v="medio" color="text2">Podrás iniciar al ser verificado.</Texto>
        ) : r.stops === 0 ? (
          <Texto v="medio" color="text2">Agrega paradas para poder iniciar.</Texto>
        ) : hayOtroEnCurso ? (
          <Texto v="medio" color="text2">Finaliza el recorrido en curso para iniciar este.</Texto>
        ) : (
          <Boton titulo="Iniciar recorrido" variante="acento" icono={Play} tamano="conduccion" estilo={{ height: 58 }} onPress={onIniciar} />
        )
      ) : estado === 'en_curso' || estado === 'en_pausa' ? (
        <Boton titulo="Continuar recorrido" variante="acento" icono={Play} tamano="conduccion" estilo={{ height: 58 }} onPress={onContinuar} />
      ) : finalizado ? (
        <Texto v="medioFuerte" color="successInk">Finalizada a las {hora(r.trip!.finished_at)}. Toca para ver el resumen</Texto>
      ) : (
        <Texto v="medio" color="text2">Cancelado hoy, {r.cancellation!.reason}</Texto>
      )}
    </Tarjeta>
  );
}
