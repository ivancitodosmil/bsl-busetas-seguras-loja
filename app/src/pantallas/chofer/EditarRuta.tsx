// Crear o editar una ruta: nombre, color, sentido, hora de salida y días.
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Check, Clock, ListOrdered, Trash2 } from 'lucide-react-native';
import {
  Boton, CampoTexto, ConTeclado, EsqueletoLista, EstadoError, HojaInferior, ModalConfirmar, Pantalla, Segmentado, Tarjeta, Texto, useToast,
} from '../../ui';
import { esp, fuentes, PALETA, radio, useTema } from '../../tema';
import { chofer } from '../../servicios/chofer';
import { pedir, supabase } from '../../config/supabase';
import { useSesion } from '../../estado/sesion';
import type { NavChofer, PilaChofer } from '../../navegacion/tipos';
import type { Sentido } from '../../tipos';
import { hhmm, LETRAS_DIA, mensajeError, NOMBRES_DIA_ISO } from '../../utils';

const NOMBRES_COLOR = ['Turquesa', 'Violeta', 'Azul', 'Naranja', 'Magenta', 'Verde'];
const HORAS = Array.from({ length: 19 }, (_, i) => i + 4); // 04 a 22
const MINUTOS = Array.from({ length: 12 }, (_, i) => i * 5);
const p2 = (n: number) => String(n).padStart(2, '0');

export default function EditarRuta() {
  const nav = useNavigation<NavChofer>();
  const { params } = useRoute<RouteProp<PilaChofer, 'EditarRuta'>>();
  const routeId = params?.routeId;
  const { c } = useTema();
  const toast = useToast();
  const idChofer = useSesion((s) => s.idSesion);

  const [cargando, setCargando] = useState(!!routeId);
  const [error, setError] = useState<unknown>(null);
  const [nombre, setNombre] = useState('');
  const [color, setColor] = useState<string>(PALETA[2]);
  const [sentido, setSentido] = useState<Sentido>('pickup');
  const [salida, setSalida] = useState('06:15');
  const [dias, setDias] = useState<number[]>([1, 2, 3, 4, 5]);
  const [resumen, setResumen] = useState<{ escuelas: number; paradas: number } | null>(null);
  const [errNombre, setErrNombre] = useState<string | null>(null);
  const [hojaHora, setHojaHora] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [eliminando, setEliminando] = useState(false);

  async function cargar() {
    if (!routeId) return;
    setCargando(true);
    setError(null);
    try {
      const [r, paradas] = await Promise.all([
        chofer.ruta(routeId),
        pedir<{ school_id: string | null }[]>(supabase.from('route_stops').select('school_id').eq('route_id', routeId)),
      ]);
      setNombre(r.name);
      setColor(r.color);
      setSentido(r.direction);
      setSalida(hhmm(r.departure_time));
      setDias(r.days_of_week);
      setResumen({ paradas: paradas.length, escuelas: new Set(paradas.map((p) => p.school_id).filter(Boolean)).size });
    } catch (e) {
      setError(e);
    } finally {
      setCargando(false);
    }
  }
  useEffect(() => { cargar(); }, [routeId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function guardar() {
    if (nombre.trim().length < 3) {
      setErrNombre('Escribe un nombre para la ruta, por ejemplo "Ruta Norte Ida".');
      return;
    }
    if (dias.length === 0) {
      toast.mostrar('Elige al menos un día.', { tipo: 'error' });
      return;
    }
    if (!idChofer) return;
    setGuardando(true);
    try {
      const r = await chofer.guardarRuta({
        id: routeId, driver_id: idChofer, name: nombre.trim(), color, direction: sentido,
        departure_time: salida, days_of_week: [...dias].sort((a, b) => a - b),
      });
      if (routeId) {
        toast.mostrar('Ruta guardada.', { tipo: 'exito' });
        nav.goBack();
      } else {
        toast.mostrar('Ruta creada. Ahora ordena sus paradas.', { tipo: 'exito' });
        nav.replace('Paradas', { routeId: r.id });
      }
    } catch (e) {
      toast.mostrar(mensajeError(e), { tipo: 'error' });
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar() {
    if (!routeId) return;
    setEliminando(true);
    try {
      await chofer.eliminarRuta(routeId);
      setConfirmar(false);
      toast.mostrar('Ruta eliminada.', { tipo: 'info' });
      nav.goBack();
    } catch (e) {
      toast.mostrar(mensajeError(e), { tipo: 'error' });
    } finally {
      setEliminando(false);
    }
  }

  const [h, m] = salida.split(':').map(Number);

  return (
    <ConTeclado>
      <Pantalla
        titulo={routeId ? 'Editar ruta' : 'Nueva ruta'}
        onAtras={() => nav.goBack()}
        pie={cargando || error ? undefined : <Boton titulo="Guardar ruta" cargando={guardando} onPress={guardar} />}
      >
        {cargando ? (
          <EsqueletoLista filas={2} />
        ) : error ? (
          <Tarjeta><EstadoError texto={mensajeError(error)} onReintentar={cargar} /></Tarjeta>
        ) : (
          <>
            <Tarjeta estilo={{ gap: esp.lg }}>
              <CampoTexto
                etiqueta="Nombre de la ruta"
                value={nombre}
                onChangeText={(t) => { setNombre(t); setErrNombre(null); }}
                placeholder="Ruta Norte Ida"
                error={errNombre}
                maxLength={40}
                returnKeyType="done"
              />
              <View style={{ gap: 8 }}>
                <Texto v="medioFuerte" color="text2">Color</Texto>
                <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                  {PALETA.map((p, i) => {
                    const sel = p.toLowerCase() === color.toLowerCase();
                    return (
                      <Pressable
                        key={p}
                        onPress={() => setColor(p)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: sel }}
                        accessibilityLabel={`Color ${NOMBRES_COLOR[i]}`}
                        style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: sel ? c.text : 'transparent' }}
                      >
                        <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: p, alignItems: 'center', justifyContent: 'center' }}>
                          {sel ? <Check size={20} color="#FFFFFF" strokeWidth={3} /> : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </Tarjeta>

            <Tarjeta estilo={{ gap: esp.lg }}>
              <View style={{ gap: 8 }}>
                <Texto v="medioFuerte" color="text2">Sentido</Texto>
                <Segmentado
                  valor={sentido}
                  onChange={setSentido}
                  opciones={[
                    { valor: 'pickup', texto: 'Ida', nota: 'casas → escuelas' },
                    { valor: 'dropoff', texto: 'Vuelta', nota: 'escuelas → casas' },
                  ]}
                />
                {routeId && resumen && resumen.paradas > 0 ? (
                  <Texto v="nota" color="warningInk">Si cambias el sentido, revisa el orden de las paradas.</Texto>
                ) : null}
              </View>

              <View style={{ gap: 6 }}>
                <Texto v="medioFuerte" color="text2">Hora de salida</Texto>
                <Pressable
                  onPress={() => setHojaHora(true)}
                  accessibilityRole="button"
                  accessibilityLabel={`Hora de salida, ${salida}. Cambiar`}
                  style={{ minHeight: 52, borderRadius: radio.campo, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 }}
                >
                  <Clock size={20} color={c.primary} strokeWidth={2} />
                  <Texto v="cifra" style={{ fontSize: 20, flex: 1 }}>{salida}</Texto>
                  <Texto v="medioFuerte" color="primary">Cambiar</Texto>
                </Pressable>
                <Texto v="nota" color="text3">El horario de cada parada se calcula desde aquí.</Texto>
              </View>

              <View style={{ gap: 8 }}>
                <Texto v="medioFuerte" color="text2">Días</Texto>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  {LETRAS_DIA.map((letra, i) => {
                    const d = i + 1;
                    const sel = dias.includes(d);
                    return (
                      <Pressable
                        key={d}
                        onPress={() => setDias((v) => (v.includes(d) ? v.filter((x) => x !== d) : [...v, d]))}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: sel }}
                        accessibilityLabel={NOMBRES_DIA_ISO[i]}
                        hitSlop={4}
                        style={{ width: 42, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: sel ? c.primary : c.surface, borderWidth: 1.5, borderColor: sel ? c.primary : c.border }}
                      >
                        <Texto v="fuerte" color={sel ? 'onPrimary' : 'text2'}>{letra}</Texto>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </Tarjeta>

            {routeId && resumen ? (
              <Tarjeta estilo={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Texto v="fuerte">
                    {resumen.escuelas} {resumen.escuelas === 1 ? 'escuela' : 'escuelas'}, {resumen.paradas} {resumen.paradas === 1 ? 'parada' : 'paradas'}
                  </Texto>
                  <Texto v="nota" color="text2">Agrega, quita o reordena las paradas.</Texto>
                </View>
                <Boton titulo="Paradas" tamano="compacto" variante="secundario" icono={ListOrdered} onPress={() => nav.navigate('Paradas', { routeId })} />
              </Tarjeta>
            ) : null}

            {routeId ? <Boton titulo="Eliminar ruta" variante="peligro" icono={Trash2} onPress={() => setConfirmar(true)} /> : null}
          </>
        )}
      </Pantalla>

      <HojaInferior
        visible={hojaHora}
        onCerrar={() => setHojaHora(false)}
        titulo="Hora de salida"
        texto={`Sale a las ${salida}`}
        pie={<Boton titulo="Listo" onPress={() => setHojaHora(false)} />}
      >
        <Texto v="medioFuerte" color="text2">Hora</Texto>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {HORAS.map((x) => (
            <Rueda key={x} texto={p2(x)} sel={x === h} etiqueta={`${x} horas`} onPress={() => setSalida(`${p2(x)}:${p2(m)}`)} />
          ))}
        </ScrollView>
        <Texto v="medioFuerte" color="text2">Minutos</Texto>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {MINUTOS.map((x) => (
            <Rueda key={x} texto={p2(x)} sel={x === m} etiqueta={`${x} minutos`} onPress={() => setSalida(`${p2(h)}:${p2(x)}`)} />
          ))}
        </View>
      </HojaInferior>

      <ModalConfirmar
        visible={confirmar}
        titulo={`¿Eliminar ${nombre || 'esta ruta'}?`}
        mensaje="Se borran sus paradas y su historial de recorridos. Los estudiantes y las escuelas se conservan."
        confirmar="Eliminar"
        peligro
        cargando={eliminando}
        onConfirmar={eliminar}
        onCancelar={() => setConfirmar(false)}
      />
    </ConTeclado>
  );
}

function Rueda({ texto, sel, etiqueta, onPress }: { texto: string; sel: boolean; etiqueta: string; onPress: () => void }) {
  const { c } = useTema();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: sel }}
      accessibilityLabel={etiqueta}
      style={{ width: 52, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: sel ? c.primary : c.surface2 }}
    >
      <Texto style={{ fontFamily: fuentes.tituloSuave, fontSize: 17 }} color={sel ? 'onPrimary' : 'text'}>{texto}</Texto>
    </Pressable>
  );
}
