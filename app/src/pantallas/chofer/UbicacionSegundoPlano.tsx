// 70 · Divulgación destacada del uso de la ubicación en segundo plano (exigida por Google Play
// ANTES del diálogo del sistema).
import React, { useState } from 'react';
import { View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Bus, MapPin } from 'lucide-react-native';
import { BannerAlerta, Boton, Pantalla, Tarjeta, Texto, useToast } from '../../ui';
import { esp, fuentes, radio, useTema } from '../../tema';
import { transmision } from '../../servicios/viaje';
import type { NavChofer, PilaChofer } from '../../navegacion/tipos';

export default function UbicacionSegundoPlano() {
  const { c } = useTema();
  const navigation = useNavigation<NavChofer>();
  const routeId = useRoute<RouteProp<PilaChofer, 'UbicacionSegundoPlano'>>().params?.routeId;
  const toast = useToast();
  const [pidiendo, setPidiendo] = useState(false);

  const seguir = (concedido: boolean) => {
    if (!concedido) toast.mostrar('Sin "Permitir todo el tiempo", BSL transmite solo con la app abierta.', { duracion: 5000 });
    if (routeId) navigation.replace('IniciarRecorrido', { routeId });
    else navigation.goBack();
  };

  const continuar = async () => {
    setPidiendo(true);
    const ok = await transmision.pedirSegundoPlano().catch(() => false);
    setPidiendo(false);
    seguir(ok);
  };

  return (
    <Pantalla
      titulo="Permisos"
      onAtras={() => navigation.goBack()}
      pie={
        <>
          <Boton titulo="Continuar" tamano="conduccion" onPress={continuar} cargando={pidiendo} />
          <Boton titulo="Ahora no" variante="fantasma" onPress={() => seguir(false)} />
        </>
      }
    >
      <Tarjeta>
        <View style={{ gap: esp.md }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <MapPin size={26} color={c.primary} strokeWidth={2} />
          </View>
          <Texto v="titulo">Uso de tu ubicación</Texto>
          <Texto v="cuerpo">
            BSL recopila datos de ubicación para mostrar la buseta en vivo a los representantes de tu ruta y avisarles cuando estás cerca de su parada, incluso cuando la app está cerrada o no está en uso.
          </Texto>
          <Texto v="cuerpo" color="text2">Solo ocurre mientras hay un recorrido iniciado. Puedes pausarlo cuando quieras.</Texto>
        </View>
      </Tarjeta>

      <View style={{ gap: esp.sm }}>
        <Texto v="seccion">Así lo verás mientras navegas</Texto>
        <View
          accessible
          accessibilityLabel="Ejemplo de la notificación: BSL está transmitiendo tu recorrido"
          style={{ backgroundColor: c.surface2, borderRadius: radio.grande, padding: esp.md, flexDirection: 'row', gap: 12, alignItems: 'center' }}
        >
          <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: c.hero, alignItems: 'center', justifyContent: 'center' }}>
            <Bus size={20} color="#FFFFFF" strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Texto v="nota" color="text2" style={{ fontFamily: fuentes.semi }}>BSL, ahora</Texto>
            <Texto v="fuerte" style={{ fontSize: 15 }}>BSL está transmitiendo tu recorrido</Texto>
            <Texto v="nota" color="text2">Cada 5 s. Toca para volver</Texto>
          </View>
        </View>
      </View>

      <BannerAlerta
        tipo="aviso"
        titulo="Elige Permitir todo el tiempo"
        texto="Con «Solo mientras se usa la app», el rastreo se corta al abrir Google Maps o Waze."
      />
    </Pantalla>
  );
}
