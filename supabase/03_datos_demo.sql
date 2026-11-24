-- ============================================================================
-- BSL · Archivo 3 de 3 · Datos de demostración (opcional, recomendado para probar).
-- Ejecutar después de 01 y 02. Si ya existen, no hace nada.
--
-- Cuentas (contraseña de todas: Bsl2026demo)
--   chofer@bsl.app      Carlos Ortega   · chofer verificado, Ruta Norte ida y vuelta
--   maria@bsl.app       María Jaramillo · mamá de Emilia y Mateo
--   diego@bsl.app       Diego Armijos   · papá de Emilia y Mateo
--   sustituto@bsl.app   Luis Carrión    · chofer verificado, sin rutas (para probar el sustituto)
-- ============================================================================
do $$
declare
  c_chofer  constant uuid := 'c0000000-0000-4000-8000-000000000001';
  c_maria   constant uuid := 'c0000000-0000-4000-8000-000000000002';
  c_diego   constant uuid := 'c0000000-0000-4000-8000-000000000003';
  c_luis    constant uuid := 'c0000000-0000-4000-8000-000000000004';
  s_seb     constant uuid := 'e0000000-0000-4000-8000-000000000001';
  s_pinos   constant uuid := 'e0000000-0000-4000-8000-000000000002';
  r_ida     constant uuid := 'd0000000-0000-4000-8000-000000000001';
  r_vuelta  constant uuid := 'd0000000-0000-4000-8000-000000000002';
  n_emilia  constant uuid := 'a0000000-0000-4000-8000-000000000001';
  n_mateo   constant uuid := 'a0000000-0000-4000-8000-000000000002';
  n_sofia   constant uuid := 'a0000000-0000-4000-8000-000000000003';
  n_vale    constant uuid := 'a0000000-0000-4000-8000-000000000004';
  n_juan    constant uuid := 'a0000000-0000-4000-8000-000000000005';
  n_nico    constant uuid := 'a0000000-0000-4000-8000-000000000006';
  a_seb uuid; a_pinos uuid; a_jar uuid; a_jar2 uuid; a_abuelos uuid; a_cueva uuid; a_ochoa uuid; a_rios uuid; a_torres uuid;
  u record; v_trip uuid; v_day date; v_t0 timestamptz; i int;
begin
  if exists (select 1 from auth.users where email = 'chofer@bsl.app') then
    raise notice 'Los datos de demostración ya existen. No se cambió nada.';
    return;
  end if;

  -- ── Cuentas ───────────────────────────────────────────────────────────────
  for u in
    select * from (values
      (c_chofer, 'chofer@bsl.app',    'driver',   'Carlos', 'Ortega',    '+593987654321'),
      (c_maria,  'maria@bsl.app',     'guardian', 'María',  'Jaramillo', '+593991234567'),
      (c_diego,  'diego@bsl.app',     'guardian', 'Diego',  'Armijos',   '+593991112233'),
      (c_luis,   'sustituto@bsl.app', 'driver',   'Luis',   'Carrión',   '+593995551212')
    ) as t(id, email, role, first_name, last_name, phone)
  loop
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change, email_change_token_new)
    values ('00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
            crypt('Bsl2026demo', gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            jsonb_build_object('role', u.role, 'first_name', u.first_name, 'last_name', u.last_name, 'phone', u.phone),
            now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), u.id, u.id::text,
            jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
            'email', now(), now(), now());
  end loop;

  update public.drivers set vehicle_brand = 'Hyundai', vehicle_model = 'H1', vehicle_year = 2019,
         vehicle_color = 'Blanca', plate_number = 'LBA-1234', vehicle_capacity = 15,
         verification_status = 'verified' where id = c_chofer;
  update public.drivers set vehicle_brand = 'Kia', vehicle_model = 'Pregio', vehicle_year = 2018,
         vehicle_color = 'Gris', plate_number = 'LBB-5678', vehicle_capacity = 14,
         verification_status = 'verified' where id = c_luis;
  update public.driver_private set license_number = '1104567890', license_type = 'E', license_expiry = '2028-03-31'
   where driver_id = c_chofer;
  update public.driver_private set license_number = '1103334445', license_type = 'D', license_expiry = '2027-09-30'
   where driver_id = c_luis;

  -- ── Escuelas ──────────────────────────────────────────────────────────────
  insert into public.addresses (driver_id, label, kind, main_street, cross_street, neighborhood, reference, latitude, longitude)
  values (c_chofer, 'U.E. San Sebastián', 'school', 'Calle Mercadillo', 'Bolívar', 'San Sebastián',
          'Puerta de la calle Mercadillo', -4.00452, -79.20118) returning id into a_seb;
  insert into public.addresses (driver_id, label, kind, main_street, cross_street, neighborhood, reference, latitude, longitude)
  values (c_chofer, 'Colegio Los Pinos', 'school', 'Av. Universitaria', 'Rocafuerte', 'Centro',
          'Portón principal, av. Universitaria', -3.99662, -79.20489) returning id into a_pinos;

  insert into public.schools (id, driver_id, name, short_name, color, address_id, entry_time, exit_time, gate_reference) values
    (s_seb,   c_chofer, 'U.E. San Sebastián', 'San Sebastián', '#14A3A0', a_seb,   '07:00', '13:00', 'Puerta de la calle Mercadillo'),
    (s_pinos, c_chofer, 'Colegio Los Pinos',  'Los Pinos',     '#7B5CE0', a_pinos, '07:20', '13:30', 'Portón principal, av. Universitaria');

  -- ── Estudiantes ───────────────────────────────────────────────────────────
  insert into public.students (id, driver_id, first_name, last_name, nickname, birth_date, school_id, grade, notes) values
    (n_emilia, c_chofer, 'Emilia',     'Jaramillo', null, '2019-03-14', s_seb,   '3.º de básica', 'Alérgica al maní. En la tarde la recibe su abuela Rosa Vivanco.'),
    (n_mateo,  c_chofer, 'Mateo',      'Jaramillo', null, '2015-08-02', s_pinos, '7.º de básica', null),
    (n_sofia,  c_chofer, 'Sofía',      'Cueva',     null, '2018-11-20', s_seb,   '4.º de básica', null),
    (n_vale,   c_chofer, 'Valentina',  'Ochoa',     'Vale', '2017-05-09', s_seb, '5.º de básica', null),
    (n_juan,   c_chofer, 'Juan Pablo', 'Ríos',      null, '2014-01-27', s_pinos, '8.º de básica', 'Baja solo si lo espera un adulto.'),
    (n_nico,   c_chofer, 'Nicolás',    'Torres',    'Nico', '2015-12-12', s_pinos, '7.º de básica', null);

  insert into public.addresses (driver_id, student_id, label, kind, main_street, cross_street, house_number, neighborhood, reference, latitude, longitude)
  values (c_chofer, n_emilia, 'Casa', 'both', 'Av. Pío Jaramillo Alvarado', 'Juan de Salinas', '14-22', 'La Argelia',
          'Portón negro frente a la panadería', -4.03310, -79.20215) returning id into a_jar;
  insert into public.addresses (driver_id, student_id, label, kind, main_street, cross_street, house_number, neighborhood, reference, latitude, longitude)
  values (c_chofer, n_mateo, 'Casa', 'both', 'Av. Pío Jaramillo Alvarado', 'Juan de Salinas', '14-22', 'La Argelia',
          'Portón negro frente a la panadería', -4.03310, -79.20215) returning id into a_jar2;
  insert into public.addresses (driver_id, student_id, label, kind, main_street, cross_street, neighborhood, reference, receiver_note, latitude, longitude)
  values (c_chofer, n_emilia, 'Casa de los abuelos', 'dropoff', 'Calle Azuay', 'Bolívar', 'San Sebastián',
          'Junto al parque', 'La recibe Rosa Vivanco, abuela', -3.99905, -79.20205) returning id into a_abuelos;
  insert into public.addresses (driver_id, student_id, label, kind, main_street, cross_street, neighborhood, reference, latitude, longitude)
  values (c_chofer, n_sofia, 'Casa', 'both', 'Calle Lourdes', 'Bolívar', 'San Sebastián', 'Casa esquinera de dos pisos', -4.00270, -79.20140)
  returning id into a_cueva;
  insert into public.addresses (driver_id, student_id, label, kind, main_street, cross_street, neighborhood, reference, latitude, longitude)
  values (c_chofer, n_vale, 'Casa', 'both', 'Av. Universitaria', 'Mercadillo', 'Centro', 'Edificio beige, timbre 3', -4.00395, -79.20470)
  returning id into a_ochoa;
  insert into public.addresses (driver_id, student_id, label, kind, main_street, cross_street, neighborhood, reference, latitude, longitude)
  values (c_chofer, n_juan, 'Casa', 'both', 'Calle Guayaquil', 'Zoilo Rodríguez', 'El Valle', 'Reja verde', -3.98520, -79.20310)
  returning id into a_rios;
  insert into public.addresses (driver_id, student_id, label, kind, main_street, cross_street, neighborhood, reference, latitude, longitude)
  values (c_chofer, n_nico, 'Casa', 'both', 'Calle Quito', 'Cuxibamba', 'Gran Colombia', 'Frente a la tienda Don Lucho', -3.98990, -79.20560)
  returning id into a_torres;

  update public.students set default_pickup_address_id = a_jar,    default_dropoff_address_id = a_jar    where id = n_emilia;
  update public.students set default_pickup_address_id = a_jar2,   default_dropoff_address_id = a_jar2   where id = n_mateo;
  update public.students set default_pickup_address_id = a_cueva,  default_dropoff_address_id = a_cueva  where id = n_sofia;
  update public.students set default_pickup_address_id = a_ochoa,  default_dropoff_address_id = a_ochoa  where id = n_vale;
  update public.students set default_pickup_address_id = a_rios,   default_dropoff_address_id = a_rios   where id = n_juan;
  update public.students set default_pickup_address_id = a_torres, default_dropoff_address_id = a_torres where id = n_nico;

  -- Martes y jueves, a Emilia la dejan donde los abuelos
  insert into public.student_address_schedule (student_id, weekday, direction, address_id) values
    (n_emilia, 2, 'dropoff', a_abuelos), (n_emilia, 4, 'dropoff', a_abuelos);

  -- ── Representantes ────────────────────────────────────────────────────────
  insert into public.student_guardians (student_id, user_id, relationship, is_primary) values
    (n_emilia, c_maria, 'Mamá', true),  (n_mateo, c_maria, 'Mamá', true),
    (n_emilia, c_diego, 'Papá', false), (n_mateo, c_diego, 'Papá', false);

  -- Invitaciones: una vigente (Sofía), una vencida (Juan Pablo) y una para probar con una cuenta nueva (Nicolás)
  insert into public.invitations (student_id, created_by, code, guardian_name, guardian_phone, relationship, is_primary, expires_at) values
    (n_sofia, c_chofer, 'BSL-9H4T-6L2M', 'Representante de Sofía', '+593984104410', 'Mamá', true, now() + interval '31 hours'),
    (n_juan,  c_chofer, 'BSL-7K2M-9Q4D', 'Representante de Juan Pablo', null, 'Papá', true, now() - interval '2 days'),
    (n_nico,  c_chofer, 'BSL-DEMO-2026', 'Representante de Nicolás', null, 'Mamá', true, now() + interval '30 days');

  -- ── Rutas ─────────────────────────────────────────────────────────────────
  insert into public.routes (id, driver_id, name, color, direction, departure_time, days_of_week) values
    (r_ida,    c_chofer, 'Ruta Norte Ida',    '#1B4D89', 'pickup',  '06:15', '{1,2,3,4,5,6,7}'),
    (r_vuelta, c_chofer, 'Ruta Norte Vuelta', '#F5A524', 'dropoff', '13:00', '{1,2,3,4,5,6,7}');

  insert into public.route_stops (route_id, position, kind, student_id, school_id, estimated_time) values
    (r_ida, 1, 'pickup_home',    n_emilia, null,    '06:38'),
    (r_ida, 2, 'pickup_home',    n_mateo,  null,    '06:38'),
    (r_ida, 3, 'pickup_home',    n_sofia,  null,    '06:47'),
    (r_ida, 4, 'pickup_home',    n_vale,   null,    '06:51'),
    (r_ida, 5, 'dropoff_school', null,     s_seb,   '06:56'),
    (r_ida, 6, 'pickup_home',    n_juan,   null,    '07:05'),
    (r_ida, 7, 'pickup_home',    n_nico,   null,    '07:10'),
    (r_ida, 8, 'dropoff_school', null,     s_pinos, '07:16'),
    (r_vuelta, 1, 'pickup_school', null,     s_seb,   '13:00'),
    (r_vuelta, 2, 'dropoff_home',  n_vale,   null,    '13:06'),
    (r_vuelta, 3, 'dropoff_home',  n_sofia,  null,    '13:10'),
    (r_vuelta, 4, 'pickup_school', null,     s_pinos, '13:30'),
    (r_vuelta, 5, 'dropoff_home',  n_juan,   null,    '13:40'),
    (r_vuelta, 6, 'dropoff_home',  n_nico,   null,    '13:46'),
    (r_vuelta, 7, 'dropoff_home',  n_emilia, null,    '13:58'),
    (r_vuelta, 8, 'dropoff_home',  n_mateo,  null,    '13:58');

  -- ── Pagos del mes ─────────────────────────────────────────────────────────
  insert into public.payments (student_id, driver_id, period, amount, status, paid_at)
  select s.id, c_chofer, date_trunc('month', public.hoy())::date, 35,
         case when s.id in (n_mateo, n_vale) then 'pending' else 'paid' end,
         case when s.id in (n_mateo, n_vale) then null else date_trunc('month', now()) + interval '3 days 9 hours' end
  from public.students s where s.driver_id = c_chofer;

  -- ── Historial: recorridos de ida de los 3 días anteriores ─────────────────
  for i in 1..3 loop
    v_day := public.hoy() - i;
    v_t0 := (v_day::text || ' 06:15:00')::timestamp at time zone 'America/Guayaquil';
    insert into public.trips (route_id, driver_id, date, direction, started_at, planned_stops_snapshot)
    values (r_ida, c_chofer, v_day, 'pickup', v_t0, '[]'::jsonb) returning id into v_trip;
    update public.trips set planned_stops_snapshot = (
      select coalesce(jsonb_agg(jsonb_build_object('stop_id', rs.id, 'position', rs.position, 'kind', rs.kind,
               'student_id', rs.student_id, 'school_id', rs.school_id) order by rs.position), '[]'::jsonb)
      from public.route_stops rs where rs.route_id = r_ida) where id = v_trip;
    insert into public.trip_events (trip_id, type, created_by, created_at) values (v_trip, 'trip_started', c_chofer, v_t0);
    insert into public.trip_events (trip_id, type, student_id, payload, created_by, created_at)
    select v_trip, 'boarded', rs.student_id, jsonb_build_object('place', 'Casa ' || st.last_name), c_chofer,
           v_t0 + make_interval(mins => 20 + rs.position * 4 + i)
    from public.route_stops rs join public.students st on st.id = rs.student_id where rs.route_id = r_ida;
    if i = 2 then
      insert into public.messages (route_id, trip_id, sender_id, template_key, body, created_at)
      values (r_ida, v_trip, c_chofer, 'small_delay', 'Pequeño retraso', v_t0 + interval '26 minutes');
    end if;
    insert into public.trip_events (trip_id, type, student_id, school_id, created_by, created_at)
    select v_trip, 'school_arrival', st.id, st.school_id, c_chofer,
           v_t0 + case when st.school_id = s_seb then interval '43 minutes' else interval '63 minutes' end + make_interval(mins => i)
    from public.students st where st.driver_id = c_chofer;
    insert into public.trip_events (trip_id, type, created_by, created_at)
    values (v_trip, 'trip_finished', c_chofer, v_t0 + interval '66 minutes' + make_interval(mins => i));
  end loop;

  -- El historial no debe dejar avisos "de hoy": se limpia y se deja un aviso de bienvenida.
  delete from public.notifications where user_id in (c_chofer, c_maria, c_diego, c_luis);
  insert into public.notifications (user_id, type, channel, title, body) values
    (c_maria,  'welcome', 'messages', 'Bienvenida a BSL', 'Aquí verás cada paso del recorrido de Emilia y Mateo.'),
    (c_diego,  'welcome', 'messages', 'Bienvenido a BSL', 'Aquí verás cada paso del recorrido de Emilia y Mateo.'),
    (c_chofer, 'welcome', 'messages', 'Tu cuenta está verificada', 'Ya puedes iniciar recorridos y ser chofer sustituto.');

  raise notice 'Datos de demostración creados. Entra con chofer@bsl.app o maria@bsl.app (contraseña Bsl2026demo).';
end $$;
