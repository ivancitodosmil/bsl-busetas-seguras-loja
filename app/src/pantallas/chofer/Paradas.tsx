// Constructor de paradas: línea de tiempo mixta casa/escuela con horario estimado.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { ArrowDownUp, ChevronDown, ChevronUp, Home, MapPinOff, Plus, School, X } from 'lucide-react-native';
import {
  Avatar, BannerAlerta, Boton, ChipEscuela, EsqueletoLista, EstadoError, EstadoVacio, HojaInferior, MapaRecorrido, ModalConfirmar,
  Pantalla, Tarjeta, Texto, useToast,
} from '../../ui';
import { esp, fuentes, useTema } from '../../tema';
import { chofer, type EstudianteLista } from '../../servicios/chofer';
import { calcularHorarios, optimizarOrden, trazar } from '../../servicios/viaje';
import { pedir, supabase } from '../../config/supabase';
import type { NavChofer, PilaChofer } from '../../navegacion/tipos';
import type { Coordenada, Direccion, Escuela, Parada, Ruta, TipoParada } from '../../tipos';
import { aMinutos, distanciaM, hhmm, mensajeError, textoSentido } from '../../utils';

interface Item {
  clave: string;
  kind: TipoParada;
  student_id: string | null;
  school_id: string | null; // en una casa: la escuela del niño
  nombre: string; // niño o escuela
  etiqueta: string; // "Casa Jaramillo" o nombre de la escuela
  calle: string | null;
  escuelaCorta: string | null;
  escuelaColor: string | null;
  horaEscuela: string | null; // entrada (ida) o salida (vuelta), solo en paradas de escuela
  latitude: number | null;
  longitude: number | null;
}

const esCasa = (k: TipoParada) => k === 'pickup_home' || k === 'dropoff_home';
const calleDe = (d: Pick<Direccion, 'main_street' | 'cross_street'> | null | undefined) =>
  d ? [d.main_street, d.cross_street].filter(Boolean).join(' y ') || null : null;

function mismoSitio(a: Item | undefined, b: Item): boolean {
  return !!a && esCasa(a.kind) && a.kind === b.kind && a.latitude != null && b.latitude != null &&
    distanciaM(a as Coordenada, b as Coordenada) < 30;
}

export default function Paradas() {
  const nav = useNavigation<NavChofer>();
  const { routeId } = useRoute<RouteProp<PilaChofer, 'Paradas'>>().params;
  const { c } = useTema();
  const toast = useToast();

  const [ruta, setRuta] = useState<Ruta | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [estudiantes, setEstudiantes] = useState<EstudianteLista[]>([]);
  const [escuelas, setEscuelas] = useState<Escuela[]>([]);
  const [direcciones, setDirecciones] = useState<Record<string, Direccion>>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [sucio, setSucio] = useState(false);
  const [horas, setHoras] = useState<(string | null)[]>([]);
  const [linea, setLinea] = useState<Coordenada[]>([]);
  const [calculando, setCalculando] = useState(false);
  const [hoja, setHoja] = useState<'nino' | 'escuela' | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [salir, setSalir] = useState(false);

  const ida = ruta?.direction !== 'dropoff';

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const [r, paradas, ests, escs] = await Promise.all([
        chofer.ruta(routeId), chofer.paradas(routeId), chofer.estudiantes(), chofer.escuelas(),
      ]);
      const ids = ests.flatMap((e) => [e.default_pickup_address_id, e.default_dropoff_address_id]).filter(Boolean) as string[];
      const dirs = ids.length ? await pedir<Direccion[]>(supabase.from('addresses').select('*').in('id', ids)) : [];
      setRuta(r);
      setEstudiantes(ests);
      setEscuelas(escs);
      setDirecciones(Object.fromEntries(dirs.map((d) => [d.id, d])));
      setItems(paradas.map((p: Parada) => ({
        clave: p.stop_id,
        kind: p.kind,
        student_id: p.student_id,
        school_id: p.school_id,
        nombre: (esCasa(p.kind) ? p.student_full_name ?? p.student_name : p.school_name) ?? '',
        etiqueta: p.label,
        calle: p.street,
        escuelaCorta: p.school_short,
        escuelaColor: p.school_color,
        horaEscuela: esCasa(p.kind) ? null : p.school_time,
        latitude: p.latitude,
        longitude: p.longitude,
      })));
      setHoras(paradas.map((p) => p.estimated_time));
      setLinea(r.polyline ?? []);
      setSucio(false);
    } catch (e) {
      setError(e);
    } finally {
      setCargando(false);
    }
  }
  useEffect(() => { cargar(); }, [routeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recalcula trazado y horarios cada vez que cambia el orden.
  const firma = items.map((i) => i.clave).join('|');
  const turno = useRef(0);
  useEffect(() => {
    if (!ruta || cargando) return;
    if (!sucio && horas.length === items.length && horas.every(Boolean) && linea.length > 1) return;
    const miTurno = ++turno.current;
    const conPunto = items.map((it, i) => ({ it, i })).filter((x) => x.it.latitude != null && x.it.longitude != null);
    if (conPunto.length === 0) {
      setHoras(items.map(() => null));
      setLinea([]);
      setCalculando(false);
      return;
    }
    setCalculando(true);
    const reloj = setTimeout(async () => {
      const t = await trazar(conPunto.map((x) => ({ latitude: x.it.latitude as number, longitude: x.it.longitude as number })));
      if (miTurno !== turno.current) return;
      const h = calcularHorarios(hhmm(ruta.departure_time), t.tramosM, conPunto.length);
      const res: (string | null)[] = items.map(() => null);
      conPunto.forEach((x, k) => { res[x.i] = h[k]; });
      setHoras(res);
      setLinea(t.linea);
      setCalculando(false);
    }, 500);
    return () => clearTimeout(reloj);
  }, [firma, ruta?.id, cargando]); // eslint-disable-line react-hooks/exhaustive-deps

  const [optimizando, setOptimizando] = useState(false);
  async function optimizar() {
    setOptimizando(true);
    try {
      const { orden, porCalles } = await optimizarOrden(items, ida ? 'pickup' : 'dropoff');
      cambiar(orden);
      toast.mostrar(porCalles ? 'Paradas ordenadas por el camino más corto. Revisa y guarda.' : 'Sin conexión: ordenamos por cercanía. Revisa y guarda.');
    } finally {
      setOptimizando(false);
    }
  }

  function cambiar(nuevos: Item[]) {
    setItems(nuevos);
    setSucio(true);
  }
  function mover(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const n = [...items];
    [n[i], n[j]] = [n[j], n[i]];
    cambiar(n);
  }

  function agregarNino(e: EstudianteLista) {
    const idDir = ida ? e.default_pickup_address_id : e.default_dropoff_address_id ?? e.default_pickup_address_id;
    const d = idDir ? direcciones[idDir] : undefined;
    const nuevo: Item = {
      clave: `n-${e.id}`,
      kind: ida ? 'pickup_home' : 'dropoff_home',
      student_id: e.id,
      school_id: e.school_id,
      nombre: `${e.first_name} ${e.last_name}`.trim(),
      etiqueta: !d || d.label.toLowerCase() === 'casa' ? `Casa ${e.last_name}`.trim() : d.label,
      calle: calleDe(d),
      escuelaCorta: e.school?.short_name ?? null,
      escuelaColor: e.school?.color ?? null,
      horaEscuela: null,
      latitude: d?.latitude ?? null,
      longitude: d?.longitude ?? null,
    };
    const n = [...items];
    const iEscuela = n.findIndex((x) => !esCasa(x.kind) && x.school_id === e.school_id);
    if (ida && iEscuela >= 0) n.splice(iEscuela, 0, nuevo); // sube antes de llegar a su escuela
    else n.push(nuevo);
    cambiar(n);
  }

  function agregarEscuela(e: Escuela) {
    const nuevo: Item = {
      clave: `e-${e.id}`,
      kind: ida ? 'dropoff_school' : 'pickup_school',
      student_id: null,
      school_id: e.id,
      nombre: e.name,
      etiqueta: e.name,
      calle: calleDe(e.address) ?? e.gate_reference,
      escuelaCorta: e.short_name,
      escuelaColor: e.color,
      horaEscuela: hhmm(ida ? e.entry_time : e.exit_time),
      latitude: e.address?.latitude ?? null,
      longitude: e.address?.longitude ?? null,
    };
    if (ida) cambiar([...items, nuevo]);
    else {
      // en la vuelta, la escuela va antes que la primera casa de sus niños
      const n = [...items];
      const iCasa = n.findIndex((x) => esCasa(x.kind) && x.school_id === e.id);
      if (iCasa >= 0) n.splice(iCasa, 0, nuevo);
      else n.push(nuevo);
      cambiar(n);
    }
  }

  const ninosLibres = useMemo(() => estudiantes.filter((e) => !items.some((i) => i.student_id === e.id)), [estudiantes, items]);
  const escuelasLibres = useMemo(() => escuelas.filter((e) => !items.some((i) => !esCasa(i.kind) && i.school_id === e.id)), [escuelas, items]);

  // Avisos que se ven mientras se edita (no impiden guardar).
  const avisos = useMemo(() => {
    const lista: { titulo: string; texto?: string; studentId?: string }[] = [];
    items.forEach((it, i) => {
      if (esCasa(it.kind)) {
        if (it.latitude == null) lista.push({ titulo: `Falta la casa de ${it.nombre}`, texto: 'La marca su representante en su app. Hasta entonces la parada no aparece en el mapa.', studentId: it.student_id ?? undefined });
        if (!it.school_id) return;
        const iEsc = items.findIndex((x) => !esCasa(x.kind) && x.school_id === it.school_id);
        if (iEsc < 0) lista.push({ titulo: `Falta la escuela de ${it.nombre}`, texto: `Agrega ${it.escuelaCorta ?? 'su escuela'} como parada de esta ruta.` });
        else if (ida && iEsc < i) lista.push({ titulo: `${it.nombre} sube después de su escuela`, texto: `Mueve su casa antes de ${it.escuelaCorta ?? 'la escuela'}.` });
        else if (!ida && iEsc > i) lista.push({ titulo: `${it.nombre} baja antes de pasar por su escuela`, texto: `Mueve ${it.escuelaCorta ?? 'la escuela'} antes de su casa.` });
      } else if (ida && it.horaEscuela && horas[i] && aMinutos(horas[i]) > aMinutos(it.horaEscuela)) {
        lista.push({ titulo: `Llegas tarde a ${it.escuelaCorta ?? it.nombre}`, texto: `Llegada estimada ${horas[i]} y la entrada es a las ${it.horaEscuela}. Sal antes o cambia el orden.` });
      }
    });
    return lista;
  }, [items, horas, ida]);

  async function guardar() {
    if (items.length < 1 || items.length > 50) {
      toast.mostrar('Una ruta necesita entre 1 y 50 paradas.', { tipo: 'error' });
      return;
    }
    setGuardando(true);
    try {
      await chofer.guardarParadas(routeId, items.map((it, i) => ({
        kind: it.kind,
        student_id: esCasa(it.kind) ? it.student_id : null,
        school_id: esCasa(it.kind) ? null : it.school_id,
        estimated_time: horas[i] ?? null,
      })));
      await chofer.guardarTrazado(routeId, linea.length > 1 ? linea : null).catch(() => {});
      toast.mostrar('Paradas guardadas. Avisamos a los representantes.', { tipo: 'exito' });
      nav.goBack();
    } catch (e) {
      toast.mostrar(mensajeError(e), { tipo: 'error' });
    } finally {
      setGuardando(false);
    }
  }

  const paradasMapa = useMemo<Parada[]>(() => items.map((it, i) => ({
    stop_id: it.clave, position: i + 1, kind: it.kind, student_id: it.student_id, school_id: it.school_id,
    student_name: it.nombre, student_full_name: it.nombre, student_photo: null, notes: null, school_name: it.nombre,
    school_short: it.escuelaCorta, school_color: it.escuelaColor, school_time: it.horaEscuela, label: it.etiqueta, street: it.calle,
    reference: null, address_id: null, latitude: it.latitude, longitude: it.longitude, estimated_time: horas[i] ?? null,
    absent: false, absence_reason: null, absence_scope: null, absence_by: null,
  })), [items, horas]);

  const atras = () => (sucio ? setSalir(true) : nav.goBack());

  return (
    <>
      <Pantalla
        titulo={`Paradas de ${ruta ? textoSentido(ruta.direction).toLowerCase() : 'la ruta'}`}
        subtitulo={ruta ? `${ruta.name}, sale ${hhmm(ruta.departure_time)}` : undefined}
        onAtras={atras}
        pie={cargando || error ? undefined : <Boton titulo="Guardar cambios" cargando={guardando} deshabilitado={items.length === 0} onPress={guardar} />}
      >
        {cargando ? (
          <EsqueletoLista filas={3} mapa />
        ) : error ? (
          <Tarjeta><EstadoError texto={mensajeError(error)} onReintentar={cargar} /></Tarjeta>
        ) : (
          <>
            <Tarjeta estilo={{ gap: esp.md }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Boton titulo="Niño" icono={Plus} variante="secundario" estilo={{ flex: 1 }} onPress={() => setHoja('nino')} />
                <Boton titulo="Escuela" icono={Plus} variante="secundario" estilo={{ flex: 1 }} onPress={() => setHoja('escuela')} />
                <Boton
                  titulo="Optimizar"
                  icono={ArrowDownUp}
                  variante="fantasma"
                  estilo={{ flex: 1.1, paddingHorizontal: 8 }}
                  deshabilitado={items.length < 3}
                  cargando={optimizando}
                  onPress={optimizar}
                />
              </View>
              {items.some((i) => i.latitude != null) ? (
                <MapaRecorrido paradas={paradasMapa} linea={linea} color={ruta?.color} alto={180} interactivo={false} />
              ) : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 20 }}>
                {calculando ? <ActivityIndicator size="small" color={c.primary} /> : null}
                <Texto v="nota" color="text2" style={{ flex: 1 }}>
                  {calculando ? 'Calculando horario…' : `${items.length} de 50 paradas, horario a 25 km/h por calles + 1 min por parada`}
                </Texto>
              </View>
            </Tarjeta>

            {avisos.slice(0, 4).map((a, i) => (
              <BannerAlerta
                key={i}
                tipo="aviso"
                icono={a.studentId ? MapPinOff : undefined}
                titulo={a.titulo}
                texto={a.texto}
                accion={a.studentId ? 'Ficha' : undefined}
                onAccion={a.studentId ? () => nav.navigate('FichaEstudiante', { studentId: a.studentId! }) : undefined}
              />
            ))}
            {avisos.length > 4 ? <Texto v="nota" color="warningInk">Y {avisos.length - 4} avisos más.</Texto> : null}

            {items.length === 0 ? (
              <Tarjeta>
                <EstadoVacio
                  icono={Home}
                  titulo="Esta ruta no tiene paradas"
                  texto={ida ? 'Agrega primero a los niños y luego la escuela donde bajan.' : 'Agrega la escuela donde suben y luego la casa de cada niño.'}
                  accion={ida ? 'Agregar niño' : 'Agregar escuela'}
                  onAccion={() => setHoja(ida ? 'nino' : 'escuela')}
                  compacto
                />
              </Tarjeta>
            ) : (
              <Tarjeta estilo={{ paddingVertical: esp.sm, paddingRight: esp.sm }}>
                {items.map((it, i) => {
                  const junto = mismoSitio(items[i - 1], it);
                  const casa = esCasa(it.kind);
                  const tipo = it.kind === 'pickup_home' || it.kind === 'pickup_school' ? 'Recogida' : 'Entrega';
                  return (
                    <View key={it.clave} style={{ flexDirection: 'row', gap: 10, minHeight: junto ? 56 : 76 }}>
                      {/* riel de la línea de tiempo */}
                      <View style={{ width: 34, alignItems: 'center' }}>
                        <View style={{ width: 2, height: junto ? 14 : 12, backgroundColor: i === 0 ? 'transparent' : c.border }} />
                        <View
                          style={{
                            width: casa ? 28 : 34, height: casa ? 28 : 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
                            backgroundColor: casa ? c.primarySoft : it.escuelaColor ?? c.primary,
                          }}
                        >
                          {casa ? (
                            <Texto style={{ fontFamily: fuentes.titulo, fontSize: 13 }} color="primary">{i + 1}</Texto>
                          ) : (
                            <School size={17} color="#FFFFFF" strokeWidth={2.2} />
                          )}
                        </View>
                        <View style={{ width: 2, flex: 1, backgroundColor: i === items.length - 1 ? 'transparent' : c.border }} />
                      </View>

                      <View style={{ flex: 1, paddingVertical: 10, gap: 3, borderTopWidth: i === 0 || junto ? 0 : 1, borderTopColor: c.border }}>
                        {junto ? null : (
                          <>
                            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                              <Texto v="cifra" style={{ fontSize: 17, lineHeight: 22 }} color={horas[i] ? 'text' : 'text3'}>{horas[i] ?? '--:--'}</Texto>
                              <Texto v="fuerte" style={{ flex: 1 }} numberOfLines={1}>{it.etiqueta}</Texto>
                            </View>
                            <Texto v="nota" color="text2" numberOfLines={1}>
                              {tipo}{it.calle ? `, ${it.calle}` : ''}{!casa && it.horaEscuela ? `, ${ida ? 'entra' : 'sale'} ${it.horaEscuela}` : ''}
                            </Texto>
                          </>
                        )}
                        {casa ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: junto ? 0 : 2 }}>
                            <Avatar nombre={it.nombre} color={it.escuelaColor} tam={26} />
                            <Texto v="medioFuerte" numberOfLines={1} style={{ flexShrink: 1 }}>{it.nombre}</Texto>
                            <ChipEscuela nombre={it.escuelaCorta} color={it.escuelaColor} />
                          </View>
                        ) : null}
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View>
                          <BotonFila icono={ChevronUp} alto={38} etiqueta={`Subir ${it.nombre}`} deshabilitado={i === 0} onPress={() => mover(i, -1)} />
                          <BotonFila icono={ChevronDown} alto={38} etiqueta={`Bajar ${it.nombre}`} deshabilitado={i === items.length - 1} onPress={() => mover(i, 1)} />
                        </View>
                        <BotonFila icono={X} etiqueta={`Quitar ${it.nombre}`} peligro onPress={() => cambiar(items.filter((x) => x.clave !== it.clave))} />
                      </View>
                    </View>
                  );
                })}
              </Tarjeta>
            )}

            <Texto v="nota" color="text2">
              Usa las flechas para reordenar. Mínimo 1, máximo 50 paradas. {ida ? 'Cada niño sube antes de llegar a su escuela.' : 'Cada niño baja después de pasar por su escuela.'}
            </Texto>
          </>
        )}
      </Pantalla>

      <HojaInferior
        visible={hoja === 'nino'}
        onCerrar={() => setHoja(null)}
        titulo="Agregar niño"
        texto={ida ? 'Se agrega la casa donde lo recoges.' : 'Se agrega la casa donde lo dejas.'}
      >
        {ninosLibres.length === 0 ? (
          <EstadoVacio
            icono={Home}
            titulo={estudiantes.length === 0 ? 'Aún no tienes estudiantes' : 'Todos tus estudiantes ya están en esta ruta'}
            accion={estudiantes.length === 0 ? 'Registrar estudiante' : undefined}
            onAccion={() => { setHoja(null); nav.navigate('EditarEstudiante'); }}
            compacto
          />
        ) : (
          ninosLibres.map((e) => (
            <FilaElegir
              key={e.id}
              titulo={`${e.first_name} ${e.last_name}`.trim()}
              texto={e.grade ?? undefined}
              color={e.school?.color}
              escuela={e.school?.short_name}
              onPress={() => agregarNino(e)}
            />
          ))
        )}
      </HojaInferior>

      <HojaInferior
        visible={hoja === 'escuela'}
        onCerrar={() => setHoja(null)}
        titulo="Agregar escuela"
        texto={ida ? 'Parada de entrega: aquí bajan sus niños.' : 'Parada de recogida: aquí suben sus niños.'}
      >
        {escuelasLibres.length === 0 ? (
          <EstadoVacio
            icono={School}
            titulo={escuelas.length === 0 ? 'Aún no tienes escuelas' : 'Todas tus escuelas ya están en esta ruta'}
            accion={escuelas.length === 0 ? 'Registrar escuela' : undefined}
            onAccion={() => { setHoja(null); nav.navigate('EditarEscuela'); }}
            compacto
          />
        ) : (
          escuelasLibres.map((e) => (
            <FilaElegir
              key={e.id}
              titulo={e.name}
              texto={`${ida ? 'Entrada' : 'Salida'} ${hhmm(ida ? e.entry_time : e.exit_time)}`}
              color={e.color}
              esEscuela
              onPress={() => { agregarEscuela(e); setHoja(null); }}
            />
          ))
        )}
      </HojaInferior>

      <ModalConfirmar
        visible={salir}
        titulo="¿Salir sin guardar?"
        mensaje="Perderás los cambios en el orden de las paradas."
        confirmar="Salir"
        cancelar="Seguir editando"
        peligro
        onConfirmar={() => { setSalir(false); nav.goBack(); }}
        onCancelar={() => setSalir(false)}
      />
    </>
  );
}

function BotonFila({
  icono: Icono, etiqueta, onPress, deshabilitado, peligro, alto = 48,
}: { icono: typeof ChevronUp; etiqueta: string; onPress: () => void; deshabilitado?: boolean; peligro?: boolean; alto?: number }) {
  const { c } = useTema();
  return (
    <Pressable
      onPress={deshabilitado ? undefined : onPress}
      disabled={deshabilitado}
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      accessibilityState={{ disabled: !!deshabilitado }}
      android_ripple={{ color: 'rgba(128,128,128,0.2)', borderless: true, radius: 22 }}
      style={{ width: 44, height: alto, alignItems: 'center', justifyContent: 'center', opacity: deshabilitado ? 0.25 : 1 }}
    >
      <Icono size={20} color={peligro ? c.dangerInk : c.text2} strokeWidth={2} />
    </Pressable>
  );
}

function FilaElegir({
  titulo, texto, color, escuela, esEscuela, onPress,
}: { titulo: string; texto?: string; color?: string | null; escuela?: string | null; esEscuela?: boolean; onPress: () => void }) {
  const { c } = useTema();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Agregar ${titulo}`}
      android_ripple={{ color: 'rgba(128,128,128,0.15)' }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border }}
    >
      {esEscuela ? (
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: color ?? c.primary, alignItems: 'center', justifyContent: 'center' }}>
          <School size={19} color="#FFFFFF" strokeWidth={2.2} />
        </View>
      ) : (
        <Avatar nombre={titulo} color={color} tam={40} />
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Texto v="fuerte">{titulo}</Texto>
        {texto ? <Texto v="nota" color="text2">{texto}</Texto> : null}
      </View>
      {escuela ? <ChipEscuela nombre={escuela} color={color} /> : null}
      <Plus size={20} color={c.primary} strokeWidth={2.2} />
    </Pressable>
  );
}
