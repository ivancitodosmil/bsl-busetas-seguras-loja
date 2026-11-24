// 03 · Verificar código
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Boton, CampoCodigo, ConTeclado, Pantalla, Texto, useToast } from '../../ui';
import { esp, radio, sombra, useTema } from '../../tema';
import { useSesion } from '../../estado/sesion';
import { celularBonito, mensajeError } from '../../utils';
import type { NavAcceso, PilaAcceso } from '../../navegacion/tipos';

const ESPERA = 60;

export default function VerificarCodigo() {
  const { c } = useTema();
  const nav = useNavigation<NavAcceso>();
  const toast = useToast();
  const { celular } = useRoute<RouteProp<PilaAcceso, 'VerificarCodigo'>>().params;
  const { verificarCodigo, enviarCodigo } = useSesion();

  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [espera, setEspera] = useState(ESPERA);

  useEffect(() => {
    if (espera <= 0) return;
    const reloj = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(reloj);
  }, [espera]);

  const verificar = async (valor = codigo) => {
    if (valor.length < 6) {
      setError('Escribe los 6 dígitos del código.');
      return;
    }
    setCargando(true);
    setError(null);
    try {
      await verificarCodigo(celular, valor);
      // Con sesión, la navegación raíz cambia sola.
    } catch (e) {
      setError(mensajeError(e, 'El código no es válido. Revisa los dígitos.'));
      setCodigo('');
    } finally {
      setCargando(false);
    }
  };

  const reenviar = async () => {
    try {
      await enviarCodigo(celular);
      setEspera(ESPERA);
      setError(null);
      toast.mostrar('Te enviamos un código nuevo', { tipo: 'exito' });
    } catch (e) {
      setError(mensajeError(e, 'No pudimos reenviar el código.'));
    }
  };

  return (
    <ConTeclado>
      <Pantalla titulo="Verificar código" onAtras={() => nav.goBack()}>
        <View style={{ backgroundColor: c.surface, borderRadius: radio.grande, padding: esp.lg, gap: esp.lg, ...sombra(c, 2) }}>
          <View style={{ gap: 4 }}>
            <Texto v="titulo" accessibilityRole="header">Escribe el código</Texto>
            <Texto v="medio" color="text2">
              Lo enviamos por SMS al {celularBonito(celular)}.{' '}
              <Texto v="medioFuerte" color="primary" onPress={() => nav.goBack()} accessibilityRole="link">Cambiar</Texto>
            </Texto>
          </View>
          <CampoCodigo
            valor={codigo}
            error={!!error}
            onChange={(t) => {
              setCodigo(t);
              if (error) setError(null);
              if (t.length === 6) verificar(t);
            }}
          />
          {error ? <Texto v="nota" color="dangerInk" accessibilityLiveRegion="polite">{error}</Texto> : null}
          <Boton titulo="Verificar" onPress={() => verificar()} cargando={cargando} />
          <Pressable
            onPress={espera > 0 ? undefined : reenviar}
            disabled={espera > 0}
            accessibilityRole="button"
            accessibilityState={{ disabled: espera > 0 }}
            style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
          >
            <Texto v="medioFuerte" color={espera > 0 ? 'text3' : 'primary'}>
              {espera > 0 ? `Reenviar (0:${String(espera).padStart(2, '0')})` : 'Reenviar código'}
            </Texto>
          </Pressable>
        </View>
      </Pantalla>
    </ConTeclado>
  );
}
