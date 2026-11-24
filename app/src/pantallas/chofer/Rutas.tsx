// Rutas del chofer: lista, accesos y cancelación del servicio de un día.
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { CalendarOff, History, ListOrdered, MessageSquare, Pencil, Plus, Route as IconoRuta, School, UserRoundCog } from 'lucide-react-native';
import {
  Boton, Chip, ChipEscuela, EsqueletoLista, EstadoError, EstadoVacio, HojaInferior, Pantalla, Tarjeta, Texto, TituloSeccion, useToast,
} from '../../ui';
import { esp, tintaDe, useTema } from '../../tema';
import { chofer, MOTIVOS_CANCELACION, type RutaLista } from '../../servicios/chofer';
import type { NavChofer } from '../../navegacion/tipos';
import { diaRelativo, diasTexto, hhmm, mensajeError, textoSentido } from '../../utils';
import { Acceso, opcionesFecha, useCarga } from './_c1Partes';

/** Escuelas distintas de una ruta, en orden de parada. */
function escuelasDe(r: RutaLista) {
  const vistas = new Set<string>();
  return r.stops
    .filter((s) => s.school && !vistas.has(s.school.id) && vistas.add(s.school.id))
    .map((s) => ({ ...s.school!, hora: hhmm(r.direction === 'pickup' ? s.school!.entry_time : s.school!.exit_time) }));
}

export default function Rutas() {
  const nav = useNavigation<NavChofer>();
  const { c } = useTema();
  const toast = useToast();
  const { datos: rutas, cargando, refrescando, error, refrescar } = useCarga<RutaLista[]>(() => chofer.rutas());

  const fechas = useMemo(opcionesFecha, []);
  const [hoja, setHoja] = useState(false);
  const [fecha, setFecha] = useState(fechas[1].iso);
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [motivo, setMotivo] = useState<string>(MOTIVOS_CANCELACION[0]);
  const [guardando, setGuardando] = useState(false);

  function abrirCancelar(soloRuta?: string) {
    setElegidas(soloRuta ? [soloRuta] : (rutas ?? []).map((r) => r.id));
    setFecha(fechas[1].iso);
    setMotivo(MOTIVOS_CANCELACION[0]);
    setHoja(true);
  }

  async function cancelar() {
    if (elegidas.length === 0) return;
    setGuardando(true);
    try {
      const creadas = await chofer.cancelarServicio(elegidas, fecha, motivo);
      setHoja(false);
      toast.mostrar(`Servicio cancelado ${diaRelativo(fecha)}. Los representantes ya fueron avisados.`, {
        tipo: 'exito',
        deshacer: creadas.length
          ? async () => {
              try {
                await Promise.all(creadas.map((x) => chofer.deshacerCancelacion(x.id)));
                toast.mostrar('Cancelación deshecha.', { tipo: 'info' });
              } catch (e) {
                toast.mostrar(mensajeError(e), { tipo: 'error' });
              }
            }
          : undefined,
      });
    } catch (e) {
      toast.mostrar(mensajeError(e), { tipo: 'error' });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <Pantalla titulo="Rutas" conBarra refrescando={refrescando} onRefrescar={refrescar}>
        <Tarjeta estilo={{ flexDirection: 'row', paddingVertical: esp.sm, paddingHorizontal: esp.sm }}>
          <Acceso icono={School} texto="Escuelas" onPress={() => nav.navigate('Escuelas')} />
          <Acceso icono={UserRoundCog} texto="Sustituto" onPress={() => nav.navigate('Sustituto')} />
          <Acceso icono={MessageSquare} texto="Mensajes" onPress={() => nav.navigate('MensajesRapidos')} />
          <Acceso icono={History} texto="Historial" onPress={() => nav.navigate('HistorialChofer')} />
        </Tarjeta>

        {cargando && !rutas ? (
          <EsqueletoLista filas={2} />
        ) : error && !rutas ? (
          <Tarjeta><EstadoError texto={mensajeError(error)} onReintentar={refrescar} /></Tarjeta>
        ) : rutas && rutas.length === 0 ? (
          <Tarjeta>
            <EstadoVacio
              icono={IconoRuta}
              titulo="Aún no tienes rutas"
              texto="Crea una ruta de ida o de vuelta y ordena sus paradas. Antes registra tus escuelas y estudiantes."
              accion="Nueva ruta"
              onAccion={() => nav.navigate('EditarRuta')}
              compacto
            />
          </Tarjeta>
        ) : rutas ? (
          <>
            <TituloSeccion titulo="Tus rutas" accion="Cancelar un día" onAccion={() => abrirCancelar()} />
            {rutas.map((r) => {
              const escuelas = escuelasDe(r);
              const { fondo, tinta } = tintaDe(r.color, c);
              return (
                <Tarjeta key={r.id} estilo={{ gap: esp.md }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Texto v="seccion">{r.name}</Texto>
                      <Texto v="medio" color="text2">
                        Sale {hhmm(r.departure_time)}, {r.stops.length} {r.stops.length === 1 ? 'parada' : 'paradas'}, {diasTexto(r.days_of_week)}
                      </Texto>
                    </View>
                    <View style={{ backgroundColor: fondo, borderRadius: 999, height: 28, paddingHorizontal: 12, justifyContent: 'center' }}>
                      <Texto v="nota" color={tinta} style={{ fontFamily: 'Inter_700Bold' }}>{textoSentido(r.direction)}</Texto>
                    </View>
                  </View>
                  {escuelas.length > 0 ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {escuelas.map((e) => <ChipEscuela key={e.id} nombre={`${e.short_name} ${e.hora}`} color={e.color} />)}
                    </View>
                  ) : (
                    <Texto v="nota" color="warningInk">Esta ruta aún no tiene paradas.</Texto>
                  )}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    <Boton titulo="Paradas" tamano="compacto" variante="secundario" icono={ListOrdered} onPress={() => nav.navigate('Paradas', { routeId: r.id })} />
                    <Boton titulo="Editar" tamano="compacto" variante="secundario" icono={Pencil} onPress={() => nav.navigate('EditarRuta', { routeId: r.id })} />
                    <Boton titulo="Cancelar día" tamano="compacto" variante="secundario" icono={CalendarOff} onPress={() => abrirCancelar(r.id)} />
                  </View>
                </Tarjeta>
              );
            })}
            <Boton titulo="Nueva ruta" icono={Plus} onPress={() => nav.navigate('EditarRuta')} />
            <Texto v="nota" color="text2">
              Al guardar cambios de paradas, los representantes de los niños agregados o quitados reciben "Tu ruta fue actualizada".
            </Texto>
          </>
        ) : null}
      </Pantalla>

      <HojaInferior
        visible={hoja}
        onCerrar={() => setHoja(false)}
        titulo="Cancelar el servicio"
        pie={
          <>
            <Boton titulo="Cancelar servicio" variante="peligro" cargando={guardando} deshabilitado={elegidas.length === 0} onPress={cancelar} />
            <Boton titulo="Volver" variante="fantasma" onPress={() => setHoja(false)} />
          </>
        }
      >
        <Texto v="medioFuerte" color="text2">Fecha</Texto>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {fechas.map((f) => <Chip key={f.iso} texto={f.texto} seleccionado={fecha === f.iso} onPress={() => setFecha(f.iso)} />)}
        </View>
        <Texto v="medioFuerte" color="text2">Rutas</Texto>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(rutas ?? []).map((r) => (
            <Chip
              key={r.id}
              texto={r.name}
              seleccionado={elegidas.includes(r.id)}
              onPress={() => setElegidas((v) => (v.includes(r.id) ? v.filter((x) => x !== r.id) : [...v, r.id]))}
            />
          ))}
        </View>
        <Texto v="medioFuerte" color="text2">Motivo</Texto>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {MOTIVOS_CANCELACION.map((m) => <Chip key={m} texto={m} seleccionado={motivo === m} onPress={() => setMotivo(m)} />)}
        </View>
        <Texto v="nota" color="text2">
          Los representantes recibirán «Servicio cancelado {diaRelativo(fecha)}. Motivo: {motivo.toLowerCase()}». Podrás deshacerlo desde Inicio.
        </Texto>
      </HojaInferior>
    </>
  );
}
