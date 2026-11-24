// Soporte: preguntas frecuentes locales (funcionan sin conexión) y, si está desplegada, la
// Edge Function "chatbot" para lo que no esté en la lista.
import { supabase } from '../config/supabase';
import type { Rol } from '../tipos';

export interface Respuesta { texto: string; pasos?: string[]; sinRespuesta?: boolean }
interface Faq { para: Rol | 'todos'; pregunta: string; claves: string[]; respuesta: Respuesta }

export const CONTACTO_SOPORTE = { correo: 'soporte@bsl.app', whatsapp: '+593987654321' };

const FAQS: Faq[] = [
  { para: 'guardian', pregunta: '¿Cómo reporto una ausencia?', claves: ['ausencia', 'falta', 'no va', 'no ira', 'enfermo', 'faltar'],
    respuesta: { texto: 'En 3 pasos:', pasos: ['Abre Ausencias en la barra de abajo.', 'Elige a tu hijo y toca el día.', 'Escoge solo ida, solo vuelta o todo el día y confirma.'] } },
  { para: 'guardian', pregunta: 'No me llegan los avisos', claves: ['avisos', 'notificacion', 'no llegan', 'no suena', 'alerta'],
    respuesta: { texto: 'Revisa esto:', pasos: ['En Perfil, Preferencias de avisos: que Urgentes y Recorrido estén activos.', 'En Ajustes del teléfono, Apps, BSL, Notificaciones: activa Permitir notificaciones.', 'Quita a BSL del ahorro de batería para que reciba avisos con la app cerrada.'] } },
  { para: 'guardian', pregunta: '¿Cómo vinculo a otro hijo?', claves: ['vincular', 'otro hijo', 'codigo', 'invitacion', 'qr'],
    respuesta: { texto: 'Pide el código al chofer y:', pasos: ['Abre Perfil y toca Vincular otro.', 'Escribe el código BSL-XXXX-XXXX o escanea el QR.', 'Confirma. El código dura 48 horas y es de un solo uso.'] } },
  { para: 'guardian', pregunta: '¿Dónde veo la buseta?', claves: ['mapa', 'donde', 'buseta', 'ubicacion', 'rastreo', 'ver'],
    respuesta: { texto: 'En la pestaña Mapa. La buseta aparece cuando el chofer inicia el recorrido y se actualiza cada 5 segundos. Si tus hijos van en busetas distintas, toca el nombre de cada uno arriba.' } },
  { para: 'guardian', pregunta: '¿Cómo cambio la dirección de recogida?', claves: ['direccion', 'casa', 'cambiar', 'abuelos', 'origen', 'destino', 'mudanza'],
    respuesta: { texto: 'Desde la ficha de tu hijo:', pasos: ['Abre Perfil y toca a tu hijo.', 'Entra a Editar direcciones y excepciones.', 'Agrega la dirección o elige en qué días se usa. El chofer recibe el aviso.'] } },
  { para: 'guardian', pregunta: '¿Puede otra persona recibir los avisos?', claves: ['otra persona', 'abuela', 'papa', 'mama', 'representante', 'compartir', 'invitar'],
    respuesta: { texto: 'Sí. Cada niño puede tener varios representantes. Pídele al chofer un código nuevo para esa persona: al vincularse recibe los mismos avisos que tú.' } },
  { para: 'driver', pregunta: '¿Cómo creo una ruta?', claves: ['crear ruta', 'nueva ruta', 'ruta', 'paradas', 'ordenar'],
    respuesta: { texto: 'En 3 pasos:', pasos: ['Registra las escuelas desde Rutas, Escuelas.', 'Agrega a tus estudiantes con su dirección.', 'Crea la ruta, elige ida o vuelta y ordena las paradas. Toca Optimizar para un orden sugerido.'] } },
  { para: 'driver', pregunta: '¿Cómo invito a un representante?', claves: ['invitar', 'codigo', 'representante', 'vincular', 'qr', 'whatsapp'],
    respuesta: { texto: 'Abre Estudiantes, toca al niño y luego Invitar. Envía el código por WhatsApp o muestra el QR. Dura 48 horas y es de un solo uso; puedes generar otro cuando quieras.' } },
  { para: 'driver', pregunta: '¿Por qué no puedo iniciar el recorrido?', claves: ['no puedo iniciar', 'iniciar', 'verificad', 'bloqueado', 'revision'],
    respuesta: { texto: 'Revisa tres cosas:', pasos: ['Que tu cuenta esté verificada (Perfil, Estado de la cuenta).', 'Que BSL tenga permiso de ubicación.', 'Que el servicio de hoy no esté cancelado y no tengas otro recorrido en curso.'] } },
  { para: 'driver', pregunta: '¿Qué pasa si me quedo sin señal?', claves: ['sin señal', 'sin conexion', 'internet', 'offline', 'datos'],
    respuesta: { texto: 'Sigue trabajando normal. Los abordajes y entregas se guardan en el teléfono y se envían solos cuando vuelve la señal. Verás cuántas acciones están pendientes en la parte de arriba.' } },
  { para: 'driver', pregunta: '¿Cómo dejo un sustituto?', claves: ['sustituto', 'reemplazo', 'otro chofer', 'delegar', 'no puedo conducir'],
    respuesta: { texto: 'En Rutas toca Sustituto, busca al chofer por su celular o correo (debe estar verificado), elige la fecha y envía la solicitud. Cuando acepta, los representantes reciben su nombre, foto y placa.' } },
  { para: 'driver', pregunta: '¿Cómo cancelo el servicio de un día?', claves: ['cancelar', 'feriado', 'mantenimiento', 'no trabajo', 'suspender'],
    respuesta: { texto: 'En Rutas toca Cancelar día, elige la fecha y el motivo. Los representantes reciben el aviso al instante y puedes deshacerlo desde Inicio.' } },
  { para: 'todos', pregunta: '¿Cómo cambio mi contraseña?', claves: ['contraseña', 'clave', 'olvide', 'recuperar', 'password'],
    respuesta: { texto: 'Cierra sesión y toca "¿Olvidaste tu contraseña?" en la pantalla de ingreso. Te enviamos un enlace a tu correo para crear una nueva.' } },
  { para: 'todos', pregunta: '¿Quién puede ver la ubicación de la buseta?', claves: ['privacidad', 'quien ve', 'seguridad', 'datos', 'ubicacion'],
    respuesta: { texto: 'Solo los representantes vinculados a un niño de esa ruta, y solo mientras hay un recorrido iniciado. Fuera de un recorrido BSL no usa la ubicación del chofer.' } },
  { para: 'todos', pregunta: '¿Cómo elimino mi cuenta?', claves: ['eliminar cuenta', 'borrar cuenta', 'darme de baja', 'eliminar'],
    respuesta: { texto: 'En Perfil, Eliminar cuenta. Verás qué se borra y deberás escribir ELIMINAR para confirmar. No se puede deshacer.' } },
];

const SIN_RESPUESTA: Respuesta = { texto: 'No tengo respuesta para eso. ¿Quieres escribirle a una persona del equipo BSL?', sinRespuesta: true };

const TILDES: Record<string, string> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u' };
const normalizar = (t: string) => t.toLowerCase().replace(/[áéíóúü]/g, (l) => TILDES[l]);

export const soporte = {
  /** Preguntas sugeridas para el rol. */
  sugeridas: (rol: Rol) => FAQS.filter((f) => f.para === rol || f.para === 'todos').map((f) => f.pregunta).slice(0, 5),

  async responder(pregunta: string, rol: Rol): Promise<Respuesta> {
    const p = normalizar(pregunta);
    let mejor: Faq | null = null;
    let puntos = 0;
    for (const f of FAQS) {
      if (f.para !== 'todos' && f.para !== rol) continue;
      if (normalizar(f.pregunta) === p) return f.respuesta;
      const n = f.claves.filter((k) => p.includes(normalizar(k))).length;
      if (n > puntos) {
        puntos = n;
        mejor = f;
      }
    }
    if (mejor) return mejor.respuesta;
    try {
      const { data, error } = await supabase.functions.invoke('chatbot', { body: { question: pregunta, role: rol } });
      const texto = (data as { answer?: string } | null)?.answer;
      if (!error && texto && !texto.toLowerCase().includes('no tengo respuesta')) return { texto };
    } catch {
      // función no desplegada o sin conexión
    }
    return SIN_RESPUESTA;
  },
};
