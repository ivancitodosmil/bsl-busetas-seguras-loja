// 77 · Selector de ubicación: buscar, ajustar el pin y describir la dirección.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import MapView, { type Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { LocateFixed, MapPin, Search } from 'lucide-react-native';
import { Boton, CampoTexto, Chip, ConTeclado, Pantalla, Segmentado, Texto, TituloSeccion, useToast } from '../../ui';
import { esp, radio, sombra, useTema } from '../../tema';
import { terminarSeleccion, useSeleccion, type DireccionBorrador } from '../../estado/seleccion';
import { LOJA } from '../../utils';
import type { Coordenada } from '../../tipos';

interface Sugerencia { id: string; titulo: string; detalle: string; latitude: number; longitude: number; calle: string | null; barrio: string | null }
type Uso = 'pickup' | 'dropoff' | 'both';
type Etiqueta = 'Casa' | 'Abuelos' | 'Otra';

const DELTA = 0.004;
const ALTO_MAPA = 260;

// Zona de búsqueda: Loja y alrededores (oeste, sur, este, norte).
const ZONA = { oeste: -79.3, sur: -4.1, este: -79.12, norte: -3.9 };

// Photon encuentra lugares por nombre parcial ("Unidad Educativa La…"), que Nominatim no encuentra.
async function buscarPhoton(texto: string, senal: AbortSignal): Promise<Sugerencia[]> {
  const url =
    'https://photon.komoot.io/api/?limit=6&lat=-3.99&lon=-79.2' +
    `&bbox=${ZONA.oeste},${ZONA.sur},${ZONA.este},${ZONA.norte}&q=` + encodeURIComponent(texto);
  const r = await fetch(url, { signal: senal });
  if (!r.ok) throw new Error(`Photon ${r.status}`);
  const datos = (await r.json()) as { features?: any[] };
  return (datos.features ?? []).map((f) => {
    const p = f.properties ?? {};
    const titulo = p.name || [p.street, p.housenumber].filter(Boolean).join(' ') || texto;
    const detalle = [p.name ? p.street : null, p.district ?? p.locality, p.city].filter(Boolean).join(', ');
    return {
      id: `photon-${p.osm_type}-${p.osm_id}`,
      titulo,
      detalle,
      latitude: Number(f.geometry?.coordinates?.[1]),
      longitude: Number(f.geometry?.coordinates?.[0]),
      calle: p.street ?? (p.osm_key === 'highway' ? p.name : null) ?? null,
      barrio: p.district ?? p.locality ?? null,
    };
  });
}

async function buscarNominatim(texto: string, senal: AbortSignal): Promise<Sugerencia[]> {
  const url =
    'https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&countrycodes=ec' +
    `&viewbox=${ZONA.oeste},${ZONA.norte},${ZONA.este},${ZONA.sur}&bounded=1&q=` + encodeURIComponent(`${texto} Loja`);
  const r = await fetch(url, { signal: senal, headers: { 'User-Agent': 'BSL-Busetas-Seguras-Loja/1.0', 'Accept-Language': 'es' } });
  if (!r.ok) throw new Error(`Nominatim ${r.status}`);
  const datos = (await r.json()) as any[];
  if (!Array.isArray(datos)) return [];
  return datos.map((d) => {
    const partes = String(d.display_name ?? '').split(',').map((p: string) => p.trim());
    return {
      id: `nominatim-${d.place_id}`,
      titulo: partes[0] || texto,
      detalle: partes.slice(1, 3).join(', '),
      latitude: Number(d.lat),
      longitude: Number(d.lon),
      calle: d.address?.road ?? null,
      barrio: d.address?.neighbourhood ?? d.address?.suburb ?? null,
    };
  });
}

// Calle y barrio del punto del mapa: Nominatim y, si no responde, Photon.
async function direccionDe(p: Coordenada): Promise<{ calle: string | null; barrio: string | null } | null> {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), 8000);
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&addressdetails=1&lat=${p.latitude}&lon=${p.longitude}`,
      { signal: control.signal, headers: { 'User-Agent': 'BSL-Busetas-Seguras-Loja/1.0', 'Accept-Language': 'es' } },
    );
    const d = (await r.json()) as any;
    const a = d?.address ?? {};
    const calle = a.road ?? a.pedestrian ?? a.residential ?? null;
    if (calle) return { calle, barrio: a.neighbourhood ?? a.suburb ?? a.quarter ?? null };
  } catch { /* se intenta con Photon */ }
  try {
    const r = await fetch(`https://photon.komoot.io/reverse?lat=${p.latitude}&lon=${p.longitude}`, { signal: control.signal });
    const d = (await r.json()) as { features?: any[] };
    const pr = d.features?.[0]?.properties ?? {};
    return { calle: pr.street ?? (pr.osm_key === 'highway' ? pr.name : null) ?? null, barrio: pr.district ?? pr.locality ?? null };
  } catch {
    return null;
  } finally {
    clearTimeout(reloj);
  }
}

// Busca en los dos servicios a la vez y junta los resultados sin repetir lugares cercanos.
async function buscar(texto: string, control: AbortController): Promise<Sugerencia[]> {
  const [photon, nominatim] = await Promise.allSettled([buscarPhoton(texto, control.signal), buscarNominatim(texto, control.signal)]);
  if (photon.status === 'rejected' && nominatim.status === 'rejected') throw photon.reason;
  const todas = [...(photon.status === 'fulfilled' ? photon.value : []), ...(nominatim.status === 'fulfilled' ? nominatim.value : [])];
  const vistas = new Set<string>();
  return todas.filter((s) => {
    if (!Number.isFinite(s.latitude) || !Number.isFinite(s.longitude)) return false;
    const clave = `${s.titulo.toLowerCase()}|${s.latitude.toFixed(3)}|${s.longitude.toFixed(3)}`;
    if (vistas.has(clave)) return false;
    vistas.add(clave);
    return true;
  }).slice(0, 6);
}

export default function SelectorUbicacion() {
  const { c, oscuro } = useTema();
  const nav = useNavigation();
  const toast = useToast();
  // Las opciones se leen una vez: terminarSeleccion() las borra al guardar.
  const opciones = useRef(useSeleccion.getState().opciones).current;
  const ini = opciones?.inicial ?? null;
  const escuela = opciones?.modo === 'escuela';
  const guardado = useRef(false);
  const mapa = useRef<MapView>(null);

  const centroInicial: Coordenada = useMemo(
    () => (ini?.latitude != null && ini?.longitude != null ? { latitude: ini.latitude, longitude: ini.longitude } : opciones?.centro ?? LOJA),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [coord, setCoord] = useState<Coordenada>(centroInicial);
  const [precision, setPrecision] = useState<number | null>(ini?.gps_accuracy_m ?? null);
  const [ubicando, setUbicando] = useState(false);

  const [consulta, setConsulta] = useState('');
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [sinResultados, setSinResultados] = useState(false);
  const [sinConexion, setSinConexion] = useState(false);

  const [calle, setCalle] = useState(ini?.main_street ?? '');
  const [cruce, setCruce] = useState(ini?.cross_street ?? '');
  const [numero, setNumero] = useState(ini?.house_number ?? '');
  const [barrio, setBarrio] = useState(ini?.neighborhood ?? '');
  const [referencia, setReferencia] = useState(ini?.reference ?? '');
  const [recibe, setRecibe] = useState(ini?.receiver_note ?? '');
  const etiquetaInicial: Etiqueta = !ini?.label || ini.label === 'Casa' ? 'Casa' : /abuel/i.test(ini.label) ? 'Abuelos' : 'Otra';
  const [etiqueta, setEtiqueta] = useState<Etiqueta>(etiquetaInicial);
  const [etiquetaLibre, setEtiquetaLibre] = useState(etiquetaInicial === 'Otra' ? ini?.label ?? '' : '');
  const [uso, setUso] = useState<Uso>(ini?.kind === 'pickup' || ini?.kind === 'dropoff' ? ini.kind : 'both');
  const [errores, setErrores] = useState<{ calle?: string; etiqueta?: string }>({});
  const [fijando, setFijando] = useState(false);

  // Si se sale sin guardar, quien abrió el selector recibe null.
  useEffect(() => {
    if (!opciones) {
      nav.goBack();
      return;
    }
    return nav.addListener('beforeRemove', () => {
      if (!guardado.current) terminarSeleccion(null);
    });
  }, [nav, opciones]);

  // Búsqueda con espera de 600 ms.
  useEffect(() => {
    const q = consulta.trim();
    setSinResultados(false);
    if (q.length < 4) {
      setSugerencias([]);
      setBuscando(false);
      return;
    }
    const control = new AbortController();
    setBuscando(true);
    setSinConexion(false);
    const reloj = setTimeout(() => {
      buscar(q, control)
        .then((r) => {
          setSugerencias(r);
          setSinResultados(r.length === 0);
        })
        .catch(() => { if (!control.signal.aborted) { setSugerencias([]); setSinConexion(true); } })
        .finally(() => { if (!control.signal.aborted) setBuscando(false); });
    }, 600);
    return () => {
      clearTimeout(reloj);
      control.abort();
    };
  }, [consulta]);

  const mover = (p: Coordenada) => {
    setCoord(p);
    mapa.current?.animateToRegion({ ...p, latitudeDelta: DELTA, longitudeDelta: DELTA }, 500);
  };

  const elegir = (s: Sugerencia) => {
    mover({ latitude: s.latitude, longitude: s.longitude });
    setPrecision(null);
    // En una escuela sin calle conocida, el nombre del lugar sirve como calle de referencia.
    const calleSugerida = s.calle ?? (escuela ? s.titulo : null);
    if (!calle.trim() && calleSugerida) setCalle(calleSugerida);
    if (!barrio.trim() && s.barrio) setBarrio(s.barrio);
    setConsulta('');
    setSugerencias([]);
  };

  const miUbicacion = async () => {
    setUbicando(true);
    try {
      const permiso = await Location.requestForegroundPermissionsAsync();
      if (!permiso.granted) {
        toast.mostrar('Activa el permiso de ubicación en Ajustes para usar tu posición.', { tipo: 'error' });
        return;
      }
      const l = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      mover({ latitude: l.coords.latitude, longitude: l.coords.longitude });
      setPrecision(l.coords.accuracy != null ? Math.round(l.coords.accuracy) : null);
    } catch {
      toast.mostrar('No pudimos obtener tu ubicación. Toca el portón en el mapa.', { tipo: 'error' });
    } finally {
      setUbicando(false);
    }
  };

  const alMoverMapa = (r: Region, detalle?: { isGesture?: boolean }) => {
    setCoord({ latitude: r.latitude, longitude: r.longitude });
    if (detalle?.isGesture) setPrecision(null); // el pin ya no es la lectura del GPS
  };

  const guardar = (extra?: { calle?: string; barrio?: string | null }) => {
    const calleFinal = (extra?.calle ?? calle).trim();
    const barrioFinal = extra?.barrio ?? barrio;
    const e: typeof errores = {};
    if (calleFinal.length < 3) e.calle = 'Escribe la calle principal.';
    if (!escuela && etiqueta === 'Otra' && etiquetaLibre.trim().length < 2) e.etiqueta = 'Ponle un nombre, por ejemplo "Casa de la tía".';
    setErrores(e);
    if (Object.keys(e).length) return;
    const limpio = (t: string) => (t.trim() ? t.trim() : null);
    const borrador: DireccionBorrador = {
      label: escuela ? ini?.label ?? 'Escuela' : etiqueta === 'Casa' ? 'Casa' : etiqueta === 'Abuelos' ? 'Casa de los abuelos' : etiquetaLibre.trim(),
      kind: escuela ? 'school' : uso,
      main_street: calleFinal,
      cross_street: limpio(cruce),
      house_number: escuela ? null : limpio(numero),
      neighborhood: escuela ? ini?.neighborhood ?? null : limpio(barrioFinal ?? ''),
      reference: limpio(referencia),
      receiver_note: escuela ? null : limpio(recibe),
      latitude: coord.latitude,
      longitude: coord.longitude,
      gps_accuracy_m: precision,
    };
    guardado.current = true;
    terminarSeleccion(borrador);
    nav.goBack();
  };

  // Tocar el pin amarillo fija la ubicación y guarda. Si falta la calle, se toma del mapa.
  const fijarAqui = async () => {
    if (fijando) return;
    let c = calle.trim();
    let b: string | null = barrio.trim() || null;
    if (c.length < 3) {
      setFijando(true);
      const d = await direccionDe(coord);
      setFijando(false);
      if (d?.calle) {
        c = d.calle;
        setCalle(d.calle);
      }
      if (!b && d?.barrio) {
        b = d.barrio;
        setBarrio(d.barrio);
      }
    }
    if (c.length < 3) {
      setErrores({ ...errores, calle: 'No encontramos el nombre de la calle. Escríbelo y vuelve a tocar el pin.' });
      toast.mostrar('Escribe la calle principal y vuelve a tocar el pin.', { tipo: 'error' });
      return;
    }
    guardar({ calle: c, barrio: b });
  };

  if (!opciones) return null;

  return (
    <ConTeclado>
      <Pantalla titulo={opciones.titulo} onAtras={() => nav.goBack()} pie={<Boton titulo={escuela ? 'Guardar ubicación' : 'Guardar dirección'} onPress={() => guardar()} />}>
        {/* Búsqueda */}
        <View style={{ backgroundColor: c.surface, borderRadius: radio.grande, padding: esp.lg, gap: esp.sm, ...sombra(c, 2) }}>
          <CampoTexto
            etiqueta="Buscar dirección"
            value={consulta}
            onChangeText={setConsulta}
            placeholder="Calle, barrio o lugar"
            ayuda="Sugerencias mientras escribes. Luego toca el portón en el mapa."
            autoCorrect={false}
            returnKeyType="search"
            derecha={buscando ? <ActivityIndicator color={c.primary} /> : <Search size={20} color={c.text3} strokeWidth={2} />}
          />
          {sugerencias.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => elegir(s)}
              accessibilityRole="button"
              accessibilityLabel={`${s.titulo}, ${s.detalle}`}
              android_ripple={{ color: 'rgba(128,128,128,0.15)' }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, borderTopWidth: 1, borderTopColor: c.border, paddingVertical: 6 }}
            >
              <MapPin size={18} color={c.primary} strokeWidth={2} />
              <View style={{ flex: 1 }}>
                <Texto v="medioFuerte" numberOfLines={1}>{s.titulo}</Texto>
                {s.detalle ? <Texto v="nota" color="text2" numberOfLines={1}>{s.detalle}</Texto> : null}
              </View>
            </Pressable>
          ))}
          {sinResultados && !buscando ? <Texto v="nota" color="text3">No encontramos ese lugar. Prueba con el nombre de la calle o toca el portón en el mapa.</Texto> : null}
          {sinConexion && !buscando ? <Texto v="nota" color="warningInk">No pudimos buscar. Revisa tu conexión o toca el portón en el mapa.</Texto> : null}
        </View>

        {/* Mapa con pin fijo al centro */}
        <View style={{ height: ALTO_MAPA, borderRadius: radio.grande, overflow: 'hidden', backgroundColor: c.surface2 }}>
          <MapView
            ref={mapa}
            style={{ flex: 1 }}
            initialRegion={{ ...centroInicial, latitudeDelta: DELTA, longitudeDelta: DELTA }}
            onRegionChangeComplete={alMoverMapa}
            onPress={(e) => { mover(e.nativeEvent.coordinate); setPrecision(null); }}
            userInterfaceStyle={oscuro ? 'dark' : 'light'}
            showsUserLocation
            showsMyLocationButton={false}
            toolbarEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            accessibilityLabel="Mapa para ubicar el portón. Toca el lugar o mueve el mapa hasta que el pin quede en él."
          />
          <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
            <View pointerEvents="box-none" style={{ marginBottom: 40, alignItems: 'center' }}>
              <Pressable
                onPress={fijarAqui}
                accessibilityRole="button"
                accessibilityLabel={escuela ? 'Fijar la ubicación de la escuela aquí y guardar' : 'Fijar mi casa aquí y guardar'}
                hitSlop={14}
                style={({ pressed }) => ({ alignItems: 'center', transform: [{ scale: pressed ? 0.94 : 1 }] })}
              >
                <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.accent, borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', elevation: 5, shadowColor: '#0F1B2D', shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } }}>
                  {fijando ? <ActivityIndicator color={c.onAccent} /> : <MapPin size={26} color={c.onAccent} strokeWidth={2.4} />}
                </View>
                <View style={{ width: 3, height: 12, backgroundColor: c.accent }} />
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#0F1B2D', opacity: 0.45, marginTop: -2 }} />
              </Pressable>
            </View>
          </View>
          <View pointerEvents="none" style={{ position: 'absolute', left: 10, right: 10, top: 10, alignItems: 'flex-start' }}>
            <View style={{ backgroundColor: '#0F1B2D', borderRadius: radio.pill, paddingHorizontal: 12, minHeight: 30, justifyContent: 'center' }}>
              <Texto v="nota" color="#FFFFFF">Toca tu portón en el mapa y luego el pin amarillo</Texto>
            </View>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: esp.md }}>
          <Boton titulo="Usar mi ubicación" icono={LocateFixed} variante="secundario" tamano="compacto" onPress={miUbicacion} cargando={ubicando} />
          {precision != null ? (
            <Texto v="nota" color={precision <= 20 ? 'successInk' : 'warningInk'} style={{ flex: 1 }}>Precisión del GPS: {precision} m</Texto>
          ) : (
            <Texto v="nota" color="text3" style={{ flex: 1 }}>Pin ajustado a mano</Texto>
          )}
        </View>

        {/* Campos estructurados */}
        <CampoTexto etiqueta="Calle principal" value={calle} onChangeText={(t) => { setCalle(t); if (errores.calle) setErrores({ ...errores, calle: undefined }); }} error={errores.calle} placeholder="Av. Pío Jaramillo" autoCapitalize="words" />
        <CampoTexto etiqueta="Intersección" value={cruce} onChangeText={setCruce} placeholder="Juan de Salinas" autoCapitalize="words" />
        {!escuela ? (
          <View style={{ flexDirection: 'row', gap: esp.md }}>
            <View style={{ flex: 1 }}>
              <CampoTexto etiqueta="Número de casa" value={numero} onChangeText={setNumero} placeholder="14-22" />
            </View>
            <View style={{ flex: 1.3 }}>
              <CampoTexto etiqueta="Barrio" value={barrio} onChangeText={setBarrio} placeholder="La Argelia" autoCapitalize="words" />
            </View>
          </View>
        ) : null}
        <CampoTexto
          etiqueta={escuela ? 'Referencia del portón' : 'Referencia'}
          value={referencia}
          onChangeText={setReferencia}
          placeholder={escuela ? 'Puerta de la calle Mercadillo' : 'Portón negro frente a la panadería'}
          ayuda={escuela ? 'Ayuda al chofer sustituto a encontrar la entrada.' : 'Lo que vería un chofer que nunca vino.'}
        />

        {!escuela ? (
          <>
            <TituloSeccion titulo="Etiqueta" />
            <View style={{ flexDirection: 'row', gap: esp.sm, flexWrap: 'wrap' }}>
              {(['Casa', 'Abuelos', 'Otra'] as Etiqueta[]).map((e) => (
                <Chip key={e} texto={e} seleccionado={etiqueta === e} onPress={() => setEtiqueta(e)} />
              ))}
            </View>
            {etiqueta === 'Otra' ? (
              <CampoTexto etiqueta="Nombre de la dirección" value={etiquetaLibre} onChangeText={(t) => { setEtiquetaLibre(t); if (errores.etiqueta) setErrores({ ...errores, etiqueta: undefined }); }} error={errores.etiqueta} placeholder="Casa de la tía" />
            ) : null}

            <TituloSeccion titulo="Usar como" />
            <Segmentado<Uso>
              opciones={[
                { valor: 'pickup', texto: 'Origen', nota: 'se recoge' },
                { valor: 'dropoff', texto: 'Destino', nota: 'se deja' },
                { valor: 'both', texto: 'Ambos' },
              ]}
              valor={uso}
              onChange={setUso}
            />
            {uso !== 'pickup' ? (
              <CampoTexto etiqueta="Quién lo recibe (opcional)" value={recibe} onChangeText={setRecibe} placeholder="La recibe Rosa Vivanco, abuela" />
            ) : null}
          </>
        ) : null}
      </Pantalla>
    </ConTeclado>
  );
}
