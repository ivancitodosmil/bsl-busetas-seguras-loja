// 76 Registrar o editar estudiante. La casa la marca el representante en su app; aquí el chofer solo la ve.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Camera, Image as IconoImagen, Plus } from 'lucide-react-native';
import {
  Avatar, Boton, CampoTexto, Chip, ConTeclado, EsqueletoLista, EstadoError, HojaInferior, Pantalla, Tarjeta,
  TarjetaDireccion, Texto, TituloSeccion, useToast,
} from '../../ui';
import { useTema } from '../../tema';
import { chofer } from '../../servicios/chofer';
import { elegirImagen, subirFotoEstudiante } from '../../servicios/fotos';
import { elegirUbicacion, type DireccionBorrador } from '../../estado/seleccion';
import { useSesion } from '../../estado/sesion';
import type { NavChofer, PilaChofer } from '../../navegacion/tipos';
import type { Escuela } from '../../tipos';
import { celularE164, hoyISO, mensajeError } from '../../utils';
import { calleDe, ChipsParentesco, detalleDe, useFotoEstudiante } from './_c2';

type DirForm = DireccionBorrador & { id?: string };

function mascaraFecha(t: string) {
  const d = t.replace(/\D/g, '').slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join('/');
}
/** "14/03/2019" → "2019-03-14"; null si no es una fecha real o es futura. */
function fechaISO(t: string): string | null {
  const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(iso + 'T00:00:00Z');
  if (isNaN(d.getTime()) || d.getUTCDate() !== Number(m[1]) || d.getUTCMonth() + 1 !== Number(m[2])) return null;
  if (iso > hoyISO() || Number(m[3]) < 1990) return null;
  return iso;
}
const deISO = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

export default function EditarEstudiante() {
  const nav = useNavigation<NavChofer>();
  const studentId = useRoute<RouteProp<PilaChofer, 'EditarEstudiante'>>().params?.studentId;
  const { c } = useTema();
  const toast = useToast();
  const driverId = useSesion((s) => s.idSesion);
  const editar = !!studentId;

  const [cargando, setCargando] = useState(editar);
  const [errorCarga, setErrorCarga] = useState<unknown>(null);
  const [escuelas, setEscuelas] = useState<Escuela[]>([]);
  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [apodo, setApodo] = useState('');
  const [nacimiento, setNacimiento] = useState('');
  const [escuelaId, setEscuelaId] = useState<string | null>(null);
  const [curso, setCurso] = useState('');
  const [cuota, setCuota] = useState('35');
  const [notas, setNotas] = useState('');
  const [origen, setOrigen] = useState<DirForm | null>(null);
  const [destino, setDestino] = useState<DirForm | null>(null); // null = igual que el origen
  const [fotoRuta, setFotoRuta] = useState<string | null>(null);
  const [fotoNueva, setFotoNueva] = useState<string | null>(null);
  const [repNombre, setRepNombre] = useState('');
  const [repCelular, setRepCelular] = useState('');
  const [parentesco, setParentesco] = useState('Mamá');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [hojaFoto, setHojaFoto] = useState(false);
  const [hojaDestino, setHojaDestino] = useState(false);
  const fotoActual = useFotoEstudiante(fotoRuta);
  const escuelasAntes = useRef<number | null>(null);
  const idsPrevios = useRef<string[]>([]);

  const cargar = useCallback(async () => {
    if (!studentId) return;
    setCargando(true);
    setErrorCarga(null);
    try {
      const f = await chofer.fichaEstudiante(studentId);
      const e = f.estudiante;
      setNombres(e.first_name);
      setApellidos(e.last_name);
      setApodo(e.nickname ?? '');
      setNacimiento(deISO(e.birth_date));
      setEscuelaId(e.school_id);
      setCurso(e.grade ?? '');
      setCuota(String(Number(e.monthly_fee)));
      setNotas(e.notes ?? '');
      setFotoRuta(e.photo_path);
      const o = f.direcciones.find((d) => d.id === e.default_pickup_address_id) ?? null;
      const d = f.direcciones.find((x) => x.id === e.default_dropoff_address_id) ?? null;
      setOrigen(o);
      setDestino(d && o && d.id !== o.id ? d : null);
    } catch (err) {
      setErrorCarga(err);
    } finally {
      setCargando(false);
    }
  }, [studentId]);

  useEffect(() => { cargar(); }, [cargar]);

  // Las escuelas se recargan al volver (p. ej. después de "Nueva escuela"); la recién creada queda elegida.
  useFocusEffect(
    useCallback(() => {
      chofer.escuelas().then((lista) => {
        setEscuelas(lista);
        if (escuelasAntes.current !== null && lista.length > escuelasAntes.current) {
          const nueva = lista.find((s) => !idsPrevios.current.includes(s.id));
          if (nueva) setEscuelaId(nueva.id);
        }
        escuelasAntes.current = lista.length;
        idsPrevios.current = lista.map((s) => s.id);
      }).catch(() => {});
    }, []),
  );

  const elegirOrigen = async () => {
    const d = await elegirUbicacion(nav, { titulo: 'Dirección de recogida', inicial: origen ?? { label: 'Casa', kind: 'both' } });
    if (d) {
      setOrigen({ ...d, id: origen?.id });
      setErrores((x) => ({ ...x, origen: '' }));
    }
  };
  const elegirDestino = async () => {
    setHojaDestino(false);
    const d = await elegirUbicacion(nav, {
      titulo: 'Dirección de entrega',
      inicial: destino ?? { label: 'Casa', kind: 'dropoff' },
      centro: origen ? { latitude: origen.latitude, longitude: origen.longitude } : null,
    });
    if (d) setDestino({ ...d, id: destino?.id });
  };

  const tomarFoto = async (desde: 'galeria' | 'camara') => {
    setHojaFoto(false);
    const uri = await elegirImagen(desde);
    if (uri) setFotoNueva(uri);
  };

  const guardar = async () => {
    const er: Record<string, string> = {};
    if (!nombres.trim()) er.nombres = 'Escribe el nombre del estudiante.';
    if (!apellidos.trim()) er.apellidos = 'Escribe los apellidos.';
    const nac = nacimiento ? fechaISO(nacimiento) : null;
    if (nacimiento && !nac) er.nacimiento = 'Usa el formato día/mes/año, por ejemplo 14/03/2019.';
    if (!escuelaId) er.escuela = 'Elige la escuela del estudiante.';
    const monto = Number(cuota.replace(',', '.'));
    if (!cuota.trim() || isNaN(monto) || monto < 0 || monto > 999) er.cuota = 'Escribe un valor entre 0 y 999.';
    const cel = repCelular.trim() ? celularE164(repCelular) : null;
    if (!editar && repCelular.trim() && !cel) er.repCelular = 'El celular debe tener 10 dígitos y empezar con 09.';
    setErrores(er);
    if (Object.keys(er).length > 0 || !driverId) {
      if (Object.keys(er).length > 0) toast.mostrar('Revisa los campos marcados', { tipo: 'error' });
      return;
    }
    setGuardando(true);
    try {
      const est = await chofer.guardarEstudiante({
        id: studentId, driver_id: driverId, first_name: nombres.trim(), last_name: apellidos.trim(),
        nickname: apodo.trim() || null, birth_date: nac, school_id: escuelaId, grade: curso.trim() || null,
        notes: notas.trim() || null, monthly_fee: monto,
      });
      let ruta = fotoRuta;
      if (fotoNueva) {
        try {
          ruta = await subirFotoEstudiante(est.id, fotoNueva);
        } catch {
          toast.mostrar('El estudiante se guardó, pero la foto no se pudo subir', { tipo: 'error' });
        }
      }
      if (ruta !== fotoRuta) await chofer.guardarEstudiante({ id: est.id, driver_id: driverId, photo_path: ruta });
      if (editar) {
        toast.mostrar('Cambios guardados', { tipo: 'exito' });
        nav.goBack();
      } else {
        await chofer.crearInvitacion(est.id, { nombre: repNombre.trim() || undefined, celular: cel, parentesco, principal: true });
        nav.replace('Invitar', { studentId: est.id });
      }
    } catch (err) {
      toast.mostrar(mensajeError(err, 'No se pudo guardar. Inténtalo de nuevo.'), { tipo: 'error' });
    } finally {
      setGuardando(false);
    }
  };

  const titulo = editar ? 'Editar estudiante' : 'Registrar estudiante';
  if (cargando || errorCarga) {
    return (
      <Pantalla titulo={titulo} onAtras={nav.goBack}>
        {cargando ? <EsqueletoLista filas={3} /> : <Tarjeta><EstadoError texto={mensajeError(errorCarga)} onReintentar={cargar} /></Tarjeta>}
      </Pantalla>
    );
  }

  const etiquetaDe = (d: DirForm) => (d.label.toLowerCase() === 'casa' && apellidos.trim() ? `Casa ${apellidos.trim().split(' ')[0]}` : d.label);

  return (
    <ConTeclado>
      <Pantalla
        titulo={titulo}
        onAtras={nav.goBack}
        pie={<Boton titulo={editar ? 'Guardar cambios' : 'Guardar y crear invitación'} onPress={guardar} cargando={guardando} />}
      >
        <Tarjeta elevacion={2} estilo={{ gap: 14 }}>
          <Pressable
            onPress={() => setHojaFoto(true)}
            accessibilityRole="button"
            accessibilityLabel="Foto del estudiante, opcional"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64 }}
          >
            <View>
              <Avatar nombre={`${nombres} ${apellidos}`.trim() || '?'} foto={fotoNueva ?? fotoActual} color={escuelas.find((s) => s.id === escuelaId)?.color} tam={64} />
              <View style={{ position: 'absolute', right: -4, bottom: -4, width: 28, height: 28, borderRadius: 14, backgroundColor: c.primary, borderWidth: 2, borderColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
                <Camera size={14} color={c.onPrimary} strokeWidth={2.2} />
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Texto v="fuerte">Foto del estudiante</Texto>
              <Texto v="nota" color="text2">Opcional. Ayuda al sustituto a reconocerlo.</Texto>
            </View>
          </Pressable>
          <CampoTexto etiqueta="Nombres" value={nombres} onChangeText={setNombres} error={errores.nombres} autoCapitalize="words" placeholder="Emilia" />
          <CampoTexto etiqueta="Apellidos" value={apellidos} onChangeText={setApellidos} error={errores.apellidos} autoCapitalize="words" placeholder="Jaramillo" />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <CampoTexto etiqueta="Apodo" value={apodo} onChangeText={setApodo} placeholder="Emi" ayuda="Opcional" maxLength={20} />
            </View>
            <View style={{ flex: 1.2 }}>
              <CampoTexto etiqueta="Nacimiento" value={nacimiento} onChangeText={(t) => setNacimiento(mascaraFecha(t))} keyboardType="number-pad" placeholder="DD/MM/AAAA" error={errores.nacimiento} maxLength={10} />
            </View>
          </View>
        </Tarjeta>

        <Tarjeta estilo={{ gap: 14 }}>
          <View style={{ gap: 8 }}>
            <Texto v="medioFuerte" color="text2">Escuela</Texto>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {escuelas.map((s) => (
                <Chip key={s.id} texto={s.short_name} color={s.color} seleccionado={escuelaId === s.id} onPress={() => { setEscuelaId(s.id); setErrores((x) => ({ ...x, escuela: '' })); }} />
              ))}
              <Chip texto="Nueva escuela" icono={Plus} onPress={() => nav.navigate('EditarEscuela')} />
            </View>
            {errores.escuela ? <Texto v="nota" color="dangerInk">{errores.escuela}</Texto> : null}
          </View>
          <CampoTexto etiqueta="Curso" value={curso} onChangeText={setCurso} placeholder="3.º de básica" />
          <CampoTexto etiqueta="Mensualidad" prefijo="$" value={cuota} onChangeText={setCuota} keyboardType="decimal-pad" error={errores.cuota} ayuda="Solo para tu registro de pagos." maxLength={6} />
        </Tarjeta>

        <View style={{ gap: 10 }}>
          <TituloSeccion titulo="Casa del estudiante" />
          {origen ? (
            <>
              <TarjetaDireccion tipo="origen" titulo={destino ? 'Recoger en' : 'Recoger y dejar en'} etiqueta={etiquetaDe(origen)} calle={calleDe(origen)} detalle={detalleDe(origen)} />
              {destino ? <TarjetaDireccion tipo="destino" titulo="Dejar en" etiqueta={etiquetaDe(destino)} calle={calleDe(destino)} detalle={detalleDe(destino)} /> : null}
              <Texto v="nota" color="text2">La marcó el representante. Si está mal, pídele que la corrija desde su app.</Texto>
            </>
          ) : (
            <Tarjeta plano estilo={{ gap: 6 }}>
              <Texto v="fuerte">La marca el representante</Texto>
              <Texto v="medio" color="text2">
                Cuando se vincule con el código de invitación, marcará su casa en el mapa. Te avisaremos y la parada aparecerá en tu ruta.
              </Texto>
            </Tarjeta>
          )}
        </View>

        <Tarjeta>
          <CampoTexto etiqueta="Notas" value={notas} onChangeText={setNotas} multiline placeholder="Alérgica al maní. La recibe su abuela." ayuda="Alergias, quién lo recibe e indicaciones." maxLength={300} />
        </Tarjeta>

        {!editar ? (
          <View style={{ gap: 10 }}>
            <TituloSeccion titulo="Representante principal" />
            <Tarjeta estilo={{ gap: 14 }}>
              <CampoTexto etiqueta="Nombre" value={repNombre} onChangeText={setRepNombre} autoCapitalize="words" placeholder="María Jaramillo" ayuda="Opcional. Te ayuda a saber a quién enviaste el código." />
              <CampoTexto etiqueta="Celular" prefijo="+593" value={repCelular} onChangeText={setRepCelular} keyboardType="phone-pad" placeholder="99 123 4567" error={errores.repCelular} ayuda="Opcional. Sirve para enviarle la invitación por WhatsApp." maxLength={13} />
              <ChipsParentesco valor={parentesco} onChange={setParentesco} />
            </Tarjeta>
          </View>
        ) : null}
      </Pantalla>

      <HojaInferior visible={hojaFoto} onCerrar={() => setHojaFoto(false)} titulo="Foto del estudiante">
        <Boton titulo="Tomar foto" icono={Camera} variante="secundario" onPress={() => tomarFoto('camara')} />
        <Boton titulo="Elegir de la galería" icono={IconoImagen} variante="secundario" onPress={() => tomarFoto('galeria')} />
      </HojaInferior>

      <HojaInferior visible={hojaDestino} onCerrar={() => setHojaDestino(false)} titulo="Dirección de entrega">
        <Boton titulo="Cambiar la dirección" variante="secundario" onPress={elegirDestino} />
        <Boton titulo="Usar la misma del origen" variante="secundario" onPress={() => { setDestino(null); setHojaDestino(false); }} />
      </HojaInferior>
    </ConTeclado>
  );
}
