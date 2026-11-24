// 13 · Recuperar acceso
import React, { useState } from 'react';
import { View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { MailCheck } from 'lucide-react-native';
import { Boton, CampoTexto, ConTeclado, EstadoVacio, Pantalla, Texto } from '../../ui';
import { esp, radio, sombra, useTema } from '../../tema';
import { useSesion } from '../../estado/sesion';
import { correoValido, mensajeError } from '../../utils';
import type { NavAcceso, PilaAcceso } from '../../navegacion/tipos';

export default function Recuperar() {
  const { c } = useTema();
  const nav = useNavigation<NavAcceso>();
  const ruta = useRoute<RouteProp<PilaAcceso, 'Recuperar'>>();
  const recuperar = useSesion((s) => s.recuperar);
  const [correo, setCorreo] = useState(ruta.params?.correo ?? '');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const enviar = async () => {
    if (!correoValido(correo)) {
      setError('Escribe el correo con el que creaste tu cuenta.');
      return;
    }
    setCargando(true);
    setError(null);
    try {
      await recuperar(correo);
      setEnviado(true);
    } catch (e) {
      setError(mensajeError(e, 'No pudimos enviar el correo. Inténtalo de nuevo.'));
    } finally {
      setCargando(false);
    }
  };

  const tarjeta = { backgroundColor: c.surface, borderRadius: radio.grande, ...sombra(c, 2) };

  if (enviado) {
    return (
      <Pantalla titulo="Recuperar acceso" onAtras={() => nav.goBack()}>
        <View style={tarjeta}>
          <EstadoVacio
            icono={MailCheck}
            titulo="Revisa tu correo"
            texto={`Enviamos un enlace a ${correo.trim().toLowerCase()} para crear una contraseña nueva. Vence en 10 minutos.`}
          />
        </View>
        <Boton titulo="Volver a iniciar sesión" onPress={() => nav.navigate('Ingreso', { correo: correo.trim().toLowerCase() })} />
        <Boton titulo="Enviar de nuevo" variante="fantasma" onPress={enviar} cargando={cargando} />
      </Pantalla>
    );
  }

  return (
    <ConTeclado>
      <Pantalla titulo="Recuperar acceso" onAtras={() => nav.goBack()}>
        <View style={[tarjeta, { padding: esp.lg, gap: esp.lg }]}>
          <View style={{ gap: 4 }}>
            <Texto v="titulo" accessibilityRole="header">Te ayudamos a entrar</Texto>
            <Texto v="medio" color="text2">Escribe tu correo. Te enviaremos un enlace para crear una contraseña nueva.</Texto>
          </View>
          <CampoTexto
            etiqueta="Correo"
            value={correo}
            onChangeText={(t) => { setCorreo(t); if (error) setError(null); }}
            error={error}
            ayuda="El enlace vence en 10 minutos."
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            placeholder="nombre@correo.com"
            returnKeyType="send"
            onSubmitEditing={enviar}
          />
          <Boton titulo="Enviar enlace" onPress={enviar} cargando={cargando} />
        </View>
        <Boton titulo="No tengo acceso a mi correo" variante="fantasma" onPress={() => nav.navigate('Soporte')} />
      </Pantalla>
    </ConTeclado>
  );
}
