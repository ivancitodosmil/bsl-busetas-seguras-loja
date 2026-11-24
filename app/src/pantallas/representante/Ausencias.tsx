// Ausencias: calendario por hijo; un toque en el día para avisar que no va (ida, vuelta o todo el día).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { CalendarX, ChevronLeft, ChevronRight, Users } from 'lucide-react-native';
import type { NavRep, PestanasRep } from '../../navegacion/tipos';
import { MOTIVOS_AUSENCIA } from '../../servicios/chofer';
import { representante } from '../../servicios/representante';
import { esp, fuentes, radio, useTema } from '../../tema';
import type { AlcanceAusencia, Ausencia, Cancelacion } from '../../tipos';
import {
  BannerAlerta, Boton, BotonIcono, Chip, EsqueletoLista, EstadoError, EstadoVacio, HojaInferior, Pantalla, Segmentado, SelectorHijo,
  Tarjeta, Texto, TituloSeccion, useToast,
} from '../../ui';
import { diaISO, fechaLarga, hoyISO, LETRAS_DIA, mensajeError, MESES, sumarDias, textoAlcance } from '../../utils';
import { opcionesHijos, useResumen } from './_partes';

const p2 = (n: number) => String(n).padStart(2, '0');

/** «Mateo no va hoy, martes 24» o «Mateo no va el jueves 26». */
function tituloHoja(nombre: string, dia: string, hoy: string) {
  const corto = fechaLarga(dia, false).split(' de ')[0];
  return dia === hoy ? `${nombre} no va hoy, ${corto}` : `${nombre} no va el ${corto}`;
}

export default function Ausencias() {
  const { c } = useTema();
  const nav = useNavigation<NavRep>();
  const toast = useToast();
  const params = useRoute<RouteProp<PestanasRep, 'Ausencias'>>().params;
  const { datos, cargando, error, refrescando, recargar } = useResumen();
  const hijos = datos?.children ?? [];
  const [hijoSel, setHijoSel] = useState<string | null>(params?.studentId ?? null);
  const hoy = hoyISO();
  const [mes, setMes] = useState(() => ({ a: Number(hoy.slice(0, 4)), m: Number(hoy.slice(5, 7)) }));
  const [ausencias, setAusencias] = useState<Ausencia[]>([]);
  const [cancelaciones, setCancelaciones] = useState<Cancelacion[]>([]);
  const [errorMes, setErrorMes] = useState(false);
  const [dia, setDia] = useState<string | null>(null);
  const [alcance, setAlcance] = useState<AlcanceAusencia>('all');
  const [motivo, setMotivo] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorHoja, setErrorHoja] = useState<string | null>(null);

  useEffect(() => {
    if (params?.studentId) setHijoSel(params.studentId);
  }, [params?.studentId]);

  const hijo = hijos.find((h) => h.id === hijoSel) ?? hijos[0];
  const rutasHijo = useMemo(() => (datos?.routes ?? []).filter((r) => hijo && r.children.some((n) => n.student_id === hijo.id)), [datos, hijo]);
  const idsRutas = rutasHijo.map((r) => r.id).join(',');
  const diasServicio = useMemo(() => new Set(rutasHijo.flatMap((r) => r.days_of_week)), [rutasHijo]);
  const chofer = rutasHijo[0]?.driver?.first_name ?? 'El chofer';

  const inicioMes = `${mes.a}-${p2(mes.m)}-01`;
  const diasDelMes = new Date(Date.UTC(mes.a, mes.m, 0)).getUTCDate();
  const finMes = `${mes.a}-${p2(mes.m)}-${p2(diasDelMes)}`;

  const cargarMes = useCallback(async () => {
    if (!hijo) return;
    try {
      const desde = inicioMes < hoy ? inicioMes : hoy;
      const limite = sumarDias(hoy, 90);
      const hasta = finMes > limite ? finMes : limite;
      const [a, k] = await Promise.all([
        representante.ausencias([hijo.id], desde, hasta),
        representante.cancelaciones(idsRutas ? idsRutas.split(',') : [], inicioMes, finMes),
      ]);
      setAusencias(a);
      setCancelaciones(k);
      setErrorMes(false);
    } catch {
      setErrorMes(true);
    }
  }, [hijo?.id, idsRutas, inicioMes, finMes, hoy]); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(useCallback(() => { cargarMes(); }, [cargarMes]));

  const porFecha = useMemo(() => Object.fromEntries(ausencias.map((a) => [a.date, a])), [ausencias]);
  const cancelados = useMemo(() => new Set(cancelaciones.map((k) => k.date)), [cancelaciones]);
  const proximas = ausencias.filter((a) => a.date >= hoy);
  const actual = dia ? porFecha[dia] : undefined;

  const abrir = (fecha: string) => {
    const a = porFecha[fecha];
    setDia(fecha);
    setAlcance(a?.scope ?? 'all');
    setMotivo(a?.reason ?? null);
    setErrorHoja(null);
  };

  const confirmar = async () => {
    if (!hijo || !dia) return;
    setGuardando(true);
    setErrorHoja(null);
    try {
      await representante.guardarAusencia({ student_id: hijo.id, date: dia, scope: alcance, reason: motivo });
      setDia(null);
      toast.mostrar(`Ausencia registrada. ${chofer} ya fue avisado`, { tipo: 'exito' });
      cargarMes();
    } catch (e) {
      setErrorHoja(mensajeError(e, 'No se pudo registrar la ausencia. Inténtalo de nuevo.'));
    } finally {
      setGuardando(false);
    }
  };

  const quitar = async () => {
    if (!actual) return;
    setGuardando(true);
    setErrorHoja(null);
    try {
      await representante.quitarAusencia(actual.id);
      setDia(null);
      toast.mostrar(`Ausencia retirada. ${hijo?.name} sí va ese día`, { tipo: 'exito' });
      cargarMes();
    } catch (e) {
      setErrorHoja(mensajeError(e, 'No se pudo quitar la ausencia.'));
    } finally {
      setGuardando(false);
    }
  };

  const moverMes = (d: number) => {
    const n = mes.m + d;
    setMes(n < 1 ? { a: mes.a - 1, m: 12 } : n > 12 ? { a: mes.a + 1, m: 1 } : { a: mes.a, m: n });
  };
  const mesActual = mes.a === Number(hoy.slice(0, 4)) && mes.m === Number(hoy.slice(5, 7));

  // Cuadrícula L–D con huecos al inicio.
  const huecos = diaISO(inicioMes) - 1;
  const celdas: (string | null)[] = [
    ...Array.from({ length: huecos }, () => null),
    ...Array.from({ length: diasDelMes }, (_, i) => `${mes.a}-${p2(mes.m)}-${p2(i + 1)}`),
  ];
  while (celdas.length % 7 !== 0) celdas.push(null);

  const celda = (fecha: string | null, i: number) => {
    if (!fecha) return <View key={i} style={{ flex: 1, height: 48 }} />;
    const a = porFecha[fecha];
    const pasado = fecha < hoy;
    const sinServicio = diasServicio.size > 0 && !diasServicio.has(diaISO(fecha));
    const cancelado = cancelados.has(fecha);
    const inactivo = pasado || sinServicio || cancelado || !hijo?.can_report_absence;
    const esHoy = fecha === hoy;
    const n = Number(fecha.slice(8));
    const etiqueta = `${fechaLarga(fecha)}${a ? `, ausencia ${textoAlcance(a.scope).toLowerCase()}` : ''}${cancelado ? ', servicio cancelado' : ''}${esHoy ? ', hoy' : ''}`;
    return (
      <Pressable
        key={i}
        onPress={inactivo ? undefined : () => abrir(fecha)}
        disabled={inactivo}
        accessibilityRole="button"
        accessibilityLabel={etiqueta}
        accessibilityState={{ disabled: inactivo, selected: !!a }}
        style={{ flex: 1, height: 48, alignItems: 'center', justifyContent: 'center' }}
      >
        <View style={{ width: 42, height: 42, borderRadius: 21, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: esHoy ? 2 : 0, borderColor: c.primary, backgroundColor: cancelado ? c.surface2 : 'transparent' }}>
          {a ? (
            <View style={{ position: 'absolute', top: 0, bottom: 0, left: a.scope === 'dropoff' ? '50%' : 0, right: a.scope === 'pickup' ? '50%' : 0, backgroundColor: c.dangerSoft }} />
          ) : null}
          <Texto
            v="medioFuerte"
            style={{
              fontFamily: a || esHoy ? fuentes.fuerte : fuentes.medio,
              color: a ? c.dangerInk : pasado || sinServicio ? c.text3 : c.text,
              opacity: pasado || sinServicio ? 0.55 : 1,
              textDecorationLine: cancelado ? 'line-through' : 'none',
            }}
          >
            {n}
          </Texto>
        </View>
      </Pressable>
    );
  };

  const leyenda = (texto: string, lado: 'izq' | 'der' | 'todo') => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: c.border, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', top: 0, bottom: 0, left: lado === 'der' ? '50%' : 0, right: lado === 'izq' ? '50%' : 0, backgroundColor: c.danger }} />
      </View>
      <Texto v="nota" color="text2">{texto}</Texto>
    </View>
  );

  return (
    <Pantalla
      marino
      titulo="Ausencias"
      conBarra
      refrescando={refrescando}
      onRefrescar={() => { recargar(true); cargarMes(); }}
      bajoTitulo={hijos.length > 1 ? <SelectorHijo hijos={opcionesHijos(hijos)} seleccionado={hijo?.id ?? null} onSeleccionar={setHijoSel} incluirTodos={false} /> : undefined}
    >
      {cargando && !datos ? (
        <EsqueletoLista filas={2} />
      ) : error && !datos ? (
        <Tarjeta><EstadoError onReintentar={() => recargar(true)} /></Tarjeta>
      ) : !hijo ? (
        <Tarjeta elevacion={2}>
          <EstadoVacio icono={Users} titulo="Vincula a tu hijo" texto="Cuando lo vincules podrás avisar aquí los días que no va." accion="Vincular con un código" onAccion={() => nav.navigate('Vincular')} />
        </Tarjeta>
      ) : (
        <>
          <Tarjeta elevacion={2} estilo={{ gap: esp.md }}>
            <Texto v="medio" color="text2">
              {hijo.can_report_absence
                ? `Toca un día para avisar que ${hijo.name} no va. Hoy solo se puede antes de que inicie cada recorrido.`
                : `Tu cuenta solo recibe avisos de ${hijo.name}. Pídele al representante principal que reporte las ausencias.`}
            </Texto>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <BotonIcono icono={ChevronLeft} etiqueta="Mes anterior" onPress={mesActual ? undefined : () => moverMes(-1)} color={mesActual ? c.border : undefined} />
              <Texto v="seccion" centro style={{ flex: 1, textTransform: 'capitalize' }} accessibilityLiveRegion="polite">{MESES[mes.m - 1]} {mes.a}</Texto>
              <BotonIcono icono={ChevronRight} etiqueta="Mes siguiente" onPress={() => moverMes(1)} />
            </View>
            <View>
              <View style={{ flexDirection: 'row' }}>
                {LETRAS_DIA.map((l, i) => (
                  <Texto key={i} v="nota" color="text3" centro style={{ flex: 1, paddingBottom: 4 }}>{l}</Texto>
                ))}
              </View>
              {Array.from({ length: celdas.length / 7 }, (_, f) => (
                <View key={f} style={{ flexDirection: 'row' }}>{celdas.slice(f * 7, f * 7 + 7).map((d, i) => celda(d, f * 7 + i))}</View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
              {leyenda('Solo ida', 'izq')}
              {leyenda('Solo vuelta', 'der')}
              {leyenda('Todo el día', 'todo')}
            </View>
            {errorMes ? <BannerAlerta tipo="aviso" titulo="No pudimos cargar el calendario" accion="Reintentar" onAccion={cargarMes} /> : null}
          </Tarjeta>

          <View>
            <TituloSeccion titulo={`Próximas ausencias de ${hijo.name}`} />
            {proximas.length === 0 ? (
              <Texto v="medio" color="text2" style={{ paddingVertical: 6 }}>Ninguna. El chofer recibe el aviso al instante y la parada desaparece de su recorrido.</Texto>
            ) : (
              <View style={{ gap: 8, marginTop: 4 }}>
                {proximas.map((a) => (
                  <Tarjeta key={a.id} onPress={hijo.can_report_absence ? () => abrir(a.date) : undefined} etiqueta={`${fechaLarga(a.date)}, ${textoAlcance(a.scope)}. Editar`}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.dangerSoft, alignItems: 'center', justifyContent: 'center' }}>
                        <CalendarX size={20} color={c.dangerInk} strokeWidth={2} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Texto v="fuerte" style={{ fontSize: 15 }}>{fechaLarga(a.date)}</Texto>
                        <Texto v="nota" color="text2">{textoAlcance(a.scope)}{a.reason ? `, ${a.reason}` : ''}</Texto>
                      </View>
                      {hijo.can_report_absence ? <Texto v="medioFuerte" color="primary">Editar</Texto> : null}
                    </View>
                  </Tarjeta>
                ))}
              </View>
            )}
          </View>
        </>
      )}

      <HojaInferior
        visible={!!dia}
        onCerrar={() => setDia(null)}
        titulo={dia ? tituloHoja(hijo?.name ?? 'Tu hijo', dia, hoy) : undefined}
        texto={`${chofer} lo verá al instante y no parará en tu casa en ese recorrido.`}
        pie={
          <>
            <Boton titulo={actual ? 'Guardar cambio' : `Confirmar que ${hijo?.name ?? 'tu hijo'} no va`} onPress={confirmar} cargando={guardando} />
            {actual ? (
              <Boton titulo="Quitar ausencia" variante="peligro" onPress={quitar} deshabilitado={guardando} />
            ) : (
              <Boton titulo="Cancelar" colores={{ fondo: 'transparent', tinta: c.text2 }} estilo={{ height: 48 }} onPress={() => setDia(null)} deshabilitado={guardando} />
            )}
          </>
        }
      >
        <Texto v="medioFuerte" color="text2" style={{ fontFamily: 'Inter_700Bold', fontSize: 13.5 }}>¿En qué recorrido?</Texto>
        <Segmentado
          valor={alcance}
          onChange={setAlcance}
          opciones={[{ valor: 'pickup', texto: 'Solo ida' }, { valor: 'dropoff', texto: 'Solo vuelta' }, { valor: 'all', texto: 'Todo el día' }]}
        />
        <Texto v="medioFuerte" color="text2" style={{ marginTop: 6, fontFamily: 'Inter_700Bold', fontSize: 13.5 }}>Motivo (opcional)</Texto>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {MOTIVOS_AUSENCIA.map((m) => (
            <Chip key={m} texto={m} seleccionado={motivo === m} onPress={() => setMotivo(motivo === m ? null : m)} />
          ))}
        </View>
        {errorHoja ? (
          <View style={{ backgroundColor: c.dangerSoft, borderRadius: radio.campo, padding: 12 }}>
            <Texto v="medio" color="dangerInk" accessibilityLiveRegion="polite">{errorHoja}</Texto>
          </View>
        ) : null}
      </HojaInferior>
    </Pantalla>
  );
}
