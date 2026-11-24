// 73 · Escuelas del chofer.
import React from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ChevronRight, Clock, DoorOpen, Plus, School, Users } from 'lucide-react-native';
import { Boton, EsqueletoLista, EstadoError, EstadoVacio, Pantalla, Tarjeta, Texto } from '../../ui';
import { useTema } from '../../tema';
import { chofer } from '../../servicios/chofer';
import type { NavChofer } from '../../navegacion/tipos';
import { hhmm, mensajeError } from '../../utils';
import { calleDe, useCarga } from './_c2';

export default function Escuelas() {
  const nav = useNavigation<NavChofer>();
  const { c } = useTema();
  const { datos, cargando, refrescando, error, recargar, refrescar } = useCarga(async () => {
    const [escuelas, estudiantes] = await Promise.all([chofer.escuelas(), chofer.estudiantes()]);
    return { escuelas, estudiantes };
  });

  const dato = (Icono: typeof Clock, texto: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Icono size={16} color={c.text3} strokeWidth={2} />
      <Texto v="medio" color="text2" style={{ flex: 1 }}>{texto}</Texto>
    </View>
  );

  return (
    <Pantalla
      titulo="Escuelas"
      onAtras={nav.goBack}
      refrescando={refrescando}
      onRefrescar={refrescar}
      pie={datos && datos.escuelas.length > 0 ? <Boton titulo="Agregar escuela" icono={Plus} onPress={() => nav.navigate('EditarEscuela')} /> : undefined}
    >
      {cargando && !datos ? (
        <EsqueletoLista filas={2} />
      ) : error && !datos ? (
        <Tarjeta><EstadoError texto={mensajeError(error)} onReintentar={() => recargar()} /></Tarjeta>
      ) : datos && datos.escuelas.length === 0 ? (
        <Tarjeta>
          <EstadoVacio
            icono={School}
            titulo="Registra tu primera escuela"
            texto="Las escuelas son paradas de entrega en la ida y de recogida en la vuelta."
            accion="Agregar escuela"
            onAccion={() => nav.navigate('EditarEscuela')}
          />
        </Tarjeta>
      ) : datos ? (
        <>
          <Tarjeta plano estilo={{ paddingVertical: 12 }}>
            <Texto v="medio" color="text2">Las escuelas son paradas de entrega en la ida y de recogida en la vuelta.</Texto>
          </Tarjeta>
          {datos.escuelas.map((s) => {
            const n = datos.estudiantes.filter((e) => e.school_id === s.id).length;
            return (
              <Tarjeta key={s.id} onPress={() => nav.navigate('EditarEscuela', { escuelaId: s.id })} etiqueta={`${s.name}, editar`} estilo={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: s.color, alignItems: 'center', justifyContent: 'center' }}>
                    <School size={20} color="#FFFFFF" strokeWidth={2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Texto v="subtitulo" numberOfLines={1}>{s.name}</Texto>
                    <Texto v="nota" color="text2" numberOfLines={1}>{calleDe(s.address) ?? 'Sin ubicación'}</Texto>
                  </View>
                  <ChevronRight size={20} color={c.text3} strokeWidth={2} />
                </View>
                <View style={{ gap: 6 }}>
                  {dato(Clock, `Entrada ${hhmm(s.entry_time)}, Salida ${hhmm(s.exit_time)}`)}
                  {dato(Users, n === 1 ? '1 estudiante' : `${n} estudiantes`)}
                  {s.gate_reference ? dato(DoorOpen, `Portón: ${s.gate_reference}`) : null}
                </View>
              </Tarjeta>
            );
          })}
        </>
      ) : null}
    </Pantalla>
  );
}
