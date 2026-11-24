import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { crearClienteDemo } from '../demo/cliente';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const clave = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** false mientras .env siga con los valores de ejemplo: la app muestra cómo configurarlo. */
export const supabaseConfigurado = /^https:\/\/.+\.supabase\.co/.test(url) && !url.includes('TU-PROYECTO') && clave.length > 40;

/** 1 = el ingreso por celular (código SMS) va primero. Requiere proveedor de SMS en Supabase Auth. */
export const celularPrimero = process.env.EXPO_PUBLIC_PHONE_AUTH === '1';

/**
 * Modo demostración (datos de ejemplo en memoria, src/demo): solo para las pruebas automáticas
 * (npm run probar:demo define EXPO_PUBLIC_DEMO=1). La app real usa siempre Supabase; sin .env
 * muestra la pantalla "Falta conectar el servidor".
 */
export const modoDemo = !supabaseConfigurado && String(process.env.EXPO_PUBLIC_DEMO) === '1';

export const supabase: SupabaseClient = modoDemo
  ? (crearClienteDemo() as unknown as SupabaseClient)
  : createClient(supabaseConfigurado ? url : 'https://sin-configurar.supabase.co', supabaseConfigurado ? clave : 'sin-configurar'.padEnd(48, '0'), {
      auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
      realtime: { params: { eventsPerSecond: 5 } },
    });

/** Desenvuelve una respuesta de Supabase: devuelve los datos o lanza el error. */
export async function pedir<T>(consulta: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await consulta;
  if (error) throw new Error(error.message);
  return data as T;
}
