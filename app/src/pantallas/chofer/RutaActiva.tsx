// 47–53, 58, 59 · Ruta activa. Pantalla de conducción: botones de 56 px, texto de 18 px o más,
// acciones en la mitad inferior y nada de texto libre.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import NetInfo from '@react-native-community/netinfo';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { simulador } from '../../demo/simulador';
import { modoDemo } from '../../config/supabase';
import {
  ArrowLeft, Check, ChevronDown, ChevronUp, CircleCheck, Flag, Home, Navigation, Pause, Play, School,
  SkipForward, Undo2,
} from 'lucide-react-native';
import {
  Avatar, BannerAlerta, BannerSinConexion, Boton, BotonIcono, Chip, EsqueletoLista, EstadoError, HojaInferior,
  MapaRecorrido, ModalConfirmar, Tarjeta, Texto, useToast,
} from '../../ui';
import { esp, fuentes, margen, radio, sombra, TACTIL_CONDUCCION, useTema, EnCielo } from '../../tema';
import { chofer as servChofer, MENSAJES_FIJOS } from '../../servicios/chofer';
import {
  agruparParadas, alMoverse, RADIO_ENTREGA_M, RADIO_ESCUELA_M, RETRASO_MIN, transmision, trazar, viaje,
} from '../../servicios/viaje';
import { useSesion } from '../../estado/sesion';
import type { Coordenada, EstadoViaje, EventoViaje, Parada, Ruta, Viaje } from '../../tipos';
import type { NavChofer, PilaChofer } from '../../navegacion/tipos';
import {
  distanciaARuta, distanciaM, distanciaTexto, hora, listaNombres, mensajeError,
} from '../../utils';

type TipoMarca = 'boarded' | 'dropped' | 'school_arrival';
type Grupo = ReturnType<typeof agruparParadas>[number];
const TIPOS_MARCA: string[] = ['boarded', 'dropped', 'school_arrival'];
const clave = (studentId: string, tipo: string) => `${studentId}:${tipo}`;
const MOTIVOS_PAUSA = ['Combustible', 'Tráfico', 'Mecánico', 'Otro'];
const esEscuela = (p: Parada) => p.kind === 'dropoff_school' || p.kind === 'pickup_school';
// Punto «en vivo» sobre el azul marino: un verde más claro que el de la marca para que se lea.
const VIVO_SOBRE_MARINO = '#6BE3A8';

interface Nino { student_id: string; nombre: string; completo: string; color: string | null; school_id: string | null; notas: string | null; parada: Parada }

export default function RutaActiva() {
  useKeepAwake(); // la pantalla no se apaga durante el recorrido
  const { c } = useTema();
  const ins = useSafeAreaInsets();
  const navigation = useNavigation<NavChofer>();
  const { tripId } = useRoute<RouteProp<PilaChofer, 'RutaActiva'>>().params;
  const toast = useToast();
  const usuario = useSesion((s) => s.usuario);
  const choferSesion = useSesion((s) => s.chofer);
  const bajoConsumo = !!choferSesion?.low_power_mode;

  const [trip, setTrip] = useState<Viaje | null>(null);
  const [ruta, setRuta] = useState<Ruta | null>(null);
  const [falla, setFalla] = useState(false);
  const [estado, setEstado] = useState<EstadoViaje>('in_progress');
  const [marcas, setMarcas] = useState<Record<string, string>>({}); // "niño:tipo" → hora
  const [saltadas, setSaltadas] = useState<string[]>([]);
  const [retraso, setRetraso] = useState<number | null>(null);
  const [pos, setPos] = useState<Coordenada | null>(null);
  const [conectado, setConectado] = useState(true);
  const [pendientes, setPendientes] = useState(0);
  const [sinPermiso, setSinPermiso] = useState(false);
  const [tic, setTic] = useState(0);

  const [hojaEscuela, setHojaEscuela] = useState<Grupo | null>(null);
  const [hojaPausa, setHojaPausa] = useState(false);
  const [confirmarFin, setConfirmarFin] = useState(false);
  const [finalizando, setFinalizando] = useState(false);
  const [forzar, setForzar] = useState<{ nino: Nino; metros: number } | null>(null);
  const [deshacerDe, setDeshacerDe] = useState<{ nino: Nino; tipo: TipoMarca } | null>(null);
  const [verParadas, setVerParadas] = useState(false);
  const [enviando, setEnviando] = useState<string | null>(null);

  const idAClave = useRef(new Map<string, string>());
  const retrasoEnviado = useRef(false);
  const desvioEnviado = useRef(false);
  const lecturasFuera = useRef(0);

  // ── Carga ──
  const cargar = useCallback(async () => {
    setFalla(false);
    try {
      const [v, evs] = await Promise.all([viaje.obtener(tripId), viaje.eventos(tripId)]);
      if (v.status === 'finished') {
        navigation.replace('Resumen', { tripId });
        return;
      }
      const m: Record<string, string> = {};
      for (const e of evs) {
        if (e.student_id && TIPOS_MARCA.includes(e.type)) {
          m[clave(e.student_id, e.type)] = e.created_at;
          idAClave.current.set(e.id, clave(e.student_id, e.type));
        }
        if (e.type === 'delay') { retrasoEnviado.current = true; setRetraso(e.payload?.minutes ?? RETRASO_MIN); }
        if (e.type === 'deviation') desvioEnviado.current = true;
      }
      setMarcas((previas) => ({ ...m, ...previas }));
      setTrip(v);
      setEstado(v.status);
      servChofer.ruta(v.route_id).then(setRuta).catch(() => {});
    } catch {
      setFalla(true);
    }
  }, [tripId, navigation]);

  useEffect(() => { cargar(); }, [cargar]);

  // ── Transmisión, posición propia, tiempo real, red y cola ──
  useEffect(() => {
    if (!trip) return;
    let vivo = true;
    transmision.iniciar(trip.id, bajoConsumo).then((modo) => { if (vivo) setSinPermiso(modo === 'sin_permiso'); }).catch(() => {});
    transmision.posicionActual().then((p) => { if (vivo && p) setPos((actual) => actual ?? p); });
    const dejarPos = alMoverse((p) => setPos({ latitude: p.latitude, longitude: p.longitude }));
    const dejarVivo = viaje.suscribir(trip.id, {
      onEvento: (e: EventoViaje, borrado) => {
        if (borrado) {
          const k = idAClave.current.get(e.id);
          if (k) setMarcas((m) => { const n = { ...m }; delete n[k]; return n; });
          return;
        }
        if (e.student_id && TIPOS_MARCA.includes(e.type)) {
          const k = clave(e.student_id, e.type);
          idAClave.current.set(e.id, k);
          setMarcas((m) => (m[k] ? m : { ...m, [k]: e.created_at }));
        }
        if (e.type === 'delay') { retrasoEnviado.current = true; setRetraso(e.payload?.minutes ?? RETRASO_MIN); }
      },
      onViaje: (v) => {
        if (v.status === 'finished') navigation.replace('Resumen', { tripId: v.id });
        else setEstado(v.status);
      },
    });
    const dejarRed = NetInfo.addEventListener((e) => setConectado(e.isConnected !== false));
    viaje.pendientes().then(setPendientes).catch(() => {});
    const dejarCola = viaje.alCambiarCola(setPendientes);
    const reloj = setInterval(() => setTic((t) => t + 1), 30000);
    return () => { vivo = false; dejarPos(); dejarVivo(); dejarRed(); dejarCola(); clearInterval(reloj); };
  }, [trip?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Modelo derivado ──
  const ida = trip?.direction === 'pickup';
  const paradas = useMemo(() => trip?.planned_stops_snapshot ?? [], [trip]);
  const grupos = useMemo(() => agruparParadas(paradas), [paradas]);
  const ninos = useMemo<Nino[]>(
    () => paradas.filter((p) => p.student_id).map((p) => ({
      student_id: p.student_id as string, nombre: p.student_name ?? 'Estudiante', completo: p.student_full_name ?? p.student_name ?? 'Estudiante',
      color: p.school_color, school_id: p.school_id, notas: p.notes, parada: p,
    })),
    [paradas],
  );
  const tiene = useCallback((id: string, tipo: TipoMarca) => marcas[clave(id, tipo)] ?? null, [marcas]);
  const entregado = useCallback((id: string) => tiene(id, ida ? 'school_arrival' : 'dropped'), [tiene, ida]);
  const aBordo = useMemo(() => ninos.filter((n) => tiene(n.student_id, 'boarded') && !tiene(n.student_id, 'school_arrival') && !tiene(n.student_id, 'dropped')), [ninos, tiene]);
  const ninosDeEscuela = useCallback((schoolId: string | null) => ninos.filter((n) => n.school_id === schoolId), [ninos]);
  const ninosDeGrupo = useCallback(
    (g: Grupo) => (esEscuela(g.principal) ? ninosDeEscuela(g.principal.school_id) : ninos.filter((n) => g.paradas.some((p) => p.stop_id === n.parada.stop_id))),
    [ninos, ninosDeEscuela],
  );

  const grupoHecho = useCallback((g: Grupo) => {
    const p = g.principal;
    const suyos = ninosDeGrupo(g);
    if (!esEscuela(p)) return suyos.every((n) => tiene(n.student_id, ida ? 'boarded' : 'dropped'));
    if (ida) {
      const llegaron = suyos.filter((n) => tiene(n.student_id, 'school_arrival')).length;
      const esperando = suyos.filter((n) => tiene(n.student_id, 'boarded') && !tiene(n.student_id, 'school_arrival')).length;
      return llegaron > 0 && esperando === 0;
    }
    return suyos.length > 0 && suyos.every((n) => tiene(n.student_id, 'boarded') || tiene(n.student_id, 'dropped'));
  }, [ninosDeGrupo, tiene, ida]);

  const hechas = useMemo(() => grupos.filter(grupoHecho).flatMap((g) => g.paradas.map((p) => p.stop_id)), [grupos, grupoHecho]);
  // En modo demostración, la buseta simulada también se salta estas paradas.
  useEffect(() => { simulador.saltadas = saltadas; }, [saltadas]);

  const proxima = useMemo(() => grupos.find((g) => !grupoHecho(g) && !saltadas.includes(g.clave)) ?? null, [grupos, grupoHecho, saltadas]);
  const puntoProxima = proxima && proxima.principal.latitude != null && proxima.principal.longitude != null
    ? { latitude: proxima.principal.latitude, longitude: proxima.principal.longitude } : null;
  const metros = pos && puntoProxima ? distanciaM(pos, puntoProxima) : null;

  // Camino por calles de la buseta a la próxima parada. Se recalcula al cambiar de parada
  // o cuando la buseta se aleja 150 m del punto desde donde se trazó.
  const [aproximacion, setAproximacion] = useState<Coordenada[] | null>(null);
  const origenAprox = useRef<{ clave: string; desde: Coordenada } | null>(null);
  const turnoAprox = useRef(0);
  useEffect(() => {
    if (!pos || !puntoProxima || !proxima || estado !== 'in_progress' || (metros != null && metros < 40)) {
      origenAprox.current = null;
      setAproximacion(null);
      return;
    }
    const o = origenAprox.current;
    if (o && o.clave === proxima.clave && distanciaM(o.desde, pos) < 150) return;
    origenAprox.current = { clave: proxima.clave, desde: pos };
    const miTurno = ++turnoAprox.current;
    trazar([pos, puntoProxima]).then((t) => { if (miTurno === turnoAprox.current) setAproximacion(t.linea); });
  }, [pos?.latitude, pos?.longitude, proxima?.clave, puntoProxima?.latitude, puntoProxima?.longitude, estado]); // eslint-disable-line react-hooks/exhaustive-deps
  // Sin retraso calculado: no hay una hora de llegada real con qué compararlo. Las familias reciben
  // avisos por distancia (1 km y 500 m) y, si el chofer lo envía, un mensaje rápido de retraso.

  // ── Desvío (> 300 m de la ruta en 3 lecturas seguidas del GPS) ──

  useEffect(() => {
    const linea = ruta?.polyline;
    if (!trip || !pos || !linea || linea.length < 2 || desvioEnviado.current || estado !== 'in_progress') return;
    lecturasFuera.current = distanciaARuta(pos, linea) > 300 ? lecturasFuera.current + 1 : 0;
    if (lecturasFuera.current >= 3) {
      desvioEnviado.current = true;
      viaje.registrar({ trip_id: trip.id, type: 'deviation', latitude: pos.latitude, longitude: pos.longitude }).catch(() => {});
    }
  }, [pos, ruta, trip, estado]);

  // ── Acciones ──
  const quitarMarca = (k: string) => setMarcas((m) => { const n = { ...m }; delete n[k]; return n; });

  const deshacer = useCallback(async (nino: Nino, tipo: TipoMarca) => {
    if (!trip) return;
    const k = clave(nino.student_id, tipo);
    const previa = marcas[k];
    quitarMarca(k);
    try {
      await viaje.deshacer(trip.id, nino.student_id, tipo);
      toast.mostrar(`Se deshizo lo de ${nino.nombre}`);
    } catch (e) {
      if (previa) setMarcas((m) => ({ ...m, [k]: previa }));
      toast.mostrar(mensajeError(e), { tipo: 'error' });
    }
  }, [trip, marcas, toast]);

  const marcar = useCallback(async (nino: Nino, tipo: TipoMarca, en: Parada, silencioso = false) => {
    if (!trip) return;
    const k = clave(nino.student_id, tipo);
    const cuando = new Date().toISOString();
    setMarcas((m) => ({ ...m, [k]: cuando }));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    try {
      const llego = await viaje.registrar({
        trip_id: trip.id, type: tipo, student_id: nino.student_id, stop_id: en.stop_id,
        school_id: esEscuela(en) ? en.school_id : null,
        payload: { place: esEscuela(en) ? en.school_short ?? en.label : en.label },
        latitude: pos?.latitude ?? null, longitude: pos?.longitude ?? null,
      });
      if (!silencioso) {
        const verbo = tipo === 'boarded' ? 'abordó' : tipo === 'dropped' ? 'fue entregado' : 'llegó a la escuela';
        toast.mostrar(`${nino.nombre} ${verbo}, ${hora(cuando)}${llego ? '' : ', se enviará al volver la señal'}`, { tipo: 'exito', deshacer: () => deshacer(nino, tipo) });
      }
    } catch (e) {
      quitarMarca(k);
      toast.mostrar(mensajeError(e), { tipo: 'error' });
    }
  }, [trip, pos, toast, deshacer]);

  const entregarEnCasa = (nino: Nino) => {
    const p = nino.parada;
    const d = pos && p.latitude != null && p.longitude != null ? distanciaM(pos, { latitude: p.latitude, longitude: p.longitude }) : null;
    if (d != null && d > RADIO_ENTREGA_M) setForzar({ nino, metros: d });
    else marcar(nino, 'dropped', p);
  };

  const confirmarTodos = async (g: Grupo) => {
    const lista = ninosDeEscuela(g.principal.school_id).filter((n) => tiene(n.student_id, 'boarded') && !tiene(n.student_id, 'school_arrival'));
    setHojaEscuela(null);
    await Promise.all(lista.map((n) => marcar(n, 'school_arrival', g.principal, true)));
    toast.mostrar(`${lista.length} ${lista.length === 1 ? 'niño entregado' : 'niños entregados'} en ${g.principal.school_short ?? g.principal.label}`, { tipo: 'exito' });
  };

  const navegar = async () => {
    if (!puntoProxima) return;
    const q = `${puntoProxima.latitude},${puntoProxima.longitude}`;
    const web = `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`;
    try {
      if (Platform.OS === 'android') await Linking.openURL(`google.navigation:q=${q}`);
      else await Linking.openURL(web);
    } catch {
      Linking.openURL(web).catch(() => toast.mostrar('No pudimos abrir la navegación.', { tipo: 'error' }));
    }
    toast.mostrar('BSL sigue transmitiendo en segundo plano');
  };

  const enviarMensaje = async (texto: string, k?: string) => {
    if (!trip || !usuario || enviando) return;
    setEnviando(texto);
    try {
      const m = await servChofer.enviarMensaje(trip.route_id, trip.id, usuario.id, texto, k);
      Haptics.selectionAsync().catch(() => {});
      toast.mostrar(`«${texto}» enviado a ${m.recipients} ${m.recipients === 1 ? 'representante' : 'representantes'}`, { tipo: 'exito' });
    } catch (e) {
      toast.mostrar(mensajeError(e, 'No se pudo enviar el mensaje.'), { tipo: 'error' });
    } finally {
      setEnviando(null);
    }
  };

  const pausar = async (motivo: string) => {
    if (!trip) return;
    setHojaPausa(false);
    setEstado('paused');
    try {
      await viaje.registrar({ trip_id: trip.id, type: 'paused', payload: { reason: motivo } });
      toast.mostrar('Recorrido en pausa. Los representantes ya fueron avisados.');
    } catch (e) {
      setEstado('in_progress');
      toast.mostrar(mensajeError(e), { tipo: 'error' });
    }
  };

  const reanudar = async () => {
    if (!trip) return;
    setEstado('in_progress');
    try {
      await viaje.registrar({ trip_id: trip.id, type: 'resumed' });
    } catch (e) {
      setEstado('paused');
      toast.mostrar(mensajeError(e), { tipo: 'error' });
    }
  };

  const finalizar = async () => {
    if (!trip) return;
    setFinalizando(true);
    try {
      await viaje.registrar({ trip_id: trip.id, type: 'trip_finished' });
      await transmision.detener();
      setConfirmarFin(false);
      navigation.replace('Resumen', { tripId: trip.id });
    } catch (e) {
      toast.mostrar(mensajeError(e, 'No se pudo finalizar. Inténtalo de nuevo.'), { tipo: 'error' });
    } finally {
      setFinalizando(false);
    }
  };

  const salir = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Pestanas', { screen: 'Inicio' });
  };

  // ── Piezas ──
  const indicador = !conectado
    ? { texto: `Sin conexión${pendientes ? `, ${pendientes} ${pendientes === 1 ? 'pendiente' : 'pendientes'}` : ''}`, color: c.warning }
    : sinPermiso
      ? { texto: 'Sin permiso de ubicación', color: c.danger }
      : estado === 'paused'
        ? { texto: 'En pausa', color: c.warning }
        : { texto: bajoConsumo ? 'Transmitiendo tu ubicación cada 15 s' : 'Transmitiendo tu ubicación', color: VIVO_SOBRE_MARINO };

  const botonHecho = (nino: Nino, tipo: TipoMarca, cuando: string) => (
    <Pressable
      onPress={() => deshacer(nino, tipo)}
      accessibilityRole="button"
      accessibilityLabel={`${nino.nombre}, ${hora(cuando)}. Toca para deshacer`}
      style={{ minHeight: TACTIL_CONDUCCION, minWidth: 132, borderRadius: radio.tarjeta, backgroundColor: c.successSoft, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Check size={18} color={c.successInk} strokeWidth={2.4} />
        <Texto v="subtitulo" color="successInk" style={{ fontVariant: ['tabular-nums'] }}>{hora(cuando)}</Texto>
      </View>
      <Texto v="nota" color="successInk">toca para deshacer</Texto>
    </Pressable>
  );

  const filaNino = (nino: Nino, accion: React.ReactNode, detalle?: string | null, apagada?: boolean) => (
    <View key={nino.student_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, paddingVertical: 6, opacity: apagada ? 0.75 : 1 }}>
      <Avatar nombre={nino.nombre} color={nino.color} tam={44} />
      <View style={{ flex: 1 }}>
        <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={{ fontFamily: 'Inter_700Bold', fontSize: 17, lineHeight: 22, color: c.text }}>{nino.nombre}</Text>
        {detalle ? <Texto v="medio" color="text3" numberOfLines={2} style={{ fontSize: 14, lineHeight: 19 }}>{detalle}</Texto> : null}
      </View>
      {accion}
    </View>
  );

  // Sello «NO VA»: el niño tiene ausencia registrada hoy (solo informativo, sin botón).
  const sello = (nino: Nino) => (
    <View
      accessible
      accessibilityLabel={`${nino.nombre} no va hoy`}
      style={{ borderWidth: 1.5, borderColor: c.warning, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, transform: [{ rotate: '-2deg' }] }}
    >
      <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fuentes.titulo, fontSize: 12, letterSpacing: 0.4, color: c.warning }}>NO VA</Text>
    </View>
  );

  const tituloTarjeta = (t: string) => (
    <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={{ fontFamily: fuentes.titulo, fontSize: 14, color: c.text2, marginBottom: 4 }}>{t}</Text>
  );

  const accionesProxima = () => {
    if (!proxima) return null;
    const p = proxima.principal;
    const suyos = ninosDeGrupo(proxima);
    if (!esEscuela(p)) {
      const tipo: TipoMarca = ida ? 'boarded' : 'dropped';
      const lejos = !ida && metros != null && metros > RADIO_ENTREGA_M;
      return (
        <View>
          {tituloTarjeta(ida ? 'Suben aquí' : 'Bajan aquí')}
          {suyos.map((n) => {
            if (n.parada.absent) return filaNino(n, sello(n), 'No va hoy', true);
            const cuando = tiene(n.student_id, tipo);
            const sinSubir = !ida && !tiene(n.student_id, 'boarded');
            return filaNino(
              n,
              cuando ? botonHecho(n, tipo, cuando) : (
                <Boton
                  titulo={ida ? 'Subió' : 'Entregado'}
                  variante={lejos ? 'secundario' : 'exito'}
                  tamano="conduccion"
                  ancho={false}
                  estilo={{ minWidth: 120, height: TACTIL_CONDUCCION }}
                  etiqueta={`${ida ? 'Subió' : 'Entregado'} ${n.nombre}`}
                  onPress={() => (ida ? marcar(n, 'boarded', n.parada) : entregarEnCasa(n))}
                />
              ),
              n.notas ?? (sinSubir ? 'No se marcó que subió en la escuela' : null),
            );
          })}
          {lejos ? <Texto v="medio" color="warningInk">A {distanciaTexto(metros as number)}, acércate a la parada para entregar</Texto> : null}
        </View>
      );
    }
    if (ida) {
      const esperando = suyos.filter((n) => tiene(n.student_id, 'boarded') && !tiene(n.student_id, 'school_arrival'));
      return (
        <View style={{ gap: esp.sm }}>
          {tituloTarjeta('Bajan aquí')}
          <Boton
            titulo={`Entregar en ${p.school_short ?? p.label} (${esperando.length})`}
            icono={School}
            variante="exito"
            tamano="conduccion"
            deshabilitado={esperando.length === 0}
            onPress={() => setHojaEscuela(proxima)}
          />
          {esperando.length === 0 ? <Texto v="medio" color="text2">Todavía no hay niños de esta escuela a bordo.</Texto> : null}
        </View>
      );
    }
    return (
      <View>
        {tituloTarjeta('Suben aquí')}
        {suyos.map((n) => {
          if (n.parada.absent) return filaNino(n, sello(n), 'No va hoy', true);
          const cuando = tiene(n.student_id, 'boarded');
          return filaNino(
            n,
            cuando ? botonHecho(n, 'boarded', cuando) : (
              <Boton titulo="Subió" variante="exito" tamano="conduccion" ancho={false} estilo={{ minWidth: 120, height: TACTIL_CONDUCCION }} etiqueta={`Subió ${n.nombre}`} onPress={() => marcar(n, 'boarded', p)} />
            ),
            n.notas,
          );
        })}
      </View>
    );
  };

  if (falla) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, justifyContent: 'center' }}>
        <EstadoError titulo="No pudimos abrir el recorrido" onReintentar={cargar} />
        <Boton titulo="Volver al inicio" variante="fantasma" ancho={false} estilo={{ alignSelf: 'center' }} onPress={salir} />
      </View>
    );
  }

  const cercaDeEscuela = !!proxima && esEscuela(proxima.principal) && ida && metros != null && metros <= RADIO_ESCUELA_M
    && ninosDeGrupo(proxima).some((n) => tiene(n.student_id, 'boarded') && !tiene(n.student_id, 'school_arrival'));
  const mensajes = [...MENSAJES_FIJOS.map((m) => ({ clave: m.clave as string | undefined, texto: m.texto as string })), ...(choferSesion?.quick_messages ?? []).map((t) => ({ clave: undefined, texto: t }))];
  let escuelaDeTramo: string | null = null;
  const idxProxima = proxima ? grupos.findIndex((g) => g.clave === proxima.clave) : -1;
  const textoAvance = grupos.length === 0 ? '' : proxima ? `Parada ${idxProxima + 1} de ${grupos.length}` : `Las ${grupos.length} paradas están listas`;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style="light" />
      {/* Encabezado marino: ruta, transmisión, niños a bordo y avance por paradas */}
      <View style={{ backgroundColor: c.hero, paddingTop: ins.top + 6, paddingHorizontal: margen, paddingBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <EnCielo><BotonIcono icono={ArrowLeft} etiqueta="Volver al inicio. El recorrido sigue" sobreHero onPress={salir} /></EnCielo>
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ fontFamily: fuentes.titulo, fontSize: 21, lineHeight: 26, letterSpacing: -0.4, color: c.onHero }}>
              {ruta?.name ?? 'Recorrido'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }} accessibilityLiveRegion="polite">
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: indicador.color }} />
              <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ flex: 1, fontFamily: fuentes.medio, fontSize: 13.5, color: c.onHero2 }}>{indicador.texto}</Text>
            </View>
          </View>
          <View style={{ height: 28, paddingHorizontal: 11, borderRadius: 14, backgroundColor: c.heroChip, justifyContent: 'center' }}>
            <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: 'Inter_700Bold', fontSize: 12.5, color: c.onHero }}>{aBordo.length} a bordo</Text>
          </View>
        </View>
        {grupos.length > 0 ? (
          <View accessible accessibilityRole="progressbar" accessibilityLabel={textoAvance} accessibilityValue={{ min: 0, max: grupos.length, now: grupos.filter(grupoHecho).length }}>
            <View style={{ flexDirection: 'row', gap: grupos.length > 14 ? 2 : 4, marginTop: 14 }}>
              {grupos.map((g) => (
                <View
                  key={g.clave}
                  style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: grupoHecho(g) ? c.success : g.clave === proxima?.clave ? c.accent : 'rgba(255,255,255,0.2)' }}
                />
              ))}
            </View>
            <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: fuentes.medio, fontSize: 13, color: c.onHero2, marginTop: 6 }}>{textoAvance}</Text>
          </View>
        ) : null}
      </View>
      {!conectado ? <BannerSinConexion pendientes={pendientes} /> : null}

      {!trip ? (
        <View style={{ padding: margen }}><EsqueletoLista filas={2} mapa /></View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: esp.xl }} showsVerticalScrollIndicator={false}>
          <View style={{ paddingHorizontal: margen, gap: esp.md, paddingTop: esp.lg }}>
            {/* Próxima parada */}
            <Tarjeta elevacion={2}>
              {proxima ? (
                <View style={{ gap: esp.md }}>
                  <View>
                    <Texto v="nota" color="text3" style={{ fontFamily: fuentes.medio }}>Próxima parada</Texto>
                    <Text accessibilityRole="header" numberOfLines={2} maxFontSizeMultiplier={1.3} style={{ fontFamily: fuentes.titulo, fontSize: 26, lineHeight: 31, letterSpacing: -0.5, color: c.text, marginTop: 2 }}>
                      {proxima.principal.label}
                    </Text>
                    {proxima.principal.street || proxima.principal.reference ? (
                      <Texto v="medio" color="text2" style={{ fontSize: 16, lineHeight: 22, marginTop: 2 }}>
                        {[proxima.principal.street, proxima.principal.reference].filter(Boolean).join('. ')}
                      </Texto>
                    ) : null}
                  </View>
                  {metros != null ? (
                    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }} accessible accessibilityLabel={`A ${distanciaTexto(metros)} de distancia`}>
                      <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fuentes.titulo, fontSize: 44, lineHeight: 50, letterSpacing: -1.3, color: c.text, fontVariant: ['tabular-nums'] }}>
                        {distanciaTexto(metros)}
                      </Text>
                      <Texto v="nota" color="text3" style={{ fontFamily: fuentes.medio, marginBottom: 9 }}>de distancia</Texto>
                    </View>
                  ) : (
                    <Texto v="medioFuerte" color="text2">Esperando tu ubicación para medir la distancia</Texto>
                  )}
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Boton titulo="Navegar" icono={Navigation} variante="secundario" tamano="conduccion" estilo={{ flex: 1 }} onPress={navegar} deshabilitado={!puntoProxima} />
                    <Boton
                      titulo="Saltar"
                      icono={SkipForward}
                      variante="secundario"
                      tamano="conduccion"
                      estilo={{ flex: 1 }}
                      etiqueta="Saltar esta parada"
                      onPress={() => {
                        const k = proxima.clave;
                        setSaltadas((s) => [...s, k]);
                        toast.mostrar(`Saltaste ${proxima.principal.label}`, { deshacer: () => setSaltadas((s) => s.filter((x) => x !== k)) });
                      }}
                    />
                  </View>
                </View>
              ) : (
                <View style={{ alignItems: 'center', gap: esp.sm, paddingVertical: esp.sm }}>
                  <CircleCheck size={36} color={c.success} strokeWidth={2} />
                  <Texto v="titulo" centro>Todas las paradas están listas</Texto>
                  <Texto v="cuerpo" color="text2" centro>Toca Finalizar para cerrar el recorrido y avisar a los representantes.</Texto>
                </View>
              )}
            </Tarjeta>

            {sinPermiso ? (
              <BannerAlerta tipo="urgente" titulo="BSL no puede ver tu ubicación" texto="Los representantes no ven la buseta." accion="Activar" onAccion={() => navigation.navigate('PermisoUbicacion')} />
            ) : null}
            {retraso ? (
              <BannerAlerta tipo="aviso" titulo="Avisaste un retraso" texto="Los representantes ya recibieron el aviso" />
            ) : null}
            {cercaDeEscuela && proxima ? (
              <BannerAlerta
                tipo="exito"
                icono={Flag}
                titulo={`Estás a menos de 100 m de ${proxima.principal.school_short ?? proxima.principal.label}`}
                texto="¿Confirmar la entrega de los niños de esta escuela?"
                accion="Confirmar"
                onAccion={() => setHojaEscuela(proxima)}
              />
            ) : null}

            {proxima ? <Tarjeta elevacion={2}>{accionesProxima()}</Tarjeta> : null}

            {/* Mensajes rápidos */}
            <View style={{ gap: esp.sm }}>
              <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={{ fontFamily: fuentes.titulo, fontSize: 14, color: c.text2 }}>Mensajes rápidos a las familias</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: margen }} style={{ marginRight: -margen }}>
                {mensajes.map((m) => (
                  <Pressable
                    key={m.texto}
                    onPress={() => enviarMensaje(m.texto, m.clave)}
                    disabled={!!enviando}
                    accessibilityRole="button"
                    accessibilityLabel={`Enviar mensaje: ${m.texto}`}
                    android_ripple={{ color: 'rgba(128,128,128,0.2)' }}
                    style={{ height: TACTIL_CONDUCCION, paddingHorizontal: 18, borderRadius: radio.pill, backgroundColor: c.surface, borderWidth: 1.5, borderColor: c.border, justifyContent: 'center', overflow: 'hidden', opacity: enviando && enviando !== m.texto ? 0.5 : 1 }}
                  >
                    <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: 'Inter_700Bold', fontSize: 15, color: c.text }}>{enviando === m.texto ? 'Enviando…' : m.texto}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {/* Mapa del recorrido */}
            <View style={{ borderRadius: radio.grande, overflow: 'hidden', ...sombra(c, 1) }}>
              <MapaRecorrido
                paradas={paradas}
                linea={ruta?.polyline ?? undefined}
                aproximacion={aproximacion}
                buseta={pos}
                hechas={hechas}
                destacadas={proxima ? proxima.paradas.map((p) => p.stop_id) : []}
                color={ruta?.color}
                alto={200}
                seguir
              />
            </View>

            {/* Lista completa de paradas */}
            <Tarjeta>
              <Pressable
                onPress={() => setVerParadas((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded: verParadas }}
                style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48 }}
              >
                <Texto v="subtitulo" style={{ flex: 1 }}>Paradas: {grupos.filter(grupoHecho).length} de {grupos.length}</Texto>
                {verParadas ? <ChevronUp size={22} color={c.text2} /> : <ChevronDown size={22} color={c.text2} />}
              </Pressable>
              {verParadas ? grupos.map((g, i) => {
                const p = g.principal;
                const hecho = grupoHecho(g);
                const saltada = saltadas.includes(g.clave);
                const esProxima = proxima?.clave === g.clave;
                const sig = ida ? grupos.slice(i).find((x) => esEscuela(x.principal))?.principal ?? null : null;
                const titulo = sig && sig.school_id !== escuelaDeTramo ? `Hacia ${sig.school_name ?? sig.label}` : null;
                if (sig) escuelaDeTramo = sig.school_id;
                const Icono = esEscuela(p) ? School : Home;
                const suyos = esEscuela(p) ? [] : ninosDeGrupo(g);
                return (
                  <View key={g.clave}>
                    {titulo ? <Texto v="medioFuerte" color="text2" style={{ marginTop: esp.md }}>{titulo}</Texto> : null}
                    <View style={{ flexDirection: 'row', gap: 12, paddingVertical: 10, alignItems: 'flex-start', borderTopWidth: titulo || i === 0 ? 0 : 1, borderTopColor: c.border }}>
                      <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: hecho ? c.success : esProxima ? c.accent : esEscuela(p) ? (p.school_color ?? c.primary) : c.primarySoft }}>
                        {hecho ? <Check size={18} color="#FFFFFF" strokeWidth={2.6} /> : <Icono size={17} color={esProxima ? c.onAccent : esEscuela(p) ? '#FFFFFF' : c.primary} strokeWidth={2.2} />}
                      </View>
                      <View style={{ flex: 1, gap: 4 }}>
                        <Texto v="fuerte" color={hecho ? 'text3' : 'text'} style={{ fontSize: 18, lineHeight: 24 }}>{p.label}{saltada && !hecho ? ' (saltada)' : ''}</Texto>
                        {p.street ?? p.reference ? <Texto v="medio" color="text2">{p.street ?? p.reference}</Texto> : null}
                        {suyos.length > 0 ? (
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                            {suyos.map((n) => {
                              const tipo: TipoMarca | null = entregado(n.student_id) ? (ida ? 'school_arrival' : 'dropped') : tiene(n.student_id, 'boarded') ? 'boarded' : null;
                              return (
                                <Chip
                                  key={n.student_id}
                                  texto={tipo ? `${n.nombre}, ${tipo === 'boarded' ? 'a bordo' : 'entregado'}` : n.nombre}
                                  icono={tipo ? Undo2 : undefined}
                                  seleccionado={!!tipo}
                                  color={tipo ? c.success : undefined}
                                  onPress={tipo ? () => setDeshacerDe({ nino: n, tipo }) : undefined}
                                />
                              );
                            })}
                          </View>
                        ) : null}
                        {saltada && !hecho ? (
                          <Boton titulo="Volver a esta parada" variante="fantasma" tamano="compacto" onPress={() => setSaltadas((s) => s.filter((x) => x !== g.clave))} />
                        ) : null}
                      </View>
                    </View>
                  </View>
                );
              }) : null}
            </Tarjeta>
          </View>
        </ScrollView>
      )}

      {/* Barra inferior fija */}
      {trip ? (
        <View style={{ flexDirection: 'row', gap: esp.sm, paddingHorizontal: margen, paddingTop: esp.md, paddingBottom: ins.bottom + esp.md, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border }}>
          {estado === 'paused' ? (
            <Boton titulo="Reanudar" icono={Play} variante="acento" tamano="conduccion" estilo={{ flex: 1 }} onPress={reanudar} />
          ) : (
            <Boton titulo="Pausar" icono={Pause} variante="secundario" tamano="conduccion" estilo={{ flex: 1 }} onPress={() => setHojaPausa(true)} />
          )}
          <Boton titulo="Finalizar" icono={Flag} variante={proxima ? 'peligro' : 'primario'} tamano="conduccion" estilo={{ flex: 1 }} onPress={() => setConfirmarFin(true)} />
        </View>
      ) : null}

      {/* Entregar en escuela */}
      <HojaInferior
        visible={!!hojaEscuela}
        onCerrar={() => setHojaEscuela(null)}
        titulo={hojaEscuela ? `Entregar en ${hojaEscuela.principal.school_name ?? hojaEscuela.principal.label}` : undefined}
        texto={hojaEscuela ? [hojaEscuela.principal.reference, `llegada ${hora(new Date())}`].filter(Boolean).join(', ') : undefined}
        pie={hojaEscuela ? (() => {
          const faltan = ninosDeEscuela(hojaEscuela.principal.school_id).filter((n) => tiene(n.student_id, 'boarded') && !tiene(n.student_id, 'school_arrival')).length;
          return (
            <>
              <Boton titulo={`Confirmar todos (${faltan})`} variante="exito" tamano="conduccion" deshabilitado={faltan === 0} onPress={() => confirmarTodos(hojaEscuela)} />
              <Boton titulo={faltan === 0 ? 'Listo' : 'Todavía no'} variante="secundario" tamano="conduccion" onPress={() => setHojaEscuela(null)} />
            </>
          );
        })() : undefined}
      >
        {hojaEscuela ? ninosDeEscuela(hojaEscuela.principal.school_id).filter((n) => tiene(n.student_id, 'boarded')).map((n) => {
          const cuando = tiene(n.student_id, 'school_arrival');
          return filaNino(
            { ...n, nombre: n.completo },
            cuando ? botonHecho(n, 'school_arrival', cuando) : (
              <Boton titulo="Entregado" variante="exito" tamano="conduccion" ancho={false} estilo={{ minWidth: 132 }} etiqueta={`Entregado ${n.nombre}`} onPress={() => marcar(n, 'school_arrival', hojaEscuela.principal)} />
            ),
            n.notas,
          );
        }) : null}
      </HojaInferior>

      {/* Pausar */}
      <HojaInferior visible={hojaPausa} onCerrar={() => setHojaPausa(false)} titulo="Pausar el recorrido" texto="Elige el motivo. Los representantes reciben el aviso al instante.">
        <View style={{ gap: esp.sm }}>
          {MOTIVOS_PAUSA.map((m) => (
            <Boton key={m} titulo={m} variante="secundario" tamano="conduccion" onPress={() => pausar(m)} />
          ))}
        </View>
      </HojaInferior>

      {/* Finalizar */}
      <ModalConfirmar
        visible={confirmarFin}
        titulo={aBordo.length > 0 ? `${aBordo.length === 1 ? 'Queda 1 niño' : `Quedan ${aBordo.length} niños`} sin entregar` : '¿Finalizar el recorrido?'}
        mensaje={aBordo.length > 0
          ? `${listaNombres(aBordo.map((n) => n.nombre))}. Si finalizas ahora, ${aBordo.length === 1 ? 'quedará como pendiente' : 'quedarán como pendientes'} en el resumen.`
          : 'Se avisa a los representantes y BSL deja de transmitir tu ubicación.'}
        confirmar={aBordo.length > 0 ? 'Finalizar igual' : 'Finalizar'}
        cancelar="Volver"
        peligro={aBordo.length > 0}
        cargando={finalizando}
        onConfirmar={finalizar}
        onCancelar={() => setConfirmarFin(false)}
      />

      {/* Entregar lejos de la parada */}
      <ModalConfirmar
        visible={!!forzar}
        titulo={forzar ? `Estás a ${distanciaTexto(forzar.metros)} de la parada` : ''}
        mensaje={forzar ? `«Entregado» se marca a menos de ${RADIO_ENTREGA_M} m de la parada. ¿Entregaste a ${forzar.nino.nombre} en otro lugar?` : undefined}
        confirmar="Sí, entregado"
        cancelar="Volver"
        onConfirmar={() => { if (forzar) marcar(forzar.nino, 'dropped', forzar.nino.parada); setForzar(null); }}
        onCancelar={() => setForzar(null)}
      />

      {/* Deshacer desde la lista */}
      <ModalConfirmar
        visible={!!deshacerDe}
        titulo={deshacerDe ? `¿Deshacer lo de ${deshacerDe.nino.nombre}?` : ''}
        mensaje={deshacerDe ? `Se quita ${deshacerDe.tipo === 'boarded' ? 'el abordaje' : 'la entrega'} y el aviso que recibieron sus representantes.` : undefined}
        confirmar="Deshacer"
        cancelar="Volver"
        peligro
        onConfirmar={() => { if (deshacerDe) deshacer(deshacerDe.nino, deshacerDe.tipo); setDeshacerDe(null); }}
        onCancelar={() => setDeshacerDe(null)}
      />
    </View>
  );
}
