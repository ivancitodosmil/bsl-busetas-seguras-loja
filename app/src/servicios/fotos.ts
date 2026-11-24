// Fotos: elegir o tomar una imagen y subirla. Las de estudiantes van a un bucket privado
// (se muestran con URL firmada de 1 hora); las de perfil son públicas.
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../config/supabase';

export async function elegirImagen(desde: 'galeria' | 'camara' = 'galeria', cuadrada = true): Promise<string | null> {
  const opciones: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: cuadrada, aspect: [1, 1], quality: 0.6 };
  if (desde === 'camara') {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) return null;
    const r = await ImagePicker.launchCameraAsync(opciones);
    return r.canceled ? null : r.assets[0].uri;
  }
  const r = await ImagePicker.launchImageLibraryAsync(opciones);
  return r.canceled ? null : r.assets[0].uri;
}

async function subir(bucket: string, ruta: string, uri: string) {
  const cuerpo = await (await fetch(uri)).arrayBuffer();
  const { error } = await supabase.storage.from(bucket).upload(ruta, cuerpo, { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(error.message);
}

/** Sube la foto de perfil y devuelve su URL pública. */
export async function subirFotoPerfil(userId: string, uri: string): Promise<string> {
  const ruta = `${userId}/perfil-${Date.now()}.jpg`;
  await subir('profile-photos', ruta, uri);
  return supabase.storage.from('profile-photos').getPublicUrl(ruta).data.publicUrl;
}

/** Sube la foto del estudiante y devuelve la ruta para guardar en students.photo_path. */
export async function subirFotoEstudiante(studentId: string, uri: string): Promise<string> {
  const ruta = `${studentId}/foto-${Date.now()}.jpg`;
  await subir('student-photos', ruta, uri);
  return ruta;
}

const firmadas = new Map<string, { url: string; vence: number }>();

/** URL temporal (1 h) de la foto de un estudiante. null si no tiene. */
export async function fotoEstudiante(ruta: string | null | undefined): Promise<string | null> {
  if (!ruta) return null;
  const guardada = firmadas.get(ruta);
  if (guardada && guardada.vence > Date.now()) return guardada.url;
  const { data } = await supabase.storage.from('student-photos').createSignedUrl(ruta, 3600);
  if (!data?.signedUrl) return null;
  firmadas.set(ruta, { url: data.signedUrl, vence: Date.now() + 55 * 60000 });
  return data.signedUrl;
}
