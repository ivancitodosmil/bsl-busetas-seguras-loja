// Puente para el Selector de ubicación: la pantalla que lo abre espera una promesa y el selector
// la resuelve al guardar (o con null si se cierra sin elegir). Evita pasar funciones por la navegación.
import { create } from 'zustand';
import type { Coordenada, Direccion } from '../tipos';

export type DireccionBorrador = Pick<
  Direccion,
  'label' | 'kind' | 'main_street' | 'cross_street' | 'house_number' | 'neighborhood' | 'reference' | 'receiver_note' | 'latitude' | 'longitude' | 'gps_accuracy_m'
>;

export interface OpcionesSelector {
  titulo: string; // "Dirección de recogida", "Ubicación de la escuela"…
  inicial?: Partial<DireccionBorrador> | null;
  centro?: Coordenada | null; // dónde abrir el mapa si no hay dirección previa
  /** 'escuela' oculta etiqueta, número de casa y "usar como". */
  modo?: 'casa' | 'escuela';
}

interface EstadoSeleccion {
  opciones: OpcionesSelector | null;
  resolver: ((d: DireccionBorrador | null) => void) | null;
}

export const useSeleccion = create<EstadoSeleccion>(() => ({ opciones: null, resolver: null }));

/**
 * Abre el selector y espera el resultado:
 *   const d = await elegirUbicacion(navigation, { titulo: 'Dirección de recogida' });
 *   if (d) …
 */
export function elegirUbicacion(
  navigation: { navigate: (pantalla: 'SelectorUbicacion') => void },
  opciones: OpcionesSelector,
): Promise<DireccionBorrador | null> {
  return new Promise((resolver) => {
    useSeleccion.getState().resolver?.(null);
    useSeleccion.setState({ opciones, resolver });
    navigation.navigate('SelectorUbicacion');
  });
}

/** Lo llama el selector al guardar o al salir. */
export function terminarSeleccion(resultado: DireccionBorrador | null) {
  const { resolver } = useSeleccion.getState();
  useSeleccion.setState({ opciones: null, resolver: null });
  resolver?.(resultado);
}
