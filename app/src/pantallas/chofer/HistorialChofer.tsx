// Historial de recorridos del chofer, por mes y sentido, con las cancelaciones.
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { CalendarOff, ChevronRight, History } from 'lucide-react-native';
import { EsqueletoLista, EstadoError, EstadoVacio, Pantalla, Segmentado, Tarjeta, Texto } from '../../ui';
import { useTema } from '../../tema';
import { chofer } from '../../servicios/chofer';
import { useSesion } from '../../estado/sesion';
import type { NavChofer } from '../../navegacion/tipos';
import type { Cancelacion, Ruta, Sentido, Viaje } from '../../tipos';
import { fechaCorta, hora, hoyISO, mensajeError, MESES } from '../../utils';
import { ChipsUnicos, finDeMes, mesISO, useCarga } from './_c1Partes';

type FilaViaje = Viaje & { route: Pick<Ruta, 'id' | 'name' | 'direction' | 'color'> | null };
type FilaCancel = Cancelacion & { route: { name: string } | null };
type Filtro = 'todos' | Sentido;

export default function HistorialChofer() {
  const nav = useNavigation<NavChofer>();
  const { c } = useTema();
  const yo = useSesion((s) => s.idSesion);
  const meses = useMemo(() => [0, -1, -2].map((d) => mesISO(hoyISO(), d)), []);
  const [mes, setMes] = useState(meses[0]);
  const [filtro, setFiltro] = useState<Filtro>('todos');

  const { datos, cargando, refrescando, error, recargar, refrescar } = useCarga(async () => {
    const hasta = finDeMes(mes);
    const [viajes, cancelaciones] = await Promise.all([
      chofer.historial(mes, hasta, filtro === 'todos' ? undefined : filtro),
      chofer.cancelacionesEntre(mes, hasta),
    ]);
    return { viajes: viajes as FilaViaje[], cancelaciones: cancelaciones as FilaCancel[] };
  });

  // Viajes y cancelaciones en una sola lista, del día más reciente al más antiguo.
  const filas = useMemo(() => {
    if (!datos) return [];
    const v = datos.viajes.map((x) => ({ tipo: 'viaje' as const, fecha: x.date, orden: x.started_at, viaje: x }));
    const k = datos.cancelaciones.map((x) => ({ tipo: 'cancelacion' as const, fecha: x.date, orden: x.date, cancelacion: x }));
    return [...v, ...k].sort((a, b) => (a.fecha === b.fecha ? b.orden.localeCompare(a.orden) : b.fecha.localeCompare(a.fecha)));
  }, [datos]);

  const cambiar = (f: () => void) => { f(); setTimeout(() => recargar(true), 0); };

  return (
    <Pantalla
      titulo="Historial de recorridos"
      onAtras={() => nav.goBack()}
      refrescando={refrescando}
      onRefrescar={refrescar}
      bajoTitulo={
        <Segmentado
          sobreHero
          valor={filtro}
          onChange={(v) => cambiar(() => setFiltro(v))}
          opciones={[{ valor: 'todos', texto: 'Todos' }, { valor: 'pickup', texto: 'Ida' }, { valor: 'dropoff', texto: 'Vuelta' }]}
        />
      }
    >
      <Tarjeta estilo={{ paddingVertical: 12 }}>
        <ChipsUnicos
          valor={mes}
          onChange={(v) => cambiar(() => setMes(v))}
          opciones={meses.map((m) => ({ valor: m, texto: MESES[Number(m.slice(5, 7)) - 1].replace(/^./, (l) => l.toUpperCase()) }))}
        />
      </Tarjeta>

      {cargando && !datos ? (
        <EsqueletoLista filas={3} />
      ) : error && !datos ? (
        <Tarjeta><EstadoError texto={mensajeError(error)} onReintentar={refrescar} /></Tarjeta>
      ) : filas.length === 0 ? (
        <Tarjeta>
          <EstadoVacio icono={History} titulo="Sin recorridos este mes" texto="Cuando finalices un recorrido, su resumen quedará guardado aquí." compacto />
        </Tarjeta>
      ) : (
        <Tarjeta estilo={{ paddingVertical: 4 }}>
          {filas.map((f, i) => {
            const borde = { borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.border } as const;
            if (f.tipo === 'cancelacion') {
              return (
                <View key={`c-${f.cancelacion.id}`} style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 10 }, borde]}>
                  <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: c.dangerSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <CalendarOff size={19} color={c.dangerInk} strokeWidth={2} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Texto v="fuerte">{fechaCorta(f.fecha)}, {f.cancelacion.route?.name ?? 'Ruta'}</Texto>
                    <Texto v="nota" color="text2">Servicio cancelado, {f.cancelacion.reason.toLowerCase()}</Texto>
                  </View>
                </View>
              );
            }
            const v = f.viaje;
            const s = v.summary;
            const enCurso = v.status !== 'finished';
            const detalle = enCurso
              ? `Desde las ${hora(v.started_at)}, en curso`
              : [
                  `${hora(v.started_at)} a ${hora(v.finished_at)}`,
                  s ? `${s.delivered} de ${s.students} niños` : null,
                  s?.delay_min ? `retraso de ${s.delay_min} min` : null,
                ].filter(Boolean).join(', ');
            return (
              <Tarjeta
                key={v.id}
                plano
                onPress={() => (enCurso ? nav.navigate('RutaActiva', { tripId: v.id }) : nav.navigate('Resumen', { tripId: v.id }))}
                etiqueta={`${fechaCorta(v.date)}, ${v.route?.name ?? 'Recorrido'}, ${detalle}`}
                estilo={[{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 10, paddingHorizontal: 0, backgroundColor: 'transparent', borderRadius: 0 }, borde]}
              >
                <View style={{ width: 10, height: 38, borderRadius: 5, backgroundColor: v.route?.color ?? c.primary }} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Texto v="fuerte">{fechaCorta(v.date)}, {v.route?.name ?? 'Recorrido'}</Texto>
                  <Texto v="nota" color="text2">{detalle}</Texto>
                  {yo && v.driver_id !== yo ? <Texto v="nota" color="accentInk">Conducido por otro chofer</Texto> : null}
                </View>
                <ChevronRight size={20} color={c.text3} />
              </Tarjeta>
            );
          })}
        </Tarjeta>
      )}

      <Texto v="nota" color="text2">Toca un recorrido para ver el resumen o volver a compartir el PDF.</Texto>
    </Pantalla>
  );
}
