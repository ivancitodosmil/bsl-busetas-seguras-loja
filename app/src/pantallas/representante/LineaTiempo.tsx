// Línea de tiempo del viaje: cada paso del recorrido, en vivo.
import React, { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Route } from 'lucide-react-native';
import type { NavRep, PilaRep } from '../../navegacion/tipos';
import { viaje } from '../../servicios/viaje';
import type { EventoViaje, Viaje } from '../../tipos';
import { EsqueletoLista, EstadoError, EstadoVacio, Pantalla, PillEstado, Tarjeta, Texto } from '../../ui';
import { fechaLarga, hora, textoSentido } from '../../utils';
import { LineaEventos, useResumen } from './_partes';

export default function LineaTiempo() {
  const nav = useNavigation<NavRep>();
  const { tripId, titulo } = useRoute<RouteProp<PilaRep, 'LineaTiempo'>>().params;
  const { datos } = useResumen();
  const [v, setV] = useState<Viaje | null>(null);
  const [eventos, setEventos] = useState<EventoViaje[] | null>(null);
  const [error, setError] = useState(false);
  const [refrescando, setRefrescando] = useState(false);

  const cargar = useCallback(async (manual = false) => {
    if (manual) setRefrescando(true);
    try {
      const [vj, ev] = await Promise.all([viaje.obtener(tripId), viaje.eventos(tripId)]);
      setV(vj);
      setEventos(ev);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setRefrescando(false);
    }
  }, [tripId]);

  useFocusEffect(
    useCallback(() => {
      cargar();
      return viaje.suscribir(tripId, {
        onEvento: (e, borrado) =>
          setEventos((lista) => {
            if (!lista) return lista;
            if (borrado) return lista.filter((x) => x.id !== e.id);
            return lista.some((x) => x.id === e.id) ? lista : [...lista, e];
          }),
        onViaje: (n) => setV((a) => (a ? { ...a, ...n } : n)),
      });
    }, [cargar, tripId]),
  );

  const nombres = useMemo(() => Object.fromEntries((datos?.children ?? []).map((h) => [h.id, h.name])), [datos]);
  const escuelas = useMemo(
    () => Object.fromEntries((datos?.children ?? []).filter((h) => h.school).map((h) => [h.school!.id, h.school!.short_name])),
    [datos],
  );
  const estado = v?.status === 'finished' ? 'finalizado' : v?.status === 'paused' ? 'en_pausa' : 'en_curso';

  return (
    <Pantalla
      titulo="Línea de tiempo"
      subtitulo={titulo ?? (v ? textoSentido(v.direction) : undefined)}
      onAtras={() => nav.goBack()}
      refrescando={refrescando}
      onRefrescar={() => cargar(true)}
    >
      {error && !eventos ? (
        <Tarjeta><EstadoError onReintentar={() => cargar(true)} /></Tarjeta>
      ) : !eventos ? (
        <EsqueletoLista filas={3} />
      ) : (
        <Tarjeta elevacion={2} estilo={{ gap: 16 }}>
          {v ? (
            <>
              <Texto v="medio" color="text2">{fechaLarga(v.date)}, salió {hora(v.started_at)}{v.finished_at ? `, terminó ${hora(v.finished_at)}` : ''}</Texto>
              <PillEstado estado={estado} />
            </>
          ) : null}
          {eventos.length === 0 ? (
            <EstadoVacio compacto icono={Route} titulo="Sin eventos todavía" texto="Cuando la buseta salga, aquí aparecerá cada paso del recorrido." />
          ) : (
            <LineaEventos eventos={eventos} nombres={nombres} escuelas={escuelas} />
          )}
        </Tarjeta>
      )}
    </Pantalla>
  );
}
