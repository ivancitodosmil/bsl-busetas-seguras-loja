// Reproducción de un recorrido pasado: la buseta sobre el mapa y la línea de eventos.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Pause, Play, RotateCcw } from 'lucide-react-native';
import type { NavRep, PilaRep } from '../../navegacion/tipos';
import { viaje } from '../../servicios/viaje';
import { esp, radio, useTema } from '../../tema';
import type { EventoViaje, PosicionViaje, Viaje } from '../../tipos';
import { BannerAlerta, Boton, EsqueletoLista, EstadoError, MapaRecorrido, Pantalla, Tarjeta, Texto } from '../../ui';
import { fechaLarga, hora } from '../../utils';
import { LineaEventos, useResumen } from './_partes';

export default function Reproduccion() {
  const { c } = useTema();
  const nav = useNavigation<NavRep>();
  const { tripId, studentId, titulo } = useRoute<RouteProp<PilaRep, 'Reproduccion'>>().params;
  const { datos } = useResumen();
  const [v, setV] = useState<Viaje | null>(null);
  const [posiciones, setPosiciones] = useState<PosicionViaje[]>([]);
  const [eventos, setEventos] = useState<EventoViaje[] | null>(null);
  const [error, setError] = useState(false);
  const [i, setI] = useState(0);
  const [reproduciendo, setReproduciendo] = useState(false);
  const [velocidad, setVelocidad] = useState<1 | 4>(1);

  const cargar = useCallback(async () => {
    try {
      const [vj, pos, ev] = await Promise.all([viaje.obtener(tripId), viaje.posiciones(tripId), viaje.eventos(tripId)]);
      setV(vj);
      setPosiciones(pos);
      setEventos(studentId ? ev.filter((e) => !e.student_id || e.student_id === studentId) : ev);
      setI(Math.max(0, pos.length - 1));
      setError(false);
    } catch {
      setError(true);
    }
  }, [tripId, studentId]);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  const total = posiciones.length;
  useEffect(() => {
    if (!reproduciendo || total < 2) return;
    const reloj = setInterval(() => {
      setI((n) => {
        const sig = Math.min(total - 1, n + velocidad);
        if (sig >= total - 1) setReproduciendo(false);
        return sig;
      });
    }, 250);
    return () => clearInterval(reloj);
  }, [reproduciendo, velocidad, total]);

  const nombres = useMemo(() => Object.fromEntries((datos?.children ?? []).map((h) => [h.id, h.name])), [datos]);
  const escuelas = useMemo(
    () => Object.fromEntries((datos?.children ?? []).filter((h) => h.school).map((h) => [h.school!.id, h.school!.short_name])),
    [datos],
  );
  const recorrido = useMemo(() => posiciones.slice(0, i + 1).map((p) => ({ latitude: p.latitude, longitude: p.longitude })), [posiciones, i]);
  const actual = posiciones[i];
  const paradas = useMemo(() => (v?.planned_stops_snapshot ?? []).filter((p) => p.latitude != null), [v]);
  const nino = studentId ? nombres[studentId] : undefined;

  const alternar = () => {
    if (!reproduciendo && i >= total - 1) setI(0);
    setReproduciendo((r) => !r);
  };

  return (
    <Pantalla titulo={titulo ?? 'Recorrido'} subtitulo={v ? fechaLarga(v.date) : undefined} onAtras={() => nav.goBack()}>
      {error && !eventos ? (
        <Tarjeta><EstadoError onReintentar={cargar} /></Tarjeta>
      ) : !eventos || !v ? (
        <EsqueletoLista filas={2} mapa />
      ) : (
        <>
          {total >= 2 ? (
            <Tarjeta elevacion={2} estilo={{ padding: 0, overflow: 'hidden' }}>
              <MapaRecorrido paradas={paradas} recorrido={recorrido} buseta={actual ? { latitude: actual.latitude, longitude: actual.longitude } : null} alto={260} redondeado={false} />
              <View style={{ padding: esp.lg, gap: esp.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Texto v="fuerte" accessibilityLiveRegion="none">Reproducción {hora(actual?.recorded_at)}</Texto>
                  <Texto v="nota" color="text3">{hora(posiciones[0].recorded_at)} a {hora(posiciones[total - 1].recorded_at)}</Texto>
                </View>
                <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round((i / (total - 1)) * 100) }} style={{ height: 8, borderRadius: radio.pill, backgroundColor: c.surface2, overflow: 'hidden' }}>
                  <View style={{ width: `${(i / (total - 1)) * 100}%`, height: 8, backgroundColor: c.accent, borderRadius: radio.pill }} />
                </View>
                <View style={{ flexDirection: 'row', gap: esp.sm }}>
                  <Boton
                    titulo={reproduciendo ? 'Pausar' : i >= total - 1 ? 'Ver de nuevo' : 'Reproducir'}
                    icono={reproduciendo ? Pause : i >= total - 1 ? RotateCcw : Play}
                    onPress={alternar}
                    estilo={{ flex: 1 }}
                  />
                  <Boton
                    titulo={velocidad === 1 ? 'x1' : 'x4'}
                    etiqueta={`Velocidad ${velocidad}. Cambiar`}
                    variante="secundario"
                    onPress={() => setVelocidad(velocidad === 1 ? 4 : 1)}
                    ancho={false}
                    estilo={{ width: 76 }}
                  />
                </View>
              </View>
            </Tarjeta>
          ) : (
            <BannerAlerta tipo="info" titulo="Sin trazado guardado" texto="Este recorrido no tiene posiciones guardadas. Te mostramos sus eventos." />
          )}

          <Tarjeta estilo={{ gap: esp.md }}>
            <Texto v="seccion" accessibilityRole="header">{nino ? `Recorrido de ${nino}` : 'Eventos del recorrido'}</Texto>
            {eventos.length === 0 ? (
              <Texto v="medio" color="text2">No hay eventos registrados.</Texto>
            ) : (
              <LineaEventos eventos={eventos} nombres={nombres} escuelas={escuelas} activoHasta={total >= 2 && actual ? new Date(actual.recorded_at).getTime() : undefined} />
            )}
          </Tarjeta>
          <Texto v="nota" color="text3" centro>Se guardan los últimos 90 días. Solo lectura.</Texto>
        </>
      )}
    </Pantalla>
  );
}
