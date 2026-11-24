// Ficha del hijo: escuela, chofer, origen y destino, y quiénes son sus representantes.
import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { CalendarX, ChevronRight, History, MapPinned } from 'lucide-react-native';
import { pedir, supabase } from '../../config/supabase';
import { useSesion } from '../../estado/sesion';
import type { NavRep, PilaRep } from '../../navegacion/tipos';
import { representante } from '../../servicios/representante';
import { esp, useTema } from '../../tema';
import type { Direccion, FichaChofer } from '../../tipos';
import {
  Avatar, Boton, ChipEscuela, EsqueletoLista, EstadoError, FilaAjuste, Pantalla, PillEstado, Tarjeta, TarjetaDireccion, Texto, TituloSeccion,
} from '../../ui';
import { edad, listaNombres, nombreCompleto, NOMBRES_DIA_ISO } from '../../utils';

type Ficha = Awaited<ReturnType<typeof representante.ficha>>;

export const calleDe = (d: Direccion) =>
  [`${d.main_street}${d.cross_street ? ` y ${d.cross_street}` : ''}`, d.house_number ? `Casa ${d.house_number}` : null].filter(Boolean).join(', ');
export const detalleDe = (d: Direccion) => [d.neighborhood, d.reference].filter(Boolean).join(', ') || null;

export default function FichaHijo() {
  const { c } = useTema();
  const nav = useNavigation<NavRep>();
  const { studentId } = useRoute<RouteProp<PilaRep, 'FichaHijo'>>().params;
  const yo = useSesion((s) => s.idSesion);
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [chofer, setChofer] = useState<FichaChofer | null>(null);
  const [error, setError] = useState(false);
  const [refrescando, setRefrescando] = useState(false);

  const cargar = useCallback(async (manual = false) => {
    if (manual) setRefrescando(true);
    try {
      const f = await representante.ficha(studentId);
      setFicha(f);
      setError(false);
      pedir<FichaChofer | null>(supabase.rpc('ficha_chofer', { p_driver: f.estudiante.driver_id })).then(setChofer).catch(() => {});
    } catch {
      setError(true);
    } finally {
      setRefrescando(false);
    }
  }, [studentId]);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  const e = ficha?.estudiante;
  const nombre = e ? e.nickname || e.first_name : '';
  const porId = Object.fromEntries((ficha?.direcciones ?? []).map((d) => [d.id, d]));
  const origen = e?.default_pickup_address_id ? porId[e.default_pickup_address_id] : undefined;
  const destino = (e?.default_dropoff_address_id && porId[e.default_dropoff_address_id]) || origen;

  // "Martes y jueves: Casa de los abuelos"
  const notaExcepciones = (sentido: 'pickup' | 'dropoff') => {
    const grupos = new Map<string, number[]>();
    for (const x of ficha?.excepciones ?? []) {
      if (x.direction !== sentido) continue;
      grupos.set(x.address_id, [...(grupos.get(x.address_id) ?? []), x.weekday]);
    }
    const partes = [...grupos.entries()].map(([id, dias]) => {
      const t = listaNombres(dias.sort((a, b) => a - b).map((d) => NOMBRES_DIA_ISO[d - 1]));
      return `${t.charAt(0).toUpperCase()}${t.slice(1)}: ${porId[id]?.label ?? 'otra dirección'}`;
    });
    return partes.length ? partes.join(', ') : null;
  };

  const anos = edad(e?.birth_date);

  return (
    <Pantalla titulo={nombre ? `Ficha de ${nombre}` : 'Ficha'} onAtras={() => nav.goBack()} refrescando={refrescando} onRefrescar={() => cargar(true)}>
      {error && !ficha ? (
        <Tarjeta><EstadoError onReintentar={() => cargar(true)} /></Tarjeta>
      ) : !ficha || !e ? (
        <EsqueletoLista filas={3} />
      ) : (
        <>
          <Tarjeta elevacion={2}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Avatar nombre={nombre} color={e.school?.color} tam={60} />
              <View style={{ flex: 1, gap: 4 }}>
                <Texto v="subtitulo">{e.first_name} {e.last_name}</Texto>
                <Texto v="medio" color="text2">{[anos != null ? `${anos} años` : null, e.grade].filter(Boolean).join(', ') || 'Estudiante'}</Texto>
                <ChipEscuela nombre={e.school?.name} color={e.school?.color} />
              </View>
            </View>
          </Tarjeta>

          {chofer ? (
            <Tarjeta onPress={() => nav.navigate('PerfilChofer', { chofer })} etiqueta={`Chofer ${chofer.name}`}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Avatar nombre={chofer.name} foto={chofer.photo_url} tam={44} />
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Texto v="fuerte">{chofer.name}</Texto>
                    {chofer.verified ? <PillEstado estado="verificado" /> : null}
                  </View>
                  <Texto v="nota" color="text2" numberOfLines={1}>{[chofer.vehicle, chofer.color, chofer.plate].filter(Boolean).join(', ')}</Texto>
                </View>
                <ChevronRight size={20} color={c.text3} strokeWidth={2} />
              </View>
            </Tarjeta>
          ) : null}

          <View style={{ gap: esp.sm }}>
            {origen ? (
              <TarjetaDireccion tipo="origen" etiqueta={origen.label} calle={calleDe(origen)} detalle={detalleDe(origen)} nota={notaExcepciones('pickup')} />
            ) : (
              <Tarjeta plano><Texto v="medio" color="text2">El chofer aún no registra la dirección de recogida.</Texto></Tarjeta>
            )}
            {destino ? (
              <TarjetaDireccion tipo="destino" etiqueta={destino.label} calle={calleDe(destino)} detalle={detalleDe(destino)} nota={notaExcepciones('dropoff') ?? destino.receiver_note} />
            ) : null}
            <Boton titulo="Editar direcciones y excepciones" variante="secundario" icono={MapPinned} onPress={() => nav.navigate('Direcciones', { studentId })} />
          </View>

          <View>
            <TituloSeccion titulo="Representantes" />
            <Tarjeta estilo={{ paddingVertical: 4, marginTop: 4 }}>
              {ficha.representantes.map((r, i) => {
                const n = nombreCompleto(r.user) || 'Representante';
                const permisos = [r.relationship, r.is_primary ? 'principal' : null, r.can_report_absence ? 'reporta ausencias' : null, r.receives_notifications ? 'recibe avisos' : 'sin avisos'].filter(Boolean).join(', ');
                return (
                  <View key={r.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 10, borderBottomWidth: i === ficha.representantes.length - 1 ? 0 : 1, borderBottomColor: c.border }}>
                    <Avatar nombre={n} foto={r.user?.photo_url} tam={40} />
                    <View style={{ flex: 1 }}>
                      <Texto v="fuerte" style={{ fontSize: 15 }}>{n}{r.user_id === yo ? ' (tú)' : ''}</Texto>
                      <Texto v="nota" color="text2">{permisos}</Texto>
                    </View>
                  </View>
                );
              })}
            </Tarjeta>
            <Texto v="nota" color="text3" style={{ marginTop: 8 }}>Para sumar a otra persona, pídele al chofer un código nuevo para {nombre}.</Texto>
          </View>

          <Tarjeta estilo={{ paddingVertical: 4 }}>
            <FilaAjuste icono={History} titulo="Historial" texto="Recorridos de los últimos 90 días" onPress={() => nav.navigate('Historial', { studentId })} />
            <FilaAjuste icono={CalendarX} titulo="Ausencias" texto="Avisar los días que no va" onPress={() => nav.navigate('Pestanas', { screen: 'Ausencias', params: { studentId } })} ultima />
          </Tarjeta>
        </>
      )}
    </Pantalla>
  );
}
