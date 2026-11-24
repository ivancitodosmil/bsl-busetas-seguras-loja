// Componentes base de BSL: texto, botones, chips, tarjetas, avatares y campos.
import type { TextInputInstance } from 'react-native';
import React, { forwardRef, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Image, Linking, Platform, Pressable, StyleProp, StyleSheet, Text, TextInput, TextInputProps,
  TextProps, TextStyle, View, ViewStyle,
} from 'react-native';
import { Eye, EyeOff, type LucideIcon } from 'lucide-react-native';
import { Colores, esp, fuentes, radio, sombra, TACTIL, TACTIL_CONDUCCION, tintaDe, useEnCielo, useTema } from '../tema';
import { iniciales } from '../utils';

// ── Texto ───────────────────────────────────────────────────────────────────
const VARIANTES = {
  // Títulos y cifras en Manrope (fuentes.titulo); lectura en Inter.
  display: { fontFamily: fuentes.titulo, fontSize: 32, lineHeight: 36, letterSpacing: -1 },
  titulo: { fontFamily: fuentes.tituloSuave, fontSize: 22, lineHeight: 28, letterSpacing: -0.4 },
  subtitulo: { fontFamily: fuentes.tituloSuave, fontSize: 18, lineHeight: 24, letterSpacing: -0.2 },
  seccion: { fontFamily: fuentes.tituloSuave, fontSize: 17, lineHeight: 22 },
  cuerpo: { fontFamily: fuentes.cuerpo, fontSize: 16, lineHeight: 24 },
  fuerte: { fontFamily: fuentes.semi, fontSize: 16, lineHeight: 22 },
  medio: { fontFamily: fuentes.cuerpo, fontSize: 15, lineHeight: 21 },
  medioFuerte: { fontFamily: fuentes.semi, fontSize: 15, lineHeight: 21 },
  nota: { fontFamily: fuentes.cuerpo, fontSize: 13, lineHeight: 18 },
  cifra: { fontFamily: fuentes.titulo, fontSize: 26, lineHeight: 30, letterSpacing: -0.6, fontVariant: ['tabular-nums'] },
} satisfies Record<string, TextStyle>;

export type VarianteTexto = keyof typeof VARIANTES;

interface TextoProps extends TextProps {
  v?: VarianteTexto;
  color?: keyof Colores | (string & {});
  centro?: boolean;
}

export function Texto({ v = 'cuerpo', color = 'text', centro, style, ...resto }: TextoProps) {
  const { c } = useTema();
  const tono = (c as Record<string, string>)[color] ?? color;
  return (
    <Text
      maxFontSizeMultiplier={1.4}
      {...resto}
      style={[VARIANTES[v] as TextStyle, { color: tono }, centro && { textAlign: 'center' }, style]}
    />
  );
}

// ── Botón ───────────────────────────────────────────────────────────────────
type VarianteBoton = 'primario' | 'acento' | 'secundario' | 'peligro' | 'fantasma' | 'exito';

interface BotonProps {
  titulo: string;
  onPress?: () => void;
  variante?: VarianteBoton;
  tamano?: 'normal' | 'conduccion' | 'compacto';
  icono?: LucideIcon;
  cargando?: boolean;
  deshabilitado?: boolean;
  estilo?: StyleProp<ViewStyle>;
  ancho?: boolean; // ocupa todo el ancho (por defecto sí, salvo compacto)
  etiqueta?: string;
  colores?: { fondo: string; tinta: string; borde?: string }; // para fondos especiales (pantalla de alarma)
}

export function Boton({
  titulo, onPress, variante = 'primario', tamano = 'normal', icono: Icono, cargando, deshabilitado, estilo, ancho, etiqueta, colores,
}: BotonProps) {
  const { c, oscuro } = useTema();
  const pal: Record<VarianteBoton, { fondo: string; tinta: string; borde?: string }> = {
    primario: { fondo: c.primary, tinta: c.onPrimary },
    acento: { fondo: c.accent, tinta: c.onAccent }, // acción principal en ámbar, como en el Figma
    exito: { fondo: c.success, tinta: oscuro ? '#0E1328' : '#FFFFFF' },
    secundario: { fondo: c.surface2, tinta: c.text },
    peligro: { fondo: c.dangerSoft, tinta: c.dangerInk },
    fantasma: { fondo: 'transparent', tinta: c.primary },
  };
  const p = colores ?? pal[variante];
  const alto = tamano === 'conduccion' ? TACTIL_CONDUCCION + 4 : tamano === 'compacto' ? 40 : 56;
  const inactivo = deshabilitado || cargando;
  const lleno = ancho ?? tamano !== 'compacto';
  return (
    <Pressable
      onPress={inactivo ? undefined : onPress}
      disabled={inactivo}
      accessibilityRole="button"
      accessibilityLabel={etiqueta ?? titulo}
      accessibilityState={{ disabled: !!inactivo, busy: !!cargando }}
      android_ripple={{ color: 'rgba(0,0,0,0.12)' }}
      hitSlop={tamano === 'compacto' ? 6 : 0}
      style={({ pressed }) => [
        {
          height: alto,
          borderRadius: tamano === 'compacto' ? radio.pill : radio.grande,
          backgroundColor: p.fondo,
          borderWidth: p.borde ? 1 : 0,
          borderColor: p.borde,
          paddingHorizontal: tamano === 'compacto' ? 16 : 20,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          overflow: 'hidden',
          alignSelf: lleno ? 'stretch' : 'flex-start',
          opacity: deshabilitado ? 0.45 : 1,
          transform: [{ scale: pressed && !inactivo ? 0.98 : 1 }],
        },
        estilo,
      ]}
    >
      {cargando ? (
        <ActivityIndicator color={p.tinta} />
      ) : (
        <>
          {Icono ? <Icono size={tamano === 'compacto' ? 17 : 20} color={p.tinta} strokeWidth={2.2} /> : null}
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.3}
            style={{
              fontFamily: fuentes.semi,
              fontSize: tamano === 'conduccion' ? 18 : tamano === 'compacto' ? 14 : 16,
              color: p.tinta,
            }}
          >
            {titulo}
          </Text>
        </>
      )}
    </Pressable>
  );
}

// Botón redondo solo con ícono (siempre con etiqueta accesible).
export function BotonIcono({
  icono: Icono, onPress, etiqueta, sobreHero, contador, tam = 44, color,
}: {
  icono: LucideIcon; onPress?: () => void; etiqueta: string; sobreHero?: boolean; contador?: number; tam?: number; color?: string;
}) {
  const { c } = useTema();
  // "sobreHero" solo aplica dentro de la franja de cielo; en encabezados claros es un botón normal.
  const enCielo = useEnCielo();
  sobreHero = !!sobreHero && enCielo;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={contador ? `${etiqueta}, ${contador} sin leer` : etiqueta}
      hitSlop={6}
      android_ripple={{ color: 'rgba(128,128,128,0.25)', borderless: true, radius: tam / 2 }}
      style={({ pressed }) => ({
        width: tam, height: tam, borderRadius: tam / 2, alignItems: 'center', justifyContent: 'center',
        backgroundColor: sobreHero ? c.heroChip : c.surface2,
        opacity: pressed && Platform.OS === 'ios' ? 0.7 : 1,
      })}
    >
      <Icono size={21} color={color ?? (sobreHero ? c.onHero : c.text)} strokeWidth={2} />
      {contador ? (
        <View style={[st.contador, { backgroundColor: sobreHero ? c.accent : c.danger, borderColor: sobreHero ? c.hero : c.bg }]}>
          <Text allowFontScaling={false} style={[st.contadorTexto, sobreHero ? { color: c.onAccent, fontFamily: fuentes.titulo } : null]}>{contador > 9 ? '9+' : contador}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

// ── Chip ────────────────────────────────────────────────────────────────────
export function Chip({
  texto, seleccionado, onPress, color, icono: Icono, sobreHero, izquierda, deshabilitado,
}: {
  texto: string; seleccionado?: boolean; onPress?: () => void; color?: string; icono?: LucideIcon;
  sobreHero?: boolean; izquierda?: React.ReactNode; deshabilitado?: boolean;
}) {
  const { c } = useTema();
  const enCielo = useEnCielo();
  sobreHero = !!sobreHero && enCielo;
  const fondo = sobreHero
    ? seleccionado ? '#FFFFFF' : c.heroChip
    : seleccionado ? (color ?? c.primary) : c.surface;
  const tinta = sobreHero
    ? seleccionado ? '#123A68' : '#FFFFFF'
    : seleccionado ? (color ? '#FFFFFF' : c.onPrimary) : c.text;
  const borde = sobreHero ? (seleccionado ? '#FFFFFF' : 'transparent') : seleccionado ? fondo : c.border;
  return (
    <Pressable
      onPress={deshabilitado ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!seleccionado, disabled: !!deshabilitado }}
      hitSlop={{ top: 4, bottom: 4 }}
      style={({ pressed }) => ({
        minHeight: 44, borderRadius: radio.pill, borderWidth: 1.5, borderColor: borde, backgroundColor: fondo,
        paddingLeft: izquierda ? 5 : 14, paddingRight: 14, flexDirection: 'row', alignItems: 'center', gap: 7,
        opacity: deshabilitado ? 0.4 : pressed ? 0.8 : 1,
      })}
    >
      {izquierda}
      {Icono ? <Icono size={16} color={tinta} strokeWidth={2.2} /> : null}
      <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: fuentes.semi, fontSize: 14, color: tinta }}>{texto}</Text>
    </Pressable>
  );
}

// Etiqueta pequeña de escuela con su color.
export function ChipEscuela({ nombre, color }: { nombre: string | null | undefined; color?: string | null }) {
  const { c } = useTema();
  if (!nombre) return null;
  const { fondo, tinta } = tintaDe(color, c);
  return (
    <View style={{ backgroundColor: fondo, borderRadius: radio.pill, paddingHorizontal: 8, height: 22, justifyContent: 'center', alignSelf: 'flex-start' }}>
      <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={{ fontFamily: fuentes.semi, fontSize: 12, color: tinta }}>{nombre}</Text>
    </View>
  );
}

// ── Pill de estado ──────────────────────────────────────────────────────────
export type Estado =
  | 'programado' | 'en_curso' | 'en_pausa' | 'finalizado' | 'cancelado' | 'vinculado' | 'pendiente'
  | 'expirado' | 'verificado' | 'en_revision' | 'rechazado' | 'pagado' | 'ausente' | 'sin_servicio';

const TEXTO_ESTADO: Record<Estado, string> = {
  programado: 'Programado', en_curso: 'En curso', en_pausa: 'En pausa', finalizado: 'Finalizado', cancelado: 'Cancelado',
  vinculado: 'Vinculado', pendiente: 'Pendiente', expirado: 'Expirado', verificado: 'Verificado',
  en_revision: 'En revisión', rechazado: 'Rechazado', pagado: 'Pagado', ausente: 'No va hoy', sin_servicio: 'Hoy no pasa',
};

export function PillEstado({ estado, texto }: { estado: Estado; texto?: string }) {
  const { c } = useTema();
  const tono: Record<Estado, [string, string]> = {
    programado: [c.surface2, c.text2],
    en_curso: [c.accentSoft, c.accentInk],
    en_pausa: [c.warningSoft, c.warningInk],
    finalizado: [c.successSoft, c.successInk],
    cancelado: [c.dangerSoft, c.dangerInk],
    vinculado: [c.successSoft, c.successInk],
    pendiente: [c.warningSoft, c.warningInk],
    expirado: [c.dangerSoft, c.dangerInk],
    verificado: [c.successSoft, c.successInk],
    en_revision: [c.warningSoft, c.warningInk],
    rechazado: [c.dangerSoft, c.dangerInk],
    pagado: [c.successSoft, c.successInk],
    ausente: [c.surface2, c.text2],
    sin_servicio: [c.surface2, c.text2],
  };
  const [fondo, tinta] = tono[estado];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingHorizontal: 10, borderRadius: radio.pill, backgroundColor: fondo, alignSelf: 'flex-start' }}>
      {estado === 'en_curso' ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent }} /> : null}
      <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fuentes.tituloSuave, fontSize: 12.5, color: tinta }}>{texto ?? TEXTO_ESTADO[estado]}</Text>
    </View>
  );
}

// ── Tarjeta ─────────────────────────────────────────────────────────────────
export function Tarjeta({
  children, onPress, estilo, elevacion = 1, etiqueta, plano,
}: {
  children: React.ReactNode; onPress?: () => void; estilo?: StyleProp<ViewStyle>; elevacion?: 1 | 2; etiqueta?: string; plano?: boolean;
}) {
  const { c } = useTema();
  const base: ViewStyle = {
    backgroundColor: plano ? c.surface2 : c.surface,
    borderRadius: radio.grande,
    padding: esp.lg,
    ...(plano ? {} : sombra(c, elevacion)),
  };
  if (!onPress) return <View style={[base, estilo]}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      android_ripple={{ color: 'rgba(128,128,128,0.15)' }}
      style={({ pressed }) => [base, { overflow: Platform.OS === 'android' ? 'hidden' : 'visible', opacity: pressed && Platform.OS === 'ios' ? 0.9 : 1 }, estilo]}
    >
      {children}
    </Pressable>
  );
}

// ── Avatar ──────────────────────────────────────────────────────────────────
export function Avatar({
  nombre, foto, tam = 40, color, anillo,
}: { nombre?: string | null; foto?: string | null; tam?: number; color?: string | null; anillo?: string }) {
  const { c } = useTema();
  const borde = anillo ? { borderWidth: 2.5, borderColor: anillo } : null;
  if (foto) {
    return <Image source={{ uri: foto }} accessibilityIgnoresInvertColors style={[{ width: tam, height: tam, borderRadius: tam / 2, backgroundColor: c.surface2 }, borde]} />;
  }
  return (
    <View style={[{ width: tam, height: tam, borderRadius: tam / 2, backgroundColor: color ?? c.primary, alignItems: 'center', justifyContent: 'center' }, borde]}>
      <Text allowFontScaling={false} style={{ fontFamily: fuentes.tituloSuave, fontSize: tam * 0.4, color: '#FFFFFF' }}>{iniciales(nombre)}</Text>
    </View>
  );
}

export function AvatarApilado({
  personas, tam = 34, borde,
}: { personas: { nombre: string; color?: string | null; foto?: string | null }[]; tam?: number; borde?: string }) {
  const { c } = useTema();
  const visibles = personas.slice(0, 3);
  return (
    <View style={{ flexDirection: 'row' }} accessibilityLabel={personas.map((p) => p.nombre).join(', ')}>
      {visibles.map((p, i) => (
        <View key={i} style={{ marginLeft: i === 0 ? 0 : -tam * 0.32, borderRadius: tam, borderWidth: 2, borderColor: borde ?? c.surface }}>
          <Avatar nombre={p.nombre} color={p.color} foto={p.foto} tam={tam} />
        </View>
      ))}
      {personas.length > 3 ? (
        <View style={{ marginLeft: -tam * 0.32, width: tam + 4, height: tam + 4, borderRadius: tam, backgroundColor: c.surface2, borderWidth: 2, borderColor: borde ?? c.surface, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: fuentes.semi, fontSize: 12, color: c.text2 }}>+{personas.length - 3}</Text>
        </View>
      ) : null}
    </View>
  );
}

// ── Campo de texto ──────────────────────────────────────────────────────────
interface CampoProps extends TextInputProps {
  etiqueta: string;
  ayuda?: string;
  error?: string | null;
  prefijo?: string;
  secreto?: boolean;
  derecha?: React.ReactNode;
  icono?: LucideIcon; // ícono al inicio del campo
}

// Campo relleno: fondo tonal en reposo; al enfocar se vuelve blanco con borde índigo.
export const CampoTexto = forwardRef<TextInputInstance, CampoProps>(function CampoTexto(
  { etiqueta, ayuda, error, prefijo, secreto, derecha, icono: Icono, style, onFocus, onBlur, editable = true, multiline, ...resto }, ref,
) {
  const { c } = useTema();
  const [foco, setFoco] = useState(false);
  const [visible, setVisible] = useState(false);
  const borde = error ? c.danger : foco ? c.primary : c.border;
  return (
    <View style={{ gap: 6 }}>
      <Texto v="medioFuerte" color="text2">{etiqueta}</Texto>
      <View
        style={{
          minHeight: 52, borderRadius: radio.campo, borderWidth: foco || error ? 2 : 1, borderColor: borde,
          backgroundColor: !editable ? c.surface2 : c.surface, flexDirection: 'row', alignItems: multiline ? 'flex-start' : 'center',
          paddingHorizontal: foco || error ? 13 : 14, gap: 10,
        }}
      >
        {Icono ? <Icono size={20} color={foco ? c.primary : c.text3} strokeWidth={2} /> : null}
        {prefijo ? <Text style={{ fontFamily: fuentes.semi, fontSize: 16, color: c.text2 }}>{prefijo}</Text> : null}
        <TextInput
          ref={ref}
          {...resto}
          editable={editable}
          multiline={multiline}
          secureTextEntry={secreto && !visible}
          placeholderTextColor={c.text3}
          selectionColor={c.primary}
          cursorColor={c.primary}
          accessibilityLabel={etiqueta}
          accessibilityHint={error ?? ayuda}
          onFocus={(e) => { setFoco(true); onFocus?.(e); }}
          onBlur={(e) => { setFoco(false); onBlur?.(e); }}
          style={[
            { flex: 1, fontFamily: fuentes.cuerpo, fontSize: 16, color: c.text, paddingVertical: multiline ? 12 : 0, minHeight: multiline ? 88 : 48, textAlignVertical: multiline ? 'top' : 'center' },
            style,
          ]}
        />
        {secreto ? (
          <Pressable onPress={() => setVisible((v) => !v)} hitSlop={12} accessibilityRole="button" accessibilityLabel={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
            {visible ? <EyeOff size={20} color={c.text2} /> : <Eye size={20} color={c.text2} />}
          </Pressable>
        ) : derecha}
      </View>
      {error ? (
        <Texto v="nota" color="dangerInk" accessibilityLiveRegion="polite">{error}</Texto>
      ) : ayuda ? (
        <Texto v="nota" color="text3">{ayuda}</Texto>
      ) : null}
    </View>
  );
});

// Seis casillas para el código SMS (un solo TextInput oculto: admite pegar y autocompletar).
export function CampoCodigo({
  valor, onChange, largo = 6, error, autoFocus = true,
}: { valor: string; onChange: (v: string) => void; largo?: number; error?: boolean; autoFocus?: boolean }) {
  const { c } = useTema();
  const ref = useRef<TextInputInstance>(null);
  const casillas = useMemo(() => Array.from({ length: largo }, (_, i) => i), [largo]);
  return (
    <Pressable onPress={() => ref.current?.focus()} accessibilityLabel={`Código de ${largo} dígitos`}>
      <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'space-between' }}>
        {casillas.map((i) => {
          const activo = i === Math.min(valor.length, largo - 1);
          return (
            <View
              key={i}
              style={{
                flex: 1, height: 60, borderRadius: radio.campo, backgroundColor: activo ? c.surface : c.surface2, alignItems: 'center', justifyContent: 'center',
                borderWidth: 2, borderColor: error ? c.danger : activo ? c.primary : 'transparent',
              }}
            >
              <Text style={{ fontFamily: fuentes.titulo, fontSize: 24, color: c.text, fontVariant: ['tabular-nums'] }}>{valor[i] ?? ''}</Text>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={ref}
        value={valor}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, largo))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        autoFocus={autoFocus}
        maxLength={largo}
        caretHidden
        style={{ position: 'absolute', opacity: 0.01, height: 60, width: '100%' }}
      />
    </Pressable>
  );
}

// Control segmentado (2 a 4 opciones).
export function Segmentado<T extends string>({
  opciones, valor, onChange, sobreHero,
}: { opciones: { valor: T; texto: string; nota?: string }[]; valor: T; onChange: (v: T) => void; sobreHero?: boolean }) {
  const { c } = useTema();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: sobreHero ? c.heroChip : c.surface2, borderRadius: radio.tarjeta, padding: 4, gap: 4 }}>
      {opciones.map((o) => {
        const sel = o.valor === valor;
        return (
          <Pressable
            key={o.valor}
            onPress={() => onChange(o.valor)}
            accessibilityRole="tab"
            accessibilityState={{ selected: sel }}
            style={{
              flex: 1, minHeight: o.nota ? 56 : 44, borderRadius: radio.campo, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
              backgroundColor: sel ? (sobreHero ? '#FFFFFF' : c.surface) : 'transparent',
              ...(sel && !sobreHero ? sombra(c, 1) : {}),
            }}
          >
            <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: sel ? fuentes.fuerte : fuentes.semi, fontSize: 14.5, color: sel ? (sobreHero ? '#123A68' : c.primary) : sobreHero ? '#FFFFFF' : c.text2 }}>{o.texto}</Text>
            {o.nota ? <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fuentes.cuerpo, fontSize: 12, color: sel ? (sobreHero ? '#48596F' : c.text2) : sobreHero ? c.onHero2 : c.text3 }}>{o.nota}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

// Encabezado de sección con acción opcional a la derecha.
export function TituloSeccion({ titulo, accion, onAccion, estilo }: { titulo: string; accion?: string; onAccion?: () => void; estilo?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 }, estilo]}>
      <Texto v="seccion" accessibilityRole="header">{titulo}</Texto>
      {accion ? (
        <Pressable onPress={onAccion} hitSlop={12} accessibilityRole="button">
          <Texto v="medioFuerte" color="primary">{accion}</Texto>
        </Pressable>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  contador: { position: 'absolute', top: -3, right: -3, minWidth: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  contadorTexto: { fontFamily: fuentes.tituloSuave, fontSize: 11, color: '#FFFFFF' },
});

// "Contáctanos": abre el sitio de Predir, la empresa que desarrolla BSL.
export function CreditoPredir({ estilo }: { estilo?: StyleProp<ViewStyle> }) {
  const { c } = useTema();
  return (
    <Pressable
      onPress={() => Linking.openURL('https://www.predirsoft.com/').catch(() => {})}
      accessibilityRole="link"
      accessibilityLabel="Contáctanos. Abre el sitio de Predir"
      hitSlop={8}
      style={({ pressed }) => [{ minHeight: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 }, estilo]}
    >
      <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: fuentes.cuerpo, fontSize: 14, color: c.text2 }}>
        ¿Necesitas ayuda? <Text style={{ fontFamily: fuentes.semi, color: c.primary }}>Contáctanos</Text>
      </Text>
    </Pressable>
  );
}
