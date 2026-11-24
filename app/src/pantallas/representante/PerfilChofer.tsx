// Perfil del chofer: quién conduce, en qué vehículo y cómo contactarlo.
import React from 'react';
import { Linking, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Bus, MessageCircle, Phone, Route } from 'lucide-react-native';
import type { NavRep, PilaRep } from '../../navegacion/tipos';
import { esp, fuentes, radio, useTema } from '../../tema';
import { Avatar, BannerAlerta, Boton, Pantalla, PillEstado, Tarjeta, Texto, useToast } from '../../ui';
import { celularBonito } from '../../utils';

export default function PerfilChofer() {
  const { c } = useTema();
  const nav = useNavigation<NavRep>();
  const toast = useToast();
  const { chofer, sustituto, ruta } = useRoute<RouteProp<PilaRep, 'PerfilChofer'>>().params;

  const abrir = (url: string) => Linking.openURL(url).catch(() => toast.mostrar('No se pudo abrir la aplicación', { tipo: 'error' }));
  const digitos = chofer.phone?.replace(/\D/g, '') ?? '';

  return (
    <Pantalla titulo={sustituto ? 'Chofer sustituto' : 'Tu chofer'} onAtras={() => nav.goBack()}>
      <Tarjeta elevacion={2} estilo={{ alignItems: 'center', gap: esp.sm, paddingVertical: esp.xxl }}>
        <Avatar nombre={chofer.name} foto={chofer.photo_url} tam={88} />
        <Texto v="titulo" centro style={{ marginTop: esp.sm }}>{chofer.name}</Texto>
        {chofer.verified ? <View style={{ alignSelf: 'center' }}><PillEstado estado="verificado" texto="Cuenta verificada" /></View> : null}
        {chofer.phone ? <Texto v="medio" color="text2">{celularBonito(chofer.phone)}</Texto> : null}
      </Tarjeta>

      {sustituto ? <BannerAlerta tipo="info" titulo="Sustituto autorizado para hoy" texto="El chofer titular lo autorizó. La autorización caduca al terminar el día." /> : null}

      <Tarjeta estilo={{ gap: esp.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <Bus size={20} color={c.primary} strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Texto v="fuerte">{chofer.vehicle ?? 'Vehículo sin registrar'}</Texto>
            {chofer.color ? <Texto v="nota" color="text2">Color {chofer.color.toLowerCase()}</Texto> : null}
          </View>
        </View>
        {chofer.plate ? (
          <View accessible accessibilityLabel={`Placa ${chofer.plate.split('').join(' ')}`} style={{ alignSelf: 'flex-start', borderWidth: 2, borderColor: c.text, borderRadius: radio.campo, paddingHorizontal: 18, paddingVertical: 8, backgroundColor: c.surface }}>
            <Texto v="nota" color="text3" centro>Placa</Texto>
            <Texto style={{ fontFamily: fuentes.titulo, fontSize: 28, lineHeight: 34, letterSpacing: 2 }}>{chofer.plate}</Texto>
          </View>
        ) : null}
        {ruta ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <Route size={20} color={c.primary} strokeWidth={2} />
            </View>
            <Texto v="fuerte" style={{ flex: 1 }}>{ruta}</Texto>
          </View>
        ) : null}
      </Tarjeta>

      {chofer.phone ? (
        <View style={{ flexDirection: 'row', gap: esp.sm }}>
          <Boton titulo="Llamar" icono={Phone} onPress={() => abrir(`tel:${chofer.phone}`)} estilo={{ flex: 1 }} />
          <Boton titulo="WhatsApp" icono={MessageCircle} variante="secundario" onPress={() => abrir(`https://wa.me/${digitos}`)} estilo={{ flex: 1 }} />
        </View>
      ) : (
        <Texto v="medio" color="text2" centro>Este chofer no tiene un celular registrado.</Texto>
      )}
    </Pantalla>
  );
}
