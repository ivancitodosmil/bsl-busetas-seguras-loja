-- ============================================================================
-- BSL · Datos de ejemplo para Rodrigo González (chofer) y Mónica León (representante).
-- Ejecutar después de 04_reiniciar_usuarios.sql. Si ya se ejecutó, no hace nada.
--
-- Escuelas: Calasanz (se usa la que ya existe) y U.E. La Inmaculada (nueva).
-- Estudiantes nuevos de Rodrigo:
--   Martín Paredes León  (Calasanz)      → hijo de Mónica, ya vinculado
--   Sofía Paredes León   (La Inmaculada) → hija de Mónica, ya vinculada
--   Daniel, Emily, Joaquín e Isabella    → con código de invitación para su representante (30 días)
-- Las casas NO se cargan: cada representante marca la de su hijo en la app (Direcciones).
-- Todos entran a la "Ruta mañanas"; cuando los padres marquen las casas, Rodrigo toca
-- Paradas → Optimizar → Guardar para trazar la ruta por calles.
-- ============================================================================
do $$
declare
  c_rodrigo constant uuid := 'b0000000-0000-4000-8000-000000000002';
  c_monica  constant uuid := 'b0000000-0000-4000-8000-000000000001';
  n_martin  constant uuid := 'f0000000-0000-4000-8000-000000000001';
  n_sofia   constant uuid := 'f0000000-0000-4000-8000-000000000002';
  n_daniel  constant uuid := 'f0000000-0000-4000-8000-000000000003';
  n_emily   constant uuid := 'f0000000-0000-4000-8000-000000000004';
  n_joaquin constant uuid := 'f0000000-0000-4000-8000-000000000005';
  n_isa     constant uuid := 'f0000000-0000-4000-8000-000000000006';
  s_calasanz uuid; s_inma uuid; a_dir uuid; r_ruta uuid;
begin
  if not exists (select 1 from public.users where id = c_rodrigo) or not exists (select 1 from public.users where id = c_monica) then
    raise exception 'Faltan las cuentas de Rodrigo o Mónica. Ejecuta primero 04_reiniciar_usuarios.sql.';
  end if;
  if exists (select 1 from public.students where id = n_martin) then
    raise notice 'Los datos de ejemplo ya existen. No se cambió nada.';
    return;
  end if;

  -- ── Escuelas ──────────────────────────────────────────────────────────────
  select id into s_calasanz from public.schools where driver_id = c_rodrigo and name ilike '%calasanz%' order by created_at limit 1;
  if s_calasanz is null then
    insert into public.addresses (driver_id, label, kind, main_street, neighborhood, reference, latitude, longitude)
    values (c_rodrigo, 'Unidad Educativa Calasanz', 'school', 'Av. Salvador Bustamante Celi', 'Calasanz',
            'Entrada principal, av. Salvador Bustamante Celi', -3.9771411, -79.2016665) returning id into a_dir;
    insert into public.schools (driver_id, name, short_name, color, address_id, entry_time, exit_time, gate_reference)
    values (c_rodrigo, 'Unidad Educativa Calasanz', 'Calasanz', '#14A3A0', a_dir, '07:00', '13:00',
            'Entrada principal, av. Salvador Bustamante Celi') returning id into s_calasanz;
  end if;

  insert into public.addresses (driver_id, label, kind, main_street, neighborhood, reference, latitude, longitude)
  values (c_rodrigo, 'U.E. La Inmaculada', 'school', 'Simón Bolívar', 'Centro',
          'Puerta principal, calle Simón Bolívar', -3.998499, -79.2023411) returning id into a_dir;
  insert into public.schools (driver_id, name, short_name, color, address_id, entry_time, exit_time, gate_reference)
  values (c_rodrigo, 'Unidad Educativa La Inmaculada', 'La Inmaculada', '#7B5CE0', a_dir, '07:00', '13:00',
          'Puerta principal, calle Simón Bolívar') returning id into s_inma;

  -- ── Estudiantes ───────────────────────────────────────────────────────────
  insert into public.students (id, driver_id, first_name, last_name, nickname, birth_date, school_id, grade, notes) values
    (n_martin,  c_rodrigo, 'Martín',   'Paredes León',     null,    '2016-04-18', s_calasanz, '5.º de básica', null),
    (n_sofia,   c_rodrigo, 'Sofía',    'Paredes León',     'Sofi',  '2013-09-02', s_inma,     '8.º de básica', 'Hermana de Martín.'),
    (n_daniel,  c_rodrigo, 'Daniel',   'Jiménez Cueva',    null,    '2014-11-25', s_calasanz, '7.º de básica', null),
    (n_emily,   c_rodrigo, 'Emily',    'Castillo Ordóñez', null,    '2017-06-10', s_inma,     '4.º de básica', 'Alérgica a la penicilina.'),
    (n_joaquin, c_rodrigo, 'Joaquín',  'Vivanco Rojas',    'Joaco', '2019-02-14', s_calasanz, '2.º de básica', 'Baja solo si lo espera un adulto.'),
    (n_isa,     c_rodrigo, 'Isabella', 'Torres Maldonado', 'Isa',   '2015-08-30', s_inma,     '6.º de básica', null);

  -- Mónica ya está vinculada a sus dos hijos
  insert into public.student_guardians (student_id, user_id, relationship, is_primary) values
    (n_martin, c_monica, 'Mamá', true),
    (n_sofia,  c_monica, 'Mamá', true);

  -- Códigos para los representantes que aún no tienen cuenta
  insert into public.invitations (student_id, created_by, code, guardian_name, relationship, is_primary, expires_at) values
    (n_daniel,  c_rodrigo, 'BSL-DJ7K-4MPA', 'Representante de Daniel',   'Mamá', true, now() + interval '30 days'),
    (n_emily,   c_rodrigo, 'BSL-EC3H-8RTW', 'Representante de Emily',    'Mamá', true, now() + interval '30 days'),
    (n_joaquin, c_rodrigo, 'BSL-JV9N-2XFB', 'Representante de Joaquín',  'Papá', true, now() + interval '30 days'),
    (n_isa,     c_rodrigo, 'BSL-IT5Q-6YLC', 'Representante de Isabella', 'Mamá', true, now() + interval '30 days');

  -- ── Ruta de la mañana ─────────────────────────────────────────────────────
  select id into r_ruta from public.routes where driver_id = c_rodrigo and direction = 'pickup' order by created_at limit 1;
  if r_ruta is null then
    insert into public.routes (driver_id, name, color, direction, departure_time, days_of_week)
    values (c_rodrigo, 'Ruta mañanas', '#1B4D89', 'pickup', '06:15', '{1,2,3,4,5}') returning id into r_ruta;
  end if;
  if not exists (select 1 from public.route_stops where route_id = r_ruta and kind = 'dropoff_school' and school_id = s_calasanz) then
    insert into public.route_stops (route_id, position, kind, school_id) values (r_ruta, 900, 'dropoff_school', s_calasanz);
  end if;
  insert into public.route_stops (route_id, position, kind, student_id) values
    (r_ruta, 101, 'pickup_home', n_martin), (r_ruta, 102, 'pickup_home', n_daniel), (r_ruta, 103, 'pickup_home', n_joaquin),
    (r_ruta, 201, 'pickup_home', n_sofia),  (r_ruta, 202, 'pickup_home', n_emily),  (r_ruta, 203, 'pickup_home', n_isa);
  insert into public.route_stops (route_id, position, kind, school_id) values (r_ruta, 950, 'dropoff_school', s_inma);

  -- Orden: niños de Calasanz → Calasanz → niñas y niños de La Inmaculada → La Inmaculada
  with orden as (
    select rs.id, row_number() over (
      order by case coalesce(rs.school_id, st.school_id) when s_calasanz then 1 when s_inma then 2 else 3 end,
               case when rs.kind in ('dropoff_school', 'pickup_school') then 1 else 0 end,
               rs.position) as n
    from public.route_stops rs left join public.students st on st.id = rs.student_id
    where rs.route_id = r_ruta
  )
  update public.route_stops rs set position = o.n from orden o where o.id = rs.id;
  update public.routes set polyline = null where id = r_ruta; -- se vuelve a trazar al guardar las paradas

  raise notice 'Datos de ejemplo creados.';
end $$;

select st.first_name || ' ' || st.last_name as estudiante, sc.short_name as escuela,
       coalesce((select string_agg(u.first_name || ' ' || u.last_name, ', ') from public.student_guardians g join public.users u on u.id = g.user_id where g.student_id = st.id),
                (select 'código ' || i.code from public.invitations i where i.student_id = st.id and i.redeemed_at is null limit 1)) as representante,
       case when st.default_pickup_address_id is null then 'falta' else 'lista' end as casa
from public.students st left join public.schools sc on sc.id = st.school_id
order by sc.short_name, st.first_name;
