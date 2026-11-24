// Selector de rol deslizable: "Representante" o "Chofer". Una palabra por lado; el texto se achica antes de salirse.
// Se toca una opción o se arrastra la píldora blanca de un lado al otro.
// El estado final se fija al soltar, aunque la animación se interrumpa.
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, PanResponder, Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import { BusFront, Users, type LucideIcon } from 'lucide-react-native';
import { fuentes, useEnCielo, useTema } from '../tema';

export type RolIngreso = 'guardian' | 'driver';

const OPCIONES: { valor: RolIngreso; texto: string; icono: LucideIcon }[] = [
  { valor: 'guardian', texto: 'Representante', icono: Users },
  { valor: 'driver', texto: 'Chofer', icono: BusFront },
];

const ALTO = 52;
const BORDE = 4;

export function SelectorRol({ valor, onChange }: { valor: RolIngreso; onChange: (r: RolIngreso) => void }) {
  const { c } = useTema();
  const enCielo = useEnCielo();
  const [ancho, setAncho] = useState(0);
  const mitad = Math.max(0, (ancho - BORDE * 2) / 2);
  const x = useRef(new Animated.Value(0)).current;
  const inicio = useRef(0);
  const reducido = useRef(false);
  const indice = valor === 'driver' ? 1 : 0;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((r) => { reducido.current = r; }).catch(() => {});
  }, []);

  const irA = (i: number) => {
    x.stopAnimation();
    if (reducido.current) x.setValue(i * mitad);
    else Animated.spring(x, { toValue: i * mitad, useNativeDriver: true, damping: 20, stiffness: 260, mass: 0.8 }).start();
  };

  // Cuando cambia el valor o el ancho, la píldora va a su lugar.
  useEffect(() => {
    if (mitad > 0) irA(indice);
  }, [indice, mitad]); // eslint-disable-line react-hooks/exhaustive-deps

  const elegir = (i: number) => {
    irA(i);
    const nuevo = OPCIONES[i].valor;
    if (nuevo !== valor) onChange(nuevo);
  };

  const arrastre = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderGrant: () => {
        x.stopAnimation((v) => { inicio.current = v; });
      },
      onPanResponderMove: (_, g) => {
        x.setValue(Math.max(0, Math.min(medida.current, inicio.current + g.dx)));
      },
      onPanResponderRelease: (_, g) => {
        const final = inicio.current + g.dx;
        const i = g.vx > 0.4 ? 1 : g.vx < -0.4 ? 0 : final > medida.current / 2 ? 1 : 0;
        elegirRef.current(i);
      },
      onPanResponderTerminate: () => elegirRef.current(indiceRef.current),
    }),
  ).current;

  // El PanResponder se crea una sola vez: lee los valores actuales por referencia.
  const medida = useRef(mitad);
  medida.current = mitad;
  const elegirRef = useRef(elegir);
  elegirRef.current = elegir;
  const indiceRef = useRef(indice);
  indiceRef.current = indice;

  const onLayout = (e: LayoutChangeEvent) => setAncho(e.nativeEvent.layout.width);

  const fondoPista = enCielo ? c.heroChip : c.surface2;
  const bordePista = enCielo ? c.heroLine : c.border;
  const tintaApagada = enCielo ? '#FFFFFF' : c.text2;

  return (
    <View
      onLayout={onLayout}
      accessibilityRole="tablist"
      {...arrastre.panHandlers}
      style={{ height: ALTO, borderRadius: 14, backgroundColor: fondoPista, borderWidth: 1, borderColor: enCielo ? bordePista : fondoPista, padding: BORDE - 1, flexDirection: 'row' }}
    >
      {mitad > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute', top: BORDE - 1, left: BORDE - 1, width: mitad, height: ALTO - BORDE * 2,
            borderRadius: 11, backgroundColor: enCielo ? '#FFFFFF' : c.surface,
            shadowColor: c.shadow, shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3,
            transform: [{ translateX: x }],
          }}
        />
      ) : null}
      {OPCIONES.map((o, i) => {
        const sel = i === indice;
        const Icono = o.icono;
        const tinta = sel ? c.primary : tintaApagada;
        return (
          <Pressable
            key={o.valor}
            onPress={() => elegir(i)}
            accessibilityRole="tab"
            accessibilityState={{ selected: sel }}
            accessibilityLabel={o.valor === 'guardian' ? 'Entrar como representante' : 'Entrar como chofer'}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <Icono size={20} color={tinta} strokeWidth={sel ? 2.4 : 2} />
            <Text selectable={false} maxFontSizeMultiplier={1.2} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ fontFamily: sel ? fuentes.fuerte : fuentes.semi, fontSize: 15.5, color: tinta }}>{o.texto}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
