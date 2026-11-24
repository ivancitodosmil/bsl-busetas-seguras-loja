// Auxiliares de las pantallas de estudiantes, escuelas y cuenta del chofer.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Check } from 'lucide-react-native';
import { Chip, HojaInferior, Texto } from '../../ui';
import { fuentes, radio, useTema } from '../../tema';
import { fotoEstudiante } from '../../servicios/fotos';
import type { Direccion } from '../../tipos';

/** Carga datos al enfocar la pantalla; conserva lo anterior mientras refresca. */
export function useCarga<T>(pedirDatos: () => Promise<T>, deps: unknown[] = []) {
  const [datos, setDatos] = useState<T | null>(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const vivo = useRef(true);
  const fn = useRef(pedirDatos);
  fn.current = pedirDatos;

  const recargar = useCallback(async (manual = false) => {
    if (manual) setRefrescando(true);
    try {
      const d = await fn.current();
      if (!vivo.current) return;
      setDatos(d);
      setError(null);
    } catch (e) {
      if (vivo.current) setError(e);
    } finally {
      if (vivo.current) {
        setCargando(false);
        setRefrescando(false);
      }
    }
  }, []);

  useEffect(() => {
    vivo.current = true;
    return () => { vivo.current = false; };
  }, []);

  useFocusEffect(
    useCallback(() => {
      recargar();
    }, deps), // eslint-disable-line react-hooks/exhaustive-deps
  );

  return { datos, cargando, refrescando, error, recargar, refrescar: () => recargar(true) };
}

/** URL firmada de la foto de un estudiante (null mientras carga o si no tiene). */
export function useFotoEstudiante(ruta: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    setUrl(null);
    if (ruta) fotoEstudiante(ruta).then((u) => { if (vivo) setUrl(u); }).catch(() => {});
    return () => { vivo = false; };
  }, [ruta]);
  return url;
}

export const PARENTESCOS = ['Mamá', 'Papá', 'Abuela', 'Abuelo', 'Otro'] as const;

export function ChipsParentesco({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <Texto v="medioFuerte" color="text2">Parentesco</Texto>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {PARENTESCOS.map((p) => (
          <Chip key={p} texto={p} seleccionado={valor === p} onPress={() => onChange(p)} />
        ))}
      </View>
    </View>
  );
}

/** "Av. Universitaria y Mercadillo, Casa 14-22" */
export function calleDe(d: Pick<Direccion, 'main_street' | 'cross_street' | 'house_number'> | null | undefined): string | null {
  if (!d) return null;
  let t = d.main_street || '';
  if (d.cross_street) t += ` y ${d.cross_street}`;
  if (d.house_number) t += `, Casa ${d.house_number}`;
  return t.trim() || null;
}
/** "La Argelia · Portón negro" */
export function detalleDe(d: Pick<Direccion, 'neighborhood' | 'reference'> | null | undefined): string | null {
  if (!d) return null;
  return [d.neighborhood, d.reference].filter(Boolean).join(', ') || null;
}

// ── Selector de hora (pasos de 5 minutos) ──
const p2 = (n: number) => String(n).padStart(2, '0');

export function SelectorHora({
  visible, titulo, valor, onCerrar, onElegir, horas,
}: { visible: boolean; titulo: string; valor: string; onCerrar: () => void; onElegir: (hhmm: string) => void; horas?: number[] }) {
  const { c } = useTema();
  const [h, setH] = useState(Number(valor.slice(0, 2)) || 7);
  const [m, setM] = useState(Number(valor.slice(3, 5)) || 0);
  useEffect(() => {
    if (visible) {
      setH(Number(valor.slice(0, 2)) || 0);
      setM(Math.round((Number(valor.slice(3, 5)) || 0) / 5) * 5 % 60);
    }
  }, [visible, valor]);
  const listaHoras = horas ?? Array.from({ length: 19 }, (_, i) => i + 4); // 04 a 22
  const casilla = (texto: string, sel: boolean, pulsar: () => void, etiqueta: string) => (
    <Pressable
      key={etiqueta}
      onPress={pulsar}
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      accessibilityState={{ selected: sel }}
      style={{
        width: 56, height: 48, borderRadius: radio.campo, alignItems: 'center', justifyContent: 'center',
        backgroundColor: sel ? c.primary : c.surface2,
      }}
    >
      <Texto v="fuerte" color={sel ? 'onPrimary' : 'text'} style={{ fontFamily: fuentes.tituloSuave }}>{texto}</Texto>
    </Pressable>
  );
  return (
    <HojaInferior
      visible={visible}
      onCerrar={onCerrar}
      titulo={titulo}
      texto={`Elegida: ${p2(h)}:${p2(m)}`}
      pie={
        <Pressable
          onPress={() => { onElegir(`${p2(h)}:${p2(m)}`); onCerrar(); }}
          accessibilityRole="button"
          style={{ height: 52, borderRadius: radio.tarjeta, backgroundColor: c.primary, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }}
        >
          <Check size={20} color={c.onPrimary} strokeWidth={2.2} />
          <Texto v="fuerte" color="onPrimary" style={{ fontFamily: fuentes.tituloSuave }}>Usar {p2(h)}:{p2(m)}</Texto>
        </Pressable>
      }
    >
      <Texto v="medioFuerte" color="text2">Hora</Texto>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {listaHoras.map((x) => casilla(p2(x), x === h, () => setH(x), `${x} horas`))}
      </View>
      <Texto v="medioFuerte" color="text2" style={{ marginTop: 4 }}>Minutos</Texto>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {Array.from({ length: 12 }, (_, i) => i * 5).map((x) => casilla(p2(x), x === m, () => setM(x), `${x} minutos`))}
      </View>
    </HojaInferior>
  );
}
