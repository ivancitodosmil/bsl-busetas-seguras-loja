// Mapa del recorrido: buseta, trazado por calles y paradas de casa y escuela.
import React, { useEffect, useMemo, useRef } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { Bus, Home, School } from 'lucide-react-native';
import { radio, useTema } from '../tema';
import type { Coordenada, Parada } from '../tipos';
import { regionDe } from '../utils';

const ESTILO_OSCURO = [
  { elementType: 'geometry', stylers: [{ color: '#13223A' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#A9B9CD' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0B1522' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#27405F' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#14304E' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
];
const ESTILO_CLARO = [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }, { featureType: 'transit', stylers: [{ visibility: 'off' }] }];

interface Props {
  paradas?: Parada[];
  linea?: Coordenada[]; // trazado planificado
  recorrido?: Coordenada[]; // por dónde ya pasó (historial)
  aproximacion?: Coordenada[] | null; // camino por calles de la buseta a la próxima parada
  buseta?: Coordenada | null;
  destacadas?: string[]; // stop_id de "tu parada"
  hechas?: string[]; // stop_id ya atendidas
  color?: string;
  alto?: number;
  seguir?: boolean; // centra la cámara en la buseta cuando se mueve
  estilo?: StyleProp<ViewStyle>;
  redondeado?: boolean;
  interactivo?: boolean;
}

export function MapaRecorrido({
  paradas = [], linea, recorrido, aproximacion, buseta, destacadas = [], hechas = [], color, alto, seguir, estilo, redondeado = true, interactivo = true,
}: Props) {
  const { c, oscuro } = useTema();
  const ref = useRef<MapView>(null);
  const puntos = useMemo(
    () => paradas.filter((p) => p.latitude != null && p.longitude != null).map((p) => ({ latitude: p.latitude as number, longitude: p.longitude as number })),
    [paradas],
  );
  const inicial = useMemo(() => regionDe([...puntos, ...(buseta ? [buseta] : [])]), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Encadra todo cuando llegan las paradas.
  useEffect(() => {
    const todos = [...puntos, ...(buseta ? [buseta] : [])];
    if (todos.length > 1) {
      const t = setTimeout(() => ref.current?.fitToCoordinates(todos, { edgePadding: { top: 60, right: 50, bottom: 60, left: 50 }, animated: true }), 350);
      return () => clearTimeout(t);
    }
  }, [puntos.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (seguir && buseta) ref.current?.animateCamera({ center: buseta }, { duration: 800 });
  }, [seguir, buseta?.latitude, buseta?.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

  const trazo = color ?? c.primary;
  return (
    <View style={[{ height: alto, borderRadius: redondeado ? radio.grande : 0, overflow: 'hidden', backgroundColor: c.surface2 }, alto ? null : { flex: 1 }, estilo]}>
      <MapView
        ref={ref}
        style={{ flex: 1 }}
        initialRegion={inicial}
        customMapStyle={oscuro ? ESTILO_OSCURO : ESTILO_CLARO}
        userInterfaceStyle={oscuro ? 'dark' : 'light'}
        toolbarEnabled={false}
        showsCompass={false}
        showsMyLocationButton={false}
        scrollEnabled={interactivo}
        zoomEnabled={interactivo}
        rotateEnabled={false}
        pitchEnabled={false}
        accessibilityLabel="Mapa del recorrido"
      >
        {linea && linea.length > 1 ? <Polyline coordinates={linea} strokeColor={trazo} strokeWidth={5} lineCap="round" lineJoin="round" /> : null}
        {recorrido && recorrido.length > 1 ? <Polyline coordinates={recorrido} strokeColor={c.accent} strokeWidth={5} lineCap="round" lineJoin="round" /> : null}
        {aproximacion && aproximacion.length > 1 ? <Polyline coordinates={aproximacion} strokeColor={c.primaryStrong} strokeWidth={5} lineDashPattern={[12, 8]} lineCap="round" lineJoin="round" zIndex={5} /> : null}
        {paradas.map((p) => {
          if (p.latitude == null || p.longitude == null) return null;
          const escuela = p.kind === 'dropoff_school' || p.kind === 'pickup_school';
          const mia = destacadas.includes(p.stop_id);
          const hecha = hechas.includes(p.stop_id);
          const fondo = hecha ? c.success : escuela ? p.school_color ?? c.primary : mia ? c.accent : c.surface;
          const tinta = hecha || escuela ? '#FFFFFF' : mia ? c.onAccent : c.primary;
          const tam = escuela || mia ? 34 : 26;
          const Icono = escuela ? School : Home;
          return (
            <Marker
              key={p.stop_id}
              coordinate={{ latitude: p.latitude, longitude: p.longitude }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
              title={p.label}
              description={p.street ?? undefined}
            >
              <View style={{ width: tam, height: tam, borderRadius: tam / 2, backgroundColor: fondo, borderWidth: 2.5, borderColor: escuela || mia || hecha ? '#FFFFFF' : c.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Icono size={tam * 0.5} color={tinta} strokeWidth={2.4} />
              </View>
            </Marker>
          );
        })}
        {buseta ? (
          <Marker coordinate={buseta} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false} title="Buseta" zIndex={10}>
            <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: c.accent, borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', elevation: 6 }}>
              <Bus size={24} color={c.onAccent} strokeWidth={2.3} />
            </View>
          </Marker>
        ) : null}
      </MapView>
    </View>
  );
}
