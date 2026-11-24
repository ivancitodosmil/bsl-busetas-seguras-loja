// 11 Iniciar sesión, 12 error al entrar.
// Primera pantalla de la app sin sesión y la que aparece al cerrar sesión.
// Arriba se elige el rol (Padre de familia o Chofer); abajo, usuario (correo) y contraseña.
import type { TextInputInstance } from 'react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Bus, Lock, Smartphone, UserRound } from 'lucide-react-native';
import { BannerAlerta, Boton, CampoTexto, ConTeclado, CreditoPredir, RutaEmblema, SelectorRol, Texto, type RolIngreso } from '../../ui';
import { esp, margen, radio, useTema } from '../../tema';
import { celularPrimero } from '../../config/supabase';
import { useSesion } from '../../estado/sesion';
import { celularE164, correoValido, mensajeError } from '../../utils';
import type { NavAcceso, PilaAcceso } from '../../navegacion/tipos';

type Modo = 'usuario' | 'celular';

const BAJADA: Record<RolIngreso, string> = {
  guardian: 'Sigue la buseta de tus hijos parada por parada.',
  driver: 'Marca cada parada y avisa a las familias sin llamar.',
};
const CLAVE_ROL = 'bsl_rol_ingreso';

export default function Ingreso() {
  const { c, oscuro } = useTema();
  const ins = useSafeAreaInsets();
  const nav = useNavigation<NavAcceso>();
  const ruta = useRoute<RouteProp<PilaAcceso, 'Ingreso'>>();
  const { entrar, enviarCodigo } = useSesion();

  const [rol, setRol] = useState<RolIngreso>('guardian');
  const [modo, setModo] = useState<Modo>(celularPrimero ? 'celular' : 'usuario');
  const [usuario, setUsuario] = useState(ruta.params?.correo ?? '');
  const [clave, setClave] = useState('');
  const [celular, setCelular] = useState('');
  const [errores, setErrores] = useState<{ usuario?: string; clave?: string; celular?: string }>({});
  const [fallo, setFallo] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const refClave = useRef<TextInputInstance>(null);

  // Recuerda el último rol elegido en este teléfono.
  useEffect(() => {
    AsyncStorage.getItem(CLAVE_ROL).then((v) => { if (v === 'guardian' || v === 'driver') setRol(v); }).catch(() => {});
  }, []);

  const limpiar = () => {
    setErrores({});
    setFallo(null);
  };
  const elegirRol = (r: RolIngreso) => {
    setRol(r);
    limpiar();
    AsyncStorage.setItem(CLAVE_ROL, r).catch(() => {});
  };
  const cambiarModo = (m: Modo) => {
    setModo(m);
    limpiar();
  };

  const ingresar = async () => {
    const e: typeof errores = {};
    if (!correoValido(usuario)) e.usuario = 'Escribe el correo con el que te registraste, por ejemplo nombre@correo.com.';
    if (clave.length < 6) e.clave = 'La contraseña tiene al menos 6 caracteres.';
    setErrores(e);
    setFallo(null);
    if (Object.keys(e).length) return;
    setCargando(true);
    try {
      await entrar(usuario, clave);
    } catch (err: any) {
      setFallo(mensajeError(err));
    } finally {
      setCargando(false);
    }
  };

  const pedirCodigo = async () => {
    const e164 = celularE164(celular);
    if (!e164) {
      setErrores({ celular: 'Escribe tu celular de 9 dígitos, por ejemplo 99 123 4567.' });
      return;
    }
    limpiar();
    setCargando(true);
    try {
      await enviarCodigo(e164);
      nav.navigate('VerificarCodigo', { celular: e164 });
    } catch (err) {
      setErrores({ celular: mensajeError(err, 'No pudimos enviar el código. Entra con tu correo y contraseña.') });
    } finally {
      setCargando(false);
    }
  };

  return (
    <ConTeclado>
      <View style={{ flex: 1, backgroundColor: c.surface }}>
        <StatusBar style={oscuro ? 'light' : 'dark'} />
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1, paddingTop: ins.top + esp.xl, paddingBottom: ins.bottom + esp.md, paddingHorizontal: 24, gap: esp.xl }}
        >
          {/* Marca */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: c.hero, alignItems: 'center', justifyContent: 'center' }}>
              <Bus size={26} color={c.accent} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1 }}>
              <Texto v="titulo" style={{ fontFamily: 'Manrope_800ExtraBold', fontSize: 20, lineHeight: 24 }}>BSL</Texto>
              <Texto v="nota" color="text2">Busetas Seguras Loja</Texto>
            </View>
          </View>

          <RutaEmblema />

          <View style={{ gap: 8 }}>
            <Texto v="display" accessibilityRole="header" style={{ fontSize: 34, lineHeight: 40, letterSpacing: -1 }}>Inicia sesión</Texto>
            <Texto v="medio" color="text2">{modo === 'usuario' ? BAJADA[rol] : 'Te enviamos un código por SMS a tu celular.'}</Texto>
          </View>

          <SelectorRol valor={rol} onChange={elegirRol} />

          {fallo ? (
            <BannerAlerta tipo="urgente" titulo={fallo} />
          ) : null}

          {modo === 'usuario' ? (
            <View style={{ gap: esp.lg }}>
              <CampoTexto
                etiqueta="Correo"
                icono={UserRound}
                value={usuario}
                onChangeText={setUsuario}
                error={errores.usuario}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="username"
                returnKeyType="next"
                placeholder="nombre@correo.com"
                onSubmitEditing={() => refClave.current?.focus()}
              />
              <View>
                <CampoTexto
                  ref={refClave}
                  etiqueta="Contraseña"
                  icono={Lock}
                  value={clave}
                  onChangeText={setClave}
                  error={errores.clave}
                  ayuda={fallo ? 'Revisa las mayúsculas y vuelve a intentar.' : undefined}
                  secreto
                  autoCapitalize="none"
                  autoComplete="current-password"
                  textContentType="password"
                  returnKeyType="go"
                  placeholder="Tu contraseña"
                  onSubmitEditing={ingresar}
                />
                <Pressable onPress={() => nav.navigate('Recuperar', { correo: usuario })} accessibilityRole="button" hitSlop={8} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-end' }}>
                  <Texto v="medioFuerte" color="primary">¿Olvidaste tu contraseña?</Texto>
                </Pressable>
              </View>
              <Boton titulo="Ingresar" onPress={ingresar} cargando={cargando} />
              <Boton titulo="Entrar con un código al celular" icono={Smartphone} variante="fantasma" onPress={() => cambiarModo('celular')} />
            </View>
          ) : (
            <View style={{ gap: esp.lg }}>
              <CampoTexto
                etiqueta="Celular"
                icono={Smartphone}
                prefijo="+593"
                value={celular}
                onChangeText={setCelular}
                error={errores.celular}
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                placeholder="99 123 4567"
                returnKeyType="go"
                onSubmitEditing={pedirCodigo}
              />
              <Boton titulo="Enviar código" onPress={pedirCodigo} cargando={cargando} />
              <Boton titulo="Entrar con correo y contraseña" icono={UserRound} variante="fantasma" onPress={() => cambiarModo('usuario')} />
            </View>
          )}

          <View style={{ flex: 1 }} />
          <View>
            <Pressable onPress={() => nav.navigate('CrearCuenta', { rol })} accessibilityRole="button" accessibilityLabel={`Crear cuenta de ${rol === 'driver' ? 'chofer' : 'representante'}`} style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}>
              <Texto v="medio" color="text2" centro>
                ¿No tienes cuenta? <Texto v="medioFuerte" color="primary">Regístrate</Texto>
              </Texto>
            </Pressable>
            <CreditoPredir />
          </View>
        </ScrollView>
      </View>
    </ConTeclado>
  );
}
