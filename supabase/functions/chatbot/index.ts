// Edge Function: chatbot  (OPCIONAL)
//
// La app responde sola las preguntas frecuentes (sin internet y sin gastar IA). Esta función solo
// recibe lo que no coincidió con ninguna: le pregunta a Gemini con el contexto de BSL y, si no
// sabe, devuelve "No tengo respuesta para eso" para que la app ofrezca hablar con una persona.
//
// Puesta en marcha:
//   supabase secrets set GEMINI_API_KEY=<tu-clave>
//   supabase functions deploy chatbot

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const SIN_RESPUESTA = 'No tengo respuesta para eso';

const CONTEXTO = `Eres el asistente de soporte de BSL (Busetas Seguras Loja), una app de transporte escolar de Loja, Ecuador.
Hay dos tipos de usuario: representantes (madres, padres, abuelos) y choferes de busetas escolares.
Lo que hace la app:
- Representante: ve la buseta en vivo en la pestaña Mapa; recibe avisos (salió, está cerca, abordó, llegó a la escuela, retraso, cambio de chofer, servicio cancelado); reporta ausencias en la pestaña Ausencias (solo ida, solo vuelta o todo el día; hoy solo antes de que inicie el recorrido); vincula a sus hijos con un código BSL-XXXX-XXXX o un QR que le da el chofer (48 horas, un solo uso); edita direcciones de origen y destino y excepciones por día en la ficha del hijo; ve el historial de 90 días.
- Chofer: registra escuelas, estudiantes y rutas (ida = casas a escuelas, vuelta = escuelas a casas); ordena las paradas; inicia el recorrido desde Inicio (necesita cuenta verificada y permiso de ubicación); marca "Abordó" y "Entregado" con un toque; envía mensajes rápidos; pausa y finaliza; puede dejar un chofer sustituto verificado y cancelar el servicio de un día; lleva un registro manual de pagos.
- Sin señal, las acciones del chofer se guardan y se envían solas al volver la conexión.
- La ubicación solo se comparte durante un recorrido y solo la ven los representantes de esa ruta.
- No hay pagos en línea dentro de la app.
Reglas: responde en español, con tuteo, en máximo 4 frases o pasos numerados cortos. No inventes funciones.
Si la pregunta no es sobre BSL o no sabes la respuesta, responde exactamente: "${SIN_RESPUESTA}".`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // Solo usuarios con sesión.
  const autorizacion = req.headers.get('Authorization') ?? '';
  try {
    const cliente = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: autorizacion } },
    });
    const { data: { user } } = await cliente.auth.getUser();
    if (!user) return json({ error: 'Sesión inválida' }, 401);
  } catch {
    return json({ error: 'Sesión inválida' }, 401);
  }

  let pregunta = '';
  let rol = 'guardian';
  try {
    const cuerpo = await req.json();
    pregunta = String(cuerpo.question ?? '').slice(0, 400).trim();
    rol = cuerpo.role === 'driver' ? 'driver' : 'guardian';
  } catch { /* cuerpo vacío */ }
  if (!pregunta) return json({ answer: SIN_RESPUESTA });

  const clave = Deno.env.get('GEMINI_API_KEY');
  if (!clave) return json({ answer: SIN_RESPUESTA });

  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${clave}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: CONTEXTO }] },
        contents: [{ role: 'user', parts: [{ text: `Quien pregunta es ${rol === 'driver' ? 'un chofer' : 'un representante'}.\nPregunta: ${pregunta}` }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 300, thinkingConfig: { thinkingBudget: 0 } },
      }),
    });
    const d = await r.json();
    const texto = d?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('').trim();
    return json({ answer: texto || SIN_RESPUESTA });
  } catch {
    return json({ answer: SIN_RESPUESTA });
  }
});
