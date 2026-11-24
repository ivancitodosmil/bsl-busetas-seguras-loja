// 09 · Permiso de notificaciones · 93 · Avisos desactivados
import React, { useCallback, useState } from 'react';
import { Linking, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { BellOff, BellRing, MessageSquare, Route, Siren, type LucideIcon } from 'lucide-react-native';
import { BannerAlerta, Boton, Pantalla, PasosNumerados, Texto, useToast } from '../../ui';
import { esp, radio, sombra, useTema } from '../../tema';
import { useAvisos } from '../../estado/avisos';
import { useSesion } from '../../estado/sesion';

export default function PermisoAvisos() {
  const { c } = useTema();
  const nav = useNavigation();
  const toast = useToast();
  const { permiso, pedirPermiso, revisarPermiso } = useAvisos();
  const chofer = useSesion((s) => s.usuario?.role === 'driver');
  const [cargando, setCargando] = useState(false);

  // Al volver de Ajustes se vuelve a consultar el permiso.
  useFocusEffect(useCallback(() => { revisarPermiso(); }, [revisarPermiso]));

  const permitir = async () => {
    setCargando(true);
    const ok = await pedirPermiso().catch(() => false);
    setCargando(false);
    if (ok) {
      toast.mostrar('Notificaciones activadas', { tipo: 'exito' });
      nav.goBack();
    }
  };

  const tarjeta = { backgroundColor: c.surface, borderRadius: radio.grande, padding: esp.lg, gap: esp.lg, ...sombra(c, 2) };

  if (permiso === 'denegado') {
    return (
      <Pantalla
        titulo="Avisos desactivados"
        onAtras={() => nav.goBack()}
        pie={
          <>
            <Boton titulo="Abrir Ajustes" onPress={() => Linking.openSettings().catch(() => {})} />
            <Boton titulo="Seguir sin avisos" variante="secundario" onPress={() => nav.goBack()} />
          </>
        }
      >
        <BannerAlerta
          tipo="aviso"
          icono={BellOff}
          titulo={chofer ? 'No recibirás ausencias ni solicitudes' : 'No recibirás el aviso "buseta cerca"'}
          texto="Las notificaciones de BSL están desactivadas en tu teléfono."
        />
        <View style={tarjeta}>
          <Texto v="subtitulo" accessibilityRole="header">Actívalas en 3 pasos</Texto>
          <PasosNumerados
            pasos={[
              { texto: 'Abre Ajustes del teléfono' },
              { texto: 'Entra a Apps, BSL, Notificaciones' },
              { texto: 'Activa Permitir notificaciones y el canal Urgentes' },
            ]}
          />
        </View>
        <Texto v="nota" color="text3" centro>
          {chofer
            ? 'Sin notificaciones igual ves las ausencias en Inicio, pero no te avisaremos al instante.'
            : 'Sin notificaciones igual ves la buseta en el mapa, pero no te avisaremos cuando esté cerca.'}
        </Texto>
      </Pantalla>
    );
  }

  const canal = (Icono: LucideIcon, fondo: string, tinta: string, titulo: string, texto: string) => (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: fondo, alignItems: 'center', justifyContent: 'center' }}>
        <Icono size={22} color={tinta} strokeWidth={2} />
      </View>
      <View style={{ flex: 1 }}>
        <Texto v="fuerte">{titulo}</Texto>
        <Texto v="nota" color="text2">{texto}</Texto>
      </View>
    </View>
  );

  return (
    <Pantalla
      titulo="Permisos"
      onAtras={() => nav.goBack()}
      pie={
        permiso === 'concedido' ? (
          <Boton titulo="Listo" onPress={() => nav.goBack()} />
        ) : (
          <>
            <Boton titulo="Permitir notificaciones" icono={BellRing} onPress={permitir} cargando={cargando} />
            <Boton titulo="Ahora no" variante="secundario" onPress={() => nav.goBack()} />
          </>
        )
      }
    >
      <View style={tarjeta}>
        <View style={{ gap: 6 }}>
          <Texto v="titulo" accessibilityRole="header">{permiso === 'concedido' ? 'Las notificaciones están activas' : 'Activa las notificaciones'}</Texto>
          <Texto v="cuerpo" color="text2">
            {chofer
              ? 'Así sabrás al instante cuando un niño no va, cuando un representante se vincula o cuando otro chofer te pide conducir.'
              : 'Así sabrás cuando la buseta esté cerca de tu casa, cuando tus hijos suban y cuando lleguen al colegio, aunque tengas la app cerrada.'}
          </Texto>
        </View>
        {canal(Siren, c.dangerSoft, c.dangerInk, 'Urgentes', 'Buseta cerca, retrasos, desvíos, cambio de chofer. Suenan fuerte.')}
        {canal(Route, c.accentSoft, c.accentInk, 'Recorrido', 'Salida, abordaje, llegada, fin del recorrido.')}
        {canal(MessageSquare, c.primarySoft, c.primary, 'Mensajes', 'Avisos del chofer y recordatorios. Silenciosos.')}
      </View>
      {permiso !== 'concedido' ? (
        <Texto v="nota" color="text3" centro>
          Si las niegas, podrás activarlas después en Ajustes del teléfono. Sin ellas no recibirás el aviso de "buseta cerca".
        </Texto>
      ) : null}
    </Pantalla>
  );
}
