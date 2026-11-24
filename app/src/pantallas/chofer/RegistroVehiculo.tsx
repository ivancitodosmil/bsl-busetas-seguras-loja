// 62 / 63 · Registro del vehículo (paso 2 de 3) y edición desde Perfil.
import type { TextInputInstance } from 'react-native';
import React, { useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Boton, CampoTexto, ConTeclado, Pantalla, Tarjeta, Texto, useToast } from '../../ui';
import { useSesion } from '../../estado/sesion';
import type { NavChofer, PilaChofer } from '../../navegacion/tipos';
import { mensajeError, placaValida } from '../../utils';

export default function RegistroVehiculo() {
  const nav = useNavigation<NavChofer>();
  const editar = !!useRoute<RouteProp<PilaChofer, 'RegistroVehiculo'>>().params?.editar;
  const toast = useToast();
  const { chofer, actualizarChofer, salir } = useSesion();

  const [marca, setMarca] = useState(chofer?.vehicle_brand ?? '');
  const [modelo, setModelo] = useState(chofer?.vehicle_model ?? '');
  const [anio, setAnio] = useState(chofer?.vehicle_year ? String(chofer.vehicle_year) : '');
  const [color, setColor] = useState(chofer?.vehicle_color ?? '');
  const [placa, setPlaca] = useState(chofer?.plate_number ?? '');
  const [capacidad, setCapacidad] = useState(chofer?.vehicle_capacity ? String(chofer.vehicle_capacity) : '');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const rModelo = useRef<TextInputInstance>(null);
  const rAnio = useRef<TextInputInstance>(null);
  const rColor = useRef<TextInputInstance>(null);
  const rPlaca = useRef<TextInputInstance>(null);
  const rCap = useRef<TextInputInstance>(null);

  // Mientras se escribe: "lba1234" → "LBA-1234"
  const escribirPlaca = (t: string) => {
    const limpio = t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
    setPlaca(limpio.length > 3 ? `${limpio.slice(0, 3)}-${limpio.slice(3)}` : limpio);
    if (errores.placa) setErrores((x) => ({ ...x, placa: '' }));
  };

  const guardar = async () => {
    const er: Record<string, string> = {};
    const anioActual = new Date().getFullYear();
    const a = Number(anio);
    const cap = Number(capacidad);
    const p = placaValida(placa);
    if (!marca.trim()) er.marca = 'Escribe la marca.';
    if (!modelo.trim()) er.modelo = 'Escribe el modelo.';
    if (!/^\d{4}$/.test(anio) || a < 1980 || a > anioActual + 1) er.anio = `Escribe un año entre 1980 y ${anioActual + 1}.`;
    if (!color.trim()) er.color = 'Escribe el color.';
    if (!p) er.placa = 'La placa debe tener el formato ABC-1234.';
    if (!/^\d{1,2}$/.test(capacidad) || cap < 1 || cap > 60) er.capacidad = 'Escribe un número entre 1 y 60.';
    setErrores(er);
    if (Object.keys(er).length > 0 || !p) return;
    setGuardando(true);
    try {
      await actualizarChofer({
        vehicle_brand: marca.trim(), vehicle_model: modelo.trim(), vehicle_year: a, vehicle_color: color.trim(),
        plate_number: p, vehicle_capacity: cap,
      });
      if (editar) {
        toast.mostrar('Vehículo actualizado', { tipo: 'exito' });
        nav.goBack();
      } else {
        nav.navigate('RegistroDocumentos');
      }
    } catch (e) {
      const m = mensajeError(e, 'No se pudo guardar el vehículo.');
      if (m.toLowerCase().includes('placa')) setErrores({ placa: m });
      else toast.mostrar(m, { tipo: 'error' });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <ConTeclado>
      <Pantalla
        titulo={editar ? 'Tu vehículo' : 'Datos de la buseta'}
        sobretitulo={editar ? undefined : 'Paso 2 de 3: tu vehículo'}
        subtitulo={editar ? undefined : 'Así la reconocerán los representantes en la calle.'}
        onAtras={editar ? nav.goBack : undefined}
        pie={
          <>
            <Boton titulo={editar ? 'Guardar cambios' : 'Continuar'} onPress={guardar} cargando={guardando} />
            {!editar ? <Boton titulo="Cerrar sesión" variante="fantasma" tamano="compacto" ancho={false} estilo={{ alignSelf: 'center' }} onPress={salir} /> : null}
          </>
        }
      >
        <Tarjeta elevacion={2} estilo={{ gap: 14 }}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <CampoTexto etiqueta="Marca" value={marca} onChangeText={setMarca} error={errores.marca} placeholder="Hyundai" autoCapitalize="words" returnKeyType="next" onSubmitEditing={() => rModelo.current?.focus()} />
            </View>
            <View style={{ flex: 1 }}>
              <CampoTexto ref={rModelo} etiqueta="Modelo" value={modelo} onChangeText={setModelo} error={errores.modelo} placeholder="H1" autoCapitalize="words" returnKeyType="next" onSubmitEditing={() => rAnio.current?.focus()} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <CampoTexto ref={rAnio} etiqueta="Año" value={anio} onChangeText={(t) => setAnio(t.replace(/\D/g, '').slice(0, 4))} error={errores.anio} placeholder="2019" keyboardType="number-pad" maxLength={4} returnKeyType="next" onSubmitEditing={() => rColor.current?.focus()} />
            </View>
            <View style={{ flex: 1 }}>
              <CampoTexto ref={rColor} etiqueta="Color" value={color} onChangeText={setColor} error={errores.color} placeholder="Blanco" autoCapitalize="words" returnKeyType="next" onSubmitEditing={() => rPlaca.current?.focus()} />
            </View>
          </View>
          <CampoTexto
            ref={rPlaca}
            etiqueta="Placa"
            value={placa}
            onChangeText={escribirPlaca}
            error={errores.placa}
            ayuda="Formato ecuatoriano: tres letras, guion y cuatro números."
            placeholder="LBA-1234"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={8}
            returnKeyType="next"
            onSubmitEditing={() => rCap.current?.focus()}
          />
          <CampoTexto
            ref={rCap}
            etiqueta="Capacidad"
            value={capacidad}
            onChangeText={(t) => setCapacidad(t.replace(/\D/g, '').slice(0, 2))}
            error={errores.capacidad}
            ayuda="Número de asientos, solo los de estudiantes."
            placeholder="15"
            keyboardType="number-pad"
            maxLength={2}
            returnKeyType="done"
            onSubmitEditing={guardar}
          />
        </Tarjeta>
        {!editar ? (
          <Texto v="nota" color="text3" centro>Después podrás cambiar estos datos desde Perfil.</Texto>
        ) : null}
      </Pantalla>
    </ConTeclado>
  );
}
