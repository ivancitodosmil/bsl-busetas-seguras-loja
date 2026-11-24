import React, { useEffect } from 'react';
import { AppState, Platform, View } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme, createNavigationContainerRef, type LinkingOptions } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import NetInfo from '@react-native-community/netinfo';
import { useFonts } from 'expo-font';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Manrope_700Bold } from '@expo-google-fonts/manrope/700Bold';
import { Manrope_800ExtraBold } from '@expo-google-fonts/manrope/800ExtraBold';
import { ProveedorTema, useTema } from './src/tema';
import { AlarmaBuseta, ProveedorToast } from './src/ui';
import { useSesion } from './src/estado/sesion';
import { viaje } from './src/servicios/viaje'; // registra la tarea de GPS en segundo plano
import Raiz from './src/navegacion/Raiz';
import { modoDemo } from './src/config/supabase';
import { useAvisos } from './src/estado/avisos';

// Solo en el modo de prueba (EXPO_PUBLIC_DEMO=1, sin Supabase): acceso para simular un recorrido y
// capturar pantallas desde el navegador. En la app real modoDemo es siempre false.
if (modoDemo && typeof window !== 'undefined') {
  const { servidorDemo } = require('./src/demo/cliente');
  const { simulador } = require('./src/demo/simulador');
  const { ID } = require('./src/demo/datos');
  const { trazar } = require('./src/servicios/viaje');
  (window as any).__bslDemo = { servidorDemo, simulador, ID, trazar, avisos: useAvisos };
}

// bsl://i/9H4T6L2M o https://bsl.app/i/9H4T6L2M abren "Vincular" con el código ya escrito.
const enlaces: LinkingOptions<ReactNavigation.RootParamList> = {
  // En la web no se cambia la dirección del navegador: la app vive en una subcarpeta (GitHub Pages)
  // y una dirección como /Ingreso daría error al recargar.
  enabled: Platform.OS !== 'web',
  prefixes: ['bsl://', 'https://bsl.app'],
  config: { screens: { Vincular: 'i/:codigo' } as never },
};

const navegacion = createNavigationContainerRef<any>();

function Navegacion() {
  const { c, oscuro } = useTema();
  const base = oscuro ? DarkTheme : DefaultTheme;
  return (
    <NavigationContainer
      ref={navegacion}
      linking={enlaces}
      documentTitle={{ formatter: () => 'BSL · Busetas Seguras Loja' }}
      theme={{ ...base, colors: { ...base.colors, primary: c.primary, background: c.bg, card: c.surface, text: c.text, border: c.border, notification: c.danger } }}
    >
      <ProveedorToast>
        <Raiz />
        <AlarmaBuseta onVerMapa={() => { try { navegacion.navigate('Pestanas', { screen: 'Mapa' }); } catch { /* el chofer no tiene mapa de representante */ } }} />
      </ProveedorToast>
    </NavigationContainer>
  );
}

export default function App() {
  const [fuentesListas] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Manrope_700Bold, Manrope_800ExtraBold });

  useEffect(() => useSesion.getState().iniciar(), []);

  // Al volver la señal o la app al frente, se envía lo que quedó en cola (≤ 30 s).
  useEffect(() => {
    const red = NetInfo.addEventListener((e) => {
      if (e.isConnected) viaje.sincronizar().catch(() => {});
    });
    const app = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') viaje.sincronizar().catch(() => {});
    });
    const reloj = setInterval(() => viaje.sincronizar().catch(() => {}), 30000);
    return () => {
      red();
      app.remove();
      clearInterval(reloj);
    };
  }, []);

  if (!fuentesListas) return <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ProveedorTema>
          <Navegacion />
        </ProveedorTema>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
