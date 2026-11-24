// Estructura de pantalla "Ruta viva": encabezado azul marino de lado a lado con el contenido
// montado encima, hojas inferiores, modales de dos acciones, avisos, estados y barra flotante.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo, Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl,
  ScrollView, StyleProp, Switch, Text, View, ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  AlertTriangle, ArrowLeft, Bell, Bus, CalendarX, Check, ChevronRight, CircleCheck, CirclePause, Flag, Home, Info, MapPin, MessageSquare,
  Route, School, UserCheck, WifiOff, X, type LucideIcon,
} from 'lucide-react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { EnCielo, esp, fuentes, margen, radio, sombra, useEnCielo, useTema, type Colores } from '../tema';
import { tonoDeAviso } from '../estado/avisos';
import type { Aviso } from '../tipos';
import { Avatar, AvatarApilado, Boton, BotonIcono, Chip, Texto } from './base';

function useMovimientoReducido() {
  const [reducido, setReducido] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReducido).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducido);
    return () => sub.remove();
  }, []);
  return reducido;
}

// ── Pantalla ────────────────────────────────────────────────────────────────
// Encabezado claro sobre el fondo. En Inicio, `cielo` agrega la tarjeta azul de próxima llegada.
interface PantallaProps {
  titulo: string;
  sobretitulo?: string; // contexto (fecha, paso): se muestra bajo el título, nunca encima
  subtitulo?: string;
  onAtras?: () => void; // si existe, barra superior compacta con flecha
  derecha?: React.ReactNode;
  bajoTitulo?: React.ReactNode; // p. ej. SelectorHijo, bajo el título
  children: React.ReactNode;
  scroll?: boolean;
  refrescando?: boolean;
  onRefrescar?: () => void;
  pie?: React.ReactNode; // barra fija inferior (botón principal)
  conBarra?: boolean; // deja espacio para la barra de pestañas
  sinMontar?: boolean; // se conserva por compatibilidad: el contenido ya no se monta sobre el encabezado
  estiloContenido?: StyleProp<ViewStyle>;
  cielo?: boolean; // Inicio: muestra la tarjeta de próxima llegada (enCielo) arriba del contenido
  enCielo?: React.ReactNode; // contenido de esa tarjeta azul (texto en blanco)
  progreso?: number | null; // avance de la buseta hacia tu casa (0 a 1)
  etiquetaProgreso?: string;
  marino?: boolean; // pestañas principales: encabezado azul marino de lado a lado (Figma BSL 2.0)
  solape?: number; // px del contenido que se monta sobre el borde inferior del encabezado marino
}

export const ALTO_BARRA = 68; // alto de la barra de pestañas, sin el borde seguro inferior

export function Pantalla({
  titulo, sobretitulo, subtitulo, onAtras, derecha, bajoTitulo, children, scroll = true, refrescando, onRefrescar,
  pie, conBarra, estiloContenido, cielo, enCielo, progreso, etiquetaProgreso, marino, solape = 0,
}: PantallaProps) {
  const { c, oscuro } = useTema();
  const ins = useSafeAreaInsets();
  const raiz = !onAtras;
  const fondoInferior = (conBarra ? ALTO_BARRA : 0) + ins.bottom + esp.xxl;
  const lineaBajo = [sobretitulo, subtitulo].filter(Boolean).join('. ');

  const tituloRaiz = (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Texto v="display" accessibilityRole="header" numberOfLines={2}>{titulo}</Texto>
        {lineaBajo ? <Texto v="medio" color="text2">{lineaBajo}</Texto> : null}
      </View>
      {derecha}
    </View>
  );

  // Encabezado azul marino: saludo en Manrope, fecha en celeste y, debajo, los chips sobre el marino.
  const conMarino = !!marino && raiz;
  const encabezadoMarino = (
    <EnCielo>
      <View style={{ backgroundColor: c.hero, paddingTop: ins.top + esp.md, paddingHorizontal: margen, paddingBottom: (bajoTitulo ? 18 : 22) + solape }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              accessibilityRole="header"
              numberOfLines={2}
              maxFontSizeMultiplier={1.3}
              style={{ fontFamily: fuentes.titulo, fontSize: 26, lineHeight: 32, letterSpacing: -0.5, color: c.onHero }}
            >
              {titulo}
            </Text>
            {lineaBajo ? (
              <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: fuentes.medio, fontSize: 13.5, lineHeight: 19, color: c.onHero2 }}>{lineaBajo}</Text>
            ) : null}
          </View>
          {derecha}
        </View>
        {bajoTitulo ? <View style={{ marginTop: esp.lg }}>{bajoTitulo}</View> : null}
      </View>
    </EnCielo>
  );

  const encabezado = conMarino ? encabezadoMarino : raiz ? (
    <View style={{ paddingTop: ins.top + esp.lg, paddingHorizontal: margen, paddingBottom: esp.sm }}>
      {tituloRaiz}
      {bajoTitulo ? <View style={{ marginTop: esp.lg }}>{bajoTitulo}</View> : null}
    </View>
  ) : (
    <View style={{ paddingTop: ins.top + esp.sm, paddingHorizontal: margen, paddingBottom: esp.sm, backgroundColor: c.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}>
        <BotonIcono icono={ArrowLeft} onPress={onAtras} etiqueta="Volver" />
        <View style={{ flex: 1 }}>
          <Texto v="subtitulo" accessibilityRole="header" numberOfLines={1}>{titulo}</Texto>
          {lineaBajo ? <Texto v="nota" color="text2" numberOfLines={1}>{lineaBajo}</Texto> : null}
        </View>
        {derecha}
      </View>
      {bajoTitulo ? <View style={{ marginTop: esp.md }}>{bajoTitulo}</View> : null}
    </View>
  );

  // La próxima llegada (Inicio): tarjeta azul con la hora y la barra de avance de la buseta.
  const llegada = cielo && enCielo ? (
    <EnCielo>
      <View style={{ backgroundColor: c.primary, borderRadius: radio.grande, padding: esp.lg, gap: esp.md }}>
        {enCielo}
        {typeof progreso === 'number' ? <BarraAvance progreso={progreso} etiqueta={etiquetaProgreso} /> : null}
      </View>
    </EnCielo>
  ) : null;

  const cuerpo = (
    <View style={[{ paddingHorizontal: margen, gap: conMarino ? esp.md : esp.lg, marginTop: conMarino ? (solape ? -solape : esp.lg) : esp.md }, estiloContenido]}>{llegada}{children}</View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style={oscuro || conMarino ? 'light' : 'dark'} />
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ paddingBottom: pie ? esp.xl : fondoInferior }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={onRefrescar ? <RefreshControl refreshing={!!refrescando} onRefresh={onRefrescar} tintColor={c.primary} colors={[c.primary]} progressViewOffset={ins.top} /> : undefined}
        >
          {encabezado}
          {cuerpo}
        </ScrollView>
      ) : (
        <>
          {encabezado}
          <View style={{ flex: 1 }}>{cuerpo}</View>
        </>
      )}
      {pie ? (
        <View style={{ paddingHorizontal: margen, paddingTop: esp.md, paddingBottom: ins.bottom + esp.md, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border, gap: esp.sm }}>
          {pie}
        </View>
      ) : null}
    </View>
  );
}

// Barra de avance de la buseta hacia tu casa (dentro de la tarjeta de llegada).
// La buseta se desliza al nuevo avance en vez de saltar.
function BarraAvance({ progreso, etiqueta }: { progreso: number; etiqueta?: string }) {
  const { c } = useTema();
  const reducido = useMovimientoReducido();
  const p = Math.max(0, Math.min(1, progreso));
  const [ancho, setAncho] = useState(0);
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reducido) v.setValue(p);
    else Animated.timing(v, { toValue: p, duration: 700, easing: Easing.bezier(0.16, 1, 0.3, 1), useNativeDriver: true }).start();
  }, [p, reducido, v]);
  const pista = Math.max(0, ancho - 26);
  return (
    <View
      onLayout={(e) => setAncho(e.nativeEvent.layout.width)}
      accessible accessibilityRole="progressbar" accessibilityLabel={etiqueta} accessibilityValue={{ min: 0, max: 100, now: Math.round(p * 100) }}
      style={{ height: 36, justifyContent: 'center' }}
    >
      <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.28)', marginRight: 26, overflow: 'hidden' }}>
        <Animated.View style={{ height: 6, width: '100%', backgroundColor: '#FFFFFF', transformOrigin: 'left', transform: [{ scaleX: v }] }} />
      </View>
      <View style={{ position: 'absolute', right: 0, width: 28, height: 28, borderRadius: 8, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
        <Home size={15} color={c.primary} strokeWidth={2.4} />
      </View>
      {ancho ? (
        <Animated.View style={{ position: 'absolute', left: -16, width: 32, height: 32, borderRadius: 16, backgroundColor: c.accent, borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [16, pista] }) }] }}>
          <Bus size={15} color={c.onAccent} strokeWidth={2.4} />
        </Animated.View>
      ) : null}
    </View>
  );
}

// Envoltura para formularios: sube el contenido cuando aparece el teclado.
export function ConTeclado({ children }: { children: React.ReactNode }) {
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      {children}
    </KeyboardAvoidingView>
  );
}

// ── Hoja inferior ───────────────────────────────────────────────────────────
export function HojaInferior({
  visible, onCerrar, titulo, texto, children, pie,
}: { visible: boolean; onCerrar: () => void; titulo?: string; texto?: string; children?: React.ReactNode; pie?: React.ReactNode }) {
  const { c } = useTema();
  const ins = useSafeAreaInsets();
  const reducido = useMovimientoReducido();
  const y = useRef(new Animated.Value(1)).current;
  const [montada, setMontada] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMontada(true);
      Animated.timing(y, { toValue: 0, duration: reducido ? 0 : 280, easing: Easing.out(Easing.poly(4)), useNativeDriver: true }).start();
    } else if (montada) {
      Animated.timing(y, { toValue: 1, duration: reducido ? 0 : 180, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => setMontada(false));
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!montada) return null;
  return (
    <Modal transparent visible statusBarTranslucent navigationBarTranslucent animationType="none" onRequestClose={onCerrar}>
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior="padding">
        <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.scrim, opacity: y.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }}>
          <Pressable style={{ flex: 1 }} onPress={onCerrar} accessibilityLabel="Cerrar" accessibilityRole="button" />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          style={{
            backgroundColor: c.surface, borderTopLeftRadius: radio.hoja, borderTopRightRadius: radio.hoja, maxHeight: '88%',
            paddingBottom: ins.bottom + esp.lg, transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [0, 640] }) }],
          }}
        >
          <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 6 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: c.border }} />
          </View>
          {titulo ? (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: margen, paddingTop: 6, gap: 12 }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={{ fontFamily: fuentes.titulo, fontSize: 22, lineHeight: 28, letterSpacing: -0.4, color: c.text }}>{titulo}</Text>
                {texto ? <Texto v="medio" color="text2">{texto}</Texto> : null}
              </View>
              <Pressable onPress={onCerrar} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cerrar" style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' }}>
                <X size={18} color={c.text2} />
              </Pressable>
            </View>
          ) : null}
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: margen, paddingTop: esp.lg, gap: esp.md }}>
            {children}
          </ScrollView>
          {pie ? <View style={{ paddingHorizontal: margen, paddingTop: esp.lg, gap: esp.sm }}>{pie}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Modal de confirmación (máximo dos acciones; sustituye a Alert.alert) ────
export function ModalConfirmar({
  visible, titulo, mensaje, confirmar = 'Confirmar', cancelar = 'Cancelar', peligro, cargando, onConfirmar, onCancelar, children,
}: {
  visible: boolean; titulo: string; mensaje?: string; confirmar?: string; cancelar?: string; peligro?: boolean; cargando?: boolean;
  onConfirmar: () => void; onCancelar: () => void; children?: React.ReactNode;
}) {
  const { c } = useTema();
  return (
    <Modal transparent visible={visible} statusBarTranslucent navigationBarTranslucent animationType="fade" onRequestClose={onCancelar}>
      <View style={{ flex: 1, backgroundColor: c.scrim, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View accessibilityViewIsModal accessibilityRole="alert" style={{ width: '100%', maxWidth: 400, backgroundColor: c.surface, borderRadius: radio.hoja, padding: esp.xl, gap: esp.md }}>
          <Texto v="subtitulo" accessibilityRole="header">{titulo}</Texto>
          {mensaje ? <Texto v="cuerpo" color="text2">{mensaje}</Texto> : null}
          {children}
          <View style={{ flexDirection: 'row', gap: esp.sm, marginTop: esp.sm }}>
            <Boton titulo={cancelar} variante="secundario" onPress={onCancelar} estilo={{ flex: 1 }} deshabilitado={cargando} />
            <Boton titulo={confirmar} variante={peligro ? 'peligro' : 'primario'} onPress={onConfirmar} cargando={cargando} estilo={{ flex: 1 }} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Banner de alerta ────────────────────────────────────────────────────────
export function BannerAlerta({
  tipo = 'info', titulo, texto, accion, onAccion, icono,
}: { tipo?: 'urgente' | 'aviso' | 'info' | 'exito'; titulo: string; texto?: string; accion?: string; onAccion?: () => void; icono?: LucideIcon }) {
  const { c } = useTema();
  const tono = {
    urgente: [c.dangerSoft, c.dangerInk, AlertTriangle],
    aviso: [c.warningSoft, c.warningInk, AlertTriangle],
    info: [c.primarySoft, c.primary, Info],
    exito: [c.successSoft, c.successInk, CircleCheck],
  } as const;
  const [fondo, tinta, IconoBase] = tono[tipo];
  const Icono = icono ?? IconoBase;
  return (
    <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: fondo, borderRadius: radio.tarjeta, paddingVertical: 12, paddingLeft: 14, paddingRight: accion ? 10 : 14 }}>
      <Icono size={22} color={tinta} strokeWidth={2.2} />
      <View style={{ flex: 1 }}>
        <Texto v="fuerte" style={{ fontSize: 15 }}>{titulo}</Texto>
        {texto ? <Texto v="nota" color="text2">{texto}</Texto> : null}
      </View>
      {accion ? <Boton titulo={accion} variante="secundario" tamano="compacto" onPress={onAccion} /> : null}
    </View>
  );
}

// Banner persistente de sin conexión, con el número de acciones en cola.
export function BannerSinConexion({ pendientes = 0 }: { pendientes?: number }) {
  const { c } = useTema();
  return (
    <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.warningSoft, paddingVertical: 10, paddingHorizontal: margen }}>
      <WifiOff size={18} color={c.warningInk} strokeWidth={2.2} />
      <Texto v="medioFuerte" color="warningInk" style={{ flex: 1 }}>
        {pendientes > 0 ? `Sin conexión, ${pendientes} ${pendientes === 1 ? 'acción pendiente' : 'acciones pendientes'}` : 'Sin conexión. Seguimos guardando lo que hagas'}
      </Texto>
    </View>
  );
}

// ── Estados: vacío, error, cargando ─────────────────────────────────────────
export function EstadoVacio({
  icono: Icono, titulo, texto, accion, onAccion, compacto,
}: { icono: LucideIcon; titulo: string; texto?: string; accion?: string; onAccion?: () => void; compacto?: boolean }) {
  const { c } = useTema();
  return (
    <View style={{ alignItems: 'center', gap: esp.sm, paddingVertical: compacto ? esp.xl : 40, paddingHorizontal: esp.lg }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
        <Icono size={28} color={c.primary} strokeWidth={2} />
      </View>
      <Texto v="subtitulo" centro>{titulo}</Texto>
      {texto ? <Texto v="medio" color="text2" centro style={{ maxWidth: 300 }}>{texto}</Texto> : null}
      {accion ? <Boton titulo={accion} onPress={onAccion} ancho={false} estilo={{ marginTop: esp.sm, paddingHorizontal: 28, alignSelf: 'center' }} /> : null}
    </View>
  );
}

export function EstadoError({ titulo = 'No pudimos cargar esto', texto, onReintentar, onSoporte }: { titulo?: string; texto?: string; onReintentar?: () => void; onSoporte?: () => void }) {
  const { c } = useTema();
  return (
    <View style={{ alignItems: 'center', gap: esp.sm, paddingVertical: 36, paddingHorizontal: esp.lg }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: c.dangerSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
        <WifiOff size={28} color={c.dangerInk} strokeWidth={2} />
      </View>
      <Texto v="subtitulo" centro>{titulo}</Texto>
      <Texto v="medio" color="text2" centro style={{ maxWidth: 300 }}>{texto ?? 'Revisa tu conexión a internet y vuelve a intentar.'}</Texto>
      {onReintentar ? <Boton titulo="Reintentar" onPress={onReintentar} ancho={false} estilo={{ marginTop: esp.sm, paddingHorizontal: 28, alignSelf: 'center' }} /> : null}
      {onSoporte ? <Boton titulo="Hablar con soporte" variante="fantasma" onPress={onSoporte} ancho={false} estilo={{ alignSelf: 'center' }} /> : null}
    </View>
  );
}

export function Esqueleto({ alto = 16, ancho = '100%', redondeo = 8, estilo }: { alto?: number; ancho?: number | `${number}%`; redondeo?: number; estilo?: StyleProp<ViewStyle> }) {
  const { c } = useTema();
  const reducido = useMovimientoReducido();
  const a = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    if (reducido) return;
    const bucle = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(a, { toValue: 0.55, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    bucle.start();
    return () => bucle.stop();
  }, [reducido]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Animated.View style={[{ height: alto, width: ancho, borderRadius: redondeo, backgroundColor: c.surface2, opacity: a }, estilo]} />;
}

// Esqueleto con la forma de una lista de tarjetas (nunca un spinner a pantalla completa).
export function EsqueletoLista({ filas = 3, mapa }: { filas?: number; mapa?: boolean }) {
  const { c } = useTema();
  return (
    <View style={{ gap: esp.md }} accessibilityLabel="Cargando" accessibilityRole="progressbar">
      {mapa ? <Esqueleto alto={220} redondeo={radio.grande} /> : null}
      {Array.from({ length: filas }).map((_, i) => (
        <View key={i} style={{ backgroundColor: c.surface, borderRadius: radio.grande, padding: esp.lg, gap: 10, ...sombra(c, 1) }}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <Esqueleto alto={40} ancho={40} redondeo={20} />
            <View style={{ flex: 1, gap: 8 }}>
              <Esqueleto alto={14} ancho="62%" />
              <Esqueleto alto={12} ancho="40%" />
            </View>
          </View>
          {i === 0 ? <Esqueleto alto={44} redondeo={12} /> : null}
        </View>
      ))}
    </View>
  );
}

// ── Toast con "Deshacer" ────────────────────────────────────────────────────
interface OpcionesToast { deshacer?: () => void; tipo?: 'exito' | 'error' | 'info'; duracion?: number }
interface ToastCtx { mostrar: (texto: string, o?: OpcionesToast) => void }
const CtxToast = createContext<ToastCtx>({ mostrar: () => {} });
export const useToast = () => useContext(CtxToast);

export function ProveedorToast({ children }: { children: React.ReactNode }) {
  const { c } = useTema();
  const ins = useSafeAreaInsets();
  const [t, setT] = useState<{ texto: string; o: OpcionesToast; id: number } | null>(null);
  const y = useRef(new Animated.Value(0)).current;
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ocultar = useCallback(() => {
    Animated.timing(y, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => setT(null));
  }, [y]);

  const mostrar = useCallback((texto: string, o: OpcionesToast = {}) => {
    if (reloj.current) clearTimeout(reloj.current);
    setT({ texto, o, id: Date.now() });
    AccessibilityInfo.announceForAccessibility(texto);
    Animated.timing(y, { toValue: 1, duration: 240, easing: Easing.out(Easing.poly(4)), useNativeDriver: true }).start();
    reloj.current = setTimeout(ocultar, o.duracion ?? (o.deshacer ? 5000 : 3200));
  }, [y, ocultar]);

  const valor = useMemo(() => ({ mostrar }), [mostrar]);
  const tono = t?.o.tipo === 'error' ? c.danger : t?.o.tipo === 'exito' ? c.success : c.accent;

  return (
    <CtxToast.Provider value={valor}>
      {children}
      {t ? (
        <Animated.View
          pointerEvents="box-none"
          style={{ position: 'absolute', left: 16, right: 16, bottom: ins.bottom + 104, opacity: y, transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}
        >
          <View style={{ backgroundColor: '#0F1B2D', borderRadius: radio.tarjeta, paddingVertical: 12, paddingLeft: 14, paddingRight: 8, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, ...sombra(c, 2), borderWidth: 0 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tono }} />
            <Text style={{ flex: 1, fontFamily: fuentes.medio, fontSize: 14.5, lineHeight: 20, color: '#FFFFFF' }}>{t.texto}</Text>
            {t.o.deshacer ? (
              <Pressable onPress={() => { t.o.deshacer?.(); ocultar(); }} hitSlop={10} accessibilityRole="button" style={{ paddingHorizontal: 12, height: 36, justifyContent: 'center' }}>
                <Text style={{ fontFamily: fuentes.fuerte, fontSize: 14.5, color: '#F09A84' }}>Deshacer</Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      ) : null}
    </CtxToast.Provider>
  );
}

// ── Tarjeta de dirección (mismo lenguaje visual en toda la app) ─────────────
export function TarjetaDireccion({
  tipo, titulo, etiqueta, calle, detalle, nota, onPress,
}: {
  tipo: 'origen' | 'destino' | 'escuela'; titulo?: string; etiqueta: string; calle?: string | null; detalle?: string | null; nota?: string | null; onPress?: () => void;
}) {
  const { c } = useTema();
  const tono = tipo === 'origen' ? [c.primarySoft, c.primary, MapPin] : tipo === 'destino' ? [c.accentSoft, c.accentInk, Flag] : [c.successSoft, c.successInk, School];
  const [fondo, tinta, Icono] = tono as [string, string, LucideIcon];
  const encabezado = titulo ?? (tipo === 'origen' ? 'Origen: dónde se recoge' : tipo === 'destino' ? 'Destino: dónde se deja' : 'Escuela');
  const cuerpo = (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: fondo, alignItems: 'center', justifyContent: 'center' }}>
        <Icono size={20} color={tinta} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Texto v="nota" color={tinta} style={{ fontFamily: fuentes.fuerte }}>{encabezado}</Texto>
        <Texto v="fuerte">{etiqueta}</Texto>
        {calle ? <Texto v="medio" color="text2">{calle}</Texto> : null}
        {detalle ? <Texto v="medio" color="text2">{detalle}</Texto> : null}
        {nota ? <Texto v="nota" color="text3" style={{ marginTop: 2 }}>{nota}</Texto> : null}
      </View>
      {onPress ? <ChevronRight size={20} color={c.text3} style={{ marginTop: 10 }} /> : null}
    </View>
  );
  const estilo: ViewStyle = { backgroundColor: c.surface, borderRadius: radio.grande, padding: esp.lg, ...sombra(c, 1) };
  if (!onPress) return <View style={estilo}>{cuerpo}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${encabezado}: ${etiqueta}`} android_ripple={{ color: 'rgba(128,128,128,0.15)' }} style={[estilo, { overflow: 'hidden' }]}>
      {cuerpo}
    </Pressable>
  );
}

// ── Fila de ajuste / de lista ───────────────────────────────────────────────
export function FilaAjuste({
  icono: Icono, titulo, texto, onPress, derecha, peligro, interruptor, onInterruptor, ultima,
}: {
  icono?: LucideIcon; titulo: string; texto?: string; onPress?: () => void; derecha?: React.ReactNode; peligro?: boolean;
  interruptor?: boolean; onInterruptor?: (v: boolean) => void; ultima?: boolean;
}) {
  const { c } = useTema();
  const tieneSwitch = typeof interruptor === 'boolean';
  return (
    <Pressable
      onPress={tieneSwitch ? () => onInterruptor?.(!interruptor) : onPress}
      disabled={!onPress && !tieneSwitch}
      accessibilityRole={tieneSwitch ? 'switch' : onPress ? 'button' : undefined}
      accessibilityState={tieneSwitch ? { checked: interruptor } : undefined}
      accessibilityLabel={titulo}
      accessibilityHint={texto}
      android_ripple={{ color: 'rgba(128,128,128,0.12)' }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 10, borderBottomWidth: ultima ? 0 : 1, borderBottomColor: c.border }}
    >
      {Icono ? (
        <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: peligro ? c.dangerSoft : c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icono size={19} color={peligro ? c.dangerInk : c.primary} strokeWidth={2} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Texto v="fuerte" color={peligro ? 'dangerInk' : 'text'} style={{ fontSize: 15.5 }}>{titulo}</Texto>
        {texto ? <Texto v="nota" color="text2">{texto}</Texto> : null}
      </View>
      {tieneSwitch ? (
        <Switch value={interruptor} onValueChange={onInterruptor} trackColor={{ false: c.border, true: c.primary }} thumbColor="#FFFFFF" importantForAccessibility="no-hide-descendants" />
      ) : derecha ?? (onPress ? <ChevronRight size={20} color={c.text3} /> : null)}
    </Pressable>
  );
}

// Lista de pasos numerados (permisos denegados, primeros pasos).
export function PasosNumerados({ pasos }: { pasos: { texto: string; hecho?: boolean }[] }) {
  const { c } = useTema();
  return (
    <View style={{ gap: 12 }}>
      {pasos.map((p, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: p.hecho ? c.success : c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: fuentes.titulo, fontSize: 14, color: p.hecho ? '#FFFFFF' : c.primary }}>{i + 1}</Text>
          </View>
          <Texto v="cuerpo" color={p.hecho ? 'text3' : 'text'} style={[{ flex: 1 }, p.hecho ? { textDecorationLine: 'line-through' } : null]}>{p.texto}</Texto>
        </View>
      ))}
    </View>
  );
}

// ── Selector de hijo ────────────────────────────────────────────────────────
export interface OpcionHijo { id: string; nombre: string; color?: string | null; foto?: string | null }

export function SelectorHijo({
  hijos, seleccionado, onSeleccionar, incluirTodos = true, sobreHero = true, textoTodos = 'Todos',
}: { hijos: OpcionHijo[]; seleccionado: string | null; onSeleccionar: (id: string | null) => void; incluirTodos?: boolean; sobreHero?: boolean; textoTodos?: string }) {
  const { c } = useTema();
  const enCielo = useEnCielo();
  sobreHero = sobreHero && enCielo;
  if (hijos.length <= 1 && incluirTodos) return null;
  const borde = sobreHero ? c.hero : c.surface;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: margen }} style={{ marginRight: -margen }}>
      {incluirTodos ? (
        <Chip
          texto={textoTodos}
          sobreHero={sobreHero}
          seleccionado={seleccionado === null}
          onPress={() => onSeleccionar(null)}
          izquierda={<AvatarApilado personas={hijos} tam={30} borde={seleccionado === null && sobreHero ? '#FFFFFF' : borde} />}
        />
      ) : null}
      {hijos.map((h) => (
        <Chip
          key={h.id}
          texto={h.nombre}
          sobreHero={sobreHero}
          seleccionado={seleccionado === h.id}
          onPress={() => onSeleccionar(h.id)}
          izquierda={<Avatar nombre={h.nombre} color={h.color} foto={h.foto} tam={32} />}
        />
      ))}
    </ScrollView>
  );
}

const SIN_CONTADORES: Record<string, number> = {};

// Píldora de la pestaña activa: aparece creciendo desde el centro (respuesta al toque, 220 ms).
function PildoraPestana({ activa, color }: { activa: boolean; color: string }) {
  const reducido = useMovimientoReducido();
  const v = useRef(new Animated.Value(activa ? 1 : 0)).current;
  useEffect(() => {
    if (reducido) v.setValue(activa ? 1 : 0);
    else Animated.timing(v, { toValue: activa ? 1 : 0, duration: activa ? 220 : 140, easing: Easing.bezier(0.16, 1, 0.3, 1), useNativeDriver: true }).start();
  }, [activa, reducido, v]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{ position: 'absolute', width: 58, height: 30, borderRadius: 15, backgroundColor: color, opacity: v, transform: [{ scaleX: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }}
    />
  );
}

// ── Barra de pestañas ───────────────────────────────────────────────────────
// Fija abajo, blanca, de lado a lado. La pestaña activa lleva su ícono en una píldora índigo suave.
// `useContadores` es un hook opcional que devuelve la insignia de cada pestaña.
export function crearBarraPestanas(iconos: Record<string, LucideIcon>, useContadores: () => Record<string, number> = () => SIN_CONTADORES) {
  return function BarraPestanas({ state, descriptors, navigation }: BottomTabBarProps) {
    const { c } = useTema();
    const ins = useSafeAreaInsets();
    const cuenta = useContadores();
    return (
      <View
        accessibilityRole="tablist"
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', backgroundColor: c.surface,
          borderTopWidth: 1, borderTopColor: c.border, paddingTop: 8, paddingBottom: Math.max(ins.bottom, 10), paddingHorizontal: 4,
        }}
      >
        {state.routes.map((ruta, i) => {
          const activa = state.index === i;
          const opciones = descriptors[ruta.key].options;
          const titulo = (opciones.title ?? ruta.name) as string;
          const Icono = iconos[ruta.name] ?? Home;
          const n = cuenta[ruta.name] ?? 0;
          const pulsar = () => {
            const e = navigation.emit({ type: 'tabPress', target: ruta.key, canPreventDefault: true });
            if (!activa && !e.defaultPrevented) navigation.navigate(ruta.name);
          };
          return (
            <Pressable
              key={ruta.key}
              onPress={pulsar}
              accessibilityRole="tab"
              accessibilityState={{ selected: activa }}
              accessibilityLabel={n ? `${titulo}, ${n} sin leer` : titulo}
              style={{ flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 4 }}
            >
              <View style={{ width: 58, height: 30, alignItems: 'center', justifyContent: 'center' }}>
                <PildoraPestana activa={activa} color={c.primarySoft} />
                <View style={{ zIndex: 1 }}><Icono size={22} color={activa ? c.primaryStrong : c.text3} strokeWidth={activa ? 2.4 : 2} /></View>
                {n > 0 ? (
                  <View style={{ position: 'absolute', top: -3, right: 10, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: c.danger, borderWidth: 2, borderColor: c.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
                    <Text style={{ fontFamily: fuentes.tituloSuave, fontSize: 10.5, color: '#FFFFFF' }}>{n > 9 ? '9+' : n}</Text>
                  </View>
                ) : null}
              </View>
              <Text maxFontSizeMultiplier={1.15} numberOfLines={1} style={{ fontFamily: activa ? fuentes.fuerte : fuentes.semi, fontSize: 12, color: activa ? c.primaryStrong : c.text3 }}>{titulo}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  };
}

// ── Ícono de aviso por tipo ─────────────────────────────────────────────────
// Cada color dice qué pasó: verde subió o llegó, rojo la alarma de 500 m, naranja el aviso de 1 km,
// azul la salida y la información del recorrido.
export function estiloAviso(a: Pick<Aviso, 'type' | 'channel'>, c: Colores): { fondo: string; tinta: string; icono: LucideIcon } {
  const verde = { fondo: c.successSoft, tinta: c.success };
  const rojo = { fondo: c.dangerSoft, tinta: c.danger };
  const naranja = { fondo: c.warningSoft, tinta: c.warning };
  const azul = { fondo: c.primarySoft, tinta: c.primary };
  switch (a.type) {
    case 'student_boarded': return { ...verde, icono: Bus };
    case 'student_dropped':
    case 'school_arrival':
    case 'trip_finished': return { ...verde, icono: Check };
    case 'guardian_linked':
    case 'substitute_accepted': return { ...verde, icono: UserCheck };
    case 'service_restored': return { ...verde, icono: CircleCheck };
    case 'bus_arriving': return { ...rojo, icono: Bell };
    case 'bus_near': return { ...naranja, icono: Bell };
    case 'deviation': return { ...rojo, icono: AlertTriangle };
    case 'delay': return { ...naranja, icono: AlertTriangle };
    case 'trip_paused': return { ...naranja, icono: CirclePause };
    case 'trip_started':
    case 'trip_resumed': return { ...azul, icono: Route };
    case 'message': return { ...azul, icono: MessageSquare };
    case 'service_cancelled': return { ...rojo, icono: CalendarX };
    default:
      if (a.type.startsWith('absence_')) return { fondo: c.surface2, tinta: c.primary, icono: CalendarX };
      if (a.type.startsWith('substitute_')) return { ...azul, icono: UserCheck };
  }
  const tono = tonoDeAviso(a);
  return tono === 'exito' ? { ...verde, icono: CircleCheck } : tono === 'urgente' ? { ...rojo, icono: Bell } : tono === 'aviso' ? { ...naranja, icono: Bell } : { ...azul, icono: Info };
}

export function IconoAviso({ aviso, tam = 40 }: { aviso: Pick<Aviso, 'type' | 'channel'>; tam?: number }) {
  const { c } = useTema();
  const { fondo, tinta, icono: Icono } = estiloAviso(aviso, c);
  return (
    <View style={{ width: tam, height: tam, borderRadius: 12, backgroundColor: fondo, alignItems: 'center', justifyContent: 'center' }}>
      <Icono size={tam * 0.5} color={tinta} strokeWidth={2.2} />
    </View>
  );
}

// Hora real ("06:58") alineada a la derecha en Manrope con cifras tabulares.
export function HoraReal({ texto, apagada }: { texto: string; apagada?: boolean }) {
  const { c } = useTema();
  return (
    <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: fuentes.titulo, fontSize: 15, color: apagada ? c.text3 : c.text, fontVariant: ['tabular-nums'] }}>{texto}</Text>
  );
}
