// La ruta dibujada como línea con paradas: el sello visual de BSL.
// RutaEmblema: horizontal, en Ingreso; la buseta se desliza una vez de la casa hacia la escuela.
// LineaParadas: vertical, en Inicio; la línea se llena con lo recorrido, como en el mapa: lo hecho en verde
// con visto, la buseta (cuadro marino) sobre la línea entre la última parada pasada y la siguiente, y tu casa en ámbar.
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Text, View, type LayoutChangeEvent } from 'react-native';
import { Bus, Check, Home } from 'lucide-react-native';
import { fuentes, useTema } from '../tema';

export function RutaEmblema() {
  const { c } = useTema();
  const [ancho, setAncho] = useState(0);
  const avance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!ancho) return;
    let vivo = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reducido) => {
        if (!vivo) return;
        if (reducido) return avance.setValue(1);
        Animated.timing(avance, { toValue: 1, duration: 1400, delay: 250, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start();
      });
    return () => {
      vivo = false;
    };
  }, [ancho, avance]);

  // Pista fina gris, lo recorrido en azul de marca y la buseta ámbar a mitad de camino.
  const util = Math.max(0, ancho - 20);
  const xBus = avance.interpolate({ inputRange: [0, 1], outputRange: [util * 0.06 - 3, util * 0.46 - 3] });
  const relleno = avance.interpolate({ inputRange: [0, 1], outputRange: [0.06, 0.46] });

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setAncho(e.nativeEvent.layout.width)}
      accessible
      accessibilityLabel="La ruta de la buseta, de la casa a la escuela"
      style={{ height: 52 }}
    >
      <View style={{ position: 'absolute', left: 10, right: 10, top: 13, height: 4, borderRadius: 2, backgroundColor: c.border }} />
      {ancho ? (
        <>
          <Animated.View style={{ position: 'absolute', left: 10, width: util, top: 13, height: 4, borderRadius: 2, backgroundColor: c.primary, transformOrigin: 'left', transform: [{ scaleX: relleno }] }} />
          <Animated.View
            style={{
              position: 'absolute', top: 1, left: 0, width: 28, height: 28, borderRadius: 9, backgroundColor: c.accent,
              borderWidth: 3, borderColor: c.surface, alignItems: 'center', justifyContent: 'center',
              transform: [{ translateX: xBus }],
            }}
          >
            <Bus size={15} color={c.onAccent} strokeWidth={2.4} />
          </Animated.View>
        </>
      ) : null}
      <Text maxFontSizeMultiplier={1.2} style={{ position: 'absolute', left: 0, top: 34, fontFamily: fuentes.semi, fontSize: 12, color: c.text3 }}>Casa</Text>
      <Text maxFontSizeMultiplier={1.2} style={{ position: 'absolute', right: 0, top: 34, fontFamily: fuentes.semi, fontSize: 12, color: c.text3 }}>Escuela</Text>
    </View>
  );
}

export interface ParadaLinea {
  clave: string;
  titulo: string;
  detalle?: string;
  hora?: string;
  hecha?: boolean;
  tuya?: boolean; // la próxima parada de tu hijo: se resalta en ámbar
}

const RIEL = 28;

function useReducido() {
  const [reducido, setReducido] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReducido).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducido);
    return () => sub.remove();
  }, []);
  return reducido;
}

// Pulso suave alrededor de tu casa mientras la buseta va en camino (estado en vivo).
function Pulso({ color, activo }: { color: string; activo: boolean }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!activo) return;
    const bucle = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    bucle.start();
    return () => bucle.stop();
  }, [activo, v]);
  if (!activo) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute', width: 30, height: 30, borderRadius: 12, backgroundColor: color,
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.1] }) }],
      }}
    />
  );
}

// La línea se llena con lo recorrido. Al aparecer, el relleno verde crece desde la salida hasta donde
// va la buseta (menos de un segundo); la pista de lo que falta queda vacía. Con "reducir movimiento"
// aparece completa.
export function LineaParadas({ paradas, enVivo = false }: { paradas: ParadaLinea[]; enVivo?: boolean }) {
  const { c } = useTema();
  const reducido = useReducido();
  const t = useRef(new Animated.Value(0)).current;
  const n = Math.max(1, paradas.length);
  const pista = c.border;
  const lleno = c.success; // lo recorrido, en verde como «subió» y «llegó»

  // Última parada recorrida (las hechas van seguidas desde la salida).
  let k = -1;
  for (let i = 0; i < paradas.length; i++) {
    if (paradas[i].hecha) k = i;
    else break;
  }
  const terminado = k === paradas.length - 1;
  const conBuseta = enVivo && k >= 0 && !terminado;
  // Hasta dónde llega el relleno, medido en filas: hasta la parada k, más media fila si la buseta va en camino.
  const destino = terminado ? n - 0.5 : Math.max(0.001, k + (conBuseta ? 1 : 0.5));
  const clave = k + '-' + conBuseta + '-' + n;

  useEffect(() => {
    if (reducido) {
      t.setValue(1);
      return;
    }
    t.setValue(0);
    Animated.timing(t, { toValue: 1, duration: Math.min(1100, 220 * Math.max(1, destino) + 250), easing: Easing.bezier(0.16, 1, 0.3, 1), useNativeDriver: true }).start();
  }, [clave, reducido, t]); // eslint-disable-line react-hooks/exhaustive-deps

  // Avance de 0 a 1 de un tramo que va de "desde" a "hasta" (en filas) sobre el recorrido total "destino".
  const tramo = (desde: number, hasta: number) => {
    const a = Math.min(0.999, Math.max(0, desde / destino));
    const b = Math.min(1, Math.max(a + 0.001, hasta / destino));
    return t.interpolate({ inputRange: [a, b], outputRange: [0, 1], extrapolate: 'clamp' });
  };

  return (
    <View accessibilityRole="list">
      {paradas.map((p, i) => {
        const primera = i === 0;
        const ultima = i === paradas.length - 1;
        const arribaLlena = !primera && i <= k;
        const abajoLlena = !ultima && (i < k || (i === k && conBuseta));
        const hecha = !!p.hecha;
        // Fila i: su mitad de arriba ocupa [i - 0.5, i] y la de abajo [i, i + 0.5] en la escala del recorrido.
        const rellenoArriba = tramo(i - 0.5, i);
        const rellenoAbajo = tramo(i, i + 0.5);
        const marca = tramo(i - 0.1, i + 0.05);
        const aviso = conBuseta && i === k ? '. La buseta va después de esta parada' : '';
        return (
          <View
            key={p.clave}
            accessible
            accessibilityLabel={p.titulo + (p.hora ? ', ' + p.hora : '') + (hecha ? ', ya pasó' : p.tuya ? ', tu parada' : '') + (p.detalle ? '. ' + p.detalle : '') + aviso}
            style={{ flexDirection: 'row', alignItems: 'stretch', minHeight: p.tuya ? 68 : 58 }}
          >
            {/* Riel: pista vacía y relleno verde por mitades */}
            <View style={{ width: RIEL, alignItems: 'center' }}>
              <View style={{ flex: 1, width: 4, marginBottom: -2 }}>
                {!primera ? <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: pista }} /> : null}
                {arribaLlena ? <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: lleno, transformOrigin: 'top', transform: [{ scaleY: rellenoArriba }] }} /> : null}
              </View>
              {p.tuya ? (
                <View style={{ zIndex: 2, alignItems: 'center', justifyContent: 'center', marginVertical: -2 }}>
                  <Pulso color={c.accent} activo={enVivo && !reducido} />
                  <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: c.accent, borderWidth: 3, borderColor: c.surface, alignItems: 'center', justifyContent: 'center', elevation: 3, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } }}>
                    <Home size={14} color={c.onAccent} strokeWidth={2.6} />
                  </View>
                </View>
              ) : hecha ? (
                <View style={{ zIndex: 2, width: 22, height: 22, borderRadius: 11, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ position: 'absolute', width: 22, height: 22, borderRadius: 11, borderWidth: 3, borderColor: pista }} />
                  <Animated.View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: lleno, alignItems: 'center', justifyContent: 'center', opacity: marca, transform: [{ scale: marca.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }}>
                    <Check size={13} color="#FFFFFF" strokeWidth={3.4} />
                  </Animated.View>
                </View>
              ) : (
                <View style={{ zIndex: 2, width: 18, height: 18, borderRadius: 9, backgroundColor: c.surface, borderWidth: 3, borderColor: pista }} />
              )}
              <View style={{ flex: 1, width: 4, marginTop: -2 }}>
                {!ultima ? <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: pista }} /> : null}
                {abajoLlena ? <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: lleno, transformOrigin: 'top', transform: [{ scaleY: rellenoAbajo }] }} /> : null}
                {/* La buseta, sobre la línea, entre esta parada (la última que pasó) y la siguiente */}
                {conBuseta && i === k ? (
                  <Animated.View
                    style={{
                      position: 'absolute', bottom: -14, left: -13, width: 30, height: 30, borderRadius: 10, backgroundColor: c.hero,
                      borderWidth: 3, borderColor: c.surface, alignItems: 'center', justifyContent: 'center', zIndex: 3, elevation: 4,
                      shadowColor: c.shadow, shadowOpacity: 0.2, shadowRadius: 5, shadowOffset: { width: 0, height: 2 },
                      opacity: t.interpolate({ inputRange: [0.85, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
                      transform: [{ scale: t.interpolate({ inputRange: [0.85, 1], outputRange: [0.6, 1], extrapolate: 'clamp' }) }],
                    }}
                  >
                    <Bus size={14} color={c.accent} strokeWidth={2.4} />
                  </Animated.View>
                ) : null}
              </View>
            </View>
            <View
              style={{
                flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: p.tuya ? 8 : 12, paddingVertical: 8,
                ...(p.tuya ? { backgroundColor: c.accentSoft, borderRadius: 12, paddingHorizontal: 10 } : null),
              }}
            >
              <View style={{ flex: 1 }}>
                <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: fuentes.fuerte, fontSize: 15, color: c.text }}>{p.titulo}</Text>
                {p.detalle ? <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: fuentes.semi, fontSize: 12.5, lineHeight: 17, marginTop: 1, color: p.tuya ? c.warningInk : hecha ? c.successInk : c.text3 }}>{p.detalle}</Text> : null}
              </View>
              {p.hora ? (
                <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: fuentes.titulo, fontSize: 15, color: c.text, fontVariant: ['tabular-nums'] }}>{p.hora}</Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
