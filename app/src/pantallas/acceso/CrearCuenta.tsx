// 02 · Crear cuenta (representante) · 61 · Registro de chofer, paso 1 de 3
import type { TextInputInstance } from 'react-native';
import React, { useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Lock, Mail, MailCheck, Smartphone, UserRound } from 'lucide-react-native';
import { Boton, CampoTexto, ConTeclado, EstadoVacio, Pantalla, Texto } from '../../ui';
import { esp, radio, sombra, useTema } from '../../tema';
import { useSesion } from '../../estado/sesion';
import { celularE164, correoValido, mensajeError } from '../../utils';
import type { NavAcceso, PilaAcceso } from '../../navegacion/tipos';

type Campos = 'nombres' | 'apellidos' | 'celular' | 'correo' | 'clave' | 'licencia';

export default function CrearCuenta() {
  const { c } = useTema();
  const nav = useNavigation<NavAcceso>();
  const { rol } = useRoute<RouteProp<PilaAcceso, 'CrearCuenta'>>().params;
  const registrar = useSesion((s) => s.registrar);
  const chofer = rol === 'driver';

  const [v, setV] = useState<Record<Campos, string>>({ nombres: '', apellidos: '', celular: '', correo: '', clave: '', licencia: '' });
  const [errores, setErrores] = useState<Partial<Record<Campos, string>>>({});
  const [fallo, setFallo] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [porConfirmar, setPorConfirmar] = useState(false);
  const refs = { apellidos: useRef<TextInputInstance>(null), celular: useRef<TextInputInstance>(null), correo: useRef<TextInputInstance>(null), clave: useRef<TextInputInstance>(null), licencia: useRef<TextInputInstance>(null) };

  const cambiar = (k: Campos) => (t: string) => {
    setV((a) => ({ ...a, [k]: t }));
    if (errores[k]) setErrores((e) => ({ ...e, [k]: undefined }));
  };

  const enviar = async () => {
    const e: Partial<Record<Campos, string>> = {};
    if (v.nombres.trim().length < 2) e.nombres = 'Escribe tus nombres.';
    if (v.apellidos.trim().length < 2) e.apellidos = 'Escribe tus apellidos.';
    const e164 = celularE164(v.celular);
    if (!e164) e.celular = 'Escribe tu celular de 9 dígitos, por ejemplo 99 123 4567.';
    if (!correoValido(v.correo)) e.correo = 'Escribe un correo válido, como nombre@correo.com.';
    if (v.clave.length < 6) e.clave = 'Usa al menos 6 caracteres.';
    if (chofer && v.licencia.trim().length < 6) e.licencia = 'Escribe el número de tu licencia profesional.';
    setErrores(e);
    setFallo(null);
    if (Object.keys(e).length) return;
    setCargando(true);
    try {
      const r = await registrar({ rol, nombres: v.nombres, apellidos: v.apellidos, celular: e164, correo: v.correo, contrasena: v.clave, licencia: chofer ? v.licencia : undefined });
      if (r.requiereConfirmar) setPorConfirmar(true);
      // Con sesión, la navegación raíz cambia sola a la pila del rol.
    } catch (err) {
      const m = mensajeError(err, 'No pudimos crear la cuenta. Inténtalo de nuevo.');
      if (m.toLowerCase().includes('correo')) setErrores({ correo: m });
      else setFallo(m);
    } finally {
      setCargando(false);
    }
  };

  if (porConfirmar) {
    return (
      <Pantalla titulo="Revisa tu correo" onAtras={() => nav.goBack()}>
        <View style={{ backgroundColor: c.surface, borderRadius: radio.grande, ...sombra(c, 2) }}>
          <EstadoVacio
            icono={MailCheck}
            titulo="Te enviamos un enlace"
            texto={`Ábrelo desde ${v.correo.trim().toLowerCase()} para confirmar tu cuenta. Después vuelve aquí e inicia sesión.`}
          />
        </View>
        <Boton titulo="Ir a iniciar sesión" onPress={() => nav.navigate('Ingreso', { correo: v.correo.trim().toLowerCase() })} />
        <Texto v="nota" color="text3" centro>Si no llega en unos minutos, revisa la carpeta de correo no deseado.</Texto>
      </Pantalla>
    );
  }

  return (
    <ConTeclado>
      <Pantalla
        titulo={chofer ? 'Registro de chofer' : 'Crear cuenta'}
        subtitulo={chofer ? 'Paso 1 de 3: tus datos' : undefined}
        onAtras={() => nav.goBack()}
      >
        <View style={{ gap: esp.lg }}>
          <View style={{ gap: 6 }}>
            <Texto v="display" accessibilityRole="header">{chofer ? 'Cuéntanos quién eres' : 'Crea tu cuenta de representante'}</Texto>
            <Texto v="medio" color="text2">
              {chofer
                ? 'Los representantes verán tu nombre y tu foto antes de cada recorrido.'
                : 'Después vinculas a tus hijos con el código que te da el chofer.'}
            </Texto>
          </View>

          <CampoTexto etiqueta="Nombres" icono={UserRound} value={v.nombres} onChangeText={cambiar('nombres')} error={errores.nombres} autoCapitalize="words" autoComplete="given-name" textContentType="givenName" returnKeyType="next" onSubmitEditing={() => refs.apellidos.current?.focus()} />
          <CampoTexto ref={refs.apellidos} etiqueta="Apellidos" value={v.apellidos} onChangeText={cambiar('apellidos')} error={errores.apellidos} autoCapitalize="words" autoComplete="family-name" textContentType="familyName" returnKeyType="next" onSubmitEditing={() => refs.celular.current?.focus()} />
          <CampoTexto
            ref={refs.celular}
            etiqueta="Celular"
            icono={Smartphone}
            prefijo="+593"
            value={v.celular}
            onChangeText={cambiar('celular')}
            error={errores.celular}
            ayuda={chofer ? 'Los representantes podrán llamarte durante el recorrido.' : 'Usaremos este número para avisarte del recorrido.'}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            placeholder="99 123 4567"
            returnKeyType="next"
            onSubmitEditing={() => refs.correo.current?.focus()}
          />
          <CampoTexto ref={refs.correo} etiqueta="Correo" icono={Mail} value={v.correo} onChangeText={cambiar('correo')} error={errores.correo} ayuda="Con él entras y recuperas tu cuenta." keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" placeholder="nombre@correo.com" returnKeyType="next" onSubmitEditing={() => refs.clave.current?.focus()} />
          <CampoTexto ref={refs.clave} etiqueta="Contraseña" icono={Lock} value={v.clave} onChangeText={cambiar('clave')} error={errores.clave} ayuda="Al menos 6 caracteres." secreto autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" returnKeyType={chofer ? 'next' : 'go'} onSubmitEditing={chofer ? () => refs.licencia.current?.focus() : enviar} />
          {chofer ? (
            <CampoTexto ref={refs.licencia} etiqueta="Número de licencia" value={v.licencia} onChangeText={cambiar('licencia')} error={errores.licencia} ayuda="Licencia profesional tipo C, D o E." keyboardType="number-pad" returnKeyType="go" onSubmitEditing={enviar} />
          ) : null}

          {fallo ? <Texto v="medio" color="dangerInk" accessibilityLiveRegion="polite">{fallo}</Texto> : null}
          <Boton titulo={chofer ? 'Continuar' : 'Crear cuenta'} variante="primario" onPress={enviar} cargando={cargando} />
        </View>

        <Texto v="nota" color="text3" centro>
          Al continuar aceptas los Términos y la Política de privacidad. Solo los representantes vinculados ven la ubicación de la buseta.
        </Texto>
        <Boton titulo="Ya tengo cuenta" variante="fantasma" onPress={() => nav.navigate('Ingreso')} />
      </Pantalla>
    </ConTeclado>
  );
}
