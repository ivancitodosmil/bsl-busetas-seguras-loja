// Sesión: cuenta, perfil y (si es chofer) datos del vehículo. Única fuente de verdad del "quién soy".
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { pedir, supabase } from '../config/supabase';
import type { Chofer, Rol, Usuario } from '../tipos';

const CLAVE_INTENTOS = 'bsl_intentos_login'; // de una versión anterior con bloqueo: se borra al abrir
const CLAVE_YA_INGRESO = 'bsl_ya_ingreso'; // tras la primera sesión, al salir se abre Ingreso y no Bienvenida

interface DatosRegistro {
  rol: Exclude<Rol, 'admin'>;
  nombres: string;
  apellidos: string;
  celular: string | null; // E.164
  correo: string;
  contrasena: string;
  licencia?: string;
}

interface EstadoSesion {
  listo: boolean; // ya se sabe si hay sesión o no
  idSesion: string | null; // id de auth (puede existir antes de que cargue el perfil)
  usuario: Usuario | null;
  chofer: Chofer | null;
  yaIngreso: boolean; // alguna vez hubo sesión en este teléfono

  iniciar: () => () => void;
  recargar: () => Promise<void>;
  entrar: (correo: string, contrasena: string) => Promise<void>;
  registrar: (d: DatosRegistro) => Promise<{ requiereConfirmar: boolean }>;
  enviarCodigo: (celular: string, meta?: { rol: Rol; nombres: string; apellidos: string }) => Promise<void>;
  verificarCodigo: (celular: string, codigo: string) => Promise<void>;
  recuperar: (correo: string) => Promise<void>;
  salir: () => Promise<void>;
  eliminarCuenta: () => Promise<void>;
  actualizarPerfil: (cambios: Partial<Pick<Usuario, 'first_name' | 'last_name' | 'phone' | 'photo_url'>>) => Promise<void>;
  actualizarChofer: (cambios: Partial<Chofer>) => Promise<void>;
}

async function cargarPerfil(id: string): Promise<{ usuario: Usuario | null; chofer: Chofer | null }> {
  const usuario = await pedir<Usuario | null>(supabase.from('users').select('*').eq('id', id).maybeSingle());
  let chofer: Chofer | null = null;
  if (usuario?.role === 'driver') {
    chofer = await pedir<Chofer | null>(supabase.from('drivers').select('*').eq('id', id).maybeSingle());
  }
  return { usuario, chofer };
}

export const useSesion = create<EstadoSesion>((set, get) => ({
  listo: false,
  idSesion: null,
  usuario: null,
  chofer: null,
  yaIngreso: false,

  // Se llama una vez al abrir la app. Devuelve la función para dejar de escuchar.
  iniciar: () => {
    AsyncStorage.removeItem(CLAVE_INTENTOS).catch(() => {});

    // La pantalla de acceso depende de esta marca: se lee antes de declarar "listo".
    const marca = AsyncStorage.getItem(CLAVE_YA_INGRESO)
      .then((v) => { if (v === '1') set({ yaIngreso: true }); })
      .catch(() => {});

    const { data } = supabase.auth.onAuthStateChange((evento, sesion) => {
      const id = sesion?.user?.id ?? null;
      if (!id) {
        set({ idSesion: null, usuario: null, chofer: null });
        marca.finally(() => set({ listo: true }));
        return;
      }
      if (!get().yaIngreso) {
        set({ yaIngreso: true });
        AsyncStorage.setItem(CLAVE_YA_INGRESO, '1').catch(() => {});
      }
      if (evento === 'TOKEN_REFRESHED' && get().usuario) return;
      set({ idSesion: id });
      // Fuera del callback de auth para no bloquear el cliente de Supabase.
      setTimeout(() => {
        get().recargar().finally(() => set({ listo: true }));
      }, 0);
    });
    return () => data.subscription.unsubscribe();
  },

  recargar: async () => {
    const id = get().idSesion;
    if (!id) return;
    try {
      // El perfil lo crea un disparador del servidor: se reintenta un instante por si aún no llega.
      for (let i = 0; i < 4; i++) {
        const r = await cargarPerfil(id);
        if (r.usuario) {
          set(r);
          return;
        }
        await new Promise((ok) => setTimeout(ok, 500));
      }
    } catch {
      // sin conexión: se conserva lo que haya
    }
  },

  entrar: async (correo, contrasena) => {
    const { error } = await supabase.auth.signInWithPassword({ email: correo.trim().toLowerCase(), password: contrasena });
    if (error) throw new Error(error.message);
  },

  registrar: async (d) => {
    const { data, error } = await supabase.auth.signUp({
      email: d.correo.trim().toLowerCase(),
      password: d.contrasena,
      options: {
        data: {
          role: d.rol,
          first_name: d.nombres.trim(),
          last_name: d.apellidos.trim(),
          phone: d.celular ?? '',
          license_number: d.licencia?.trim() ?? '',
        },
      },
    });
    if (error) throw new Error(error.message);
    // Con "Confirm email" activo en Supabase no hay sesión hasta abrir el enlace del correo.
    return { requiereConfirmar: !data.session };
  },

  enviarCodigo: async (celular, meta) => {
    const { error } = await supabase.auth.signInWithOtp({
      phone: celular,
      options: meta ? { data: { role: meta.rol, first_name: meta.nombres.trim(), last_name: meta.apellidos.trim(), phone: celular } } : { shouldCreateUser: false },
    });
    if (error) throw new Error(error.message);
  },

  verificarCodigo: async (celular, codigo) => {
    const { error } = await supabase.auth.verifyOtp({ phone: celular, token: codigo, type: 'sms' });
    if (error) throw new Error(error.message);
  },

  recuperar: async (correo) => {
    const { error } = await supabase.auth.resetPasswordForEmail(correo.trim().toLowerCase());
    if (error) throw new Error(error.message);
  },

  salir: async () => {
    await supabase.auth.signOut().catch(() => {});
    set({ idSesion: null, usuario: null, chofer: null });
  },

  eliminarCuenta: async () => {
    await pedir(supabase.rpc('eliminar_mi_cuenta'));
    await supabase.auth.signOut().catch(() => {});
    set({ idSesion: null, usuario: null, chofer: null });
  },

  actualizarPerfil: async (cambios) => {
    const id = get().idSesion;
    if (!id) return;
    const usuario = await pedir<Usuario>(supabase.from('users').update(cambios).eq('id', id).select().single());
    set({ usuario });
  },

  actualizarChofer: async (cambios) => {
    const id = get().idSesion;
    if (!id) return;
    const chofer = await pedir<Chofer>(supabase.from('drivers').update(cambios).eq('id', id).select().single());
    set({ chofer });
  },
}));
