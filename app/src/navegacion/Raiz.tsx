// Navegación raíz: decide qué pila mostrar según la sesión y el rol.
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Bell, Bus, CalendarX, CircleDollarSign, Home, Map, Route, User, Users } from 'lucide-react-native';
import { useSesion } from '../estado/sesion';
import { useAvisos, useSinLeer } from '../estado/avisos';
import { viaje } from '../servicios/viaje';
import { Boton, crearBarraPestanas, EstadoError, Texto, useToast } from '../ui';
import { useTema } from '../tema';
import type { PestanasChofer, PestanasRep, PilaAcceso, PilaChofer, PilaRep } from './tipos';

// Acceso
import Bienvenida from '../pantallas/acceso/Bienvenida';
import Ingreso from '../pantallas/acceso/Ingreso';
import CrearCuenta from '../pantallas/acceso/CrearCuenta';
import VerificarCodigo from '../pantallas/acceso/VerificarCodigo';
import Recuperar from '../pantallas/acceso/Recuperar';
import Configurar from '../pantallas/acceso/Configurar';
import { modoDemo, supabaseConfigurado } from '../config/supabase';
// Comunes
import Soporte from '../pantallas/comunes/Soporte';
import EliminarCuenta from '../pantallas/comunes/EliminarCuenta';
import EditarPerfil from '../pantallas/comunes/EditarPerfil';
import PermisoAvisos from '../pantallas/comunes/PermisoAvisos';
import SelectorUbicacion from '../pantallas/comunes/SelectorUbicacion';
import CentroAvisos from '../pantallas/comunes/CentroAvisos';
// Representante
import RepInicio from '../pantallas/representante/Inicio';
import RepMapa from '../pantallas/representante/Mapa';
import RepAusencias from '../pantallas/representante/Ausencias';
import RepPerfil from '../pantallas/representante/Perfil';
import Vincular from '../pantallas/representante/Vincular';
import HijoVinculado from '../pantallas/representante/HijoVinculado';
import PreferenciasAvisos from '../pantallas/representante/PreferenciasAvisos';
import LineaTiempo from '../pantallas/representante/LineaTiempo';
import FichaHijo from '../pantallas/representante/FichaHijo';
import Direcciones from '../pantallas/representante/Direcciones';
import PerfilChofer from '../pantallas/representante/PerfilChofer';
import Historial from '../pantallas/representante/Historial';
import Reproduccion from '../pantallas/representante/Reproduccion';
// Chofer
import ChoferInicio from '../pantallas/chofer/Inicio';
import ChoferRutas from '../pantallas/chofer/Rutas';
import ChoferEstudiantes from '../pantallas/chofer/Estudiantes';
import ChoferPagos from '../pantallas/chofer/Pagos';
import ChoferPerfil from '../pantallas/chofer/Perfil';
import RegistroVehiculo from '../pantallas/chofer/RegistroVehiculo';
import RegistroDocumentos from '../pantallas/chofer/RegistroDocumentos';
import EstadoCuenta from '../pantallas/chofer/EstadoCuenta';
import PermisoUbicacion from '../pantallas/chofer/PermisoUbicacion';
import UbicacionSegundoPlano from '../pantallas/chofer/UbicacionSegundoPlano';
import Escuelas from '../pantallas/chofer/Escuelas';
import EditarEscuela from '../pantallas/chofer/EditarEscuela';
import FichaEstudiante from '../pantallas/chofer/FichaEstudiante';
import EditarEstudiante from '../pantallas/chofer/EditarEstudiante';
import Invitar from '../pantallas/chofer/Invitar';
import EditarRuta from '../pantallas/chofer/EditarRuta';
import Paradas from '../pantallas/chofer/Paradas';
import IniciarRecorrido from '../pantallas/chofer/IniciarRecorrido';
import RutaActiva from '../pantallas/chofer/RutaActiva';
import Resumen from '../pantallas/chofer/Resumen';
import Sustituto from '../pantallas/chofer/Sustituto';
import MensajesRapidos from '../pantallas/chofer/MensajesRapidos';
import HistorialChofer from '../pantallas/chofer/HistorialChofer';

const OPCIONES_PILA = { headerShown: false, animation: 'slide_from_right' } as const;

// ── Acceso ──
const PA = createNativeStackNavigator<PilaAcceso>();
// Sin sesión la app abre siempre en Ingreso (usuario y contraseña). Bienvenida queda para crear cuenta.
function Acceso() {
  return (
    <PA.Navigator screenOptions={OPCIONES_PILA} initialRouteName="Ingreso">
      <PA.Screen name="Bienvenida" component={Bienvenida} options={{ animation: 'fade' }} />
      <PA.Screen name="Ingreso" component={Ingreso} />
      <PA.Screen name="CrearCuenta" component={CrearCuenta} />
      <PA.Screen name="VerificarCodigo" component={VerificarCodigo} />
      <PA.Screen name="Recuperar" component={Recuperar} />
      <PA.Screen name="Soporte" component={Soporte} />
    </PA.Navigator>
  );
}

// ── Representante ──
const TR = createBottomTabNavigator<PestanasRep>();
const BarraRep = crearBarraPestanas({ Mapa: Map, Avisos: Bell, Inicio: Home, Ausencias: CalendarX, Perfil: User }, () => ({ Avisos: useSinLeer() }));

function PestanasRepresentante() {
  return (
    <TR.Navigator initialRouteName="Inicio" tabBar={(p) => <BarraRep {...p} />} screenOptions={{ headerShown: false }}>
      <TR.Screen name="Mapa" component={RepMapa} />
      <TR.Screen name="Avisos" component={CentroAvisos} />
      <TR.Screen name="Inicio" component={RepInicio} />
      <TR.Screen name="Ausencias" component={RepAusencias} />
      <TR.Screen name="Perfil" component={RepPerfil} />
    </TR.Navigator>
  );
}

const PR = createNativeStackNavigator<PilaRep>();
function Representante() {
  return (
    <PR.Navigator screenOptions={OPCIONES_PILA}>
      <PR.Screen name="Pestanas" component={PestanasRepresentante} />
      <PR.Screen name="Vincular" component={Vincular} />
      <PR.Screen name="HijoVinculado" component={HijoVinculado} options={{ gestureEnabled: false }} />
      <PR.Screen name="PermisoAvisos" component={PermisoAvisos} />
      <PR.Screen name="PreferenciasAvisos" component={PreferenciasAvisos} />
      <PR.Screen name="LineaTiempo" component={LineaTiempo} />
      <PR.Screen name="FichaHijo" component={FichaHijo} />
      <PR.Screen name="Direcciones" component={Direcciones} />
      <PR.Screen name="SelectorUbicacion" component={SelectorUbicacion} />
      <PR.Screen name="PerfilChofer" component={PerfilChofer} />
      <PR.Screen name="Historial" component={Historial} />
      <PR.Screen name="Reproduccion" component={Reproduccion} />
      <PR.Screen name="Soporte" component={Soporte} />
      <PR.Screen name="EliminarCuenta" component={EliminarCuenta} />
      <PR.Screen name="EditarPerfil" component={EditarPerfil} />
    </PR.Navigator>
  );
}

// ── Chofer ──
const TC = createBottomTabNavigator<PestanasChofer>();
const BarraChofer = crearBarraPestanas({ Rutas: Route, Estudiantes: Users, Inicio: Home, Pagos: CircleDollarSign, Perfil: User });

function PestanasDelChofer() {
  return (
    <TC.Navigator initialRouteName="Inicio" tabBar={(p) => <BarraChofer {...p} />} screenOptions={{ headerShown: false }}>
      <TC.Screen name="Rutas" component={ChoferRutas} />
      <TC.Screen name="Estudiantes" component={ChoferEstudiantes} />
      <TC.Screen name="Inicio" component={ChoferInicio} />
      <TC.Screen name="Pagos" component={ChoferPagos} />
      <TC.Screen name="Perfil" component={ChoferPerfil} />
    </TC.Navigator>
  );
}

const PC = createNativeStackNavigator<PilaChofer>();
function Chofer({ faltaVehiculo }: { faltaVehiculo: boolean }) {
  return (
    <PC.Navigator screenOptions={OPCIONES_PILA} initialRouteName={faltaVehiculo ? 'RegistroVehiculo' : 'Pestanas'}>
      <PC.Screen name="Pestanas" component={PestanasDelChofer} />
      <PC.Screen name="RegistroVehiculo" component={RegistroVehiculo} />
      <PC.Screen name="RegistroDocumentos" component={RegistroDocumentos} />
      <PC.Screen name="EstadoCuenta" component={EstadoCuenta} />
      <PC.Screen name="PermisoUbicacion" component={PermisoUbicacion} />
      <PC.Screen name="UbicacionSegundoPlano" component={UbicacionSegundoPlano} />
      <PC.Screen name="Escuelas" component={Escuelas} />
      <PC.Screen name="EditarEscuela" component={EditarEscuela} />
      <PC.Screen name="FichaEstudiante" component={FichaEstudiante} />
      <PC.Screen name="EditarEstudiante" component={EditarEstudiante} />
      <PC.Screen name="Invitar" component={Invitar} />
      <PC.Screen name="SelectorUbicacion" component={SelectorUbicacion} />
      <PC.Screen name="EditarRuta" component={EditarRuta} />
      <PC.Screen name="Paradas" component={Paradas} />
      <PC.Screen name="IniciarRecorrido" component={IniciarRecorrido} />
      <PC.Screen name="RutaActiva" component={RutaActiva} options={{ gestureEnabled: false }} />
      <PC.Screen name="Resumen" component={Resumen} options={{ gestureEnabled: false }} />
      <PC.Screen name="AvisosChofer" component={CentroAvisos} />
      <PC.Screen name="Sustituto" component={Sustituto} />
      <PC.Screen name="MensajesRapidos" component={MensajesRapidos} />
      <PC.Screen name="HistorialChofer" component={HistorialChofer} />
      <PC.Screen name="PermisoAvisos" component={PermisoAvisos} />
      <PC.Screen name="Soporte" component={Soporte} />
      <PC.Screen name="EliminarCuenta" component={EliminarCuenta} />
      <PC.Screen name="EditarPerfil" component={EditarPerfil} />
    </PC.Navigator>
  );
}

// Mientras se sabe si hay sesión: la forma de la pantalla, no un spinner.
function Arranque() {
  const { c } = useTema();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
        <Bus size={34} color="#FFFFFF" strokeWidth={2.2} />
      </View>
      <Texto v="titulo">BSL</Texto>
    </View>
  );
}

export default function Raiz() {
  const { listo, idSesion, usuario, chofer, recargar, salir } = useSesion();
  const toast = useToast();

  // Avisos en vivo y cola sin conexión, mientras haya sesión.
  useEffect(() => {
    if (!usuario) {
      useAvisos.getState().limpiar();
      return;
    }
    const avisos = useAvisos.getState();
    avisos.cargar();
    avisos.revisarPermiso();
    viaje.sincronizar().catch(() => {});
    return avisos.escuchar(usuario.id, (a) => toast.mostrar(a.body ? `${a.title}\n${a.body}` : a.title, { tipo: a.channel === 'urgent' ? 'error' : 'info', duracion: 4500 }));
  }, [usuario?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!supabaseConfigurado && !modoDemo) return <Configurar />;
  if (!listo) return <Arranque />;
  if (!idSesion) return <Acceso />;
  if (!usuario) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <EstadoError titulo="No pudimos cargar tu perfil" texto="Revisa tu conexión a internet. Tu cuenta y tus datos siguen guardados." onReintentar={recargar} />
        <Boton titulo="Cerrar sesión" variante="fantasma" onPress={salir} ancho={false} estilo={{ alignSelf: 'center' }} />
      </View>
    );
  }
  if (usuario.role === 'driver') return <Chofer faltaVehiculo={!chofer?.plate_number} />;
  return <Representante />;
}
