// Inicio del representante: qué pasa ahora con la buseta de cada hijo.
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Bell, CalendarX, History, Map as IconoMapa, MapPin, UserPlus, Users } from 'lucide-react-native';
import { useSesion } from '../../estado/sesion';
import { useAvisos, useSinLeer } from '../../estado/avisos';
import type { NavRep } from '../../navegacion/tipos';
import { esp, fuentes, useTema } from '../../tema';
import type { RutaRepresentante } from '../../tipos';
import {
  BannerAlerta, Boton, BotonIcono, EsqueletoLista, EstadoError, EstadoVacio, FilaAjuste, HoraReal, IconoAviso, Pantalla, PillEstado,
  LineaParadas, SelectorHijo, Tarjeta, Texto, TituloSeccion, type Estado, type ParadaLinea,
} from '../../ui';
import { aMinutos, fechaDe, fechaLarga, hhmm, hora, hoyISO, textoSentido } from '../../utils';
import { conductorDe, opcionesHijos, useResumen } from './_partes';

function estadoRuta(r: RutaRepresentante): Estado {
  if (r.cancellation) return 'cancelado';
  if (r.trip?.status === 'in_progress') return 'en_curso';
  if (r.trip?.status === 'paused') return 'en_pausa';
  if (r.trip?.status === 'finished') return 'finalizado';
  return r.runs_today ? 'programado' : 'sin_servicio';
}

// La pill habla de la ruta: «Programada», «Finalizada», «Cancelada».
const TEXTO_RUTA: Partial<Record<Estado, string>> = { programado: 'Programada', finalizado: 'Finalizada', cancelado: 'Cancelada' };

/** Rutas que importan ahora: las que están en curso; si no hay, las próximas de hoy del mismo sentido. */
function rutasAhora(rutas: RutaRepresentante[]) {
  const hoy = rutas.filter((r) => r.runs_today);
  const enCurso = hoy.filter((r) => r.trip && r.trip.status !== 'finished');
  const finalizadas = hoy.filter((r) => r.trip?.status === 'finished');
  if (enCurso.length > 0) return { visibles: enCurso, finalizadas };
  const pendientes = hoy.filter((r) => !r.trip);
  const primera = pendientes.find((r) => !r.cancellation) ?? pendientes[0];
  if (primera) return { visibles: pendientes.filter((r) => r.direction === primera.direction), finalizadas };
  return { visibles: finalizadas.slice(-1), finalizadas: finalizadas.slice(0, -1) };
}

export default function Inicio() {
  const { c } = useTema();
  const nav = useNavigation<NavRep>();
  const usuario = useSesion((s) => s.usuario);
  const sinLeer = useSinLeer();
  const avisos = useAvisos((s) => s.avisos);
  const marcarLeido = useAvisos((s) => s.marcarLeido);
  const { datos, cargando, refrescando, error, recargar } = useResumen(true);
  const [hijoSel, setHijoSel] = useState<string | null>(null);

  const hijos = datos?.children ?? [];
  const porId = useMemo(() => Object.fromEntries(hijos.map((h, i) => [h.id, { h, i }])), [hijos]);
  const rutas = useMemo(
    () => (datos?.routes ?? []).filter((r) => r.children.some((n) => !hijoSel || n.student_id === hijoSel)),
    [datos, hijoSel],
  );
  const { visibles, finalizadas } = useMemo(() => rutasAhora(rutas), [rutas]);

  const hoy = hoyISO();
  const avisosHoy = avisos.filter((a) => fechaDe(a.created_at) === hoy);
  const retraso = avisosHoy.find((a) => a.type === 'delay' && !a.read_at);
  const desvio = avisosHoy.find((a) => a.type === 'deviation' && !a.read_at);
  const busetasDistintas = !hijoSel && visibles.length > 1;

  const irMapa = (studentId?: string) => nav.navigate('Pestanas', { screen: 'Mapa', params: studentId ? { studentId } : undefined });
  const irAvisos = () => nav.navigate('Pestanas', { screen: 'Avisos' });

  // La ruta de hoy como línea. Solo hechos reales: la hora de salida programada, las horas en que
  // de verdad pasó cada cosa (salió, subió, llegó) y los avisos por distancia del GPS (1 km y 500 m).
  // Nunca una hora de llegada estimada: no hay forma honesta de predecirla.
  const paradasDe = (r: RutaRepresentante, ninos: RutaRepresentante['children']): ParadaLinea[] => {
    const salio = !!r.trip;
    const enVivo = r.trip?.status === 'in_progress' || r.trip?.status === 'paused';
    const ida = r.direction === 'pickup';
    const delViaje = avisos.filter((a) => r.trip && a.trip_id === r.trip.id);
    const cerca = (id: string) => {
      const mios = delViaje.filter((a) => a.student_id === id);
      if (mios.some((a) => a.type === 'bus_arriving')) return 'La buseta está a menos de 500 m';
      if (mios.some((a) => a.type === 'bus_near')) return 'La buseta está a menos de 1 km';
      return null;
    };
    const lista: ParadaLinea[] = [{
      clave: 'salida', titulo: ida ? (salio ? 'Salió la buseta' : 'Salida de la buseta') : salio ? 'Salió de la escuela' : 'Salida de la escuela',
      detalle: salio ? undefined : 'Hora programada',
      hora: salio ? hora(r.trip!.started_at) : hhmm(r.departure_time), hecha: salio,
    }];
    // Orden de las paradas en la ruta (el que armó el chofer).
    const ordenados = [...ninos].sort((a, b) => aMinutos(a.estimated_time) - aMinutos(b.estimated_time));
    let marcada = false;
    for (const n of ordenados) {
      const h = porId[n.student_id]?.h;
      const subio = n.status === 'boarded' || n.status === 'delivered';
      const hecha = n.absent || (ida ? subio : n.status === 'delivered');
      const tuya = !hecha && !marcada && enVivo;
      if (tuya) marcada = true;
      let detalle: string | undefined;
      let horaReal: string | undefined;
      if (n.absent) detalle = 'No va hoy';
      else if (hecha) {
        detalle = ida ? 'Subió a la buseta' : 'Llegó a casa';
        horaReal = hora(ida ? n.boarded_at : n.delivered_at) || undefined;
      } else if (tuya) detalle = cerca(n.student_id) ?? 'En camino. Te avisamos a 1 km y a 500 m';
      lista.push({ clave: n.student_id, titulo: `Tu casa, ${h?.name ?? 'tu hijo'}`, detalle, hora: horaReal, hecha, tuya });
    }
    if (ida) {
      const escuelas = [...new Set(ordenados.map((n) => porId[n.student_id]?.h.school?.short_name).filter(Boolean))] as string[];
      const llego = ordenados.filter((n) => !n.absent);
      const todos = llego.length > 0 && llego.every((n) => n.status === 'delivered');
      const ultima = todos ? llego.map((n) => n.delivered_at).filter(Boolean).sort().pop() : null;
      lista.push({
        clave: 'escuela', titulo: escuelas.length ? `Escuela ${escuelas.join(' y ')}` : 'Escuela',
        detalle: todos ? 'Llegaron a la escuela' : undefined, hora: ultima ? hora(ultima) : undefined, hecha: todos,
      });
    }
    return lista;
  };

  const tarjetaRuta = (r: RutaRepresentante) => {
    const conductor = conductorDe(r);
    const estado = estadoRuta(r);
    const ninos = r.children.filter((n) => !hijoSel || n.student_id === hijoSel);
    const salio = !!r.trip;
    const unico = ninos.length === 1 ? porId[ninos[0].student_id]?.h : undefined;
    return (
      <Tarjeta key={r.id} elevacion={2} estilo={{ gap: esp.md, paddingBottom: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <Pressable
            style={{ flex: 1, minHeight: 48, justifyContent: 'center' }}
            onPress={conductor ? () => nav.navigate('PerfilChofer', { chofer: conductor, sustituto: !!r.substitute, ruta: r.name }) : undefined}
            accessibilityRole="button"
            accessibilityLabel={`${r.name}. Ver al chofer ${conductor?.name ?? ''}`}
          >
            <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={{ fontFamily: fuentes.titulo, fontSize: 17, lineHeight: 22, letterSpacing: -0.2, color: c.text }}>{r.name}</Text>
            <Texto v="nota" color="text3" numberOfLines={1} style={{ fontFamily: fuentes.medio }}>
              {conductor ? `${conductor.name}${conductor.plate ? `, placa ${conductor.plate}` : ''}` : `Sale a las ${hhmm(r.departure_time)}`}
            </Texto>
          </Pressable>
          <PillEstado estado={estado} texto={TEXTO_RUTA[estado]} />
        </View>

        {r.cancellation ? (
          <Texto v="medio" color="text2">Hoy no pasa. Motivo: {r.cancellation.reason.toLowerCase()}.</Texto>
        ) : null}

        {!r.cancellation ? <LineaParadas paradas={paradasDe(r, ninos)} enVivo={r.trip?.status === 'in_progress'} /> : null}

        {!r.cancellation ? (
          <Boton
            titulo={busetasDistintas && unico ? `Ver la buseta de ${unico.name}` : 'Ver la buseta en el mapa'}
            variante="acento"
            icono={IconoMapa}
            onPress={() => irMapa(hijoSel ?? ninos[0]?.student_id)}
          />
        ) : null}
      </Tarjeta>
    );
  };

  return (
    <Pantalla
      marino
      titulo={`Hola, ${usuario?.first_name || 'bienvenido'}`}
      sobretitulo={fechaLarga()}
      conBarra
      refrescando={refrescando}
      onRefrescar={() => recargar(true)}
      derecha={<BotonIcono icono={Bell} etiqueta="Avisos" sobreHero contador={sinLeer} onPress={irAvisos} />}
      bajoTitulo={hijos.length > 1 ? <SelectorHijo hijos={opcionesHijos(hijos)} seleccionado={hijoSel} onSeleccionar={setHijoSel} /> : undefined}
    >
      {cargando && !datos ? (
        <EsqueletoLista filas={3} />
      ) : error && !datos ? (
        <Tarjeta><EstadoError onReintentar={() => recargar(true)} onSoporte={() => nav.navigate('Soporte')} /></Tarjeta>
      ) : hijos.length === 0 ? (
        <Tarjeta elevacion={2}>
          <EstadoVacio
            icono={Users}
            titulo="Vincula a tu hijo"
            texto="Pídele al chofer el código de invitación. Con él verás la buseta en vivo y recibirás los avisos."
            accion="Vincular con un código"
            onAccion={() => nav.navigate('Vincular')}
          />
        </Tarjeta>
      ) : (
        <>
          {hijos.filter((h) => !h.has_home).map((h) => (
            <BannerAlerta
              key={'casa-' + h.id}
              tipo="aviso"
              icono={MapPin}
              titulo={`Marca la casa de ${h.name}`}
              texto="Sin ella el chofer no tiene tu parada y no te llegan los avisos a 1 km y 500 m."
              accion="Marcar"
              onAccion={() => nav.navigate('Direcciones', { studentId: h.id })}
            />
          ))}
          {desvio ? (
            <BannerAlerta tipo="urgente" titulo="Desvío detectado" texto="La buseta se apartó más de 300 m de la ruta" accion="Ver" onAccion={() => { marcarLeido(desvio.id); irMapa(hijoSel ?? undefined); }} />
          ) : null}
          {retraso ? (
            <BannerAlerta tipo="aviso" titulo={retraso.title} texto={retraso.body} accion="Visto" onAccion={() => marcarLeido(retraso.id)} />
          ) : null}
          {visibles.filter((r) => r.substitute).slice(0, 1).map((r) => (
            <BannerAlerta
              key={r.id}
              tipo="info"
              titulo={`Hoy conduce ${r.substitute!.name}`}
              texto={`Sustituto autorizado por ${r.driver?.first_name ?? 'tu chofer'}${r.substitute!.plate ? `, placa ${r.substitute!.plate}` : ''}`}
              accion="Ver"
              onAccion={() => nav.navigate('PerfilChofer', { chofer: r.substitute!, sustituto: true, ruta: r.name })}
            />
          ))}
          {busetasDistintas ? (
            <Texto v="medio" color="text2">Hoy tus hijos van en busetas distintas. Cada tarjeta muestra la suya.</Texto>
          ) : null}

          {visibles.length > 0 ? visibles.map(tarjetaRuta) : (
            <Tarjeta elevacion={2}>
              <EstadoVacio compacto icono={CalendarX} titulo="Hoy no hay recorrido" texto="Las rutas de tus hijos no pasan hoy. Aquí verás el próximo recorrido." />
            </Tarjeta>
          )}

          {finalizadas.filter((f) => !visibles.includes(f)).map((f) => (
            <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.success }} />
              <Texto v="medio" color="text2">{textoSentido(f.direction)} finalizada a las {hora(f.trip?.finished_at)}</Texto>
            </View>
          ))}

          <Tarjeta elevacion={2} estilo={{ paddingVertical: 4 }}>
            <FilaAjuste icono={CalendarX} titulo="Avisar que no va" texto="El chofer lo sabe al instante" onPress={() => nav.navigate('Pestanas', { screen: 'Ausencias', params: hijoSel ? { studentId: hijoSel } : undefined })} />
            <FilaAjuste icono={History} titulo="Historial" texto="Horas reales de subida y llegada" onPress={() => nav.navigate('Historial', hijoSel ? { studentId: hijoSel } : undefined)} />
            <FilaAjuste icono={UserPlus} titulo="Vincular otro hijo" texto="Con el código que te da el chofer" onPress={() => nav.navigate('Vincular')} ultima />
          </Tarjeta>

          <View>
            <TituloSeccion titulo="Avisos de hoy" accion="Ver todos" onAccion={irAvisos} />
            {avisosHoy.length === 0 ? (
              <Texto v="medio" color="text2" style={{ paddingVertical: 8 }}>Todavía no hay avisos. Te avisaremos cuando la buseta salga.</Texto>
            ) : (
              avisosHoy.slice(0, 3).map((a, i, lista) => (
                <Pressable
                  key={a.id}
                  onPress={irAvisos}
                  accessibilityRole="button"
                  accessibilityLabel={`${a.title}. ${a.body}. ${hora(a.created_at)}`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 10, borderBottomWidth: i === lista.length - 1 ? 0 : 1, borderBottomColor: c.border }}
                >
                  <IconoAviso aviso={a} />
                  <View style={{ flex: 1 }}>
                    <Texto v="medioFuerte" numberOfLines={1}>{a.title}</Texto>
                    {a.body ? <Texto v="nota" color="text3" numberOfLines={1}>{a.body}</Texto> : null}
                  </View>
                  <HoraReal texto={hora(a.created_at)} />
                </Pressable>
              ))
            )}
          </View>
        </>
      )}
    </Pantalla>
  );
}
