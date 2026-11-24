// Rastreo en vivo: la buseta, mi parada y el estado de mis hijos.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Bell, Clock, ListChecks, MessageCircle, Phone, Users, type LucideIcon } from 'lucide-react-native';
import { pedir, supabase } from '../../config/supabase';
import type { NavRep, PestanasRep } from '../../navegacion/tipos';
import { viaje } from '../../servicios/viaje';
import { esp, fuentes, margen, radio, sombra, useTema } from '../../tema';
import type { Coordenada, Parada, RutaRepresentante } from '../../tipos';
import {
  ALTO_BARRA, Avatar, BannerAlerta, Boton, ChipEscuela, Esqueleto, EstadoError, EstadoVacio, MapaRecorrido, PillEstado, SelectorHijo, Texto,
  useToast,
} from '../../ui';
import { distanciaM, distanciaTexto, hhmm, hora } from '../../utils';
import { colorDe, colorTono, conductorDe, estadoNino, opcionesHijos, useResumen } from './_partes';

/** Alarmas dentro del mapa, de la más lejana a la más cercana. Cada una suena una sola vez por viaje. */
const ALARMAS = [
  { metros: 1000, clave: '1km', titulo: 'La buseta está a menos de 1 km', prepara: 'Prepara a', luego: ' Te avisamos otra vez a 500 m.' },
  { metros: 500, clave: '500m', titulo: 'La buseta está a menos de 500 m', prepara: 'Sal con', luego: '' },
] as const;
type Alarma = (typeof ALARMAS)[number];

/** La ruta que conviene mostrar: en curso, si no la próxima sin terminar, si no la última. */
function elegirRuta(rutas: RutaRepresentante[], hijo: string | null): RutaRepresentante | null {
  const mias = rutas.filter((r) => r.runs_today && r.children.some((n) => !hijo || n.student_id === hijo));
  return (
    mias.find((r) => r.trip && r.trip.status !== 'finished') ??
    mias.find((r) => !r.trip && !r.cancellation) ??
    mias[mias.length - 1] ??
    rutas.find((r) => r.children.some((n) => !hijo || n.student_id === hijo)) ??
    null
  );
}

export default function Mapa() {
  const { c, oscuro } = useTema();
  const ins = useSafeAreaInsets();
  const nav = useNavigation<NavRep>();
  const toast = useToast();
  const params = useRoute<RouteProp<PestanasRep, 'Mapa'>>().params;
  const { datos, cargando, error, recargar } = useResumen(true);
  const [hijoSel, setHijoSel] = useState<string | null>(params?.studentId ?? null);
  const [paradas, setParadas] = useState<Parada[]>([]);
  const [buseta, setBuseta] = useState<(Coordenada & { cuando: string }) | null>(null);
  const [alarma, setAlarma] = useState<Alarma | null>(null);
  const alarmasRevisadas = useRef(new Set<string>());

  useEffect(() => {
    if (params?.studentId) setHijoSel(params.studentId);
  }, [params?.studentId]);

  const hijos = datos?.children ?? [];
  const porId = useMemo(() => Object.fromEntries(hijos.map((h, i) => [h.id, { h, i }])), [hijos]);
  const ruta = useMemo(() => elegirRuta(datos?.routes ?? [], hijoSel), [datos, hijoSel]);
  const tripId = ruta?.trip?.id ?? null;
  const enVivo = !!ruta?.trip && ruta.trip.status !== 'finished';
  const ninos = useMemo(() => (ruta?.children ?? []).filter((n) => !hijoSel || n.student_id === hijoSel), [ruta, hijoSel]);
  const otros = useMemo(
    () => (hijoSel ? [] : hijos.filter((h) => ruta && !ruta.children.some((n) => n.student_id === h.id))),
    [hijos, ruta, hijoSel],
  );

  // Paradas de la ruta (el servidor solo devuelve escuelas y las casas de mis hijos).
  const rutaId = ruta?.id;
  useEffect(() => {
    if (!rutaId) {
      setParadas([]);
      return;
    }
    let vivo = true;
    pedir<Parada[]>(supabase.rpc('paradas_de_ruta', { p_route: rutaId }))
      .then((p) => { if (vivo) setParadas(p ?? []); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [rutaId]);

  // Posición en vivo.
  useFocusEffect(
    useCallback(() => {
      setBuseta(null);
      if (!tripId) return;
      let vivo = true;
      viaje.ultimaPosicion(tripId)
        .then((p) => { if (vivo && p) setBuseta({ latitude: p.latitude, longitude: p.longitude, cuando: p.recorded_at }); })
        .catch(() => {});
      const cancelar = viaje.suscribir(tripId, {
        onPosicion: (p) => setBuseta({ latitude: p.latitude, longitude: p.longitude, cuando: p.recorded_at }),
        onViaje: () => recargar(),
      });
      return () => { vivo = false; cancelar(); };
    }, [tripId, recargar]),
  );

  const misParadas = useMemo(() => paradas.filter((p) => p.student_id && ninos.some((n) => n.student_id === p.student_id)), [paradas, ninos]);
  // Mi parada pendiente: la de un hijo que aún no sube (ida) o que aún no entregan (vuelta).
  const objetivo = useMemo(() => {
    if (!ruta) return null;
    const pendiente = ninos.find((n) => !n.absent && (ruta.direction === 'pickup' ? n.status === 'pending' || n.status === 'near' : n.status !== 'delivered'));
    return pendiente ? misParadas.find((p) => p.student_id === pendiente.student_id && p.latitude != null) ?? null : null;
  }, [ruta, ninos, misParadas]);

  const metros = buseta && objetivo ? distanciaM(buseta, { latitude: objetivo.latitude as number, longitude: objetivo.longitude as number }) : null;

  // Cartel en el mapa a 1 km y a 500 m (la vibración tipo alarma la da AlarmaBuseta con el aviso del servidor). Si la buseta aparece ya a 500 m,
  // suena solo la de 500 m y la de 1 km queda marcada como pasada.
  useEffect(() => {
    if (!tripId || !enVivo || metros == null) return;
    const idx = ALARMAS.reduce((hallada, a, i) => (metros <= a.metros ? i : hallada), -1);
    if (idx < 0) return;
    const etapa = ALARMAS[idx];
    const clave = `bsl_alarma_${tripId}_${etapa.clave}`;
    if (alarmasRevisadas.current.has(clave)) return;
    ALARMAS.slice(0, idx + 1).forEach((a) => alarmasRevisadas.current.add(`bsl_alarma_${tripId}_${a.clave}`));
    AsyncStorage.getItem(clave)
      .then((ya) => {
        if (ya) return;
        ALARMAS.slice(0, idx + 1).forEach((a) => AsyncStorage.setItem(`bsl_alarma_${tripId}_${a.clave}`, '1').catch(() => {}));
        setAlarma(etapa);
      })
      .catch(() => {});
  }, [tripId, enVivo, metros]);

  useEffect(() => { setAlarma(null); }, [tripId]);

  const conductor = ruta ? conductorDe(ruta) : null;
  // La hoja llega hasta detrás de la barra de pestañas (que es opaca): así no queda un hueco de mapa.
  const fondoHoja = ALTO_BARRA + ins.bottom + 8;
  const pausado = ruta?.trip?.status === 'paused';
  const nombresPendientes = ninos.filter((n) => !n.absent).map((n) => porId[n.student_id]?.h.name).filter(Boolean).join(' y ') || 'tu hijo';
  const abrir = (url: string) => Linking.openURL(url).catch(() => toast.mostrar('No se pudo abrir la aplicación', { tipo: 'error' }));

  const chipFlotante = (contenido: React.ReactNode) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 30, paddingHorizontal: 10, borderRadius: 10, backgroundColor: c.surface, flexShrink: 1, ...sombra(c, 2) }}>
      {contenido}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style={oscuro ? 'light' : 'dark'} />

      {cargando && !datos ? (
        <View style={{ flex: 1, padding: margen, paddingTop: ins.top + margen, gap: esp.md }}>
          <Esqueleto alto={280} redondeo={radio.grande} />
          <Esqueleto alto={120} redondeo={radio.grande} />
        </View>
      ) : error && !datos ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EstadoError titulo="No pudimos cargar el mapa" texto="Revisa tu conexión a internet y vuelve a intentar." onReintentar={() => recargar(true)} onSoporte={() => nav.navigate('Soporte')} />
        </View>
      ) : !ruta ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EstadoVacio
            icono={Users}
            titulo={hijos.length === 0 ? 'Vincula a tu hijo' : 'Sin ruta asignada'}
            texto={hijos.length === 0 ? 'Con el código del chofer verás aquí la buseta en vivo.' : 'El chofer aún no agrega a tu hijo a una ruta.'}
            accion={hijos.length === 0 ? 'Vincular con un código' : undefined}
            onAccion={() => nav.navigate('Vincular')}
          />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <MapaRecorrido
            paradas={paradas}
            buseta={enVivo ? buseta : null}
            destacadas={misParadas.map((p) => p.stop_id)}
            color={ruta.color}
            seguir={enVivo}
            redondeado={false}
          />

          {/* Encima del mapa: aviso de 1 km o 500 m, hijos, nombre de la ruta y estado en vivo */}
          <View pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, top: ins.top + 8, gap: 10 }}>
            {alarma ? (
              <View
                accessibilityRole="alert"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.warningSoft, borderRadius: radio.tarjeta, paddingVertical: 10, paddingLeft: 14, paddingRight: 6, ...sombra(c, 2) }}
              >
                <Bell size={20} color={c.warning} strokeWidth={2.2} />
                <View style={{ flex: 1 }}>
                  <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: 'Inter_700Bold', fontSize: 14, lineHeight: 19, color: c.warningInk }}>{alarma.titulo}</Text>
                  <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: fuentes.medio, fontSize: 12.5, lineHeight: 17, color: c.warningInk }}>
                    {`${alarma.prepara} ${nombresPendientes}.${alarma.luego}`}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setAlarma(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Entendido, cerrar el aviso"
                  hitSlop={4}
                  style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 10, justifyContent: 'center', borderRadius: 10, opacity: pressed ? 0.6 : 1 })}
                >
                  <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: 'Inter_700Bold', fontSize: 13.5, color: c.warningInk }}>Entendido</Text>
                </Pressable>
              </View>
            ) : null}
            {error ? <BannerAlerta tipo="aviso" titulo="Sin conexión" texto={buseta ? `Última posición conocida a las ${hora(buseta.cuando)}` : 'Mostramos lo último que cargó.'} /> : null}
            {hijos.length > 1 ? <SelectorHijo hijos={opcionesHijos(hijos)} seleccionado={hijoSel} onSeleccionar={setHijoSel} sobreHero={false} /> : null}
            <View pointerEvents="none" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              {chipFlotante(<Text numberOfLines={1} maxFontSizeMultiplier={1.2} accessibilityRole="header" style={{ fontFamily: fuentes.tituloSuave, fontSize: 13, color: c.text, flexShrink: 1 }}>{ruta.name}</Text>)}
              {enVivo
                ? chipFlotante(
                  <>
                    <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: pausado ? c.warning : c.success }} />
                    <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fuentes.semi, fontSize: 11.5, color: c.text2 }}>{pausado ? 'En pausa' : 'En vivo, cada 5 s'}</Text>
                  </>,
                )
                : null}
            </View>
          </View>

          {/* Hoja inferior */}
          <View
            style={{
              position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: fondoHoja, maxHeight: '62%', backgroundColor: c.surface,
              borderTopLeftRadius: 22, borderTopRightRadius: 22, ...sombra(c, 2),
            }}
          >
            <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 4 }}>
              <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: c.border }} />
            </View>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 6, paddingBottom: 4, gap: esp.md }} showsVerticalScrollIndicator={false}>
              {ruta.cancellation ? (
                <View style={{ gap: 2 }}>
                  <Texto v="seccion">Servicio cancelado hoy</Texto>
                  <Texto v="medio" color="text2">Motivo: {ruta.cancellation.reason.toLowerCase()}.</Texto>
                </View>
              ) : !ruta.trip ? (
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Clock size={20} color={c.primary} strokeWidth={2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Texto v="seccion">El recorrido aún no inicia</Texto>
                    <Texto v="medio" color="text2">Sale a las {hhmm(ruta.departure_time)}. Te avisaremos cuando la buseta salga.</Texto>
                  </View>
                </View>
              ) : ruta.trip.status === 'finished' ? (
                <View style={{ gap: 2 }}>
                  <Texto v="seccion">Recorrido terminado</Texto>
                  <Texto v="medio" color="text2">Finalizó a las {hora(ruta.trip.finished_at)}.</Texto>
                </View>
              ) : objetivo ? (
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
                    <View style={{ flex: 1 }} accessible accessibilityLabel={metros != null ? `Distancia a tu casa: ${distanciaTexto(metros)}` : 'Esperando la ubicación de la buseta'}>
                      <Texto v="nota" color="text3" style={{ fontFamily: fuentes.medio }}>Distancia a tu casa</Texto>
                      {metros != null ? (
                        <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fuentes.titulo, fontSize: 40, lineHeight: 46, letterSpacing: -1.2, color: c.text, fontVariant: ['tabular-nums'] }}>
                          {distanciaTexto(metros)}
                        </Text>
                      ) : (
                        <Texto v="seccion" style={{ marginTop: 4 }}>Esperando la ubicación de la buseta</Texto>
                      )}
                    </View>
                    <View style={{ paddingBottom: 8 }}><PillEstado estado={pausado ? 'en_pausa' : 'en_curso'} /></View>
                  </View>
                  <Texto v="nota" color="text3" style={{ fontFamily: fuentes.medio, marginTop: 2 }}>
                    En línea recta, según el GPS de la buseta. Tu parada: {objetivo.label}.
                  </Texto>
                </View>
              ) : (
                <Texto v="medio" color="text2">La buseta sigue su recorrido. Tus hijos ya no tienen paradas pendientes.</Texto>
              )}

              {ninos.map((n) => {
                const info = porId[n.student_id];
                const est = estadoNino(n, ruta, info?.h);
                return (
                  <View key={n.student_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Avatar nombre={info?.h.name} color={colorDe(info?.h, info?.i)} tam={32} />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Texto v="medioFuerte">{info?.h.name ?? 'Tu hijo'}</Texto>
                        <ChipEscuela nombre={info?.h.school?.short_name} color={info?.h.school?.color} />
                      </View>
                      <Texto v="nota" style={{ color: colorTono(est.tono, c) }}>{est.texto}</Texto>
                    </View>
                  </View>
                );
              })}

              {conductor ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 12 }}>
                  <Pressable
                    onPress={() => nav.navigate('PerfilChofer', { chofer: conductor, sustituto: !!ruta.substitute, ruta: ruta.name })}
                    accessibilityRole="button"
                    accessibilityLabel={`Chofer ${conductor.name}. Ver su perfil`}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}
                  >
                    <Avatar nombre={conductor.name} foto={conductor.photo_url} tam={40} />
                    <View style={{ flex: 1 }}>
                      <Texto v="medioFuerte" numberOfLines={1} style={{ fontFamily: 'Inter_700Bold' }}>{conductor.name}{ruta.substitute ? ' (sustituto)' : ''}</Texto>
                      <Texto v="nota" color="text3" numberOfLines={2} style={{ fontFamily: fuentes.medio }}>{[[conductor.vehicle, conductor.color?.toLowerCase()].filter(Boolean).join(' '), conductor.plate].filter(Boolean).join(', ')}</Texto>
                    </View>
                  </Pressable>
                  {conductor.phone ? (
                    <>
                      <BotonContacto icono={Phone} etiqueta={`Llamar a ${conductor.name}`} onPress={() => abrir(`tel:${conductor.phone}`)} />
                      <BotonContacto icono={MessageCircle} etiqueta={`Escribir a ${conductor.name} por WhatsApp`} onPress={() => abrir(`https://wa.me/${(conductor.phone ?? '').replace(/\D/g, '')}`)} />
                    </>
                  ) : null}
                </View>
              ) : null}

              {tripId ? (
                <Boton titulo="Línea de tiempo del viaje" variante="secundario" icono={ListChecks} onPress={() => nav.navigate('LineaTiempo', { tripId, titulo: ruta.name })} />
              ) : null}

              {otros.length > 0 ? (
                <Texto v="nota" color="text3">
                  {otros.map((h) => h.name).join(' y ')} {otros.length === 1 ? 'va' : 'van'} en otra buseta. Toca su nombre arriba para verla.
                </Texto>
              ) : null}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}

// Llamar o escribir al chofer: cuadro de 48 px con ícono azul, como en el resto de listas.
function BotonContacto({ icono: Icono, etiqueta, onPress }: { icono: LucideIcon; etiqueta: string; onPress: () => void }) {
  const { c } = useTema();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 12, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
    >
      <Icono size={20} color={c.primary} strokeWidth={2} />
    </Pressable>
  );
}
