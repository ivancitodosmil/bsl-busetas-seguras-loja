// 01 Bienvenida y rol: para quien todavía no tiene cuenta.
import React from 'react';
import { ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Bell, Bus, BusFront, CalendarX, MapPin, Users, type LucideIcon } from 'lucide-react-native';
import { Boton, CreditoPredir, Texto } from '../../ui';
import { esp, margen, useTema } from '../../tema';
import type { NavAcceso } from '../../navegacion/tipos';

const PUNTOS: { icono: LucideIcon; texto: string }[] = [
  { icono: MapPin, texto: 'La buseta en el mapa, en vivo' },
  { icono: Bell, texto: 'Aviso a 1 km y a 500 m de tu casa' },
  { icono: CalendarX, texto: 'Reporta ausencias sin llamar al chofer' },
];

export default function Bienvenida() {
  const { c, oscuro } = useTema();
  const ins = useSafeAreaInsets();
  const nav = useNavigation<NavAcceso>();

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <StatusBar style={oscuro ? 'light' : 'dark'} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, paddingTop: ins.top + esp.xxl, paddingBottom: ins.bottom + esp.md, paddingHorizontal: margen, gap: esp.xl }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Bus size={24} color={c.onPrimary} strokeWidth={2.2} />
          </View>
          <View>
            <Texto v="subtitulo">BSL</Texto>
            <Texto v="nota" color="text2">Busetas Seguras Loja</Texto>
          </View>
        </View>

        <View style={{ gap: 6, marginTop: esp.sm }}>
          <Texto v="display" accessibilityRole="header">La buseta de tus hijos, en tu celular</Texto>
          <Texto v="medio" color="text2">Crea tu cuenta para empezar.</Texto>
        </View>

        <View style={{ gap: esp.md }}>
          {PUNTOS.map(({ icono: Icono, texto }) => (
            <View key={texto} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                <Icono size={18} color={c.primary} strokeWidth={2.2} />
              </View>
              <Texto v="cuerpo" style={{ flex: 1 }}>{texto}</Texto>
            </View>
          ))}
        </View>

        <View style={{ flex: 1 }} />
        <View style={{ gap: esp.md }}>
          <Boton titulo="Soy representante" icono={Users} onPress={() => nav.navigate('CrearCuenta', { rol: 'guardian' })} />
          <Boton titulo="Soy chofer" icono={BusFront} variante="secundario" onPress={() => nav.navigate('CrearCuenta', { rol: 'driver' })} />
          <Boton titulo="Ya tengo cuenta" variante="fantasma" onPress={() => nav.navigate('Ingreso')} />
          <CreditoPredir />
        </View>
      </ScrollView>
    </View>
  );
}
