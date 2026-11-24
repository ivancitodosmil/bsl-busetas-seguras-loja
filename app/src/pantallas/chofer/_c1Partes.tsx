// Piezas compartidas por las pantallas del chofer (inicio, rutas, pagos, historial).
import React, { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { LucideIcon } from 'lucide-react-native';
import { Chip, Texto } from '../../ui';
import { margen, useTema } from '../../tema';
import { fechaCorta, hoyISO, sumarDias } from '../../utils';

/** Carga datos al enfocar la pantalla, con estados de cargando, error y refresco manual. */
export function useCarga<T>(pedirDatos: () => Promise<T>) {
  const [datos, setDatos] = useState<T | null>(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const fn = useRef(pedirDatos);
  fn.current = pedirDatos;
  const vivo = useRef(true);

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

  useFocusEffect(
    useCallback(() => {
      vivo.current = true;
      recargar();
      return () => {
        vivo.current = false;
      };
    }, [recargar]),
  );

  return { datos, setDatos, cargando, refrescando, error, recargar, refrescar: () => recargar(true) };
}

/** Opciones de fecha: hoy, mañana y pasado mañana. */
export function opcionesFecha(): { iso: string; texto: string }[] {
  const hoy = hoyISO();
  return [
    { iso: hoy, texto: 'Hoy' },
    { iso: sumarDias(hoy, 1), texto: `Mañana, ${fechaCorta(sumarDias(hoy, 1)).toLowerCase()}` },
    { iso: sumarDias(hoy, 2), texto: fechaCorta(sumarDias(hoy, 2)) },
  ];
}

/** Fila horizontal de chips de selección única. */
export function ChipsUnicos<T extends string>({
  opciones, valor, onChange,
}: { opciones: { valor: T; texto: string }[]; valor: T; onChange: (v: T) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: margen }} style={{ marginRight: -margen }}>
      {opciones.map((o) => (
        <Chip key={o.valor} texto={o.texto} seleccionado={o.valor === valor} onPress={() => onChange(o.valor)} />
      ))}
    </ScrollView>
  );
}

/** Acceso rápido: ícono sobre fondo suave y etiqueta debajo. */
export function Acceso({ icono: Icono, texto, onPress }: { icono: LucideIcon; texto: string; onPress: () => void }) {
  const { c } = useTema();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={texto}
      android_ripple={{ color: 'rgba(128,128,128,0.15)' }}
      style={({ pressed }) => ({ flex: 1, minHeight: 72, alignItems: 'center', justifyContent: 'center', gap: 6, opacity: pressed ? 0.75 : 1 })}
    >
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icono size={20} color={c.primary} strokeWidth={2} />
      </View>
      <Texto v="nota" color="text" style={{ textAlign: 'center' }} numberOfLines={1}>{texto}</Texto>
    </Pressable>
  );
}

/** Primer día del mes (AAAA-MM-01) desplazado n meses desde una fecha ISO. */
export function mesISO(base: string, desplazar = 0): string {
  const a = Number(base.slice(0, 4));
  const m = Number(base.slice(5, 7)) - 1 + desplazar;
  const d = new Date(Date.UTC(a, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}
/** Último día del mes de un AAAA-MM-01. */
export function finDeMes(primero: string): string {
  return sumarDias(mesISO(primero, 1), -1);
}
