// 26 · Avisos vacío · 31 · Centro de avisos · 56 · Avisos del chofer
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { BellOff, CheckCheck, Inbox, Trash2 } from 'lucide-react-native';
import { BannerAlerta, Boton, Chip, EsqueletoLista, EstadoError, EstadoVacio, HoraReal, IconoAviso, ModalConfirmar, Pantalla, Texto, Avatar } from '../../ui';
import { esp, fuentes, margen, radio, sombra, useTema } from '../../tema';
import { useAvisos } from '../../estado/avisos';
import { useSesion } from '../../estado/sesion';
import { representante } from '../../servicios/representante';
import { fechaDe, fechaLarga, hora, hoyISO, sumarDias } from '../../utils';
import type { Aviso, HijoResumen } from '../../tipos';
import type { NavChofer, NavRep } from '../../navegacion/tipos';

const AL_MAPA = ['bus_near', 'bus_arriving', 'trip_started', 'delay', 'deviation', 'trip_paused', 'trip_resumed'];

export default function CentroAvisos() {
  const { c } = useTema();
  const nav = useNavigation<NavRep>();
  const navChofer = nav as unknown as NavChofer;
  const usuario = useSesion((s) => s.usuario);
  const esChofer = usuario?.role === 'driver';
  const { avisos, cargando, error, permiso, cargar, marcarLeido, marcarTodos, borrarTodo, revisarPermiso } = useAvisos();
  const [filtro, setFiltro] = useState<string>('todos'); // 'todos' | 'urgentes' | id de hijo
  const [hijos, setHijos] = useState<HijoResumen[]>([]);
  const [confirmar, setConfirmar] = useState(false);
  const [refrescando, setRefrescando] = useState(false);

  useFocusEffect(
    useCallback(() => {
      cargar();
      revisarPermiso();
    }, [cargar, revisarPermiso]),
  );

  // Los hijos (para los filtros) se piden una vez.
  useEffect(() => {
    if (esChofer || !usuario) return;
    representante.resumen().then((r) => setHijos(r.children)).catch(() => {});
  }, [esChofer, usuario?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibles = useMemo(() => {
    if (filtro === 'urgentes') return avisos.filter((a) => a.channel === 'urgent');
    if (filtro !== 'todos') return avisos.filter((a) => a.student_id === filtro);
    return avisos;
  }, [avisos, filtro]);

  const grupos = useMemo(() => {
    const hoy = hoyISO();
    const ayer = sumarDias(hoy, -1);
    const mapa = new Map<string, Aviso[]>();
    for (const a of visibles) {
      const dia = fechaDe(a.created_at);
      if (!mapa.has(dia)) mapa.set(dia, []);
      mapa.get(dia)!.push(a);
    }
    return [...mapa.entries()].map(([dia, lista]) => ({ dia, titulo: dia === hoy ? 'Hoy' : dia === ayer ? 'Ayer' : fechaLarga(dia), lista }));
  }, [visibles]);

  const sinLeer = avisos.some((a) => !a.read_at);

  const abrir = (a: Aviso) => {
    if (!a.read_at) marcarLeido(a.id);
    if (esChofer) {
      if (a.type === 'guardian_linked' && a.student_id) navChofer.navigate('FichaEstudiante', { studentId: a.student_id });
      else if (a.type === 'address_changed' && a.student_id) navChofer.navigate('FichaEstudiante', { studentId: a.student_id });
      else if (a.type === 'verification_result') navChofer.navigate('EstadoCuenta');
      else if (a.type.startsWith('absence_') || a.type.startsWith('substitute_')) navChofer.navigate('Pestanas', { screen: 'Inicio' });
      return;
    }
    if (AL_MAPA.includes(a.type)) nav.navigate('Pestanas', { screen: 'Mapa', params: a.student_id ? { studentId: a.student_id } : undefined });
    else if (a.trip_id) nav.navigate('LineaTiempo', { tripId: a.trip_id });
    else if (a.type === 'service_cancelled' || a.type === 'service_restored' || a.type === 'substitute_assigned') nav.navigate('Pestanas', { screen: 'Inicio' });
  };

  const refrescar = async () => {
    setRefrescando(true);
    await cargar();
    setRefrescando(false);
  };

  const filtros = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: margen }} style={{ marginRight: -margen }}>
      <Chip texto="Todos" sobreHero seleccionado={filtro === 'todos'} onPress={() => setFiltro('todos')} />
      <Chip texto="Urgentes" sobreHero seleccionado={filtro === 'urgentes'} onPress={() => setFiltro('urgentes')} />
      {hijos.map((h) => (
        <Chip
          key={h.id}
          texto={h.name}
          sobreHero
          seleccionado={filtro === h.id}
          onPress={() => setFiltro(h.id)}
          izquierda={<Avatar nombre={h.name} color={h.school?.color} tam={32} />}
        />
      ))}
    </ScrollView>
  );

  const primeraCarga = cargando && avisos.length === 0;

  return (
    <>
      <Pantalla
        marino
        titulo="Avisos"
        onAtras={esChofer ? () => nav.goBack() : undefined}
        conBarra={!esChofer}
        bajoTitulo={filtros}
        refrescando={refrescando}
        onRefrescar={refrescar}
      >
        {permiso !== 'concedido' ? (
          <BannerAlerta
            tipo="aviso"
            icono={BellOff}
            titulo="Las notificaciones están apagadas"
            texto={esChofer ? 'Actívalas para enterarte de las ausencias al instante.' : 'Actívalas para saber cuando la buseta esté cerca.'}
            accion="Activar"
            onAccion={() => nav.navigate('PermisoAvisos')}
          />
        ) : null}

        {primeraCarga ? (
          <EsqueletoLista filas={4} />
        ) : error && avisos.length === 0 ? (
          <View style={{ backgroundColor: c.surface, borderRadius: radio.grande, ...sombra(c, 1) }}>
            <EstadoError titulo="No pudimos cargar tus avisos" onReintentar={cargar} onSoporte={() => nav.navigate('Soporte')} />
          </View>
        ) : visibles.length === 0 ? (
          <View style={{ backgroundColor: c.surface, borderRadius: radio.grande, ...sombra(c, 1) }}>
            <EstadoVacio
              icono={Inbox}
              titulo="Sin avisos"
              texto={
                filtro !== 'todos'
                  ? 'No hay avisos con este filtro.'
                  : esChofer
                    ? 'Aquí verás las ausencias, las vinculaciones y las solicitudes de otros choferes.'
                    : 'Cuando la buseta salga, aquí aparecerá cada paso del recorrido.'
              }
              accion={filtro !== 'todos' ? 'Ver todos' : undefined}
              onAccion={() => setFiltro('todos')}
            />
          </View>
        ) : (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: -8 }}>
              <Boton titulo="Marcar como leídos" icono={CheckCheck} variante="fantasma" tamano="compacto" onPress={marcarTodos} deshabilitado={!sinLeer} estilo={{ paddingHorizontal: 8 }} />
              <Boton titulo="Borrar todo" icono={Trash2} variante="fantasma" tamano="compacto" onPress={() => setConfirmar(true)} estilo={{ paddingHorizontal: 8 }} />
            </View>

            {grupos.map((g) => (
              <View key={g.dia} style={{ gap: esp.sm }}>
                <Texto v="medioFuerte" color="text2" accessibilityRole="header" style={{ fontFamily: fuentes.titulo, fontSize: 14 }}>{g.titulo}</Texto>
                <View style={{ backgroundColor: c.surface, borderRadius: radio.grande, overflow: 'hidden', ...sombra(c, 2) }}>
                  {g.lista.map((a, i) => {
                    const nuevo = !a.read_at;
                    return (
                      <Pressable
                        key={a.id}
                        onPress={() => abrir(a)}
                        accessibilityRole="button"
                        accessibilityLabel={`${nuevo ? 'Sin leer. ' : ''}${a.title}. ${a.body}. ${hora(a.created_at)}`}
                        android_ripple={{ color: 'rgba(128,128,128,0.15)' }}
                        style={{
                          flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 12, paddingHorizontal: esp.lg, minHeight: 64,

                          borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.border,
                        }}
                      >
                        <IconoAviso aviso={a} />
                        <View style={{ flex: 1, gap: 2 }}>
                          <Texto v="medioFuerte" style={{ fontFamily: 'Inter_700Bold', fontSize: 15 }}>{a.title}</Texto>
                          {a.body ? <Texto v="nota" color="text3" style={{ fontFamily: fuentes.medio }}>{a.body}</Texto> : null}
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 6 }}>
                          <HoraReal texto={hora(a.created_at)} />
                          {nuevo ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.primary }} /> : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </>
        )}
      </Pantalla>

      <ModalConfirmar
        visible={confirmar}
        titulo="¿Borrar todos los avisos?"
        mensaje="Se quitan de tu lista. El historial de recorridos no cambia."
        confirmar="Borrar todo"
        peligro
        onCancelar={() => setConfirmar(false)}
        onConfirmar={() => {
          setConfirmar(false);
          borrarTodo();
        }}
      />
    </>
  );
}
