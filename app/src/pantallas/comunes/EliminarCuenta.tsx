// 98 · Eliminar cuenta · doble confirmación
import React, { useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Check, X } from 'lucide-react-native';
import { Boton, CampoTexto, ConTeclado, Pantalla, Texto } from '../../ui';
import { esp, radio, sombra, useTema } from '../../tema';
import { useSesion } from '../../estado/sesion';
import { mensajeError } from '../../utils';

const PALABRA = 'ELIMINAR';

export default function EliminarCuenta() {
  const { c } = useTema();
  const nav = useNavigation();
  const { usuario, eliminarCuenta } = useSesion();
  const chofer = usuario?.role === 'driver';
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const seBorra = chofer
    ? ['Tu perfil, tu celular y tu correo', 'Tus rutas, paradas y escuelas', 'Tus estudiantes y sus vínculos con los representantes', 'Tu registro de pagos y tus documentos']
    : ['Tu perfil, tu celular y tu correo', 'Tu vínculo con tus hijos en BSL', 'Tus avisos y preferencias'];
  const seConserva = chofer
    ? ['Las cuentas de los representantes, sin acceso a tus rutas']
    : ['Tus hijos siguen en la ruta de su chofer', 'Los otros representantes siguen recibiendo los avisos'];

  const eliminar = async () => {
    setCargando(true);
    setError(null);
    try {
      await eliminarCuenta();
    } catch (e) {
      setError(mensajeError(e, 'No pudimos eliminar la cuenta. Inténtalo de nuevo.'));
      setCargando(false);
    }
  };

  const lista = (titulo: string, items: string[], borra: boolean) => (
    <View style={{ gap: esp.sm }}>
      <Texto v="seccion">{titulo}</Texto>
      {items.map((t) => (
        <View key={t} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: borra ? c.dangerSoft : c.successSoft, alignItems: 'center', justifyContent: 'center' }}>
            {borra ? <X size={14} color={c.dangerInk} strokeWidth={2.5} /> : <Check size={14} color={c.successInk} strokeWidth={2.5} />}
          </View>
          <Texto v="medio" color="text2" style={{ flex: 1 }}>{t}</Texto>
        </View>
      ))}
    </View>
  );

  return (
    <ConTeclado>
      <Pantalla
        titulo="Eliminar cuenta"
        onAtras={() => nav.goBack()}
        pie={
          <>
            <Boton titulo="Eliminar mi cuenta" variante="peligro" onPress={eliminar} cargando={cargando} deshabilitado={texto.trim().toUpperCase() !== PALABRA} />
            <Boton titulo="Cancelar" variante="secundario" onPress={() => nav.goBack()} deshabilitado={cargando} />
          </>
        }
      >
        <View style={{ backgroundColor: c.surface, borderRadius: radio.grande, padding: esp.lg, gap: esp.lg, ...sombra(c, 2) }}>
          <View style={{ gap: 4 }}>
            <Texto v="titulo" accessibilityRole="header">¿Eliminar tu cuenta de BSL?</Texto>
            <Texto v="medio" color="text2">Lee qué se borra. Esta acción no se puede deshacer.</Texto>
          </View>
          {lista('Se borra', seBorra, true)}
          {lista('Se conserva', seConserva, false)}
        </View>
        <CampoTexto
          etiqueta={`Escribe ${PALABRA} para confirmar`}
          value={texto}
          onChangeText={setTexto}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder={PALABRA}
          error={error}
          ayuda="Así evitamos que se borre por error."
        />
      </Pantalla>
    </ConTeclado>
  );
}
