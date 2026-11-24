// 69 · Permiso de ubicación (y 94 · ubicación denegada con los 3 pasos para activarla).
import React, { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Eye, MapPin, MapPinOff, Timer } from 'lucide-react-native';
import { BannerAlerta, Boton, Pantalla, PasosNumerados, Tarjeta, Texto } from '../../ui';
import { esp, useTema } from '../../tema';
import { transmision } from '../../servicios/viaje';
import type { NavChofer, PilaChofer } from '../../navegacion/tipos';

export default function PermisoUbicacion() {
  const { c } = useTema();
  const navigation = useNavigation<NavChofer>();
  const routeId = useRoute<RouteProp<PilaChofer, 'PermisoUbicacion'>>().params?.routeId;
  const [denegado, setDenegado] = useState(false);
  const [pidiendo, setPidiendo] = useState(false);

  useEffect(() => {
    transmision.permisos().then((p) => {
      if (!p.primerPlano && !p.puedePreguntar) setDenegado(true);
    }).catch(() => {});
  }, []);

  const permitir = async () => {
    setPidiendo(true);
    try {
      const ok = await transmision.pedirPrimerPlano();
      if (ok) {
        navigation.replace('UbicacionSegundoPlano', { routeId });
        return;
      }
      const p = await transmision.permisos();
      if (!p.puedePreguntar) setDenegado(true);
    } catch {
      setDenegado(true);
    } finally {
      setPidiendo(false);
    }
  };

  if (denegado) {
    return (
      <Pantalla
        titulo="Ubicación desactivada"
        onAtras={() => navigation.goBack()}
        pie={
          <>
            <Boton titulo="Abrir Ajustes" tamano="conduccion" onPress={() => Linking.openSettings()} />
            <Boton titulo="Ya la activé, comprobar" variante="secundario" onPress={permitir} cargando={pidiendo} />
            <Boton titulo="Volver al inicio" variante="fantasma" onPress={() => navigation.navigate('Pestanas', { screen: 'Inicio' })} />
          </>
        }
      >
        <Tarjeta>
          <View style={{ alignItems: 'center', gap: esp.sm, paddingVertical: esp.sm }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: c.dangerSoft, alignItems: 'center', justifyContent: 'center' }}>
              <MapPinOff size={28} color={c.dangerInk} strokeWidth={2} />
            </View>
            <Texto v="titulo" centro>No puedes iniciar el recorrido</Texto>
            <Texto v="cuerpo" color="text2" centro>BSL no tiene permiso para usar tu ubicación.</Texto>
          </View>
        </Tarjeta>
        <Tarjeta>
          <Texto v="seccion" style={{ marginBottom: esp.md }}>Actívala en 3 pasos</Texto>
          <PasosNumerados
            pasos={[
              { texto: 'Abre Ajustes del teléfono' },
              { texto: 'Entra a Apps, BSL, Ubicación' },
              { texto: 'Elige Permitir todo el tiempo y activa Ubicación precisa' },
            ]}
          />
        </Tarjeta>
        <Texto v="medio" color="text2">
          Los representantes solo ven la buseta mientras hay un recorrido iniciado. Fuera de eso, BSL no usa tu ubicación.
        </Texto>
      </Pantalla>
    );
  }

  return (
    <Pantalla
      titulo="Permisos"
      onAtras={() => navigation.goBack()}
      pie={
        <>
          <Boton titulo="Permitir ubicación" icono={MapPin} tamano="conduccion" onPress={permitir} cargando={pidiendo} />
          <Boton titulo="Ahora no" variante="fantasma" onPress={() => navigation.goBack()} />
        </>
      }
    >
      <Tarjeta>
        <View style={{ gap: esp.md }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <MapPin size={28} color={c.primary} strokeWidth={2} />
          </View>
          <Texto v="titulo">Activa tu ubicación</Texto>
          <Texto v="cuerpo" color="text2">
            BSL usa el GPS para mostrar la buseta a los representantes, avisarles cuando estás a 1 km y a 500 m de su casa y proponerte confirmar entregas al llegar a la escuela.
          </Texto>
        </View>
      </Tarjeta>
      <BannerAlerta tipo="info" icono={Timer} titulo="Solo durante un recorrido" texto="Fuera de un recorrido no se comparte tu posición." />
      <BannerAlerta tipo="info" icono={Eye} titulo="Solo la ven los representantes de tu ruta" texto="Nadie más puede seguir la buseta." />
    </Pantalla>
  );
}
