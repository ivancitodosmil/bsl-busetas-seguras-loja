// Centro de avisos: lista, contador de no leídos, tiempo real y permiso de notificaciones.
import { Platform } from 'react-native';
import { create } from 'zustand';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { pedir, supabase } from '../config/supabase';
import type { Aviso, CanalAviso } from '../tipos';

const enExpoGo = Constants.executionEnvironment === 'storeClient';

// Cómo se muestran los avisos con la app abierta.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

const CANALES: Record<CanalAviso, { nombre: string; importancia: Notifications.AndroidImportance; descripcion: string }> = {
  urgent: { nombre: 'Urgentes', importancia: Notifications.AndroidImportance.MAX, descripcion: 'Buseta cerca, retrasos, desvíos, cambio de chofer y cancelaciones' },
  trip: { nombre: 'Recorrido', importancia: Notifications.AndroidImportance.DEFAULT, descripcion: 'Salida, abordaje, llegada y fin del recorrido' },
  messages: { nombre: 'Mensajes', importancia: Notifications.AndroidImportance.LOW, descripcion: 'Mensajes del chofer y recordatorios' },
};

/** Avisos que suenan como alarma: la buseta a 1 km y a 500 m de tu casa. */
export const TIPOS_ALARMA = ['bus_near', 'bus_arriving'];
export const esAlarma = (a: Pick<Aviso, 'type'>) => TIPOS_ALARMA.includes(a.type);
// Vibración tipo alarma: tres pulsos largos.
export const PATRON_ALARMA = [0, 900, 350, 900, 350, 1400];

async function crearCanales() {
  if (Platform.OS !== 'android') return;
  for (const [id, canal] of Object.entries(CANALES)) {
    await Notifications.setNotificationChannelAsync(id, {
      name: canal.nombre,
      description: canal.descripcion,
      importance: canal.importancia,
      vibrationPattern: id === 'urgent' ? [0, 400, 200, 400] : undefined,
      lightColor: '#1B4D89',
    });
  }
  // Canal propio para la alarma de la buseta: máxima prioridad, vibración larga, sonido y visible
  // en la pantalla bloqueada. (Android no deja cambiar un canal ya creado: por eso es uno nuevo.)
  await Notifications.setNotificationChannelAsync('alarma_buseta', {
    name: 'Alarma de la buseta',
    description: 'Suena cuando la buseta está a 1 km y a 500 m de tu casa',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: PATRON_ALARMA,
    enableVibrate: true,
    sound: 'default',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
    lightColor: '#C53A3A',
  });
}

interface EstadoAvisos {
  avisos: Aviso[];
  cargando: boolean;
  error: boolean;
  permiso: 'concedido' | 'denegado' | 'sin_preguntar';
  /** Aviso de cercanía que se muestra como alarma a pantalla completa (null = ninguna). */
  alarma: Aviso | null;
  cerrarAlarma: () => void;
  cargar: () => Promise<void>;
  /** Empieza a escuchar avisos nuevos del usuario. Devuelve cómo dejar de escuchar. */
  escuchar: (userId: string, alLlegar?: (a: Aviso) => void) => () => void;
  marcarLeido: (id: string) => Promise<void>;
  marcarTodos: () => Promise<void>;
  borrar: (id: string) => Promise<void>;
  borrarTodo: () => Promise<void>;
  revisarPermiso: () => Promise<void>;
  /** Muestra el diálogo del sistema y registra el token push (si el dispositivo lo permite). */
  pedirPermiso: () => Promise<boolean>;
  limpiar: () => void;
}

export const useAvisos = create<EstadoAvisos>((set, get) => ({
  avisos: [],
  cargando: false,
  error: false,
  permiso: 'sin_preguntar',
  alarma: null,
  cerrarAlarma: () => {
    const a = get().alarma;
    set({ alarma: null });
    if (a) get().marcarLeido(a.id).catch(() => {});
  },

  cargar: async () => {
    set({ cargando: true, error: false });
    try {
      const avisos = await pedir<Aviso[]>(supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(150));
      set({ avisos, cargando: false });
    } catch {
      set({ cargando: false, error: true });
    }
  },

  escuchar: (userId, alLlegar) => {
    const canal = supabase
      .channel(`avisos-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, (c) => {
        const a = c.new as Aviso;
        if (get().avisos.some((x) => x.id === a.id)) return;
        set({ avisos: [a, ...get().avisos] });
        alLlegar?.(a);
        // La buseta a 1 km o a 500 m: alarma a pantalla completa dentro de la app.
        if (esAlarma(a)) set({ alarma: a });
        // Aviso del sistema con la app abierta o recién minimizada (el push con la app cerrada lo envía el servidor).
        if (get().permiso === 'concedido') {
          Notifications.scheduleNotificationAsync({
            content: {
              title: a.title, body: a.body, data: { aviso: a.id, type: a.type, trip_id: a.trip_id, student_id: a.student_id }, sound: a.channel !== 'messages',
              ...(esAlarma(a) ? { priority: Notifications.AndroidNotificationPriority.MAX, vibrate: PATRON_ALARMA, interruptionLevel: 'timeSensitive' as const } : null),
            },
            trigger: Platform.OS === 'android' ? { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1, channelId: esAlarma(a) ? 'alarma_buseta' : a.channel } : null,
          }).catch(() => {});
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'notifications' }, (c) => {
        const id = (c.old as { id?: string }).id;
        if (id) set({ avisos: get().avisos.filter((x) => x.id !== id) });
      })
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  },

  marcarLeido: async (id) => {
    const ahora = new Date().toISOString();
    set({ avisos: get().avisos.map((a) => (a.id === id && !a.read_at ? { ...a, read_at: ahora } : a)) });
    await supabase.from('notifications').update({ read_at: ahora }).eq('id', id).is('read_at', null);
  },

  marcarTodos: async () => {
    const ahora = new Date().toISOString();
    set({ avisos: get().avisos.map((a) => (a.read_at ? a : { ...a, read_at: ahora })) });
    await supabase.from('notifications').update({ read_at: ahora }).is('read_at', null);
  },

  borrar: async (id) => {
    set({ avisos: get().avisos.filter((a) => a.id !== id) });
    await supabase.from('notifications').delete().eq('id', id);
  },

  borrarTodo: async () => {
    const ids = get().avisos.map((a) => a.id);
    set({ avisos: [] });
    if (ids.length) await supabase.from('notifications').delete().in('id', ids);
  },

  revisarPermiso: async () => {
    const p = await Notifications.getPermissionsAsync();
    set({ permiso: p.granted ? 'concedido' : p.canAskAgain ? 'sin_preguntar' : 'denegado' });
    if (p.granted) crearCanales().catch(() => {});
  },

  pedirPermiso: async () => {
    await crearCanales().catch(() => {});
    const p = await Notifications.requestPermissionsAsync();
    set({ permiso: p.granted ? 'concedido' : p.canAskAgain ? 'sin_preguntar' : 'denegado' });
    if (!p.granted) return false;
    // El token push solo existe en un teléfono real con la app compilada (no en Expo Go ni emuladores).
    if (Device.isDevice && !enExpoGo) {
      try {
        const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
        const token = (await Notifications.getExpoPushTokenAsync(projectId && !projectId.startsWith('REEMPLAZAR') ? { projectId } : undefined)).data;
        await supabase.rpc('registrar_token_push', { p_token: token, p_platform: Platform.OS });
      } catch { /* sin token: quedan los avisos dentro de la app */ }
    }
    return true;
  },

  limpiar: () => set({ avisos: [], error: false, alarma: null }),
}));

/** Cuántos avisos están sin leer (para la insignia de la pestaña). */
export const useSinLeer = () => useAvisos((s) => s.avisos.reduce((n, a) => n + (a.read_at ? 0 : 1), 0));

/** Tono de cada tipo de aviso (lo usan el centro de avisos y las listas de Inicio). */
export function tonoDeAviso(a: Pick<Aviso, 'type' | 'channel'>): 'urgente' | 'exito' | 'info' | 'aviso' {
  if (['student_boarded', 'student_dropped', 'school_arrival', 'trip_finished', 'guardian_linked', 'substitute_accepted', 'service_restored'].includes(a.type)) return 'exito';
  if (['delay', 'trip_paused', 'absence_received', 'substitute_request'].includes(a.type)) return 'aviso';
  if (a.channel === 'urgent') return 'urgente';
  return 'info';
}
