// Sistema de diseño BSL 2.0, tomado del Figma "BSL 2.0, Diseño completo": azul #1B4D89 de marca,
// ámbar #F5A524 para la acción principal y la buseta, azul marino #123A68 en las cabeceras.
// La app arranca en modo claro aunque el teléfono esté en oscuro; el oscuro se elige en Perfil.
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform, useColorScheme, ViewStyle } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const claro = {
  bg: '#F3F6FA', // gris azulado del Figma BSL 2.0
  surface: '#FFFFFF',
  surface2: '#EAF0F7',
  border: '#DCE3EC',
  text: '#0F1B2D',
  text2: '#3A4A60',
  text3: '#5A6A80',
  primary: '#1B4D89', // azul de marca: enlaces, pestaña activa, confirmar
  primaryStrong: '#123A68', // azul marino de las cabeceras
  primarySoft: '#E3ECF8',
  onPrimary: '#FFFFFF',
  accent: '#F5A524', // ámbar: acción principal, "en curso" y la buseta
  accentInk: '#8A5500',
  accentSoft: '#FFF0D3',
  onAccent: '#0F1B2D',
  success: '#1E9E62', // subió, llegó, verificado
  successInk: '#14784A',
  successSoft: '#E2F4EA',
  warning: '#E07A10', // pausa, pendiente
  warningInk: '#A84F08',
  warningSoft: '#FDEEDC',
  danger: '#C53A3A', // alarma de 500 m, eliminar
  dangerInk: '#B42F2F',
  dangerSoft: '#FBE3E3',
  hero: '#123A68',
  onHero: '#FFFFFF',
  onHero2: '#C9D8EC',
  heroChip: 'rgba(255,255,255,0.16)',
  heroLine: 'rgba(255,255,255,0.28)',
  scrim: 'rgba(15,27,45,0.5)',
  mapWater: '#D6E4F2',
  shadow: '#123A68', // sombras teñidas de azul marino
};

const oscuro: typeof claro = {
  bg: '#0B1220',
  surface: '#131C2E',
  surface2: '#1A2539',
  border: '#24304A',
  text: '#EEF3FA',
  text2: '#B9C6D8',
  text3: '#93A3B8',
  primary: '#6EA8F0',
  primaryStrong: '#9CC4F5',
  primarySoft: '#172A47',
  onPrimary: '#0B1220',
  accent: '#F5A524',
  accentInk: '#F5B94F',
  accentSoft: '#3A2A0C',
  onAccent: '#0F1B2D',
  success: '#3DBE84',
  successInk: '#6BD3A2',
  successSoft: '#11301F',
  warning: '#F0952F',
  warningInk: '#F5B26B',
  warningSoft: '#3A260C',
  danger: '#E46161',
  dangerInk: '#F08F8F',
  dangerSoft: '#3B1717',
  hero: '#131C2E',
  onHero: '#FFFFFF',
  onHero2: '#B9C6D8',
  heroChip: 'rgba(255,255,255,0.10)',
  heroLine: 'rgba(255,255,255,0.18)',
  scrim: 'rgba(0,0,0,0.65)',
  mapWater: '#16283F',
  shadow: '#000000',
};

export type Colores = typeof claro;

// Una sola familia: Figtree carga títulos, cuerpo, etiquetas y cifras.
// Manrope para títulos y cifras; Inter para la lectura.
export const fuentes = {
  titulo: 'Manrope_800ExtraBold', // títulos y cifras (Figma BSL 2.0)
  tituloSuave: 'Manrope_700Bold',
  cuerpo: 'Inter_400Regular',
  medio: 'Inter_500Medium',
  semi: 'Inter_600SemiBold',
  fuerte: 'Inter_600SemiBold',
} as const;

// Espaciado en base 4 y radios del sistema.
export const esp = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const radio = { campo: 10, tarjeta: 14, grande: 14, hoja: 20, pill: 999 } as const;
export const margen = 20; // margen lateral de pantalla
export const TACTIL = 48; // área táctil mínima
export const TACTIL_CONDUCCION = 56; // en pantallas de conducción

// Paleta para escuelas y rutas (cada una con tinta legible sobre su fondo suave).
export const PALETA = ['#14A3A0', '#7B5CE0', '#1B4D89', '#E07A10', '#C2417A', '#1E9E62'] as const;

export function tintaDe(color: string | null | undefined, c: Colores): { fondo: string; tinta: string } {
  const base = color || c.primary;
  return { fondo: base + '26', tinta: c === oscuroRef ? aclarar(base) : oscurecer(base) };
}

function canal(hex: string, i: number) {
  return parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
}
function mezclar(hex: string, hacia: number, cuanto: number) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const p = [0, 1, 2].map((i) => Math.round(canal(hex, i) + (hacia - canal(hex, i)) * cuanto));
  return '#' + p.map((n) => n.toString(16).padStart(2, '0')).join('');
}
export const oscurecer = (hex: string) => mezclar(hex, 0, 0.35);
export const aclarar = (hex: string) => mezclar(hex, 255, 0.45);
const oscuroRef = oscuro;

// Elevación: borde fino para lo plano (nivel 1) y sombra suave índigo para lo que flota (nivel 2).
// Nunca las dos a la vez.
export function sombra(c: Colores, nivel: 1 | 2 = 1): ViewStyle {
  if (c === oscuro || nivel === 1) return { borderWidth: 1, borderColor: c.border };
  return Platform.select<ViewStyle>({
    android: { elevation: 3, shadowColor: c.shadow },
    default: { shadowColor: c.shadow, shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  })!;
}

export type ModoTema = 'sistema' | 'claro' | 'oscuro';

interface Tema {
  c: Colores;
  oscuro: boolean;
  modo: ModoTema;
  setModo: (m: ModoTema) => void;
}

const Ctx = createContext<Tema>({ c: claro, oscuro: false, modo: 'sistema', setModo: () => {} });
const CLAVE = 'bsl_modo_tema_v2'; // v2: el claro es el predeterminado (antes seguía al sistema)

export function ProveedorTema({ children }: { children: React.ReactNode }) {
  const sistema = useColorScheme();
  const [modo, setModoEstado] = useState<ModoTema>('claro');

  useEffect(() => {
    AsyncStorage.getItem(CLAVE)
      .then((v) => {
        if (v === 'claro' || v === 'oscuro' || v === 'sistema') setModoEstado(v);
      })
      .catch(() => {});
  }, []);

  const valor = useMemo<Tema>(() => {
    const esOscuro = modo === 'oscuro' || (modo === 'sistema' && sistema === 'dark');
    return {
      c: esOscuro ? oscuro : claro,
      oscuro: esOscuro,
      modo,
      setModo: (m) => {
        setModoEstado(m);
        AsyncStorage.setItem(CLAVE, m).catch(() => {});
      },
    };
  }, [modo, sistema]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export const useTema = () => useContext(Ctx);

// Sobre fondos de color (tarjeta azul de llegada, barra del recorrido) los controles usan su versión clara.
const CtxCielo = createContext(false);
export const EnCielo = ({ children }: { children: React.ReactNode }) => <CtxCielo.Provider value>{children}</CtxCielo.Provider>;
export const useEnCielo = () => useContext(CtxCielo);
