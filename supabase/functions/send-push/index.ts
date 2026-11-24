// Edge Function: send-push  (OPCIONAL: solo hace falta para recibir avisos con la app cerrada)
//
// La llama el disparador `notifications_push` de Postgres con { notification_id }. Lee el aviso,
// respeta las preferencias del usuario (canal apagado, horario silencioso; lo urgente siempre sale)
// y lo envía a todos sus dispositivos por la API de Expo Push.
//
// Puesta en marcha:
//   1. supabase functions deploy send-push --no-verify-jwt
//   2. supabase secrets set PUSH_FUNCTION_SECRET=<una-clave-larga>
//   3. En el SQL Editor (activa antes la extensión pg_net en Database → Extensions):
//        insert into app_config (key, value) values
//          ('push_function_url', 'https://<TU-PROYECTO>.supabase.co/functions/v1/send-push'),
//          ('push_function_secret', '<la-misma-clave>')
//        on conflict (key) do update set value = excluded.value;

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });

// Minutos del día en Loja (UTC−5).
function minutosEnLoja(): number {
  const d = new Date(Date.now() - 5 * 3600 * 1000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
const aMin = (t: string | null) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null);

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const secreto = Deno.env.get('PUSH_FUNCTION_SECRET');
  const recibido = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!secreto || recibido !== secreto) return json({ error: 'Unauthorized' }, 401);

  let id: string | undefined;
  try {
    id = (await req.json()).notification_id;
  } catch {
    return json({ error: 'JSON inválido' }, 400);
  }
  if (!id) return json({ error: 'Falta notification_id' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: aviso } = await admin.from('notifications').select('*').eq('id', id).maybeSingle();
  if (!aviso) return json({ ok: true, omitido: 'aviso inexistente' });

  // Preferencias: primero la del niño, luego la general.
  const { data: prefs } = await admin.from('notification_preferences').select('*').eq('user_id', aviso.user_id);
  const pref = (prefs ?? []).find((p) => p.student_id && p.student_id === aviso.student_id) ?? (prefs ?? []).find((p) => !p.student_id);
  const urgente = aviso.channel === 'urgent';
  if (pref && !urgente) {
    if (aviso.channel === 'trip' && !pref.trip) return json({ ok: true, omitido: 'canal apagado' });
    if (aviso.channel === 'messages' && !pref.messages) return json({ ok: true, omitido: 'canal apagado' });
    const desde = aMin(pref.quiet_from), hasta = aMin(pref.quiet_to), ahora = minutosEnLoja();
    if (desde !== null && hasta !== null) {
      const enSilencio = desde <= hasta ? ahora >= desde && ahora < hasta : ahora >= desde || ahora < hasta;
      if (enSilencio) return json({ ok: true, omitido: 'horario silencioso' });
    }
  }

  const { data: tokens } = await admin.from('push_tokens').select('token').eq('user_id', aviso.user_id);
  if (!tokens?.length) return json({ ok: true, omitido: 'sin dispositivos' });

  // La buseta a 1 km y a 500 m suena como alarma: canal propio en Android (vibración larga, pantalla
  // bloqueada) y "time-sensitive" en iPhone para atravesar los modos de concentración.
  const alarma = aviso.type === 'bus_near' || aviso.type === 'bus_arriving';
  const mensajes = tokens.map((t) => ({
    to: t.token,
    title: aviso.title,
    body: aviso.body,
    channelId: alarma ? 'alarma_buseta' : aviso.channel, // alarma_buseta | urgent | trip | messages (canales creados por la app)
    priority: urgente || alarma ? 'high' : 'default',
    sound: aviso.channel === 'messages' ? null : 'default',
    ...(alarma ? { interruptionLevel: 'time-sensitive', ttl: 300 } : {}),
    data: { aviso: aviso.id, type: aviso.type, trip_id: aviso.trip_id, student_id: aviso.student_id, route_id: aviso.route_id },
  }));

  const r = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(mensajes),
  });
  const resultado = await r.json().catch(() => null);

  // Tokens que ya no existen (app desinstalada): se limpian.
  const caducos = (resultado?.data ?? [])
    .map((x: { status: string; details?: { error?: string } }, i: number) => (x.details?.error === 'DeviceNotRegistered' ? tokens[i].token : null))
    .filter(Boolean);
  if (caducos.length) await admin.from('push_tokens').delete().in('token', caducos);

  return json({ ok: r.ok, enviados: mensajes.length, caducos: caducos.length }, r.ok ? 200 : 502);
});
