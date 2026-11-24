// 46 / 57 · Iniciar recorrido: resumen del día, ausentes ya excluidos y orden de paradas.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Home, Play, School } from 'lucide-react-native';
import {
  Avatar, BannerAlerta, Boton, ChipEscuela, EsqueletoLista, EstadoError, MapaRecorrido, Pantalla, PillEstado, Tarjeta, Texto,
} from '../../ui';
import { esp, fuentes, useTema } from '../../tema';
import { chofer as servChofer } from '../../servicios/chofer';
import { agruparParadas, transmision, viaje } from '../../servicios/viaje';
import { useSesion } from '../../estado/sesion';
import type { Parada, Ruta } from '../../tipos';
import type { NavChofer, PilaChofer } from '../../navegacion/tipos';
import { hhmm, listaNombres, mensajeError, textoSentido } from '../../utils';

export default function IniciarRecorrido() {
  const { c } = useTema();
  const navigation = useNavigation<NavChofer>();
  const { routeId } = useRoute<RouteProp<PilaChofer, 'IniciarRecorrido'>>().params;
  const choferSesion = useSesion((s) => s.chofer);
  const [ruta, setRuta] = useState<Ruta | null>(null);
  const [paradas, setParadas] = useState<Parada[] | null>(null);
  const [falla, setFalla] = useState(false);
  const [iniciando, setIniciando] = useState(false);
  const [error, setError] = useState<{ texto: string; verificacion: boolean } | null>(null);

  const cargar = useCallback(async () => {
    setFalla(false);
    try {
      const [r, p] = await Promise.all([servChofer.ruta(routeId), servChofer.paradas(routeId)]);
      setRuta(r);
      setParadas(p);
    } catch {
      setFalla(true);
    }
  }, [routeId]);

  useEffect(() => { cargar(); }, [cargar]);

  const activas = useMemo(() => (paradas ?? []).filter((p) => !p.absent), [paradas]);
  const ausentes = useMemo(() => (paradas ?? []).filter((p) => p.absent && p.student_id), [paradas]);
  const grupos = useMemo(() => agruparParadas(activas), [activas]);
  const casas = grupos.filter((g) => g.principal.kind === 'pickup_home' || g.principal.kind === 'dropoff_home').length;
  const escuelas = grupos.length - casas;
  const ida = ruta?.direction === 'pickup';
  const cadaSeg = choferSesion?.low_power_mode ? 15 : 5;

  // Niños que suben o bajan en cada parada de escuela (los activos de esa escuela).
  const ninosDe = (g: (typeof grupos)[number]) => {
    const p = g.principal;
    if (p.student_id) return g.paradas.map((x) => x.student_name ?? '');
    return activas.filter((x) => x.student_id && x.school_id === p.school_id).map((x) => x.student_name ?? '');
  };

  const iniciar = async () => {
    setIniciando(true);
    setError(null);
    try {
      const permisos = await transmision.permisos();
      if (!permisos.primerPlano) {
        navigation.navigate('PermisoUbicacion', { routeId });
        return;
      }
      const trip = await viaje.iniciar(routeId);
      const modo = await transmision.iniciar(trip.id, !!choferSesion?.low_power_mode);
      if (modo === 'sin_permiso') {
        navigation.navigate('PermisoUbicacion', { routeId });
        return;
      }
      navigation.replace('RutaActiva', { tripId: trip.id });
    } catch (e: any) {
      setError({ texto: mensajeError(e, 'No pudimos iniciar el recorrido. Inténtalo de nuevo.'), verificacion: String(e?.message ?? '').includes('CHOFER_NO_VERIFICADO') });
    } finally {
      setIniciando(false);
    }
  };

  const dato = (valor: string | number, etiqueta: string) => (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Texto v="cifra">{valor}</Texto>
      <Texto v="nota" color="text2" centro>{etiqueta}</Texto>
    </View>
  );

  return (
    <Pantalla
      titulo="Iniciar recorrido"
      subtitulo={ruta?.name}
      onAtras={() => navigation.goBack()}
      pie={
        ruta && paradas ? (
          <>
            <Boton
              titulo={`Confirmar e iniciar ${ida ? 'ida' : 'vuelta'}`}
              icono={Play}
              variante="acento"
              tamano="conduccion"
              onPress={iniciar}
              cargando={iniciando}
              deshabilitado={activas.length === 0}
            />
            <Texto v="nota" color="text2" centro>
              Al iniciar, BSL transmite tu ubicación cada {cadaSeg} s a los representantes de esta ruta, incluso con la app en segundo plano.
            </Texto>
          </>
        ) : undefined
      }
    >
      {falla ? (
        <Tarjeta><EstadoError onReintentar={cargar} /></Tarjeta>
      ) : !ruta || !paradas ? (
        <EsqueletoLista filas={3} />
      ) : (
        <>
          <Tarjeta elevacion={2}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Texto v="subtitulo">{ruta.name}</Texto>
                <Texto v="medio" color="text2">{ida ? 'Casas → escuelas' : 'Escuelas → casas'}</Texto>
              </View>
              <PillEstado estado="programado" texto={textoSentido(ruta.direction)} />
            </View>
            <View style={{ flexDirection: 'row', marginTop: esp.lg, paddingTop: esp.md, borderTopWidth: 1, borderTopColor: c.border }}>
              {dato(hhmm(ruta.departure_time), 'hora de salida')}
              {dato(grupos.length, 'paradas activas')}
              {dato(casas, 'casas')}
              {dato(escuelas, 'escuelas')}
            </View>
          </Tarjeta>

          {error ? (
            <BannerAlerta
              tipo="urgente"
              titulo="No se pudo iniciar"
              texto={error.texto}
              accion={error.verificacion ? 'Ver' : undefined}
              onAccion={error.verificacion ? () => navigation.navigate('EstadoCuenta') : undefined}
            />
          ) : null}

          <View style={{ gap: esp.sm }}>
            <Texto v="seccion">Ausentes de hoy (ya excluidos)</Texto>
            {ausentes.length === 0 ? (
              <Texto v="medio" color="text2">Ninguno. Van todos los niños de la ruta.</Texto>
            ) : (
              <Tarjeta plano>
                <View style={{ gap: esp.md }}>
                  {ausentes.map((a) => (
                    <View key={a.stop_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <Avatar nombre={a.student_name} color={a.school_color} tam={40} />
                      <View style={{ flex: 1 }}>
                        <Texto v="fuerte" style={{ textDecorationLine: 'line-through' }}>{a.student_full_name ?? a.student_name}</Texto>
                        <Texto v="nota" color="text2">
                          {[a.absence_reason, a.absence_by ? `avisó ${a.absence_by}` : null, 'su parada vuelve mañana'].filter(Boolean).join(', ')}
                        </Texto>
                      </View>
                    </View>
                  ))}
                </View>
              </Tarjeta>
            )}
          </View>

          {activas.some((p) => p.latitude != null) ? (
            <MapaRecorrido paradas={activas} linea={ruta.polyline ?? undefined} color={ruta.color} alto={170} interactivo={false} />
          ) : null}

          <View style={{ gap: esp.sm }}>
            <Texto v="seccion">Orden de paradas</Texto>
            {grupos.length === 0 ? (
              <BannerAlerta tipo="aviso" titulo="Esta ruta no tiene paradas activas hoy" texto="Agrega paradas a la ruta o revisa las ausencias." />
            ) : (
              <Tarjeta>
                <View>
                  {grupos.map((g, i) => {
                    const p = g.principal;
                    const esEscuela = !p.student_id;
                    const Icono = esEscuela ? School : Home;
                    return (
                      <View key={g.clave} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 56, paddingVertical: 8, borderBottomWidth: i === grupos.length - 1 ? 0 : 1, borderBottomColor: c.border }}>
                        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: esEscuela ? (p.school_color ?? c.primary) : c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                          <Texto v="nota" color={esEscuela ? '#FFFFFF' : 'primary'} style={{ fontFamily: fuentes.titulo, fontSize: 14 }}>{i + 1}</Texto>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Icono size={15} color={c.text2} strokeWidth={2} />
                            <Texto v="fuerte" numberOfLines={1} style={{ flex: 1 }}>{p.label}</Texto>
                          </View>
                          <Texto v="nota" color="text2" numberOfLines={2}>{listaNombres(ninosDe(g).filter(Boolean)) || 'Sin niños hoy'}</Texto>
                        </View>
                        {!esEscuela && p.school_short && g.paradas.length === 1 ? <ChipEscuela nombre={p.school_short} color={p.school_color} /> : null}
                      </View>
                    );
                  })}
                </View>
              </Tarjeta>
            )}
          </View>
        </>
      )}
    </Pantalla>
  );
}
