// Piezas compartidas por las pantallas del representante.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  AlertTriangle, Bus, CircleCheck, CirclePause, CirclePlay, Clock, Flag, MapPin, MessageSquare, Route, School, UserCheck,
  type LucideIcon,
} from 'lucide-react-native';
import { PALETA, useTema, type Colores } from '../../tema';
import { representante } from '../../servicios/representante';
import { viaje } from '../../servicios/viaje';
import { Texto, type OpcionHijo } from '../../ui';
import type { EventoViaje, HijoResumen, NinoEnRuta, ResumenRepresentante, RutaRepresentante, Sentido } from '../../tipos';
import { hora } from '../../utils';

export function colorDe(h: HijoResumen | undefined, i = 0): string {
  return h?.school?.color ?? PALETA[i % PALETA.length];
}

export function opcionesHijos(hijos: HijoResumen[]): OpcionHijo[] {
  return hijos.map((h, i) => ({ id: h.id, nombre: h.name, color: colorDe(h, i) }));
}

/** Resumen del día con estados de carga; se recarga al enfocar y, si `enVivo`, con cada cambio del servidor. */
export function useResumen(enVivo = false) {
  const [datos, setDatos] = useState<ResumenRepresentante | null>(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState(false);
  const vivo = useRef(true);

  const recargar = useCallback(async (manual = false) => {
    if (manual) setRefrescando(true);
    try {
      const r = await representante.resumen();
      if (!vivo.current) return;
      setDatos(r);
      setError(false);
    } catch {
      if (vivo.current) setError(true);
    } finally {
      if (vivo.current) {
        setCargando(false);
        setRefrescando(false);
      }
    }
  }, []);

  useEffect(() => {
    vivo.current = true;
    return () => { vivo.current = false; };
  }, []);

  useFocusEffect(
    useCallback(() => {
      recargar();
      if (!enVivo) return;
      return viaje.suscribirCambiosDelDia(() => recargar());
    }, [recargar, enVivo]),
  );

  return { datos, cargando, refrescando, error, recargar };
}

export const leyendaSentido = (s: Sentido) => (s === 'pickup' ? 'ida' : 'vuelta');

/** Texto de estado de un niño dentro de una ruta. */
export function estadoNino(n: NinoEnRuta, ruta: RutaRepresentante, hijo?: HijoResumen): { texto: string; tono: 'normal' | 'vivo' | 'ok' | 'apagado' } {
  if (n.absent) return { texto: `No va hoy, ${leyendaSentido(ruta.direction)}`, tono: 'apagado' };
  if (n.status === 'delivered') return { texto: `Llegó ${hora(n.delivered_at)}`, tono: 'ok' };
  if (n.status === 'boarded') return { texto: `Abordó a las ${hora(n.boarded_at)}`, tono: 'ok' };
  if (n.status === 'near') return { texto: 'La buseta está a menos de 1 km', tono: 'vivo' };
  if (ruta.direction === 'pickup') return { texto: ruta.trip ? 'En camino. Te avisamos a 1 km y a 500 m' : 'Te avisamos cuando la buseta salga', tono: 'normal' };
  return { texto: hijo?.school?.exit_time ? `Sale del colegio ${hijo.school.exit_time}` : 'Pendiente', tono: 'normal' };
}

export function horaGrande(n: NinoEnRuta, ruta: RutaRepresentante): { hora: string; leyenda: string } {
  return ruta.direction === 'pickup'
    ? { hora: n.school_time ?? n.estimated_time ?? '', leyenda: 'llega al colegio' }
    : { hora: n.estimated_time ?? '', leyenda: 'llega a casa' };
}

export function colorTono(tono: 'normal' | 'vivo' | 'ok' | 'apagado', c: Colores): string {
  return tono === 'ok' ? c.successInk : tono === 'vivo' ? c.accentInk : tono === 'apagado' ? c.text3 : c.text2;
}

/** Quién conduce hoy: el sustituto aceptado o el titular. */
export const conductorDe = (r: RutaRepresentante) => r.substitute ?? r.driver;

// ── Eventos del viaje ───────────────────────────────────────────────────────
export interface EventoTexto { titulo: string; detalle?: string; icono: LucideIcon; tono: 'primario' | 'exito' | 'aviso' | 'urgente' | 'acento' }

export function textoEvento(e: EventoViaje, nombres: Record<string, string>, escuelas: Record<string, string> = {}): EventoTexto {
  const nino = (e.student_id && nombres[e.student_id]) || 'Tu hijo';
  const lugar = e.payload?.place;
  switch (e.type) {
    case 'trip_started': return { titulo: 'La buseta salió', icono: Bus, tono: 'primario' };
    case 'bus_near': return { titulo: `A 1 km de ${lugar ?? 'tu parada'}`, detalle: `Aviso enviado para ${nino}`, icono: MapPin, tono: 'acento' };
    case 'bus_arriving': return { titulo: `A 500 m de ${lugar ?? 'tu parada'}`, detalle: `Aviso enviado para ${nino}`, icono: MapPin, tono: 'urgente' };
    case 'boarded': return { titulo: `${nino} abordó`, detalle: lugar, icono: UserCheck, tono: 'exito' };
    case 'dropped': return { titulo: `${nino} llegó a ${lugar ?? 'su destino'}`, icono: Flag, tono: 'exito' };
    case 'school_arrival': return { titulo: `${nino} llegó a ${(e.school_id && escuelas[e.school_id]) || 'la escuela'}`, icono: School, tono: 'exito' };
    case 'paused': return { titulo: 'Recorrido en pausa', detalle: e.payload?.reason, icono: CirclePause, tono: 'aviso' };
    case 'resumed': return { titulo: 'El recorrido continúa', icono: CirclePlay, tono: 'primario' };
    case 'delay': return { titulo: 'El chofer avisó un retraso', detalle: 'La buseta va más tarde de lo previsto', icono: Clock, tono: 'aviso' };
    case 'deviation': return { titulo: 'La buseta cambió de camino', detalle: 'Se apartó más de 300 m de la ruta', icono: AlertTriangle, tono: 'urgente' };
    case 'message': return { titulo: `Mensaje: «${e.payload?.body ?? ''}»`, detalle: 'Del chofer', icono: MessageSquare, tono: 'primario' };
    case 'trip_finished': return { titulo: 'Recorrido terminado', icono: CircleCheck, tono: 'exito' };
    default: return { titulo: 'Evento del recorrido', icono: Route, tono: 'primario' };
  }
}

/** Línea vertical de eventos: hora a la izquierda, punto con ícono y texto. */
export function LineaEventos({
  eventos, nombres, escuelas, activoHasta,
}: { eventos: EventoViaje[]; nombres: Record<string, string>; escuelas?: Record<string, string>; activoHasta?: number }) {
  const { c } = useTema();
  const tonos = {
    primario: [c.primarySoft, c.primary], exito: [c.successSoft, c.successInk], aviso: [c.warningSoft, c.warningInk],
    urgente: [c.dangerSoft, c.dangerInk], acento: [c.accentSoft, c.accentInk],
  } as const;
  return (
    <View>
      {eventos.map((e, i) => {
        const t = textoEvento(e, nombres, escuelas);
        const [fondo, tinta] = tonos[t.tono];
        const Icono = t.icono;
        const apagado = activoHasta != null && new Date(e.created_at).getTime() > activoHasta;
        return (
          <View key={e.id} style={{ flexDirection: 'row', gap: 12, opacity: apagado ? 0.4 : 1 }} accessible accessibilityLabel={`${hora(e.created_at)}, ${t.titulo}${t.detalle ? ', ' + t.detalle : ''}`}>
            <Texto v="medioFuerte" color="text2" style={{ width: 46, paddingTop: 8, fontVariant: ['tabular-nums'] }}>{hora(e.created_at)}</Texto>
            <View style={{ alignItems: 'center' }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: fondo, alignItems: 'center', justifyContent: 'center' }}>
                <Icono size={18} color={tinta} strokeWidth={2} />
              </View>
              {i < eventos.length - 1 ? <View style={{ width: 2, flex: 1, minHeight: 18, backgroundColor: c.border }} /> : null}
            </View>
            <View style={{ flex: 1, paddingTop: 7, paddingBottom: 16 }}>
              <Texto v="fuerte" style={{ fontSize: 15 }}>{t.titulo}</Texto>
              {t.detalle ? <Texto v="nota" color="text2">{t.detalle}</Texto> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
