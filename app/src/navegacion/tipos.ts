// Rutas de navegación. Cada pantalla es el `export default` del archivo indicado en los navegadores.
import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { FichaChofer, Rol, VinculoCreado } from '../tipos';

// ── Sin sesión ──
export type PilaAcceso = {
  Bienvenida: undefined;
  Ingreso: { correo?: string } | undefined;
  CrearCuenta: { rol: Exclude<Rol, 'admin'> };
  VerificarCodigo: { celular: string };
  Recuperar: { correo?: string } | undefined;
  Soporte: undefined;
};

// ── Pantallas compartidas por los dos roles ──
type Comunes = {
  Soporte: undefined;
  EliminarCuenta: undefined;
  EditarPerfil: undefined;
  PermisoAvisos: { siguiente?: 'volver' } | undefined;
  /** Devuelve el resultado con usarSeleccionUbicacion (estado/seleccion.ts). */
  SelectorUbicacion: undefined;
};

// ── Representante ──
export type PestanasRep = {
  Mapa: { studentId?: string } | undefined;
  Avisos: undefined;
  Inicio: undefined;
  Ausencias: { studentId?: string } | undefined;
  Perfil: undefined;
};

export type PilaRep = Comunes & {
  Pestanas: NavigatorScreenParams<PestanasRep> | undefined;
  Vincular: { codigo?: string } | undefined;
  HijoVinculado: { vinculo: VinculoCreado };
  PreferenciasAvisos: undefined;
  LineaTiempo: { tripId: string; titulo?: string };
  FichaHijo: { studentId: string };
  Direcciones: { studentId: string };
  PerfilChofer: { chofer: FichaChofer; sustituto?: boolean; ruta?: string };
  Historial: { studentId?: string } | undefined;
  Reproduccion: { tripId: string; studentId?: string; titulo?: string };
};

// ── Chofer ──
export type PestanasChofer = {
  Rutas: undefined;
  Estudiantes: undefined;
  Inicio: undefined;
  Pagos: undefined;
  Perfil: undefined;
};

export type PilaChofer = Comunes & {
  Pestanas: NavigatorScreenParams<PestanasChofer> | undefined;
  RegistroVehiculo: { editar?: boolean } | undefined;
  RegistroDocumentos: undefined;
  EstadoCuenta: undefined;
  PermisoUbicacion: { routeId?: string } | undefined;
  UbicacionSegundoPlano: { routeId?: string } | undefined;
  Escuelas: undefined;
  EditarEscuela: { escuelaId?: string } | undefined;
  FichaEstudiante: { studentId: string };
  EditarEstudiante: { studentId?: string } | undefined;
  Invitar: { studentId: string };
  EditarRuta: { routeId?: string } | undefined;
  Paradas: { routeId: string };
  IniciarRecorrido: { routeId: string };
  RutaActiva: { tripId: string };
  Resumen: { tripId: string };
  AvisosChofer: undefined;
  Sustituto: undefined;
  MensajesRapidos: undefined;
  HistorialChofer: undefined;
};

export type NavAcceso = NativeStackNavigationProp<PilaAcceso>;
export type NavRep = NativeStackNavigationProp<PilaRep>;
export type NavChofer = NativeStackNavigationProp<PilaChofer>;
/** Para las pantallas comunes, que no saben en qué pila están. */
export type NavComun = NativeStackNavigationProp<Comunes>;
