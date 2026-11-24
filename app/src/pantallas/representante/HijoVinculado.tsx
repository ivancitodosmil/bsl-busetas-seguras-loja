// Confirmación de que el hijo quedó vinculado y qué avisos se van a recibir.
import React from 'react';
import { View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { BellRing, Bus, CircleCheck, School } from 'lucide-react-native';
import { useAvisos } from '../../estado/avisos';
import type { NavRep, PilaRep } from '../../navegacion/tipos';
import { esp, useTema } from '../../tema';
import { Avatar, Boton, Pantalla, Tarjeta, Texto } from '../../ui';

export default function HijoVinculado() {
  const { c } = useTema();
  const nav = useNavigation<NavRep>();
  const { vinculo } = useRoute<RouteProp<PilaRep, 'HijoVinculado'>>().params;
  const permiso = useAvisos((s) => s.permiso);

  const continuar = () => {
    if (permiso !== 'concedido') nav.replace('PermisoAvisos');
    else nav.navigate('Pestanas', { screen: 'Inicio' });
  };

  return (
    <Pantalla
      titulo="Listo"
      pie={
        <>
          <Boton titulo="Continuar" onPress={continuar} />
          <Boton titulo="Vincular a otro hijo" variante="secundario" onPress={() => nav.replace('Vincular')} />
        </>
      }
    >
      <Tarjeta elevacion={2} estilo={{ alignItems: 'center', gap: esp.sm, paddingVertical: esp.xxl }}>
        <View>
          <Avatar nombre={vinculo.first_name} color={vinculo.school_color} tam={84} />
          <View style={{ position: 'absolute', right: -4, bottom: -4, backgroundColor: c.surface, borderRadius: 16 }}>
            <CircleCheck size={30} color={c.success} strokeWidth={2} />
          </View>
        </View>
        <Texto v="titulo" centro style={{ marginTop: esp.sm }} accessibilityRole="header">{vinculo.first_name} ya está en tu cuenta</Texto>
        <Texto v="medio" color="text2" centro>{vinculo.full_name}</Texto>
      </Tarjeta>

      <Tarjeta estilo={{ gap: esp.md }}>
        {vinculo.school || vinculo.grade ? (
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <School size={20} color={c.primary} strokeWidth={2} />
            <Texto v="cuerpo" style={{ flex: 1 }}>{[vinculo.grade, vinculo.school].filter(Boolean).join(', ')}</Texto>
          </View>
        ) : null}
        {vinculo.driver_name ? (
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <Bus size={20} color={c.primary} strokeWidth={2} />
            <Texto v="cuerpo" style={{ flex: 1 }}>Chofer: {vinculo.driver_name}{vinculo.plate ? `, ${vinculo.plate}` : ''}</Texto>
          </View>
        ) : null}
      </Tarjeta>

      <Tarjeta plano estilo={{ flexDirection: 'row', gap: 12 }}>
        <BellRing size={20} color={c.primary} strokeWidth={2} style={{ marginTop: 2 }} />
        <View style={{ flex: 1, gap: 2 }}>
          <Texto v="fuerte">Qué vas a recibir</Texto>
          <Texto v="medio" color="text2">Salida de la buseta, “está cerca”, abordaje, llegada al colegio y cualquier retraso o cambio de chofer.</Texto>
        </View>
      </Tarjeta>
    </Pantalla>
  );
}
