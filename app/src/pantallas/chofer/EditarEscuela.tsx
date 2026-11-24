// 74 · Crear o editar escuela.
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Archive, Check, Clock } from 'lucide-react-native';
import {
  Boton, CampoTexto, ConTeclado, EsqueletoLista, EstadoError, ModalConfirmar, Pantalla, Tarjeta, TarjetaDireccion, Texto, useToast,
} from '../../ui';
import { PALETA, radio, useTema } from '../../tema';
import { chofer } from '../../servicios/chofer';
import { elegirUbicacion, type DireccionBorrador } from '../../estado/seleccion';
import { useSesion } from '../../estado/sesion';
import type { NavChofer, PilaChofer } from '../../navegacion/tipos';
import { hhmm, mensajeError } from '../../utils';
import { calleDe, SelectorHora } from './_c2';

export default function EditarEscuela() {
  const nav = useNavigation<NavChofer>();
  const escuelaId = useRoute<RouteProp<PilaChofer, 'EditarEscuela'>>().params?.escuelaId;
  const { c } = useTema();
  const toast = useToast();
  const driverId = useSesion((s) => s.idSesion);
  const editar = !!escuelaId;

  const [cargando, setCargando] = useState(editar);
  const [errorCarga, setErrorCarga] = useState<unknown>(null);
  const [nombre, setNombre] = useState('');
  const [corto, setCorto] = useState('');
  const [cortoTocado, setCortoTocado] = useState(editar);
  const [color, setColor] = useState<string>(PALETA[0]);
  const [dir, setDir] = useState<DireccionBorrador | null>(null);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [porton, setPorton] = useState('');
  const [entrada, setEntrada] = useState('07:00');
  const [salida, setSalida] = useState('13:00');
  const [hora, setHora] = useState<'entrada' | 'salida' | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [archivar, setArchivar] = useState(false);
  const [archivando, setArchivando] = useState(false);

  const cargar = useCallback(async () => {
    if (!escuelaId) {
      // Color libre para la escuela nueva.
      chofer.escuelas().then((l) => setColor(PALETA.find((p) => !l.some((s) => s.color === p)) ?? PALETA[0])).catch(() => {});
      return;
    }
    setCargando(true);
    setErrorCarga(null);
    try {
      const s = (await chofer.escuelas()).find((x) => x.id === escuelaId);
      if (!s) throw new Error('Esta escuela ya no existe.');
      setNombre(s.name);
      setCorto(s.short_name);
      setColor(s.color);
      setPorton(s.gate_reference ?? '');
      setEntrada(hhmm(s.entry_time));
      setSalida(hhmm(s.exit_time));
      setAddressId(s.address_id);
      setDir(s.address ?? null);
    } catch (err) {
      setErrorCarga(err);
    } finally {
      setCargando(false);
    }
  }, [escuelaId]);

  useEffect(() => { cargar(); }, [cargar]);

  const cambiarNombre = (t: string) => {
    setNombre(t);
    if (!cortoTocado) {
      // "Unidad Educativa San Sebastián" → "San Sebastián"
      const sugerido = t.replace(/^(unidad educativa|u\.?\s?e\.?|colegio|escuela|instituto|liceo)\s+/i, '').trim();
      setCorto(sugerido.slice(0, 16));
    }
  };

  const ubicar = async () => {
    const d = await elegirUbicacion(nav, { titulo: 'Ubicación de la escuela', modo: 'escuela', inicial: dir ?? { label: nombre.trim() || 'Escuela', kind: 'school' } });
    if (d) {
      setDir(d);
      setErrores((x) => ({ ...x, dir: '' }));
      if (!porton.trim() && d.reference) setPorton(d.reference);
    }
  };

  const guardar = async () => {
    const er: Record<string, string> = {};
    if (!nombre.trim()) er.nombre = 'Escribe el nombre de la escuela.';
    if (!corto.trim()) er.corto = 'Escribe un nombre corto.';
    if (!dir) er.dir = 'Marca en el mapa el portón de la escuela.';
    setErrores(er);
    if (Object.keys(er).length > 0 || !dir || !driverId) return;
    setGuardando(true);
    try {
      await chofer.guardarEscuela(
        driverId,
        { id: escuelaId, address_id: addressId, name: nombre.trim(), short_name: corto.trim(), color, entry_time: entrada, exit_time: salida, gate_reference: porton.trim() || null },
        { main_street: dir.main_street, cross_street: dir.cross_street, latitude: dir.latitude, longitude: dir.longitude },
      );
      toast.mostrar(editar ? 'Escuela guardada' : 'Escuela agregada', { tipo: 'exito' });
      nav.goBack();
    } catch (err) {
      toast.mostrar(mensajeError(err, 'No se pudo guardar la escuela.'), { tipo: 'error' });
    } finally {
      setGuardando(false);
    }
  };

  const confirmarArchivo = async () => {
    if (!escuelaId) return;
    setArchivando(true);
    try {
      await chofer.archivarEscuela(escuelaId);
      setArchivar(false);
      toast.mostrar('Escuela archivada', { tipo: 'exito' });
      nav.goBack();
    } catch (err) {
      setArchivar(false);
      toast.mostrar(mensajeError(err), { tipo: 'error' });
    } finally {
      setArchivando(false);
    }
  };

  const titulo = editar ? 'Editar escuela' : 'Nueva escuela';
  if (cargando || errorCarga) {
    return (
      <Pantalla titulo={titulo} onAtras={nav.goBack}>
        {cargando ? <EsqueletoLista filas={2} /> : <Tarjeta><EstadoError texto={mensajeError(errorCarga, 'No pudimos cargar la escuela.')} onReintentar={cargar} /></Tarjeta>}
      </Pantalla>
    );
  }

  const campoHora = (etiqueta: string, valor: string, cual: 'entrada' | 'salida') => (
    <View style={{ flex: 1, gap: 6 }}>
      <Texto v="medioFuerte" color="text2">{etiqueta}</Texto>
      <Pressable
        onPress={() => setHora(cual)}
        accessibilityRole="button"
        accessibilityLabel={`${etiqueta}: ${valor}. Cambiar`}
        style={{ height: 52, borderRadius: radio.campo, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 }}
      >
        <Clock size={18} color={c.text2} strokeWidth={2} />
        <Texto v="fuerte">{valor}</Texto>
      </Pressable>
    </View>
  );

  return (
    <ConTeclado>
      <Pantalla titulo={titulo} onAtras={nav.goBack} pie={<Boton titulo="Guardar escuela" onPress={guardar} cargando={guardando} />}>
        <Tarjeta elevacion={2} estilo={{ gap: 14 }}>
          <CampoTexto etiqueta="Nombre" value={nombre} onChangeText={cambiarNombre} error={errores.nombre} autoCapitalize="words" placeholder="Unidad Educativa San Sebastián" />
          <CampoTexto
            etiqueta="Nombre corto"
            value={corto}
            onChangeText={(t) => { setCorto(t); setCortoTocado(true); }}
            error={errores.corto}
            ayuda="Se usa en chips y notificaciones."
            maxLength={16}
            placeholder="San Sebastián"
          />
          <View style={{ gap: 8 }}>
            <Texto v="medioFuerte" color="text2">Color en mapas y listas</Texto>
            <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
              {PALETA.map((p, i) => (
                <Pressable
                  key={p}
                  onPress={() => setColor(p)}
                  accessibilityRole="button"
                  accessibilityLabel={`Color ${i + 1}`}
                  accessibilityState={{ selected: color === p }}
                  style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: p, alignItems: 'center', justifyContent: 'center', borderWidth: color === p ? 3 : 0, borderColor: c.text }}
                >
                  {color === p ? <Check size={20} color="#FFFFFF" strokeWidth={3} /> : null}
                </Pressable>
              ))}
            </View>
          </View>
        </Tarjeta>

        <View style={{ gap: 6 }}>
          <TarjetaDireccion
            tipo="escuela"
            titulo="Ubicación del portón"
            etiqueta={dir ? calleDe(dir) ?? 'Ubicación marcada' : 'Marcar en el mapa'}
            calle={dir ? dir.neighborhood : 'Toca para buscar la dirección y poner el pin en el portón'}
            onPress={ubicar}
          />
          {errores.dir ? <Texto v="nota" color="dangerInk">{errores.dir}</Texto> : null}
        </View>

        <Tarjeta estilo={{ gap: 14 }}>
          <CampoTexto etiqueta="Referencia del portón" value={porton} onChangeText={setPorton} placeholder="Puerta de la calle Mercadillo" ayuda="Ayuda al chofer sustituto a encontrar la entrada." maxLength={80} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {campoHora('Entrada', entrada, 'entrada')}
            {campoHora('Salida', salida, 'salida')}
          </View>
        </Tarjeta>

        {editar ? <Boton titulo="Archivar escuela" icono={Archive} variante="peligro" onPress={() => setArchivar(true)} /> : null}
      </Pantalla>

      <SelectorHora
        visible={hora !== null}
        titulo={hora === 'salida' ? 'Hora de salida' : 'Hora de entrada'}
        valor={hora === 'salida' ? salida : entrada}
        onCerrar={() => setHora(null)}
        onElegir={(v) => (hora === 'salida' ? setSalida(v) : setEntrada(v))}
      />
      <ModalConfirmar
        visible={archivar}
        titulo={`¿Archivar ${corto || 'esta escuela'}?`}
        mensaje="Dejará de aparecer en tus listas y no podrás agregarla a rutas nuevas. Sus estudiantes y el historial se conservan."
        confirmar="Archivar"
        peligro
        cargando={archivando}
        onConfirmar={confirmarArchivo}
        onCancelar={() => setArchivar(false)}
      />
    </ConTeclado>
  );
}
