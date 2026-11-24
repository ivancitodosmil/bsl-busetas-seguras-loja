// Historial: recorridos de los últimos 90 días, por hijo y por mes. Solo lectura.
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { ChevronRight, History } from 'lucide-react-native';
import type { NavRep, PilaRep } from '../../navegacion/tipos';
import { representante } from '../../servicios/representante';
import { esp, margen, useTema } from '../../tema';
import { Avatar, Chip, EsqueletoLista, EstadoError, EstadoVacio, Pantalla, SelectorHijo, Tarjeta, Texto } from '../../ui';
import { fechaCorta, hora, hoyISO, MESES, sumarDias } from '../../utils';
import { colorDe, opcionesHijos, useResumen } from './_partes';

type Viajes = Awaited<ReturnType<typeof representante.historial>>;

interface Fila {
  clave: string; tripId: string; studentId: string; fecha: string; mes: string; ruta: string; detalle: string;
}

export default function Historial() {
  const { c } = useTema();
  const nav = useNavigation<NavRep>();
  const params = useRoute<RouteProp<PilaRep, 'Historial'>>().params;
  const { datos } = useResumen();
  const hijos = datos?.children ?? [];
  const [hijoSel, setHijoSel] = useState<string | null>(params?.studentId ?? null);
  const [viajes, setViajes] = useState<Viajes | null>(null);
  const [error, setError] = useState(false);
  const [refrescando, setRefrescando] = useState(false);
  const [mesSel, setMesSel] = useState<string | null>(null);

  const cargar = useCallback(async (manual = false) => {
    if (manual) setRefrescando(true);
    try {
      setViajes(await representante.historial(sumarDias(hoyISO(), -90)));
      setError(false);
    } catch {
      setError(true);
    } finally {
      setRefrescando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  const porId = useMemo(() => Object.fromEntries(hijos.map((h, i) => [h.id, { h, i }])), [hijos]);

  const filas = useMemo(() => {
    const lista: Fila[] = [];
    for (const v of viajes ?? []) {
      if (v.status !== 'finished') continue;
      const ninos = [...new Set(v.eventos.map((e) => e.student_id).filter(Boolean) as string[])];
      for (const id of ninos) {
        if (hijoSel && id !== hijoSel) continue;
        const abordo = v.eventos.find((e) => e.student_id === id && e.type === 'boarded');
        const llego = v.eventos.find((e) => e.student_id === id && (v.direction === 'pickup' ? e.type === 'school_arrival' : e.type === 'dropped'));
        const partes = [abordo ? `Abordó ${hora(abordo.created_at)}` : null, llego ? `llegó ${hora(llego.created_at)}` : null].filter(Boolean);
        lista.push({
          clave: `${v.id}-${id}`, tripId: v.id, studentId: id, fecha: v.date, mes: v.date.slice(0, 7),
          ruta: v.route?.name ?? 'Recorrido', detalle: partes.length ? partes.join(', ') : 'Sin registro de abordaje',
        });
      }
    }
    return lista;
  }, [viajes, hijoSel]);

  const meses = useMemo(() => [...new Set(filas.map((f) => f.mes))], [filas]);
  const mes = mesSel && meses.includes(mesSel) ? mesSel : meses[0];
  const visibles = filas.filter((f) => f.mes === mes);
  const nombreMes = (m: string) => {
    const n = MESES[Number(m.slice(5)) - 1];
    return n.charAt(0).toUpperCase() + n.slice(1);
  };

  return (
    <Pantalla
      titulo="Historial"
      onAtras={() => nav.goBack()}
      refrescando={refrescando}
      onRefrescar={() => cargar(true)}
      bajoTitulo={hijos.length > 1 ? <SelectorHijo hijos={opcionesHijos(hijos)} seleccionado={hijoSel} onSeleccionar={setHijoSel} /> : undefined}
    >
      {error && !viajes ? (
        <Tarjeta><EstadoError onReintentar={() => cargar(true)} /></Tarjeta>
      ) : !viajes ? (
        <EsqueletoLista filas={4} />
      ) : filas.length === 0 ? (
        <Tarjeta elevacion={2}>
          <EstadoVacio icono={History} titulo="Aún no hay recorridos" texto="Cuando termine el primer recorrido de tus hijos, lo verás aquí." />
        </Tarjeta>
      ) : (
        <>
          <Tarjeta elevacion={2} estilo={{ paddingVertical: 10 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: margen }} style={{ marginRight: -esp.lg }}>
              {meses.map((m) => <Chip key={m} texto={nombreMes(m)} seleccionado={m === mes} onPress={() => setMesSel(m)} />)}
            </ScrollView>
          </Tarjeta>
          <View style={{ gap: 8 }}>
            {visibles.map((f) => {
              const info = porId[f.studentId];
              return (
                <Tarjeta
                  key={f.clave}
                  onPress={() => nav.navigate('Reproduccion', { tripId: f.tripId, studentId: f.studentId, titulo: fechaCorta(f.fecha) })}
                  etiqueta={`${fechaCorta(f.fecha)}, ${info?.h.name ?? ''}, ${f.detalle}. Ver el recorrido`}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Avatar nombre={info?.h.name} color={colorDe(info?.h, info?.i)} tam={40} />
                    <View style={{ flex: 1 }}>
                      <Texto v="fuerte" style={{ fontSize: 15 }}>{fechaCorta(f.fecha)}{hijos.length > 1 && info ? `, ${info.h.name}` : ''}</Texto>
                      <Texto v="nota" color="text2">{f.detalle}</Texto>
                      <Texto v="nota" color="text3" numberOfLines={1}>{f.ruta}</Texto>
                    </View>
                    <ChevronRight size={20} color={c.text3} strokeWidth={2} />
                  </View>
                </Tarjeta>
              );
            })}
          </View>
        </>
      )}
      <Texto v="nota" color="text3" centro>Se guardan los últimos 90 días. Solo lectura.</Texto>
    </Pantalla>
  );
}
