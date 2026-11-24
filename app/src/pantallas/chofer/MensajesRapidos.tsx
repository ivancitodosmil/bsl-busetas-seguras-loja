// Mensajes rápidos: botones fijos, dos personalizados e historial de envíos.
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MessageSquare, Pencil } from 'lucide-react-native';
import {
  Boton, CampoTexto, EsqueletoLista, EstadoError, EstadoVacio, HojaInferior, Pantalla, Tarjeta, Texto, TituloSeccion, useToast,
} from '../../ui';
import { esp, radio, useTema } from '../../tema';
import { chofer, MENSAJES_FIJOS } from '../../servicios/chofer';
import { useSesion } from '../../estado/sesion';
import type { NavChofer } from '../../navegacion/tipos';
import type { Mensaje } from '../../tipos';
import { fechaCorta, fechaDe, hora, hoyISO, mensajeError, sumarDias } from '../../utils';
import { useCarga } from './_c1Partes';

type Fila = Mensaje & { route: { name: string } | null };
const MAX = 24;

export default function MensajesRapidos() {
  const nav = useNavigation<NavChofer>();
  const { c } = useTema();
  const toast = useToast();
  const datosChofer = useSesion((s) => s.chofer);
  const actualizarChofer = useSesion((s) => s.actualizarChofer);
  const propios = [datosChofer?.quick_messages?.[0] ?? '', datosChofer?.quick_messages?.[1] ?? ''];

  const { datos: historial, cargando, refrescando, error, refrescar } = useCarga<Fila[]>(() => chofer.mensajes());
  const [hoja, setHoja] = useState(false);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [guardando, setGuardando] = useState(false);

  const grupos = useMemo(() => {
    const hoy = hoyISO();
    const ayer = sumarDias(hoy, -1);
    const mapa = new Map<string, Fila[]>();
    for (const m of historial ?? []) {
      const d = fechaDe(m.created_at);
      mapa.set(d, [...(mapa.get(d) ?? []), m]);
    }
    return [...mapa.entries()].map(([d, filas]) => ({ titulo: d === hoy ? 'Hoy' : d === ayer ? 'Ayer' : fechaCorta(d), filas }));
  }, [historial]);

  function abrir() {
    setA(propios[0]);
    setB(propios[1]);
    setHoja(true);
  }

  async function guardar() {
    setGuardando(true);
    try {
      await actualizarChofer({ quick_messages: [a.trim(), b.trim()].filter(Boolean) });
      setHoja(false);
      toast.mostrar('Mensajes personalizados guardados.', { tipo: 'exito' });
    } catch (e) {
      toast.mostrar(mensajeError(e), { tipo: 'error' });
    } finally {
      setGuardando(false);
    }
  }

  const Pastilla = ({ texto, vacio }: { texto: string; vacio?: boolean }) => (
    <View style={{ minHeight: 44, borderRadius: radio.pill, paddingHorizontal: 16, justifyContent: 'center', backgroundColor: vacio ? 'transparent' : c.primarySoft, borderWidth: vacio ? 1.5 : 0, borderColor: c.border, borderStyle: vacio ? 'dashed' : 'solid' }}>
      <Texto v="medioFuerte" color={vacio ? 'text3' : 'primary'}>{texto}</Texto>
    </View>
  );

  return (
    <>
      <Pantalla titulo="Mensajes rápidos" onAtras={() => nav.goBack()} refrescando={refrescando} onRefrescar={refrescar}>
        <Tarjeta estilo={{ gap: esp.lg }}>
          <Texto v="medio" color="text2">
            Se envían con un toque a todos los representantes de la ruta. No hay texto libre mientras conduces.
          </Texto>
          <View style={{ gap: 8 }}>
            <Texto v="seccion">Botones fijos</Texto>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {MENSAJES_FIJOS.map((m) => <Pastilla key={m.clave} texto={m.texto} />)}
            </View>
          </View>
          <View style={{ gap: 8 }}>
            <TituloSeccion titulo="Personalizados" accion="Editar" onAccion={abrir} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {propios.map((t, i) => <Pastilla key={i} texto={t || 'Sin definir'} vacio={!t} />)}
            </View>
          </View>
        </Tarjeta>

        <TituloSeccion titulo="Historial" />
        {cargando && !historial ? (
          <EsqueletoLista filas={2} />
        ) : error && !historial ? (
          <Tarjeta><EstadoError texto={mensajeError(error)} onReintentar={refrescar} /></Tarjeta>
        ) : grupos.length === 0 ? (
          <Tarjeta>
            <EstadoVacio icono={MessageSquare} titulo="Aún no envías mensajes" texto="Durante un recorrido, toca un mensaje rápido y aquí quedará el registro." compacto />
          </Tarjeta>
        ) : (
          grupos.map((g) => (
            <View key={g.titulo} style={{ gap: esp.sm }}>
              <Texto v="nota" color="text2" style={{ fontFamily: 'Inter_700Bold' }}>{g.titulo}</Texto>
              <Tarjeta estilo={{ paddingVertical: 4 }}>
                {g.filas.map((m, i) => (
                  <View key={m.id} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.border }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Texto v="fuerte">«{m.body}»</Texto>
                      <Texto v="nota" color="text2">
                        {[m.route?.name, `a ${m.recipients} ${m.recipients === 1 ? 'representante' : 'representantes'}`].filter(Boolean).join(', ')}
                      </Texto>
                    </View>
                    <Texto v="nota" color="text3" style={{ fontVariant: ['tabular-nums'] }}>{hora(m.created_at)}</Texto>
                  </View>
                ))}
              </Tarjeta>
            </View>
          ))
        )}
      </Pantalla>

      <HojaInferior
        visible={hoja}
        onCerrar={() => setHoja(false)}
        titulo="Mensajes personalizados"
        texto="Dos frases cortas que usas seguido. Aparecen junto a los botones fijos durante el recorrido."
        pie={<Boton titulo="Guardar" icono={Pencil} cargando={guardando} onPress={guardar} />}
      >
        <CampoTexto etiqueta="Mensaje 1" value={a} onChangeText={setA} maxLength={MAX} placeholder="Tráfico pesado" ayuda={`${a.length} de ${MAX} caracteres`} />
        <CampoTexto etiqueta="Mensaje 2" value={b} onChangeText={setB} maxLength={MAX} placeholder="Llego en 5 min" ayuda={`${b.length} de ${MAX} caracteres`} />
      </HojaInferior>
    </>
  );
}
