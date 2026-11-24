-- ============================================================================
-- BSL · Archivo 2 de 3 · Funciones, disparadores, RLS, Realtime y Storage.
-- Ejecutar después de 01_esquema.sql. Se puede volver a ejecutar.
-- Regla: ninguna política consulta otra tabla directamente; toda comprobación
-- de pertenencia pasa por funciones SECURITY DEFINER (sin ciclos de RLS).
-- ============================================================================

-- ───────────────────── Funciones de pertenencia ───────────────────────────
create or replace function public.es_representante_de(p_student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from student_guardians where student_id = p_student and user_id = auth.uid())
$$;

-- El titular, o su sustituto aceptado para hoy.
create or replace function public.actua_como_chofer(p_driver uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_driver = auth.uid() or exists (
    select 1 from driver_substitutions
    where driver_id = p_driver and substitute_id = auth.uid()
      and status = 'accepted' and date = public.hoy())
$$;

create or replace function public.es_mi_chofer(p_driver uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from students s join student_guardians g on g.student_id = s.id
    where s.driver_id = p_driver and g.user_id = auth.uid())
$$;

create or replace function public.chofer_de_estudiante(p_student uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select driver_id from students where id = p_student
$$;

create or replace function public.chofer_de_ruta(p_route uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select driver_id from routes where id = p_route
$$;

create or replace function public.es_representante_de_ruta(p_route uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from route_stops rs join student_guardians g on g.student_id = rs.student_id
    where rs.route_id = p_route and g.user_id = auth.uid())
$$;

create or replace function public.conduce_viaje(p_trip uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from trips where id = p_trip and driver_id = auth.uid())
$$;

create or replace function public.es_chofer_de_viaje(p_trip uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from trips t join routes r on r.id = t.route_id
                 where t.id = p_trip and (t.driver_id = auth.uid() or r.driver_id = auth.uid()))
$$;

create or replace function public.puede_ver_viaje(p_trip uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from trips t join routes r on r.id = t.route_id
    where t.id = p_trip
      and (t.driver_id = auth.uid() or r.driver_id = auth.uid()
           or public.es_representante_de_ruta(t.route_id)))
$$;

create or replace function public.puede_ver_usuario(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user = auth.uid()
    -- el chofer (o su sustituto de hoy) ve a los representantes de sus estudiantes
    or exists (select 1 from students s join student_guardians g on g.student_id = s.id
               where g.user_id = p_user and public.actua_como_chofer(s.driver_id))
    -- el representante ve a su chofer, a los otros representantes del niño y al sustituto
    or exists (select 1 from student_guardians me join students s on s.id = me.student_id
               where me.user_id = auth.uid()
                 and (s.driver_id = p_user
                      or exists (select 1 from student_guardians o
                                 where o.student_id = s.id and o.user_id = p_user)
                      or exists (select 1 from driver_substitutions d
                                 where d.driver_id = s.driver_id and d.substitute_id = p_user
                                   and d.status = 'accepted' and d.date >= public.hoy())))
    -- titular y sustituto se ven entre sí
    or exists (select 1 from driver_substitutions d
               where (d.driver_id = auth.uid() and d.substitute_id = p_user)
                  or (d.substitute_id = auth.uid() and d.driver_id = p_user))
$$;

-- ───────────────────── Alta de usuario (perfil automático) ────────────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role text := coalesce(m->>'role', 'guardian');
  v_phone text := nullif(coalesce(nullif(new.phone, ''), m->>'phone'), '');
begin
  if v_role not in ('driver', 'guardian') then v_role := 'guardian'; end if;
  begin
    insert into users (id, role, first_name, last_name, phone, email)
    values (new.id, v_role, coalesce(m->>'first_name', ''), coalesce(m->>'last_name', ''), v_phone, new.email)
    on conflict (id) do nothing;
  exception when unique_violation then
    -- el celular ya está en otra cuenta: se crea el perfil sin celular para no bloquear el registro
    insert into users (id, role, first_name, last_name, phone, email)
    values (new.id, v_role, coalesce(m->>'first_name', ''), coalesce(m->>'last_name', ''), null, new.email)
    on conflict (id) do nothing;
  end;
  if v_role = 'driver' then
    insert into drivers (id) values (new.id) on conflict (id) do nothing;
    insert into driver_private (driver_id, license_number)
    values (new.id, m->>'license_number') on conflict (driver_id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────── Notificaciones ─────────────────────────────────────
create or replace function public.notificar(p_user uuid, p_type text, p_channel text, p_title text, p_body text,
  p_student uuid default null, p_trip uuid default null, p_route uuid default null, p_data jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, type, channel, title, body, student_id, trip_id, route_id, data)
  values (p_user, p_type, p_channel, left(p_title, 60), left(p_body, 140), p_student, p_trip, p_route, coalesce(p_data, '{}'))
$$;

-- A los representantes (con avisos activos) de un niño.
create or replace function public.notificar_estudiante(p_student uuid, p_type text, p_channel text, p_title text,
  p_body text, p_trip uuid default null, p_route uuid default null, p_data jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, type, channel, title, body, student_id, trip_id, route_id, data)
  select g.user_id, p_type, p_channel, left(p_title, 60), left(p_body, 140), p_student, p_trip, p_route, coalesce(p_data, '{}')
  from student_guardians g where g.student_id = p_student and g.receives_notifications
$$;

-- A todos los representantes de una ruta, una sola vez por persona.
create or replace function public.notificar_ruta(p_route uuid, p_type text, p_channel text, p_title text,
  p_body text, p_trip uuid default null, p_data jsonb default '{}')
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into notifications (user_id, type, channel, title, body, trip_id, route_id, data)
  select distinct g.user_id, p_type, p_channel, left(p_title, 60), left(p_body, 140), p_trip, p_route, coalesce(p_data, '{}')
  from route_stops rs join student_guardians g on g.student_id = rs.student_id
  where rs.route_id = p_route and g.receives_notifications;
  get diagnostics n = row_count;
  return n;
end $$;

-- Reenvío a la Edge Function send-push (opcional: solo si app_config tiene la URL).
create or replace function public.tg_notification_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_url text; v_secret text;
begin
  select value into v_url from app_config where key = 'push_function_url';
  if v_url is null or v_url = '' then return new; end if;
  select value into v_secret from app_config where key = 'push_function_secret';
  begin
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'Authorization', 'Bearer ' || coalesce(v_secret, '')),
      body := jsonb_build_object('notification_id', new.id));
  exception when others then null;   -- un fallo del push nunca bloquea la operación
  end;
  return new;
end $$;

drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push after insert on public.notifications
  for each row execute function public.tg_notification_push();

-- ───────────────────── Choferes: verificación ─────────────────────────────
create or replace function public.tg_driver_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.plate_number is not null then new.plate_number := upper(new.plate_number); end if;
  if auth.uid() is not null and new.verification_status is distinct from old.verification_status then
    -- desde la app el chofer solo puede "enviar a revisión"; aprobar o rechazar es del equipo BSL
    if new.verification_status <> 'in_review' or old.verification_status = 'verified' then
      raise exception 'CAMBIO_DE_ESTADO_NO_PERMITIDO';
    end if;
    if exists (select 1 from app_config where key = 'auto_verify_drivers' and value = 'true') then
      new.verification_status := 'verified';
    end if;
  end if;
  if new.verification_status = 'verified' and old.verification_status <> 'verified' then
    new.verified_at := now();
    new.reviewer_note := null;
  end if;
  return new;
end $$;

drop trigger if exists drivers_guard on public.drivers;
create trigger drivers_guard before update on public.drivers
  for each row execute function public.tg_driver_guard();

create or replace function public.tg_driver_verified_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.verification_status is distinct from old.verification_status then
    if new.verification_status = 'verified' then
      perform notificar(new.id, 'verification_result', 'urgent', 'Tu cuenta está verificada',
                        'Ya puedes iniciar recorridos y ser chofer sustituto.');
    elsif new.verification_status = 'rejected' then
      perform notificar(new.id, 'verification_result', 'urgent', 'Necesitamos un cambio',
                        'Motivo: ' || coalesce(new.reviewer_note, 'revisa tus documentos.'));
    end if;
  end if;
  return new;
end $$;

drop trigger if exists drivers_verified_notify on public.drivers;
create trigger drivers_verified_notify after update on public.drivers
  for each row execute function public.tg_driver_verified_notify();

-- ───────────────────── Invitaciones ───────────────────────────────────────
create or replace function public.crear_invitacion(p_student uuid, p_name text default null,
  p_phone text default null, p_relationship text default 'Representante', p_primary boolean default false)
returns public.invitations language plpgsql security definer set search_path = public as $$
declare
  abc constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text; v_inv invitations; i int;
begin
  if not exists (select 1 from students where id = p_student and driver_id = auth.uid()) then
    raise exception 'NO_AUTORIZADO';
  end if;
  loop
    v_code := 'BSL-';
    for i in 1..8 loop
      v_code := v_code || substr(abc, 1 + floor(random() * length(abc))::int, 1);
      if i = 4 then v_code := v_code || '-'; end if;
    end loop;
    exit when not exists (select 1 from invitations where code = v_code);
  end loop;
  insert into invitations (student_id, created_by, code, guardian_name, guardian_phone, relationship, is_primary)
  values (p_student, auth.uid(), v_code, nullif(p_name, ''), nullif(p_phone, ''),
          coalesce(nullif(p_relationship, ''), 'Representante'), coalesce(p_primary, false))
  returning * into v_inv;
  return v_inv;
end $$;

create or replace function public.canjear_invitacion(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_inv invitations; v_st students; v_me users; v_first boolean;
begin
  select * into v_me from users where id = auth.uid();
  if not found then raise exception 'NO_AUTENTICADO'; end if;
  if v_me.role <> 'guardian' then raise exception 'SOLO_REPRESENTANTES'; end if;

  select * into v_inv from invitations
  where code = upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  if not found then raise exception 'INVITACION_INVALIDA'; end if;

  if v_inv.redeemed_by is not null and v_inv.redeemed_by <> auth.uid() then
    raise exception 'INVITACION_USADA';
  end if;
  if v_inv.redeemed_by is null then
    if v_inv.expires_at < now() then raise exception 'INVITACION_EXPIRADA'; end if;
    v_first := not exists (select 1 from student_guardians where student_id = v_inv.student_id);
    insert into student_guardians (student_id, user_id, relationship, is_primary)
    values (v_inv.student_id, auth.uid(), v_inv.relationship, v_inv.is_primary or v_first)
    on conflict (student_id, user_id) do nothing;
    update invitations set redeemed_by = auth.uid(), redeemed_at = now() where id = v_inv.id;
    select * into v_st from students where id = v_inv.student_id;
    perform notificar(v_st.driver_id, 'guardian_linked', 'messages',
      trim(v_me.first_name || ' ' || v_me.last_name) || ' se vinculó',
      'Ya recibe los avisos de ' || coalesce(v_st.nickname, v_st.first_name) || '.', v_st.id);
  else
    select * into v_st from students where id = v_inv.student_id;
  end if;

  return (
    select jsonb_build_object(
      'student_id', s.id,
      'first_name', coalesce(s.nickname, s.first_name),
      'full_name', trim(s.first_name || ' ' || s.last_name),
      'grade', s.grade,
      'school', sc.name,
      'school_color', sc.color,
      'driver_name', trim(u.first_name || ' ' || u.last_name),
      'plate', d.plate_number)
    from students s
    left join schools sc on sc.id = s.school_id
    left join users u on u.id = s.driver_id
    left join drivers d on d.id = s.driver_id
    where s.id = v_st.id);
end $$;

-- ───────────────────── Paradas resueltas de una ruta ──────────────────────
-- Devuelve las paradas con su dirección del día (excepciones por día de la
-- semana incluidas) y marca a los ausentes. El representante solo recibe las
-- escuelas y las paradas de sus propios hijos.
create or replace function public.paradas_de_ruta(p_route uuid, p_date date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_route routes; v_full boolean;
  v_date date := coalesce(p_date, public.hoy());
  v_dow int;
begin
  select * into v_route from routes where id = p_route;
  if not found then return '[]'::jsonb; end if;
  v_dow := extract(isodow from v_date);
  v_full := public.actua_como_chofer(v_route.driver_id);
  if not v_full and not public.es_representante_de_ruta(p_route) then
    raise exception 'NO_AUTORIZADO';
  end if;

  return coalesce((
    select jsonb_agg(q.x order by q.pos)
    from (
      select rs.position as pos, jsonb_build_object(
        'stop_id', rs.id,
        'position', rs.position,
        'kind', rs.kind,
        'student_id', rs.student_id,
        'school_id', coalesce(rs.school_id, st.school_id),
        'student_name', coalesce(st.nickname, st.first_name),
        'student_full_name', trim(st.first_name || ' ' || st.last_name),
        'student_photo', st.photo_path,
        'notes', case when v_full then st.notes end,
        'school_name', coalesce(sc.name, ss.name),
        'school_short', coalesce(sc.short_name, ss.short_name),
        'school_color', coalesce(sc.color, ss.color),
        'school_time', case when rs.school_id is not null then
            to_char(case when v_route.direction = 'pickup' then sc.entry_time else sc.exit_time end, 'HH24:MI') end,
        'label', case when rs.school_id is not null then sc.name
                      when a.label is null then 'Casa ' || st.last_name
                      when lower(a.label) = 'casa' then 'Casa ' || st.last_name
                      else a.label end,
        'street', nullif(trim(coalesce(a.main_street, '') ||
                   case when coalesce(a.cross_street, '') <> '' then ' y ' || a.cross_street else '' end), ''),
        'reference', case when rs.school_id is not null then coalesce(sc.gate_reference, a.reference) else a.reference end,
        'address_id', a.id,
        'latitude', a.latitude,
        'longitude', a.longitude,
        'estimated_time', to_char(rs.estimated_time, 'HH24:MI'),
        'absent', ab.id is not null,
        'absence_reason', ab.reason,
        'absence_scope', ab.scope,
        'absence_by', (select u.first_name from users u where u.id = ab.registered_by)
      ) as x
      from route_stops rs
      left join students st on st.id = rs.student_id
      left join schools ss on ss.id = st.school_id
      left join schools sc on sc.id = rs.school_id
      left join addresses a on a.id = coalesce(
        (select sas.address_id from student_address_schedule sas
          where sas.student_id = rs.student_id and sas.weekday = v_dow and sas.direction = v_route.direction),
        rs.address_id,
        case when rs.student_id is not null then
               case when v_route.direction = 'pickup' then st.default_pickup_address_id
                    else coalesce(st.default_dropoff_address_id, st.default_pickup_address_id) end
             else sc.address_id end)
      left join absences ab on ab.student_id = rs.student_id and ab.date = v_date
                            and ab.scope in ('all', v_route.direction)
      where rs.route_id = p_route
        and (v_full or rs.school_id is not null or public.es_representante_de(rs.student_id))
    ) q), '[]'::jsonb);
end $$;

-- Reemplaza todas las paradas de una ruta en una sola transacción.
create or replace function public.guardar_paradas(p_route uuid, p_stops jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int; v_route routes;
begin
  select * into v_route from routes where id = p_route and driver_id = auth.uid();
  if not found then raise exception 'NO_AUTORIZADO'; end if;
  n := coalesce(jsonb_array_length(p_stops), 0);
  if n < 1 or n > 50 then raise exception 'PARADAS_FUERA_DE_RANGO'; end if;
  if exists (select 1 from trips where route_id = p_route and status <> 'finished') then
    raise exception 'RECORRIDO_EN_CURSO';
  end if;

  delete from route_stops where route_id = p_route;
  insert into route_stops (route_id, position, kind, student_id, school_id, address_id, estimated_time)
  select p_route, e.ord, e.s->>'kind',
         nullif(e.s->>'student_id', '')::uuid, nullif(e.s->>'school_id', '')::uuid,
         nullif(e.s->>'address_id', '')::uuid, nullif(e.s->>'estimated_time', '')::time
  from jsonb_array_elements(p_stops) with ordinality as e(s, ord);

  perform notificar_ruta(p_route, 'route_changed', 'messages', 'Tu ruta fue actualizada',
    v_route.name || ' cambió. Revisa la nueva hora de paso.');
  return n;
end $$;

-- ───────────────────── Recorridos ─────────────────────────────────────────
create or replace function public.iniciar_recorrido(p_route uuid) returns public.trips
language plpgsql security definer set search_path = public as $$
declare
  v_route routes; v_trip trips; v_snapshot jsonb;
begin
  select * into v_route from routes where id = p_route;
  if not found or not public.actua_como_chofer(v_route.driver_id) then raise exception 'NO_AUTORIZADO'; end if;
  if not exists (select 1 from drivers where id = auth.uid() and verification_status = 'verified') then
    raise exception 'CHOFER_NO_VERIFICADO';
  end if;
  if exists (select 1 from route_cancellations where route_id = p_route and date = public.hoy()) then
    raise exception 'SERVICIO_CANCELADO';
  end if;

  select * into v_trip from trips where route_id = p_route and date = public.hoy();
  if found then
    if v_trip.status = 'finished' then raise exception 'RECORRIDO_YA_FINALIZADO'; end if;
    return v_trip;
  end if;
  if exists (select 1 from trips where driver_id = auth.uid() and status <> 'finished') then
    raise exception 'OTRO_RECORRIDO_EN_CURSO';
  end if;

  select coalesce(jsonb_agg(s order by (s->>'position')::int), '[]'::jsonb) into v_snapshot
  from jsonb_array_elements(public.paradas_de_ruta(p_route, public.hoy())) s
  where not (s->>'absent')::boolean;
  if jsonb_array_length(v_snapshot) = 0 then raise exception 'RUTA_SIN_PARADAS'; end if;

  insert into trips (route_id, driver_id, date, direction, planned_stops_snapshot)
  values (p_route, auth.uid(), public.hoy(), v_route.direction, v_snapshot)
  returning * into v_trip;

  insert into trip_events (trip_id, type, created_by) values (v_trip.id, 'trip_started', auth.uid());
  return v_trip;
end $$;

create or replace function public.tg_trip_event_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is null then new.created_by := auth.uid(); end if;
  return new;
end $$;

drop trigger if exists trip_events_before on public.trip_events;
create trigger trip_events_before before insert on public.trip_events
  for each row execute function public.tg_trip_event_before();

-- Cada evento del viaje genera sus avisos y mueve el estado del recorrido.
create or replace function public.tg_trip_event_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_trip trips; v_route routes; v_chofer text; v_nino text; v_hora text; v_lugar text; v_summary jsonb;
begin
  select * into v_trip from trips where id = new.trip_id;
  select * into v_route from routes where id = v_trip.route_id;
  select first_name into v_chofer from users where id = v_trip.driver_id;
  v_hora := public.hora_local(new.created_at);
  v_lugar := new.payload->>'place';
  if new.student_id is not null then
    select coalesce(nickname, first_name) into v_nino from students where id = new.student_id;
  end if;

  case new.type
    when 'trip_started' then
      perform notificar_ruta(v_route.id, 'trip_started', 'trip', 'La buseta salió',
        v_route.name || ' salió a las ' || v_hora || '. Te avisamos cuando esté cerca.', v_trip.id);
    when 'bus_near' then
      perform notificar_estudiante(new.student_id, 'bus_near', 'urgent', 'La buseta está a 1 km',
        'Prepara a ' || v_nino || '. La buseta llega a tu parada en unos minutos.', v_trip.id, v_route.id);
    when 'bus_arriving' then
      perform notificar_estudiante(new.student_id, 'bus_arriving', 'urgent', 'La buseta está a 500 m',
        'Sal con ' || v_nino || '. La buseta está por llegar a tu parada.', v_trip.id, v_route.id);
    when 'boarded' then
      perform notificar_estudiante(new.student_id, 'student_boarded', 'trip', v_nino || ' subió a la buseta',
        'Abordó a las ' || v_hora || coalesce(' en ' || v_lugar, '') || '.', v_trip.id, v_route.id);
    when 'dropped' then
      perform notificar_estudiante(new.student_id, 'student_dropped', 'trip',
        v_nino || ' llegó a ' || coalesce(v_lugar, 'su destino'),
        'La entrega fue a las ' || v_hora || '.', v_trip.id, v_route.id);
    when 'school_arrival' then
      perform notificar_estudiante(new.student_id, 'school_arrival', 'trip',
        v_nino || ' llegó a ' || coalesce((select short_name from schools where id = new.school_id), 'la escuela'),
        'Entró a las ' || v_hora || '.', v_trip.id, v_route.id);
    when 'paused' then
      update trips set status = 'paused' where id = v_trip.id and status = 'in_progress';
      perform notificar_ruta(v_route.id, 'trip_paused', 'trip', 'Recorrido en pausa',
        v_chofer || ' pausó ' || v_route.name || coalesce('. Motivo: ' || (new.payload->>'reason'), '') || '.', v_trip.id);
    when 'resumed' then
      update trips set status = 'in_progress' where id = v_trip.id and status = 'paused';
      perform notificar_ruta(v_route.id, 'trip_resumed', 'trip', 'El recorrido continúa',
        v_route.name || ' retomó la marcha a las ' || v_hora || '.', v_trip.id);
    when 'delay' then
      perform notificar_ruta(v_route.id, 'delay', 'urgent',
        'Retraso de ' || coalesce(new.payload->>'minutes', '10') || ' min',
        v_route.name || ' va más tarde de lo previsto. Toca Visto para no repetir.', v_trip.id);
    when 'deviation' then
      perform notificar_ruta(v_route.id, 'deviation', 'urgent', 'La buseta cambió de camino',
        'Se apartó más de 300 m de la ruta. Te mostramos dónde va.', v_trip.id);
    when 'message' then
      perform notificar_ruta(v_route.id, 'message', 'messages',
        v_chofer || ': «' || coalesce(new.payload->>'body', '') || '»',
        v_route.name || ', ' || v_hora, v_trip.id);
    when 'trip_finished' then
      select jsonb_build_object(
        'stops', jsonb_array_length(v_trip.planned_stops_snapshot),
        'students', (select count(distinct s->>'student_id') from jsonb_array_elements(v_trip.planned_stops_snapshot) s
                      where s->>'student_id' is not null),
        'boarded', (select count(*) from trip_events where trip_id = v_trip.id and type = 'boarded'),
        'delivered', (select count(*) from trip_events where trip_id = v_trip.id and type in ('dropped', 'school_arrival')),
        'absent', (select count(*) from absences ab
                    where ab.date = v_trip.date and ab.scope in ('all', v_trip.direction)
                      and exists (select 1 from route_stops rs where rs.route_id = v_trip.route_id and rs.student_id = ab.student_id)),
        'pending', coalesce((select jsonb_agg(coalesce(st.nickname, st.first_name))
                    from trip_events b join students st on st.id = b.student_id
                    where b.trip_id = v_trip.id and b.type = 'boarded'
                      and not exists (select 1 from trip_events d where d.trip_id = v_trip.id
                                       and d.student_id = b.student_id and d.type in ('dropped', 'school_arrival'))), '[]'::jsonb),
        'messages', coalesce((select jsonb_agg(m.payload->>'body' order by m.created_at)
                    from trip_events m where m.trip_id = v_trip.id and m.type = 'message'), '[]'::jsonb),
        'delay_min', (select max((d.payload->>'minutes')::int) from trip_events d where d.trip_id = v_trip.id and d.type = 'delay'),
        'duration_min', greatest(1, round(extract(epoch from (new.created_at - v_trip.started_at)) / 60))::int
      ) into v_summary;
      update trips set status = 'finished', finished_at = new.created_at, summary = v_summary where id = v_trip.id;
      perform notificar_ruta(v_route.id, 'trip_finished', 'trip', 'Recorrido terminado',
        v_route.name || ' terminó a las ' || v_hora || '.', v_trip.id);
    else null;
  end case;
  return new;
end $$;

drop trigger if exists trip_events_after on public.trip_events;
create trigger trip_events_after after insert on public.trip_events
  for each row execute function public.tg_trip_event_after();

-- Deshacer un abordaje o una entrega retira también su aviso.
create or replace function public.tg_trip_event_deleted() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from notifications
  where trip_id = old.trip_id and student_id = old.student_id
    and type = case old.type when 'boarded' then 'student_boarded' when 'dropped' then 'student_dropped'
                             else old.type end;
  return old;
end $$;

drop trigger if exists trip_events_deleted on public.trip_events;
create trigger trip_events_deleted after delete on public.trip_events
  for each row execute function public.tg_trip_event_deleted();

-- "La buseta está a 1 km" y "La buseta está a 500 m": se calculan en el servidor, una sola vez
-- por niño y viaje, cuando la buseta entra a 1 km y luego a 500 m de la parada de casa.
-- Si la primera posición ya cae a 500 m o menos, solo se envía el aviso de 500 m.
create or replace function public.tg_trip_location_near() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_trip trips; s jsonb; v_done text; v_dist double precision; v_tipo text; v_alumno uuid;
begin
  select * into v_trip from trips where id = new.trip_id;
  if v_trip.status <> 'in_progress' then return new; end if;
  v_done := case when v_trip.direction = 'pickup' then 'boarded' else 'dropped' end;
  for s in select * from jsonb_array_elements(v_trip.planned_stops_snapshot) loop
    continue when s->>'student_id' is null or s->>'kind' not in ('pickup_home', 'dropoff_home')
                  or s->>'latitude' is null;
    v_alumno := (s->>'student_id')::uuid;
    v_dist := public.distancia_m(new.latitude, new.longitude,
                                 (s->>'latitude')::double precision, (s->>'longitude')::double precision);
    v_tipo := case when v_dist <= 500 then 'bus_arriving' when v_dist <= 1000 then 'bus_near' end;
    continue when v_tipo is null;
    -- en la vuelta, solo si el niño ya subió en la escuela
    continue when v_trip.direction = 'dropoff' and not exists (select 1 from trip_events e
                  where e.trip_id = v_trip.id and e.student_id = v_alumno and e.type = 'boarded');
    -- ya abordó o ya lo entregaron: no hace falta avisar
    continue when exists (select 1 from trip_events e
                  where e.trip_id = v_trip.id and e.student_id = v_alumno and e.type = v_done);
    -- el de 1 km no se envía si ya salió el de 500 m
    continue when v_tipo = 'bus_near' and exists (select 1 from trip_events e
                  where e.trip_id = v_trip.id and e.student_id = v_alumno and e.type = 'bus_arriving');
    insert into trip_events (trip_id, type, student_id, stop_id, latitude, longitude, payload)
    values (v_trip.id, v_tipo, v_alumno, (s->>'stop_id')::uuid, new.latitude, new.longitude,
            jsonb_build_object('place', s->>'label', 'meters', round(v_dist)))
    on conflict do nothing;
  end loop;
  return new;
end $$;

drop trigger if exists trip_locations_near on public.trip_locations;
create trigger trip_locations_near after insert on public.trip_locations
  for each row execute function public.tg_trip_location_near();

-- ───────────────────── Ausencias ──────────────────────────────────────────
create or replace function public.tg_absence_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_dirs text[]; v_old text[] := '{}';
begin
  if new.registered_by is null then new.registered_by := auth.uid(); end if;
  if auth.uid() is null then return new; end if;        -- cargas desde el panel
  if new.date < public.hoy() then raise exception 'FECHA_PASADA'; end if;
  if new.date = public.hoy() then
    v_dirs := case new.scope when 'all' then array['pickup', 'dropoff'] else array[new.scope] end;
    if tg_op = 'UPDATE' and old.date = new.date then
      v_old := case old.scope when 'all' then array['pickup', 'dropoff'] else array[old.scope] end;
    end if;
    if exists (
      select 1 from trips t join route_stops rs on rs.route_id = t.route_id
      where t.date = new.date and rs.student_id = new.student_id
        and t.direction = any (v_dirs) and not (t.direction = any (v_old)))
    then raise exception 'RECORRIDO_YA_INICIO'; end if;
  end if;
  return new;
end $$;

drop trigger if exists absences_before on public.absences;
create trigger absences_before before insert or update on public.absences
  for each row execute function public.tg_absence_before();

create or replace function public.tg_absence_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare r absences; v_st students; v_quien text; v_que text; v_dia text;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  select * into v_st from students where id = r.student_id;
  if v_st.id is null then return null; end if;
  select trim(first_name || ' ' || last_name) into v_quien from users where id = coalesce(auth.uid(), r.registered_by);
  v_que := case r.scope when 'pickup' then 'solo ida' when 'dropoff' then 'solo vuelta' else 'todo el día' end;
  v_dia := case when r.date = public.hoy() then 'hoy' when r.date = public.hoy() + 1 then 'mañana'
                else 'el ' || to_char(r.date, 'DD/MM') end;
  if tg_op = 'DELETE' then
    perform notificar(v_st.driver_id, 'absence_removed', 'trip',
      coalesce(v_st.nickname, v_st.first_name) || ' sí va ' || v_dia,
      'Se retiró la ausencia (' || v_que || ').' || coalesce(' Avisó ' || v_quien || '.', ''), v_st.id);
  else
    perform notificar(v_st.driver_id, 'absence_received', 'trip',
      'Ausencia: ' || coalesce(v_st.nickname, v_st.first_name) || ' no va ' || v_dia,
      v_que || coalesce(', ' || nullif(r.reason, ''), '') || coalesce(', avisó ' || v_quien, ''), v_st.id);
  end if;
  return null;
end $$;

drop trigger if exists absences_notify on public.absences;
create trigger absences_notify after insert or update or delete on public.absences
  for each row execute function public.tg_absence_notify();

-- ───────────────────── Cancelación del servicio ───────────────────────────
create or replace function public.tg_cancellation() returns trigger
language plpgsql security definer set search_path = public as $$
declare r route_cancellations; v_route routes; v_dia text;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  select * into v_route from routes where id = r.route_id;
  if v_route.id is null then return null; end if;
  v_dia := case when r.date = public.hoy() then 'hoy' when r.date = public.hoy() + 1 then 'mañana'
                else 'el ' || to_char(r.date, 'DD/MM') end;
  if tg_op = 'INSERT' then
    perform notificar_ruta(r.route_id, 'service_cancelled', 'urgent', 'Servicio cancelado ' || v_dia,
      v_route.name || ' no pasará. Motivo: ' || lower(r.reason) || '.');
  else
    perform notificar_ruta(r.route_id, 'service_restored', 'urgent', 'El servicio sí pasa ' || v_dia,
      v_route.name || ' vuelve a su horario normal.');
  end if;
  return null;
end $$;

drop trigger if exists cancellations_notify on public.route_cancellations;
create trigger cancellations_notify after insert or delete on public.route_cancellations
  for each row execute function public.tg_cancellation();

create or replace function public.tg_cancellation_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is null then new.created_by := auth.uid(); end if;
  if exists (select 1 from trips where route_id = new.route_id and date = new.date) then
    raise exception 'RECORRIDO_YA_INICIO';
  end if;
  return new;
end $$;

drop trigger if exists cancellations_before on public.route_cancellations;
create trigger cancellations_before before insert on public.route_cancellations
  for each row execute function public.tg_cancellation_before();

-- ───────────────────── Sustitutos ─────────────────────────────────────────
create or replace function public.buscar_chofer_verificado(p_q text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', u.id,
    'name', trim(u.first_name || ' ' || u.last_name),
    'photo_url', u.photo_url,
    'vehicle', trim(concat_ws(' ', d.vehicle_brand, d.vehicle_model, d.vehicle_year::text)),
    'color', d.vehicle_color,
    'plate', d.plate_number)), '[]'::jsonb)
  from users u join drivers d on d.id = u.id
  where auth.uid() is not null and u.id <> auth.uid() and d.verification_status = 'verified'
    and length(trim(coalesce(p_q, ''))) >= 6
    and (lower(u.email) = lower(trim(p_q))
         or right(regexp_replace(coalesce(u.phone, ''), '\D', '', 'g'), 9)
            = right(regexp_replace(p_q, '\D', '', 'g'), 9)
            and length(regexp_replace(p_q, '\D', '', 'g')) >= 9)
$$;

create or replace function public.tg_substitution_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' or auth.uid() = new.driver_id then
    if new.driver_id <> auth.uid() then raise exception 'NO_AUTORIZADO'; end if;
    if new.status not in ('requested', 'revoked') then raise exception 'CAMBIO_DE_ESTADO_NO_PERMITIDO'; end if;
    if new.status = 'requested' then
      if new.date < public.hoy() then raise exception 'FECHA_PASADA'; end if;
      if not exists (select 1 from drivers where id = new.substitute_id and verification_status = 'verified') then
        raise exception 'SUSTITUTO_NO_VERIFICADO';
      end if;
      new.responded_at := null;
    end if;
  elsif auth.uid() = new.substitute_id then
    if old.status <> 'requested' or new.status not in ('accepted', 'rejected')
       or new.driver_id <> old.driver_id or new.date <> old.date or new.scope <> old.scope then
      raise exception 'CAMBIO_DE_ESTADO_NO_PERMITIDO';
    end if;
    new.responded_at := now();
  else
    raise exception 'NO_AUTORIZADO';
  end if;
  return new;
end $$;

drop trigger if exists substitutions_before on public.driver_substitutions;
create trigger substitutions_before before insert or update on public.driver_substitutions
  for each row execute function public.tg_substitution_before();

create or replace function public.tg_substitution_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_titular text; v_sust text; v_dia text; v_veh text; r record;
begin
  if tg_op = 'UPDATE' and new.status = old.status and new.substitute_id = old.substitute_id then return null; end if;
  select trim(first_name || ' ' || last_name) into v_titular from users where id = new.driver_id;
  select trim(first_name || ' ' || last_name) into v_sust from users where id = new.substitute_id;
  select concat_ws(', ', nullif(trim(concat_ws(' ', vehicle_brand, vehicle_model)), ''), plate_number)
    into v_veh from drivers where id = new.substitute_id;
  v_dia := case when new.date = public.hoy() then 'hoy' when new.date = public.hoy() + 1 then 'mañana'
                else 'el ' || to_char(new.date, 'DD/MM') end;
  if new.status = 'requested' then
    perform notificar(new.substitute_id, 'substitute_request', 'urgent', v_titular || ' te pide conducir',
      'Sus rutas ' || v_dia || '. Acepta o rechaza.', null, null, null, jsonb_build_object('substitution_id', new.id));
  elsif new.status = 'accepted' then
    perform notificar(new.driver_id, 'substitute_accepted', 'urgent', v_sust || ' aceptó',
      'Conducirá tus rutas ' || v_dia || '. Los representantes ya fueron avisados.');
    for r in select id, name from routes where driver_id = new.driver_id
               and (new.scope = 'all' or direction = new.scope) loop
      perform notificar_ruta(r.id, 'substitute_assigned', 'urgent',
        initcap(v_dia) || ' conduce ' || v_sust, r.name || coalesce(', ' || nullif(v_veh, ''), '') || '.');
    end loop;
  elsif new.status = 'rejected' then
    perform notificar(new.driver_id, 'substitute_rejected', 'urgent', v_sust || ' no puede',
      'Rechazó conducir tus rutas ' || v_dia || '. Busca a otro chofer.');
  elsif new.status = 'revoked' then
    perform notificar(new.substitute_id, 'substitute_revoked', 'urgent', 'Autorización retirada',
      v_titular || ' ya no necesita que conduzcas ' || v_dia || '.');
  end if;
  return null;
end $$;

drop trigger if exists substitutions_notify on public.driver_substitutions;
create trigger substitutions_notify after insert or update on public.driver_substitutions
  for each row execute function public.tg_substitution_notify();

-- ───────────────────── Mensajes rápidos ───────────────────────────────────
create or replace function public.tg_message_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.sender_id := coalesce(auth.uid(), new.sender_id);
  select count(distinct g.user_id) into new.recipients
  from route_stops rs join student_guardians g on g.student_id = rs.student_id
  where rs.route_id = new.route_id and g.receives_notifications;
  return new;
end $$;

drop trigger if exists messages_before on public.messages;
create trigger messages_before before insert on public.messages
  for each row execute function public.tg_message_before();

create or replace function public.tg_message_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_route routes; v_chofer text;
begin
  if new.trip_id is not null then
    insert into trip_events (trip_id, type, payload, created_by)
    values (new.trip_id, 'message', jsonb_build_object('body', new.body, 'template_key', new.template_key), new.sender_id);
  else
    select * into v_route from routes where id = new.route_id;
    select first_name into v_chofer from users where id = new.sender_id;
    perform notificar_ruta(new.route_id, 'message', 'messages', v_chofer || ': «' || new.body || '»', v_route.name);
  end if;
  return null;
end $$;

drop trigger if exists messages_after on public.messages;
create trigger messages_after after insert on public.messages
  for each row execute function public.tg_message_after();

-- ───────────────────── Direcciones cambiadas por un representante ─────────
create or replace function public.tg_address_changed() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_st students; v_quien text;
begin
  if auth.uid() is null or new.student_id is null or auth.uid() = new.driver_id then return null; end if;
  select * into v_st from students where id = new.student_id;
  select first_name into v_quien from users where id = auth.uid();
  perform notificar(new.driver_id, 'address_changed', 'messages',
    'Cambio de dirección de ' || coalesce(v_st.nickname, v_st.first_name),
    v_quien || ' marcó «' || new.label || '» en el mapa. Ya se actualizó en tu ruta.', v_st.id);
  return null;
end $$;

drop trigger if exists addresses_changed on public.addresses;
create trigger addresses_changed after insert or update on public.addresses
  for each row execute function public.tg_address_changed();

-- ───────────────────── Resúmenes para las pantallas de Inicio ─────────────
create or replace function public.ficha_chofer(p_driver uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', u.id,
    'name', trim(u.first_name || ' ' || u.last_name),
    'first_name', u.first_name,
    'photo_url', u.photo_url,
    'phone', u.phone,
    'vehicle', nullif(trim(concat_ws(' ', d.vehicle_brand, d.vehicle_model, d.vehicle_year::text)), ''),
    'color', d.vehicle_color,
    'plate', d.plate_number,
    'verified', d.verification_status = 'verified')
  from users u left join drivers d on d.id = u.id
  where u.id = p_driver and public.puede_ver_usuario(p_driver)
$$;

create or replace function public.resumen_representante(p_date date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_date date := coalesce(p_date, public.hoy());
  v_dow int;
  v_children jsonb; v_routes jsonb;
begin
  if auth.uid() is null then raise exception 'NO_AUTENTICADO'; end if;
  v_dow := extract(isodow from v_date);

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id,
      'first_name', s.first_name,
      'last_name', s.last_name,
      'name', coalesce(s.nickname, s.first_name),
      'grade', s.grade,
      'birth_date', s.birth_date,
      'photo_path', s.photo_path,
      'driver_id', s.driver_id,
      'relationship', g.relationship,
      'is_primary', g.is_primary,
      'can_report_absence', g.can_report_absence,
      'has_home', s.default_pickup_address_id is not null,
      'school', case when sc.id is null then null else jsonb_build_object(
          'id', sc.id, 'name', sc.name, 'short_name', sc.short_name, 'color', sc.color,
          'entry_time', to_char(sc.entry_time, 'HH24:MI'), 'exit_time', to_char(sc.exit_time, 'HH24:MI')) end,
      'absence', (select jsonb_build_object('id', ab.id, 'scope', ab.scope, 'reason', ab.reason)
                  from absences ab where ab.student_id = s.id and ab.date = v_date)
    ) order by s.birth_date nulls last, s.first_name), '[]'::jsonb)
  into v_children
  from student_guardians g
  join students s on s.id = g.student_id
  left join schools sc on sc.id = s.school_id
  where g.user_id = auth.uid();

  select coalesce(jsonb_agg(rt.x order by rt.dep), '[]'::jsonb) into v_routes
  from (
    select r.departure_time as dep, jsonb_build_object(
      'id', r.id,
      'name', r.name,
      'color', r.color,
      'direction', r.direction,
      'departure_time', to_char(r.departure_time, 'HH24:MI'),
      'days_of_week', to_jsonb(r.days_of_week),
      'runs_today', v_dow = any (r.days_of_week),
      'driver', public.ficha_chofer(r.driver_id),
      'substitute', (select public.ficha_chofer(d.substitute_id) from driver_substitutions d
                     where d.driver_id = r.driver_id and d.date = v_date and d.status = 'accepted'
                       and d.scope in ('all', r.direction)),
      'cancellation', (select jsonb_build_object('reason', c.reason) from route_cancellations c
                       where c.route_id = r.id and c.date = v_date),
      'trip', (select jsonb_build_object('id', t.id, 'status', t.status,
                        'started_at', t.started_at, 'finished_at', t.finished_at, 'driver_id', t.driver_id)
               from trips t where t.route_id = r.id and t.date = v_date),
      'children', (
        select coalesce(jsonb_agg(jsonb_build_object(
            'student_id', rs.student_id,
            'stop_id', rs.id,
            'kind', rs.kind,
            'estimated_time', to_char(rs.estimated_time, 'HH24:MI'),
            'school_time', (select to_char(x.estimated_time, 'HH24:MI') from route_stops x
                            where x.route_id = r.id and x.school_id = st.school_id limit 1),
            'absent', exists (select 1 from absences ab where ab.student_id = rs.student_id
                              and ab.date = v_date and ab.scope in ('all', r.direction)),
            'status', coalesce((
                select case
                  when bool_or(e.type in ('dropped', 'school_arrival') and
                               ((r.direction = 'pickup' and e.type = 'school_arrival') or
                                (r.direction = 'dropoff' and e.type = 'dropped'))) then 'delivered'
                  when bool_or(e.type = 'boarded') then 'boarded'
                  when bool_or(e.type in ('bus_near', 'bus_arriving')) then 'near'
                  else 'pending' end
                from trip_events e join trips t on t.id = e.trip_id
                where t.route_id = r.id and t.date = v_date and e.student_id = rs.student_id), 'pending'),
            'boarded_at', (select e.created_at from trip_events e join trips t on t.id = e.trip_id
                           where t.route_id = r.id and t.date = v_date and e.student_id = rs.student_id
                             and e.type = 'boarded'),
            'delivered_at', (select max(e.created_at) from trip_events e join trips t on t.id = e.trip_id
                             where t.route_id = r.id and t.date = v_date and e.student_id = rs.student_id
                               and e.type in ('dropped', 'school_arrival'))
          ) order by rs.position), '[]'::jsonb)
        from route_stops rs
        join students st on st.id = rs.student_id
        join student_guardians g on g.student_id = rs.student_id and g.user_id = auth.uid()
        where rs.route_id = r.id)
    ) as x
    from routes r
    where exists (select 1 from route_stops rs join student_guardians g on g.student_id = rs.student_id
                  where rs.route_id = r.id and g.user_id = auth.uid())
  ) rt;

  return jsonb_build_object('date', v_date, 'children', v_children, 'routes', v_routes);
end $$;

create or replace function public.resumen_chofer(p_date date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_date date := coalesce(p_date, public.hoy());
  v_dow int; v_me uuid := auth.uid();
  v_routes jsonb; v_abs jsonb; v_reqs jsonb; v_students int; v_drv jsonb;
begin
  if v_me is null then raise exception 'NO_AUTENTICADO'; end if;
  v_dow := extract(isodow from v_date);

  select jsonb_build_object('verification_status', d.verification_status, 'reviewer_note', d.reviewer_note,
           'plate', d.plate_number, 'low_power_mode', d.low_power_mode,
           'absence_cutoff_time', to_char(d.absence_cutoff_time, 'HH24:MI'),
           'schools', (select count(*) from schools where driver_id = v_me and archived_at is null))
    into v_drv from drivers d where d.id = v_me;

  select count(*) into v_students from students where driver_id = v_me;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', ab.id, 'student_id', s.id,
      'name', trim(s.first_name || ' ' || s.last_name),
      'short_name', coalesce(s.nickname, s.first_name),
      'scope', ab.scope, 'reason', ab.reason,
      'by', (select u.first_name from users u where u.id = ab.registered_by),
      'school_short', sc.short_name, 'school_color', sc.color) order by s.first_name), '[]'::jsonb)
    into v_abs
  from absences ab join students s on s.id = ab.student_id
  left join schools sc on sc.id = s.school_id
  where ab.date = v_date and s.driver_id = v_me;

  select coalesce(jsonb_agg(rt.x order by rt.dep), '[]'::jsonb) into v_routes
  from (
    select r.departure_time as dep, jsonb_build_object(
      'id', r.id, 'name', r.name, 'color', r.color, 'direction', r.direction,
      'departure_time', to_char(r.departure_time, 'HH24:MI'),
      'days_of_week', to_jsonb(r.days_of_week),
      'runs_today', v_dow = any (r.days_of_week),
      'own', r.driver_id = v_me,
      'titular', case when r.driver_id <> v_me then
          (select trim(u.first_name || ' ' || u.last_name) from users u where u.id = r.driver_id) end,
      'stops', (select count(*) from route_stops rs where rs.route_id = r.id),
      'active_stops', (select count(*) from route_stops rs where rs.route_id = r.id
          and not exists (select 1 from absences ab where ab.student_id = rs.student_id
                          and ab.date = v_date and ab.scope in ('all', r.direction))),
      'students', (select count(*) from route_stops rs where rs.route_id = r.id and rs.student_id is not null),
      'schools', (select coalesce(jsonb_agg(jsonb_build_object(
            'id', sc.id, 'short_name', sc.short_name, 'color', sc.color,
            'time', to_char(case when r.direction = 'pickup' then sc.entry_time else sc.exit_time end, 'HH24:MI'))
            order by rs.position), '[]'::jsonb)
          from route_stops rs join schools sc on sc.id = rs.school_id where rs.route_id = r.id),
      'trip', (select jsonb_build_object('id', t.id, 'status', t.status, 'started_at', t.started_at,
                        'finished_at', t.finished_at, 'driver_id', t.driver_id)
               from trips t where t.route_id = r.id and t.date = v_date),
      'cancellation', (select jsonb_build_object('id', c.id, 'reason', c.reason)
                       from route_cancellations c where c.route_id = r.id and c.date = v_date),
      'substitute', (select jsonb_build_object('id', d.id, 'status', d.status,
                        'name', (select trim(u.first_name || ' ' || u.last_name) from users u where u.id = d.substitute_id))
                     from driver_substitutions d
                     where d.driver_id = r.driver_id and d.date = v_date and d.status in ('requested', 'accepted')
                       and d.scope in ('all', r.direction))
    ) as x
    from routes r
    where r.driver_id = v_me
       or exists (select 1 from driver_substitutions d
                  where d.driver_id = r.driver_id and d.substitute_id = v_me and d.date = v_date
                    and d.status = 'accepted' and d.scope in ('all', r.direction))
  ) rt;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', d.id, 'date', d.date, 'scope', d.scope, 'status', d.status,
      'driver', public.ficha_chofer(d.driver_id),
      'routes', (select coalesce(jsonb_agg(jsonb_build_object('name', r.name, 'direction', r.direction,
                    'departure_time', to_char(r.departure_time, 'HH24:MI')) order by r.departure_time), '[]'::jsonb)
                 from routes r where r.driver_id = d.driver_id and (d.scope = 'all' or r.direction = d.scope)),
      'students', (select count(*) from students s where s.driver_id = d.driver_id)
    ) order by d.date), '[]'::jsonb)
    into v_reqs
  from driver_substitutions d
  where d.substitute_id = v_me and d.date >= public.hoy() and d.status in ('requested', 'accepted');

  return jsonb_build_object(
    'date', v_date,
    'driver', v_drv,
    'totals', jsonb_build_object('students', v_students, 'absent', jsonb_array_length(v_abs),
                                 'active', greatest(v_students - jsonb_array_length(v_abs), 0)),
    'absences', v_abs,
    'routes', v_routes,
    'substitution_requests', v_reqs,
    'active_trip_id', (select t.id from trips t where t.driver_id = v_me and t.status <> 'finished'
                       order by t.started_at desc limit 1));
end $$;

-- ───────────────────── Varios ─────────────────────────────────────────────
create or replace function public.registrar_token_push(p_token text, p_platform text default null) returns void
language sql security definer set search_path = public as $$
  insert into push_tokens (token, user_id, platform) values (p_token, auth.uid(), p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now()
$$;

-- Borra la cuenta del usuario y, en cascada, todos sus datos (exigido por App Store y Google Play).
create or replace function public.eliminar_mi_cuenta() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'NO_AUTENTICADO'; end if;
  delete from auth.users where id = auth.uid();
end $$;

-- Historial: se conservan 90 días de posiciones. Programar con pg_cron si se desea:
--   select cron.schedule('bsl-limpieza', '0 8 * * *', 'select public.limpiar_historial()');
create or replace function public.limpiar_historial() returns void
language sql security definer set search_path = public as $$
  delete from trip_locations where recorded_at < now() - interval '90 days';
  delete from notifications where created_at < now() - interval '90 days';
$$;

-- ============================================================================
-- RLS
-- ============================================================================
do $$ declare p record; begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

alter table public.app_config enable row level security;                 -- sin políticas: solo funciones
alter table public.users enable row level security;
alter table public.drivers enable row level security;
alter table public.driver_private enable row level security;
alter table public.driver_documents enable row level security;
alter table public.addresses enable row level security;
alter table public.schools enable row level security;
alter table public.students enable row level security;
alter table public.student_guardians enable row level security;
alter table public.student_address_schedule enable row level security;
alter table public.invitations enable row level security;
alter table public.routes enable row level security;
alter table public.route_stops enable row level security;
alter table public.trips enable row level security;
alter table public.trip_events enable row level security;
alter table public.trip_locations enable row level security;
alter table public.absences enable row level security;
alter table public.route_cancellations enable row level security;
alter table public.driver_substitutions enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.push_tokens enable row level security;
alter table public.payments enable row level security;

-- users / drivers
create policy users_select on public.users for select to authenticated using (public.puede_ver_usuario(id));
create policy users_update on public.users for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy drivers_select on public.drivers for select to authenticated using (public.puede_ver_usuario(id));
create policy drivers_update on public.drivers for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy driver_private_all on public.driver_private for all to authenticated
  using (driver_id = auth.uid()) with check (driver_id = auth.uid());
create policy driver_documents_all on public.driver_documents for all to authenticated
  using (driver_id = auth.uid()) with check (driver_id = auth.uid());

-- escuelas
create policy schools_select on public.schools for select to authenticated
  using (public.actua_como_chofer(driver_id) or public.es_mi_chofer(driver_id));
create policy schools_write on public.schools for all to authenticated
  using (driver_id = auth.uid()) with check (driver_id = auth.uid());

-- estudiantes
create policy students_select on public.students for select to authenticated
  using (public.actua_como_chofer(driver_id) or public.es_representante_de(id));
create policy students_write on public.students for all to authenticated
  using (driver_id = auth.uid()) with check (driver_id = auth.uid());

create policy guardians_select on public.student_guardians for select to authenticated
  using (user_id = auth.uid() or public.es_representante_de(student_id)
         or public.actua_como_chofer(public.chofer_de_estudiante(student_id)));
create policy guardians_update on public.student_guardians for update to authenticated
  using (user_id = auth.uid() or public.chofer_de_estudiante(student_id) = auth.uid())
  with check (user_id = auth.uid() or public.chofer_de_estudiante(student_id) = auth.uid());
create policy guardians_delete on public.student_guardians for delete to authenticated
  using (user_id = auth.uid() or public.chofer_de_estudiante(student_id) = auth.uid());

-- direcciones
create policy addresses_select on public.addresses for select to authenticated
  using (public.actua_como_chofer(driver_id)
         or (student_id is not null and public.es_representante_de(student_id))
         or (student_id is null and public.es_mi_chofer(driver_id)));
-- La casa de cada niño la marca SOLO su representante (sabe dónde vive y dónde está el portón).
-- El chofer la ve y la usa en su ruta, pero no la cambia. Las direcciones de escuelas (student_id
-- nulo) son del chofer.
create policy addresses_insert on public.addresses for insert to authenticated
  with check ((student_id is null and driver_id = auth.uid())
              or (student_id is not null and public.es_representante_de(student_id)
                  and driver_id = public.chofer_de_estudiante(student_id)));
create policy addresses_update on public.addresses for update to authenticated
  using ((student_id is null and driver_id = auth.uid()) or (student_id is not null and public.es_representante_de(student_id)))
  with check ((student_id is null and driver_id = auth.uid()) or (student_id is not null and public.es_representante_de(student_id)));
create policy addresses_delete on public.addresses for delete to authenticated
  using ((student_id is null and driver_id = auth.uid()) or (student_id is not null and public.es_representante_de(student_id)));

-- El representante elige qué dirección es la casa por defecto (recoger, dejar o ambas). Actualiza al
-- niño y sus paradas de casa en las rutas del chofer.
create or replace function public.fijar_casa(p_student uuid, p_address uuid, p_sentido text default 'both')
returns void language plpgsql security definer set search_path = public as $$
declare v_st students; v_dir addresses;
begin
  if not public.es_representante_de(p_student) then raise exception 'NO_ES_REPRESENTANTE'; end if;
  if p_sentido not in ('pickup', 'dropoff', 'both') then raise exception 'SENTIDO_INVALIDO'; end if;
  select * into v_dir from addresses where id = p_address and student_id = p_student;
  if not found then raise exception 'DIRECCION_INVALIDA'; end if;
  update students set
    default_pickup_address_id  = case when p_sentido in ('pickup', 'both') then p_address else default_pickup_address_id end,
    default_dropoff_address_id = case when p_sentido in ('dropoff', 'both') then p_address else default_dropoff_address_id end
  where id = p_student returning * into v_st;
  update route_stops set address_id = p_address
   where student_id = p_student
     and ((kind = 'pickup_home' and p_sentido in ('pickup', 'both')) or (kind = 'dropoff_home' and p_sentido in ('dropoff', 'both')));
  -- El aviso al chofer lo envía tg_address_changed cuando el representante crea o cambia la dirección.
end $$;
grant execute on function public.fijar_casa(uuid, uuid, text) to authenticated;

create policy schedule_select on public.student_address_schedule for select to authenticated
  using (public.es_representante_de(student_id) or public.actua_como_chofer(public.chofer_de_estudiante(student_id)));
create policy schedule_write on public.student_address_schedule for all to authenticated
  using (public.es_representante_de(student_id) or public.chofer_de_estudiante(student_id) = auth.uid())
  with check (public.es_representante_de(student_id) or public.chofer_de_estudiante(student_id) = auth.uid());

-- invitaciones (el canje pasa por canjear_invitacion)
create policy invitations_select on public.invitations for select to authenticated using (created_by = auth.uid());
create policy invitations_delete on public.invitations for delete to authenticated using (created_by = auth.uid());

-- rutas y paradas
create policy routes_select on public.routes for select to authenticated
  using (public.actua_como_chofer(driver_id) or public.es_representante_de_ruta(id));
create policy routes_write on public.routes for all to authenticated
  using (driver_id = auth.uid()) with check (driver_id = auth.uid());
create policy route_stops_select on public.route_stops for select to authenticated
  using (public.actua_como_chofer(public.chofer_de_ruta(route_id))
         or (school_id is not null and public.es_representante_de_ruta(route_id))
         or (student_id is not null and public.es_representante_de(student_id)));
create policy route_stops_write on public.route_stops for all to authenticated
  using (public.chofer_de_ruta(route_id) = auth.uid()) with check (public.chofer_de_ruta(route_id) = auth.uid());

-- recorridos (se crean con iniciar_recorrido; el estado cambia por eventos)
create policy trips_select on public.trips for select to authenticated using (public.puede_ver_viaje(id));
create policy trip_events_select on public.trip_events for select to authenticated
  using (public.es_chofer_de_viaje(trip_id)
         or (public.puede_ver_viaje(trip_id) and (student_id is null or public.es_representante_de(student_id))));
create policy trip_events_insert on public.trip_events for insert to authenticated
  with check (public.conduce_viaje(trip_id) and type not in ('bus_near', 'bus_arriving'));
create policy trip_events_delete on public.trip_events for delete to authenticated
  using (public.conduce_viaje(trip_id) and type in ('boarded', 'dropped', 'school_arrival'));
create policy trip_locations_select on public.trip_locations for select to authenticated using (public.puede_ver_viaje(trip_id));
create policy trip_locations_insert on public.trip_locations for insert to authenticated with check (public.conduce_viaje(trip_id));

-- ausencias
create policy absences_select on public.absences for select to authenticated
  using (public.es_representante_de(student_id) or public.actua_como_chofer(public.chofer_de_estudiante(student_id)));
create policy absences_write on public.absences for all to authenticated
  using (public.es_representante_de(student_id) or public.chofer_de_estudiante(student_id) = auth.uid())
  with check (public.es_representante_de(student_id) or public.chofer_de_estudiante(student_id) = auth.uid());

-- cancelaciones
create policy cancellations_select on public.route_cancellations for select to authenticated
  using (public.actua_como_chofer(public.chofer_de_ruta(route_id)) or public.es_representante_de_ruta(route_id));
create policy cancellations_write on public.route_cancellations for all to authenticated
  using (public.chofer_de_ruta(route_id) = auth.uid()) with check (public.chofer_de_ruta(route_id) = auth.uid());

-- sustituciones
create policy substitutions_select on public.driver_substitutions for select to authenticated
  using (driver_id = auth.uid() or substitute_id = auth.uid()
         or (status = 'accepted' and public.es_mi_chofer(driver_id)));
create policy substitutions_insert on public.driver_substitutions for insert to authenticated
  with check (driver_id = auth.uid());
create policy substitutions_update on public.driver_substitutions for update to authenticated
  using (driver_id = auth.uid() or substitute_id = auth.uid())
  with check (driver_id = auth.uid() or substitute_id = auth.uid());
create policy substitutions_delete on public.driver_substitutions for delete to authenticated using (driver_id = auth.uid());

-- mensajes
create policy messages_select on public.messages for select to authenticated
  using (public.actua_como_chofer(public.chofer_de_ruta(route_id)) or public.es_representante_de_ruta(route_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (public.actua_como_chofer(public.chofer_de_ruta(route_id)));

-- avisos: los crea el servidor; el usuario los lee, los marca y los borra
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = auth.uid());

create policy preferences_all on public.notification_preferences for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_tokens_all on public.push_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- pagos (registro manual del chofer; el representante solo ve los de sus hijos)
create policy payments_select on public.payments for select to authenticated
  using (driver_id = auth.uid() or public.es_representante_de(student_id));
create policy payments_write on public.payments for all to authenticated
  using (driver_id = auth.uid()) with check (driver_id = auth.uid());

-- Privilegios (Supabase ya los concede por defecto; se repiten por claridad)
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to authenticated, service_role;
grant all on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public to authenticated, service_role;
revoke all on public.app_config from anon, authenticated;

-- ============================================================================
-- Realtime: la app escucha estos cambios (cada uno filtrado por RLS)
-- ============================================================================
do $$ declare t text; begin
  foreach t in array array['trips', 'trip_events', 'trip_locations', 'notifications', 'absences',
                           'route_cancellations', 'driver_substitutions', 'student_guardians', 'drivers'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; when undefined_object then null;
    end;
  end loop;
end $$;

-- ============================================================================
-- Storage: fotos de estudiantes y documentos PRIVADOS; fotos de perfil públicas.
-- Rutas: student-photos/<student_id>/…  driver-documents/<user_id>/…  profile-photos/<user_id>/…
-- ============================================================================
insert into storage.buckets (id, name, public) values
  ('student-photos', 'student-photos', false),
  ('driver-documents', 'driver-documents', false),
  ('profile-photos', 'profile-photos', true)
on conflict (id) do update set public = excluded.public;

create or replace function public.carpeta_uuid(p_name text) returns uuid
language plpgsql immutable as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when others then return null;
end $$;

drop policy if exists bsl_student_photos_read on storage.objects;
drop policy if exists bsl_student_photos_write on storage.objects;
drop policy if exists bsl_driver_documents_all on storage.objects;
drop policy if exists bsl_profile_photos_read on storage.objects;
drop policy if exists bsl_profile_photos_write on storage.objects;

create policy bsl_student_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'student-photos'
         and (public.es_representante_de(public.carpeta_uuid(name))
              or public.actua_como_chofer(public.chofer_de_estudiante(public.carpeta_uuid(name)))));
create policy bsl_student_photos_write on storage.objects for all to authenticated
  using (bucket_id = 'student-photos'
         and (public.es_representante_de(public.carpeta_uuid(name))
              or public.chofer_de_estudiante(public.carpeta_uuid(name)) = auth.uid()))
  with check (bucket_id = 'student-photos'
         and (public.es_representante_de(public.carpeta_uuid(name))
              or public.chofer_de_estudiante(public.carpeta_uuid(name)) = auth.uid()));
create policy bsl_driver_documents_all on storage.objects for all to authenticated
  using (bucket_id = 'driver-documents' and public.carpeta_uuid(name) = auth.uid())
  with check (bucket_id = 'driver-documents' and public.carpeta_uuid(name) = auth.uid());
create policy bsl_profile_photos_read on storage.objects for select
  using (bucket_id = 'profile-photos');
create policy bsl_profile_photos_write on storage.objects for all to authenticated
  using (bucket_id = 'profile-photos' and public.carpeta_uuid(name) = auth.uid())
  with check (bucket_id = 'profile-photos' and public.carpeta_uuid(name) = auth.uid());

-- Modo demostración: la verificación de choferes se aprueba sola al enviar documentos.
-- Para producción: update public.app_config set value = 'false' where key = 'auto_verify_drivers';
insert into public.app_config (key, value) values ('auto_verify_drivers', 'true')
on conflict (key) do nothing;
