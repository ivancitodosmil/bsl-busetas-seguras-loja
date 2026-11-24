// Preferencias de avisos: se guardan en el servidor y valen en todos los dispositivos.
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { AlertTriangle, Bus, MessageSquare, MoonStar } from 'lucide-react-native';
import { useSesion } from '../../estado/sesion';
import type { NavRep } from '../../navegacion/tipos';
import { representante } from '../../servicios/representante';
import { esp, margen } from '../../tema';
import type { PreferenciaAvisos } from '../../tipos';
import { Boton, Chip, EsqueletoLista, EstadoError, FilaAjuste, Pantalla, Tarjeta, Texto, useToast } from '../../ui';
import { hhmm, mensajeError } from '../../utils';
import { useResumen } from './_partes';

const DESDE = ['20:00', '21:00', '22:00'];
const HASTA = ['05:00', '05:30', '06:00'];

export default function PreferenciasAvisos() {
  const nav = useNavigation<NavRep>();
  const toast = useToast();
  const userId = useSesion((s) => s.idSesion);
  const { datos } = useResumen();
  const hijos = datos?.children ?? [];
  const [todas, setTodas] = useState<PreferenciaAvisos[] | null>(null);
  const [error, setError] = useState(false);
  const [hijo, setHijo] = useState<string | null>(null);
  const [p, setP] = useState<PreferenciaAvisos | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    if (!userId) return;
    try {
      setTodas(await representante.preferencias(userId));
      setError(false);
    } catch {
      setError(true);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  // Las de un hijo parten de las generales si aún no tienen las suyas.
  useEffect(() => {
    if (!todas || !userId) return;
    const general = todas.find((x) => x.student_id === null);
    const propia = todas.find((x) => x.student_id === hijo);
    const base = propia ?? general;
    setP({
      id: propia?.id,
      user_id: userId,
      student_id: hijo,
      urgent: true,
      trip: base?.trip ?? true,
      messages: base?.messages ?? true,
      quiet_from: base?.quiet_from ? hhmm(base.quiet_from) : null,
      quiet_to: base?.quiet_to ? hhmm(base.quiet_to) : null,
    });
  }, [todas, hijo, userId]);

  const guardar = async () => {
    if (!p) return;
    setGuardando(true);
    try {
      await representante.guardarPreferencia({ ...p, urgent: true });
      await cargar();
      toast.mostrar('Preferencias guardadas', { tipo: 'exito' });
    } catch (e) {
      toast.mostrar(mensajeError(e, 'No se pudieron guardar las preferencias.'), { tipo: 'error' });
    } finally {
      setGuardando(false);
    }
  };

  const silencio = !!(p?.quiet_from && p?.quiet_to);

  return (
    <Pantalla titulo="Preferencias de avisos" onAtras={() => nav.goBack()} pie={p ? <Boton titulo="Guardar" onPress={guardar} cargando={guardando} /> : undefined}>
      {error && !todas ? (
        <Tarjeta><EstadoError onReintentar={cargar} /></Tarjeta>
      ) : !p ? (
        <EsqueletoLista filas={2} />
      ) : (
        <>
          <Tarjeta elevacion={2} estilo={{ gap: esp.md }}>
            <Texto v="medio" color="text2">Se guardan en tu cuenta y aplican en todos tus dispositivos. Puedes ajustarlas por hijo.</Texto>
            {hijos.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: margen }} style={{ marginRight: -esp.lg }}>
                <Chip texto="Todos mis hijos" seleccionado={hijo === null} onPress={() => setHijo(null)} />
                {hijos.map((h) => <Chip key={h.id} texto={h.name} seleccionado={hijo === h.id} onPress={() => setHijo(h.id)} />)}
              </ScrollView>
            ) : null}
          </Tarjeta>

          <Tarjeta estilo={{ paddingVertical: 4 }}>
            <FilaAjuste icono={AlertTriangle} titulo="Urgentes" texto="Buseta cerca, retraso, desvío, sustituto y cancelación. No se pueden silenciar del todo." interruptor onInterruptor={() => toast.mostrar('Los avisos urgentes siempre están activos')} />
            <FilaAjuste icono={Bus} titulo="Recorrido" texto="Salida, abordaje, llegada al colegio y fin" interruptor={p.trip} onInterruptor={(v) => setP({ ...p, trip: v })} />
            <FilaAjuste icono={MessageSquare} titulo="Mensajes" texto="Mensajes del chofer y recordatorio de mensualidad" interruptor={p.messages} onInterruptor={(v) => setP({ ...p, messages: v })} ultima />
          </Tarjeta>

          <Tarjeta estilo={{ gap: esp.md }}>
            <FilaAjuste
              icono={MoonStar}
              titulo="Horario silencioso"
              texto={silencio ? `${p.quiet_from} a ${p.quiet_to}, excepto urgentes` : 'Desactivado'}
              interruptor={silencio}
              onInterruptor={(v) => setP({ ...p, quiet_from: v ? '21:00' : null, quiet_to: v ? '05:30' : null })}
              ultima
            />
            {silencio ? (
              <>
                <View style={{ gap: 8 }}>
                  <Texto v="medioFuerte" color="text2">Desde</Texto>
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    {DESDE.map((h) => <Chip key={h} texto={h} seleccionado={p.quiet_from === h} onPress={() => setP({ ...p, quiet_from: h })} />)}
                  </View>
                </View>
                <View style={{ gap: 8 }}>
                  <Texto v="medioFuerte" color="text2">Hasta</Texto>
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    {HASTA.map((h) => <Chip key={h} texto={h} seleccionado={p.quiet_to === h} onPress={() => setP({ ...p, quiet_to: h })} />)}
                  </View>
                </View>
              </>
            ) : null}
          </Tarjeta>
        </>
      )}
    </Pantalla>
  );
}
