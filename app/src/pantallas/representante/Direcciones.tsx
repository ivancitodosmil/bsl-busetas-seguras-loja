// Direcciones del hijo y excepciones por día ("martes y jueves donde los abuelos").
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Check, Home, MapPin, Plus } from 'lucide-react-native';
import { elegirUbicacion } from '../../estado/seleccion';
import type { NavRep, PilaRep } from '../../navegacion/tipos';
import { representante } from '../../servicios/representante';
import { esp, radio, useTema } from '../../tema';
import type { Direccion, HijoResumen, Sentido } from '../../tipos';
import { Boton, EsqueletoLista, EstadoError, HojaInferior, Pantalla, Tarjeta, TarjetaDireccion, Texto, TituloSeccion, useToast } from '../../ui';
import { LETRAS_DIA, mensajeError, NOMBRES_DIA_ISO } from '../../utils';
import { calleDe, detalleDe } from './FichaHijo';

type Ficha = Awaited<ReturnType<typeof representante.ficha>>;
const clave = (dia: number, s: Sentido) => `${dia}-${s}`;

export default function Direcciones() {
  const { c } = useTema();
  const nav = useNavigation<NavRep>();
  const toast = useToast();
  const { studentId } = useRoute<RouteProp<PilaRep, 'Direcciones'>>().params;
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [error, setError] = useState(false);
  const [semana, setSemana] = useState<Record<string, string>>({});
  const [cambios, setCambios] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [eligiendo, setEligiendo] = useState<{ dia: number; sentido: Sentido } | null>(null);
  // Hermanos sin casa marcada: al marcar la primera casa se ofrece usar la misma para ellos.
  const [compartir, setCompartir] = useState<{ casa: Direccion; hermanos: HijoResumen[] } | null>(null);
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [copiando, setCopiando] = useState(false);

  const e = ficha?.estudiante;
  const nombre = e ? e.nickname || e.first_name : '';
  const porDefecto = useCallback(
    (s: Sentido) => (s === 'pickup' ? e?.default_pickup_address_id : e?.default_dropoff_address_id ?? e?.default_pickup_address_id) ?? '',
    [e],
  );
  const dias = useMemo(() => {
    const d = new Set((ficha?.rutas ?? []).flatMap((r) => r.days_of_week));
    return d.size > 0 ? [...d].sort((a, b) => a - b) : [1, 2, 3, 4, 5];
  }, [ficha]);

  const cargar = useCallback(async () => {
    try {
      const f = await representante.ficha(studentId);
      setFicha(f);
      setSemana(Object.fromEntries(f.excepciones.map((x) => [clave(x.weekday, x.direction), x.address_id])));
      setCambios(false);
      setError(false);
    } catch {
      setError(true);
    }
  }, [studentId]);

  // Solo al entrar: al volver del selector de ubicación no se pisan los cambios sin guardar.
  useFocusEffect(useCallback(() => { if (!ficha) cargar(); }, [cargar, ficha]));

  const direcciones = ficha?.direcciones ?? [];
  const porId = Object.fromEntries(direcciones.map((d) => [d.id, d]));
  const de = (dia: number, s: Sentido) => semana[clave(dia, s)] ?? porDefecto(s);

  const editar = async (d?: Direccion) => {
    if (!e) return;
    const r = await elegirUbicacion(nav, { titulo: d ? `Editar ${d.label}` : 'Nueva dirección', inicial: d ?? null, modo: 'casa' });
    if (!r) return;
    try {
      const fila = await representante.guardarDireccion({ ...r, id: d?.id, driver_id: e.driver_id, student_id: e.id });
      // La primera dirección que marca el representante es la casa: queda para recoger y para dejar.
      const primera = !e.default_pickup_address_id;
      if (primera) await representante.fijarCasa(e.id, fila.id, 'both');
      const f = await representante.ficha(studentId);
      setFicha(f);
      toast.mostrar(primera ? 'Casa marcada. Ya está en la ruta del chofer' : d ? 'Dirección actualizada. El chofer ya fue avisado' : 'Dirección agregada. El chofer ya fue avisado', { tipo: 'exito' });
      if (primera) {
        const hermanos = await representante.resumen().then((r) => r.children.filter((h) => h.id !== e.id && !h.has_home)).catch(() => []);
        if (hermanos.length > 0) {
          setElegidos(hermanos.map((h) => h.id));
          setCompartir({ casa: fila, hermanos });
        }
      }
    } catch (err) {
      toast.mostrar(mensajeError(err, 'No se pudo guardar la dirección.'), { tipo: 'error' });
    }
  };

  // Copia la casa a cada hermano elegido (cada niño tiene su propia dirección) y la fija como su casa.
  const usarMismaCasa = async () => {
    if (!compartir) return;
    const { casa, hermanos } = compartir;
    const para = hermanos.filter((h) => elegidos.includes(h.id));
    setCopiando(true);
    try {
      for (const h of para) {
        const copia = await representante.guardarDireccion({
          driver_id: h.driver_id, student_id: h.id, label: casa.label, kind: casa.kind,
          main_street: casa.main_street, cross_street: casa.cross_street, house_number: casa.house_number,
          neighborhood: casa.neighborhood, reference: casa.reference, receiver_note: casa.receiver_note,
          latitude: casa.latitude, longitude: casa.longitude, gps_accuracy_m: casa.gps_accuracy_m,
        });
        await representante.fijarCasa(h.id, copia.id, 'both');
      }
      setCompartir(null);
      const nombres = para.map((h) => h.name);
      toast.mostrar(`Casa marcada también para ${nombres.length > 1 ? `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}` : nombres[0]}`, { tipo: 'exito' });
    } catch (err) {
      toast.mostrar(mensajeError(err, 'No se pudo marcar la casa de los hermanos.'), { tipo: 'error' });
    } finally {
      setCopiando(false);
    }
  };

  const usarComoCasa = async (d: Direccion) => {
    if (!e) return;
    try {
      await representante.fijarCasa(e.id, d.id, 'both');
      setFicha(await representante.ficha(studentId));
      toast.mostrar(`«${d.label}» es ahora la casa de ${nombre}`, { tipo: 'exito' });
    } catch (err) {
      toast.mostrar(mensajeError(err, 'No se pudo cambiar la casa.'), { tipo: 'error' });
    }
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      const lista: { weekday: number; direction: Sentido; address_id: string }[] = [];
      for (const dia of dias) {
        for (const s of ['pickup', 'dropoff'] as Sentido[]) {
          const id = semana[clave(dia, s)];
          if (id && id !== porDefecto(s) && porId[id]) lista.push({ weekday: dia, direction: s, address_id: id });
        }
      }
      await representante.guardarExcepciones(studentId, lista);
      setCambios(false);
      toast.mostrar('Cambios guardados', { tipo: 'exito' });
    } catch (err) {
      toast.mostrar(mensajeError(err, 'No se pudieron guardar los cambios.'), { tipo: 'error' });
    } finally {
      setGuardando(false);
    }
  };

  const celda = (dia: number, s: Sentido) => {
    const id = de(dia, s);
    const distinta = id !== porDefecto(s);
    return (
      <Pressable
        onPress={() => setEligiendo({ dia, sentido: s })}
        accessibilityRole="button"
        accessibilityLabel={`${NOMBRES_DIA_ISO[dia - 1]}, ${s === 'pickup' ? 'recoger en' : 'dejar en'} ${porId[id]?.label ?? 'sin dirección'}. Cambiar`}
        style={{ flex: 1, minHeight: 48, borderRadius: radio.campo, paddingHorizontal: 10, justifyContent: 'center', backgroundColor: distinta ? c.accentSoft : c.surface2 }}
      >
        <Texto v="nota" numberOfLines={2} style={{ color: distinta ? c.accentInk : c.text, fontFamily: 'Inter_600SemiBold' }}>{porId[id]?.label ?? 'Elegir'}</Texto>
      </Pressable>
    );
  };

  return (
    <Pantalla
      titulo={nombre ? `Direcciones de ${nombre}` : 'Direcciones'}
      onAtras={() => nav.goBack()}
      pie={ficha ? (
        <>
          <Boton titulo="Guardar cambios" onPress={guardar} cargando={guardando} deshabilitado={!cambios} />
          <Texto v="nota" color="text3" centro>El chofer recibe el aviso de cada cambio.</Texto>
        </>
      ) : undefined}
    >
      {error && !ficha ? (
        <Tarjeta><EstadoError onReintentar={cargar} /></Tarjeta>
      ) : !ficha || !e ? (
        <EsqueletoLista filas={3} />
      ) : (
        <>
          <View style={{ gap: esp.sm }}>
            <Tarjeta elevacion={2} estilo={{ paddingVertical: 10 }}>
              <TituloSeccion titulo="Direcciones guardadas" accion="Agregar" onAccion={() => editar()} />
            </Tarjeta>
            {direcciones.length === 0 ? (
              <Tarjeta estilo={{ gap: esp.md }}>
                <Texto v="subtitulo">Marca la casa de {nombre}</Texto>
                <Texto v="medio" color="text2">
                  Pon el pin en el portón de tu casa y escribe una referencia. El chofer la verá en su ruta y te llegarán los avisos cuando la buseta esté a 1 km y a 500 m.
                </Texto>
                <Boton titulo="Marcar la casa en el mapa" icono={MapPin} onPress={() => editar()} />
              </Tarjeta>
            ) : direcciones.map((d) => {
              const esOrigen = d.id === e.default_pickup_address_id;
              const esDestino = d.id === (e.default_dropoff_address_id ?? e.default_pickup_address_id);
              const titulo = esOrigen && esDestino ? 'Origen y destino por defecto' : esOrigen ? 'Origen por defecto' : esDestino ? 'Destino por defecto' : d.kind === 'pickup' ? 'Origen otros días' : 'Destino otros días';
              return (
                <View key={d.id} style={{ gap: 4 }}>
                  <TarjetaDireccion
                    tipo={esOrigen || d.kind === 'pickup' ? 'origen' : 'destino'}
                    titulo={titulo}
                    etiqueta={d.label}
                    calle={calleDe(d)}
                    detalle={detalleDe(d)}
                    nota={d.receiver_note}
                    onPress={() => editar(d)}
                  />
                  {!esOrigen && !esDestino ? (
                    <Boton titulo="Usar como casa de siempre" variante="fantasma" tamano="compacto" icono={Home} onPress={() => usarComoCasa(d)} ancho={false} estilo={{ alignSelf: 'flex-end' }} />
                  ) : null}
                </View>
              );
            })}
            {direcciones.length > 0 ? <Boton titulo="Agregar otra dirección" variante="secundario" icono={Plus} onPress={() => editar()} /> : null}
          </View>

          {direcciones.length > 0 ? (
            <Tarjeta estilo={{ gap: esp.sm }}>
              <Texto v="seccion" accessibilityRole="header">Semana de {nombre}</Texto>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <View style={{ width: 28 }} />
                <Texto v="nota" color="text2" style={{ flex: 1 }}>Ida: recoger en</Texto>
                <Texto v="nota" color="text2" style={{ flex: 1 }}>Vuelta: dejar en</Texto>
              </View>
              {dias.map((dia) => (
                <View key={dia} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <Texto v="seccion" color="text2" style={{ width: 28 }} accessibilityLabel={NOMBRES_DIA_ISO[dia - 1]}>{LETRAS_DIA[dia - 1]}</Texto>
                  {celda(dia, 'pickup')}
                  {celda(dia, 'dropoff')}
                </View>
              ))}
              <Texto v="nota" color="text3">Los días resaltados usan una dirección distinta a la de siempre.</Texto>
            </Tarjeta>
          ) : null}
        </>
      )}

      <HojaInferior
        visible={!!eligiendo}
        onCerrar={() => setEligiendo(null)}
        titulo={eligiendo ? `${NOMBRES_DIA_ISO[eligiendo.dia - 1].charAt(0).toUpperCase()}${NOMBRES_DIA_ISO[eligiendo.dia - 1].slice(1)}, ${eligiendo.sentido === 'pickup' ? 'recoger en' : 'dejar en'}` : undefined}
      >
        {eligiendo ? direcciones.map((d) => {
          const sel = de(eligiendo.dia, eligiendo.sentido) === d.id;
          return (
            <Pressable
              key={d.id}
              onPress={() => {
                setSemana((s) => ({ ...s, [clave(eligiendo.dia, eligiendo.sentido)]: d.id }));
                setCambios(true);
                setEligiendo(null);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: sel }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, padding: esp.md, borderRadius: 12, backgroundColor: sel ? c.primarySoft : c.surface2 }}
            >
              <View style={{ flex: 1 }}>
                <Texto v="fuerte" color={sel ? 'primary' : 'text'}>{d.label}{d.id === porDefecto(eligiendo.sentido) ? ' (la de siempre)' : ''}</Texto>
                <Texto v="nota" color="text2">{calleDe(d)}</Texto>
              </View>
              {sel ? <Check size={20} color={c.primary} strokeWidth={2} /> : null}
            </Pressable>
          );
        }) : null}
      </HojaInferior>

      <HojaInferior
        visible={!!compartir}
        onCerrar={() => setCompartir(null)}
        titulo={compartir && compartir.hermanos.length === 1 ? `¿${compartir.hermanos[0].name} vive en la misma casa?` : '¿Sus hermanos viven en la misma casa?'}
        texto={compartir ? `Usamos «${compartir.casa.label}» también para ${compartir.hermanos.length === 1 ? compartir.hermanos[0].name : 'los que elijas'}, sin volver a marcarla en el mapa.` : undefined}
        pie={
          <>
            <Boton titulo="Usar la misma casa" icono={Home} onPress={usarMismaCasa} cargando={copiando} deshabilitado={elegidos.length === 0} />
            <Boton titulo="No, vive en otra casa" variante="fantasma" onPress={() => setCompartir(null)} deshabilitado={copiando} />
          </>
        }
      >
        {compartir && compartir.hermanos.length > 1 ? compartir.hermanos.map((h) => {
          const sel = elegidos.includes(h.id);
          return (
            <Pressable
              key={h.id}
              onPress={() => setElegidos((l) => (sel ? l.filter((x) => x !== h.id) : [...l, h.id]))}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: sel }}
              accessibilityLabel={h.name}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: c.border }}
            >
              <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: sel ? c.primary : c.border, backgroundColor: sel ? c.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                {sel ? <Check size={16} color={c.onPrimary} strokeWidth={3} /> : null}
              </View>
              <Texto v="medioFuerte" style={{ flex: 1 }}>{h.first_name} {h.last_name}</Texto>
            </Pressable>
          );
        }) : null}
      </HojaInferior>
    </Pantalla>
  );
}
