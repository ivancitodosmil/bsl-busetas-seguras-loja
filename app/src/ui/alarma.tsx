// Alarma de la buseta: cuando llega el aviso de 1 km o de 500 m con la app abierta, se muestra a
// pantalla completa y el teléfono vibra como una alarma hasta que la persona toca "Entendido"
// (o 30 segundos como máximo). Con la app cerrada, la alarma la da la notificación del sistema
// en el canal "Alarma de la buseta".
import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, Modal, Text, Vibration, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bus } from 'lucide-react-native';
import { PATRON_ALARMA, useAvisos } from '../estado/avisos';
import { fuentes, margen, useTema } from '../tema';
import { Boton } from './base';

export function AlarmaBuseta({ onVerMapa }: { onVerMapa?: () => void }) {
  const { c } = useTema();
  const ins = useSafeAreaInsets();
  const alarma = useAvisos((s) => s.alarma);
  const cerrar = useAvisos((s) => s.cerrarAlarma);
  const pulso = useRef(new Animated.Value(0)).current;
  const quinientos = alarma?.type === 'bus_arriving';

  useEffect(() => {
    if (!alarma) return;
    Vibration.vibrate(PATRON_ALARMA, true);
    AccessibilityInfo.announceForAccessibility(`${alarma.title}. ${alarma.body}`);
    const limite = setTimeout(() => Vibration.cancel(), 30000);
    let bucle: Animated.CompositeAnimation | null = null;
    AccessibilityInfo.isReduceMotionEnabled().then((reducido) => {
      if (reducido) return;
      bucle = Animated.loop(Animated.timing(pulso, { toValue: 1, duration: 1300, easing: Easing.out(Easing.quad), useNativeDriver: true }));
      bucle.start();
    }).catch(() => {});
    return () => {
      clearTimeout(limite);
      Vibration.cancel();
      bucle?.stop();
      pulso.setValue(0);
    };
  }, [alarma?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!alarma) return null;
  const fondo = quinientos ? c.danger : c.primaryStrong;
  const tinta = '#FFFFFF';

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={cerrar}>
      <View
        accessibilityViewIsModal
        accessibilityRole="alert"
        style={{ flex: 1, backgroundColor: fondo, paddingTop: ins.top + 40, paddingBottom: ins.bottom + 24, paddingHorizontal: margen, justifyContent: 'space-between' }}
      >
        <View style={{ alignItems: 'center', gap: 28, marginTop: 40 }}>
          <View style={{ width: 160, height: 160, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ position: 'absolute', width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.14)' }} />
            {[0, 0.5].map((desfase) => (
              <Animated.View
                key={desfase}
                style={{
                  position: 'absolute', width: 110, height: 110, borderRadius: 55, backgroundColor: tinta,
                  opacity: pulso.interpolate({ inputRange: [0, 1], outputRange: [0.25 - desfase * 0.2, 0] }),
                  transform: [{ scale: pulso.interpolate({ inputRange: [0, 1], outputRange: [1 + desfase * 0.3, 1.9] }) }],
                }}
              />
            ))}
            <View style={{ width: 110, height: 110, borderRadius: 55, backgroundColor: tinta, alignItems: 'center', justifyContent: 'center' }}>
              <Bus size={54} color={fondo} strokeWidth={1.8} />
            </View>
          </View>
          <View style={{ alignItems: 'center', gap: 10 }}>
            <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: fuentes.titulo, fontSize: 40, lineHeight: 42, letterSpacing: -1.2, color: tinta, textAlign: 'center' }}>
              {alarma.title.replace(/(\d) (k?m)\b/g, '$1\u00A0$2')}
            </Text>
            {alarma.body ? (
              <Text maxFontSizeMultiplier={1.4} style={{ fontFamily: fuentes.medio, fontSize: 17, lineHeight: 25, color: tinta, textAlign: 'center', opacity: 0.9 }}>
                {alarma.body}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={{ gap: 12 }}>
          <Boton titulo="Entendido" onPress={cerrar} colores={{ fondo: tinta, tinta: fondo }} />
          {onVerMapa ? (
            <Boton
              titulo="Ver la buseta en el mapa"
              onPress={() => { cerrar(); onVerMapa(); }}
              colores={{ fondo: 'transparent', tinta, borde: 'rgba(255,255,255,0.7)' }}
              estilo={{ borderWidth: 2 }}
            />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
