-- Recorre los flujos principales como lo haría la app (con RLS activo) y falla si algo no cuadra.
\set ON_ERROR_STOP on
\set chofer 'c0000000-0000-4000-8000-000000000001'
\set maria  'c0000000-0000-4000-8000-000000000002'
\set diego  'c0000000-0000-4000-8000-000000000003'
\set luis   'c0000000-0000-4000-8000-000000000004'
\set r_ida  'd0000000-0000-4000-8000-000000000001'
\set r_vta  'd0000000-0000-4000-8000-000000000002'
\set emilia 'a0000000-0000-4000-8000-000000000001'
\set mateo  'a0000000-0000-4000-8000-000000000002'
\set sofia  'a0000000-0000-4000-8000-000000000003'

create schema if not exists prueba;
create or replace function prueba.espera(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'FALLO: %', p_msg; end if; raise notice 'ok  %', p_msg; end $$;
grant usage on schema prueba to authenticated;

-- ── 1. Alta de cuenta nueva por el disparador ───────────────────────────────
insert into auth.users (id, email, raw_user_meta_data) values
  ('b0000000-0000-4000-8000-000000000009', 'nueva@bsl.app',
   '{"role":"guardian","first_name":"Rosa","last_name":"Vivanco","phone":"+593990000001"}'),
  ('b0000000-0000-4000-8000-000000000010', 'chofernuevo@bsl.app',
   '{"role":"driver","first_name":"Jorge","last_name":"Paredes","phone":"+593991234567"}');   -- celular repetido
select prueba.espera((select role = 'guardian' and first_name = 'Rosa' from public.users where email = 'nueva@bsl.app'), 'perfil de representante creado por disparador');
select prueba.espera((select phone is null from public.users where email = 'chofernuevo@bsl.app'), 'celular repetido no bloquea el registro');
select prueba.espera(exists (select 1 from public.drivers where id = 'b0000000-0000-4000-8000-000000000010'), 'fila de chofer creada');

-- ── 2. Representante: qué ve ────────────────────────────────────────────────
set role authenticated;
select set_config('request.jwt.claim.sub', :'maria', false);
select prueba.espera((select count(*) = 2 from public.students), 'María ve solo a sus 2 hijos');
select prueba.espera((select count(*) = 4 from public.student_guardians), 'María ve a los representantes de sus hijos');
select prueba.espera((select count(*) = 3 from public.users), 'María ve su perfil, a Diego y a su chofer (no al sustituto)');
select prueba.espera((select count(*) = 0 from public.invitations), 'María no ve invitaciones');
select prueba.espera((select count(*) = 0 from public.driver_private), 'María no ve la licencia del chofer');
select prueba.espera((select count(*) = 5 from public.addresses), 'María ve 3 direcciones de sus hijos y 2 de escuelas');
select prueba.espera((select count(*) = 8 from public.route_stops), 'María ve paradas de sus hijos (4) y de escuelas (4)');
select prueba.espera((select jsonb_array_length(public.paradas_de_ruta(:'r_ida')) = 4), 'paradas_de_ruta filtra las casas de otros niños');
select prueba.espera((select jsonb_array_length(r->'children') = 2 and jsonb_array_length(r->'routes') = 2
                       from public.resumen_representante() r), 'resumen_representante: 2 hijos, 2 rutas');
select prueba.espera((select (r->'routes'->0->'driver'->>'plate') = 'LBA-1234' from public.resumen_representante() r), 'resumen trae la placa del chofer');

-- ── 3. Ausencia de Mateo, solo vuelta, hoy ─────────────────────────────────
insert into public.absences (student_id, date, scope, reason) values (:'mateo', public.hoy(), 'dropoff', 'Cita médica');
do $$ begin
  begin
    insert into public.absences (student_id, date, scope) values ('a0000000-0000-4000-8000-000000000001', public.hoy() - 1, 'all');
    raise exception 'FALLO: se aceptó una ausencia en fecha pasada';
  exception when others then
    if sqlerrm not like '%FECHA_PASADA%' then raise; end if;
    raise notice 'ok  ausencia en fecha pasada rechazada';
  end;
  begin
    insert into public.absences (student_id, date, scope) values ('a0000000-0000-4000-8000-000000000003', public.hoy() + 1, 'all');
    raise exception 'FALLO: María registró ausencia de un niño ajeno';
  exception when insufficient_privilege then raise notice 'ok  ausencia de niño ajeno bloqueada por RLS';
  end;
end $$;

-- ── 4. Chofer: resumen, paradas e inicio del recorrido de vuelta ───────────
select set_config('request.jwt.claim.sub', :'chofer', false);
select prueba.espera((select (r->'totals'->>'students')::int = 6 and (r->'totals'->>'absent')::int = 1
                        and jsonb_array_length(r->'routes') = 2 from public.resumen_chofer() r), 'resumen_chofer: 6 estudiantes, 1 ausente, 2 rutas');
select prueba.espera((select count(*) = 1 from public.notifications where type = 'absence_received'), 'el chofer recibió el aviso de ausencia');
select prueba.espera((select count(*) filter (where (s->>'absent')::boolean) = 1 and count(*) = 8
                       from jsonb_array_elements(public.paradas_de_ruta(:'r_vta')) s), 'vuelta: 8 paradas, 1 marcada ausente');

select id as trip_vta from public.iniciar_recorrido(:'r_vta') \gset
select prueba.espera((select jsonb_array_length(planned_stops_snapshot) = 7 from public.trips where id = :'trip_vta'), 'el recorrido de vuelta excluye a Mateo (7 paradas)');
select prueba.espera((select id = :'trip_vta' from public.iniciar_recorrido(:'r_vta')), 'iniciar dos veces devuelve el mismo recorrido');
do $$ begin
  begin perform public.iniciar_recorrido('d0000000-0000-4000-8000-000000000001');
    raise exception 'FALLO: permitió dos recorridos a la vez';
  exception when others then if sqlerrm not like '%OTRO_RECORRIDO_EN_CURSO%' then raise; end if;
    raise notice 'ok  no se puede iniciar otro recorrido en curso';
  end;
end $$;

-- Sube Emilia en la escuela, mensaje rápido, pausa, reanuda
insert into public.trip_events (trip_id, type, student_id, client_id, payload)
values (:'trip_vta', 'boarded', :'emilia', 'f0000000-0000-4000-8000-000000000001', '{"place":"San Sebastián"}');
insert into public.trip_events (trip_id, type, student_id, client_id, payload)
values (:'trip_vta', 'boarded', :'emilia', 'f0000000-0000-4000-8000-000000000001', '{}')
on conflict do nothing;                                                       -- reintento de la cola sin conexión
select prueba.espera((select count(*) = 1 from public.trip_events where trip_id = :'trip_vta' and type = 'boarded'), 'abordaje idempotente');
insert into public.messages (route_id, trip_id, sender_id, template_key, body) values (:'r_vta', :'trip_vta', :'chofer', 'outside', 'Ya estoy afuera');
select prueba.espera((select recipients = 2 from public.messages where trip_id = :'trip_vta'), 'mensaje rápido cuenta 2 destinatarios');
insert into public.trip_events (trip_id, type, payload) values (:'trip_vta', 'paused', '{"reason":"Combustible"}');
select prueba.espera((select status = 'paused' from public.trips where id = :'trip_vta'), 'pausa cambia el estado');
insert into public.trip_events (trip_id, type) values (:'trip_vta', 'resumed');
select prueba.espera((select status = 'in_progress' from public.trips where id = :'trip_vta'), 'reanudar cambia el estado');

-- GPS: lejos (sin aviso), a ~890 m (aviso de 1 km) y luego a ~220 m y ~110 m (aviso de 500 m, una vez)
insert into public.trip_locations (trip_id, latitude, longitude) values (:'trip_vta', -3.9700, -79.2100);
select prueba.espera((select count(*) = 0 from public.trip_events where trip_id = :'trip_vta' and type in ('bus_near', 'bus_arriving')),
                      'lejos: sin aviso de cercanía');
insert into public.trip_locations (trip_id, latitude, longitude)
select :'trip_vta', (s->>'latitude')::float8 + 0.008, (s->>'longitude')::float8
from public.trips t, jsonb_array_elements(t.planned_stops_snapshot) s
where t.id = :'trip_vta' and s->>'student_id' = :'emilia';
select prueba.espera((select count(*) = 1 from public.trip_events where trip_id = :'trip_vta' and type = 'bus_near' and student_id = :'emilia'),
                      'a 1 km: aviso "La buseta está a 1 km"');
select prueba.espera((select count(*) = 0 from public.trip_events where trip_id = :'trip_vta' and type = 'bus_arriving'),
                      'a 1 km todavía no suena el de 500 m');
insert into public.trip_locations (trip_id, latitude, longitude)
select :'trip_vta', (s->>'latitude')::float8 + 0.002, (s->>'longitude')::float8
from public.trips t, jsonb_array_elements(t.planned_stops_snapshot) s
where t.id = :'trip_vta' and s->>'student_id' = :'emilia';
insert into public.trip_locations (trip_id, latitude, longitude)
select :'trip_vta', (s->>'latitude')::float8 + 0.001, (s->>'longitude')::float8
from public.trips t, jsonb_array_elements(t.planned_stops_snapshot) s
where t.id = :'trip_vta' and s->>'student_id' = :'emilia';
select prueba.espera((select count(*) = 1 from public.trip_events where trip_id = :'trip_vta' and type = 'bus_near' and student_id = :'emilia'),
                      '"La buseta está a 1 km" se genera una sola vez y solo para quien ya subió');
select prueba.espera((select count(*) = 1 from public.trip_events where trip_id = :'trip_vta' and type = 'bus_arriving' and student_id = :'emilia'),
                      '"La buseta está a 500 m" se genera una sola vez y solo para quien ya subió');

insert into public.trip_events (trip_id, type, student_id, payload) values (:'trip_vta', 'dropped', :'emilia', '{"place":"Casa de los abuelos"}');

-- ── 5. Representante: ve el viaje, sus eventos y no los de otros niños ─────
select set_config('request.jwt.claim.sub', :'maria', false);
select prueba.espera((select count(*) = 1 from public.trips where id = :'trip_vta'), 'María ve el recorrido de hoy');
select prueba.espera((select count(*) >= 3 from public.trip_locations where trip_id = :'trip_vta'), 'María ve las posiciones');
select prueba.espera((select bool_and(student_id is null or student_id in (:'emilia', :'mateo')) from public.trip_events where trip_id = :'trip_vta'),
                      'María no ve eventos de otros niños');
select prueba.espera((select array_agg(type order by created_at) @> array['trip_started','student_boarded','message','trip_paused','trip_resumed','bus_near','bus_arriving','student_dropped']
                       from public.notifications where trip_id = :'trip_vta'), 'María recibió todos los avisos del viaje');
select prueba.espera((select c->>'status' = 'delivered' from public.resumen_representante() r,
                        jsonb_array_elements(r->'routes') rt, jsonb_array_elements(rt->'children') c
                       where rt->>'id' = :'r_vta' and c->>'student_id' = :'emilia'), 'resumen: Emilia entregada');
select prueba.espera((select (c->>'absent')::boolean from public.resumen_representante() r,
                        jsonb_array_elements(r->'routes') rt, jsonb_array_elements(rt->'children') c
                       where rt->>'id' = :'r_vta' and c->>'student_id' = :'mateo'), 'resumen: Mateo ausente en la vuelta');
do $$ begin
  begin
    insert into public.trip_events (trip_id, type) select id, 'trip_finished' from public.trips where status <> 'finished';
    raise exception 'FALLO: un representante pudo finalizar el recorrido';
  exception when insufficient_privilege then raise notice 'ok  un representante no puede escribir eventos';
  end;
  begin
    update public.absences set scope = 'all' where student_id = 'a0000000-0000-4000-8000-000000000002';
    raise notice 'ok  ampliar la ausencia a todo el día se permite si la ida no ha iniciado';
  end;
end $$;
update public.notifications set read_at = now() where read_at is null;

-- ── 6. Chofer finaliza; resumen calculado ──────────────────────────────────
select set_config('request.jwt.claim.sub', :'chofer', false);
insert into public.trip_events (trip_id, type) values (:'trip_vta', 'trip_finished');
select prueba.espera((select status = 'finished' and (summary->>'boarded')::int = 1 and (summary->>'delivered')::int = 1
                        and (summary->>'absent')::int = 1 and summary->'messages' = '["Ya estoy afuera"]'::jsonb
                       from public.trips where id = :'trip_vta'), 'finalizar calcula el resumen');

-- ── 7. Sustituto ───────────────────────────────────────────────────────────
select prueba.espera((select jsonb_array_length(public.buscar_chofer_verificado('+593 99 555 1212')) = 1), 'buscar sustituto por celular');
select prueba.espera((select jsonb_array_length(public.buscar_chofer_verificado('chofernuevo@bsl.app')) = 0), 'no aparecen choferes sin verificar');
insert into public.driver_substitutions (driver_id, substitute_id, date) values (:'chofer', :'luis', public.hoy());
select set_config('request.jwt.claim.sub', :'luis', false);
select prueba.espera((select count(*) = 0 from public.students), 'el sustituto no ve estudiantes antes de aceptar');
select prueba.espera((select jsonb_array_length(r->'substitution_requests') = 1 from public.resumen_chofer() r), 'el sustituto ve la solicitud');
update public.driver_substitutions set status = 'accepted' where substitute_id = :'luis';
select prueba.espera((select count(*) = 6 from public.students), 'el sustituto aceptado ve a los 6 estudiantes hoy');
select prueba.espera((select jsonb_array_length(r->'routes') = 2 from public.resumen_chofer() r), 'el sustituto ve las 2 rutas en su Inicio');
select set_config('request.jwt.claim.sub', :'maria', false);
select prueba.espera((select count(*) = 2 from public.notifications where type = 'substitute_assigned'), 'María recibió "hoy conduce Luis" por cada ruta');
select prueba.espera((select (rt->'substitute'->>'name') = 'Luis Carrión' from public.resumen_representante() r, jsonb_array_elements(r->'routes') rt limit 1), 'resumen muestra al sustituto');

-- ── 8. Invitación con una cuenta nueva ─────────────────────────────────────
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000009', false);
do $$ declare r jsonb; begin
  begin perform public.canjear_invitacion('BSL-0000-0000'); raise exception 'FALLO';
  exception when others then if sqlerrm not like '%INVITACION_INVALIDA%' then raise; end if; raise notice 'ok  código inválido'; end;
  begin perform public.canjear_invitacion('bsl-7k2m-9q4d'); raise exception 'FALLO';
  exception when others then if sqlerrm not like '%INVITACION_EXPIRADA%' then raise; end if; raise notice 'ok  código expirado'; end;
  r := public.canjear_invitacion(' bsl-demo-2026 ');
  if r->>'first_name' <> 'Nico' or r->>'plate' <> 'LBA-1234' then raise exception 'FALLO: canje %', r; end if;
  raise notice 'ok  canje correcto: %', r;
end $$;
select prueba.espera((select count(*) = 1 from public.students), 'la cuenta nueva ya ve a Nicolás');
select set_config('request.jwt.claim.sub', :'diego', false);
do $$ begin
  begin perform public.canjear_invitacion('BSL-DEMO-2026'); raise exception 'FALLO';
  exception when others then if sqlerrm not like '%INVITACION_USADA%' then raise; end if; raise notice 'ok  código ya usado'; end;
end $$;

-- ── 9. Chofer nuevo: verificación y gestión ────────────────────────────────
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000010', false);
do $$ begin
  begin update public.drivers set verification_status = 'verified' where id = auth.uid(); raise exception 'FALLO';
  exception when others then if sqlerrm not like '%CAMBIO_DE_ESTADO_NO_PERMITIDO%' then raise; end if; raise notice 'ok  un chofer no puede verificarse solo'; end;
  begin update public.drivers set plate_number = 'LB-123' where id = auth.uid(); raise exception 'FALLO';
  exception when check_violation then raise notice 'ok  placa inválida rechazada'; end;
end $$;
update public.drivers set plate_number = 'lbc-4410', vehicle_brand = 'Toyota', vehicle_capacity = 12, verification_status = 'in_review' where id = auth.uid();
select prueba.espera((select verification_status = 'verified' and plate_number = 'LBC-4410' from public.drivers where id = auth.uid()), 'modo demo: enviar a revisión verifica la cuenta');

with a as (insert into public.addresses (driver_id, label, kind, main_street, latitude, longitude)
           values (auth.uid(), 'Escuela', 'school', 'Calle 1', -4.0, -79.2) returning id),
     s as (insert into public.schools (driver_id, name, short_name, address_id) select auth.uid(), 'Escuela Prueba', 'Prueba', id from a returning id),
     n as (insert into public.students (driver_id, first_name, last_name, school_id) select auth.uid(), 'Ana', 'Paz', id from s returning id, school_id),
     r as (insert into public.routes (driver_id, name, direction) values (auth.uid(), 'Ruta Prueba', 'pickup') returning id)
select public.guardar_paradas(r.id, jsonb_build_array(
         jsonb_build_object('kind', 'pickup_home', 'student_id', n.id, 'estimated_time', '06:30'),
         jsonb_build_object('kind', 'dropoff_school', 'school_id', n.school_id, 'estimated_time', '06:50'))) as paradas
from r, n \gset
-- La casa la marca solo el representante: el chofer no puede crearla.
do $$ begin
  begin
    insert into public.addresses (driver_id, student_id, label, main_street, latitude, longitude)
    select auth.uid(), id, 'Casa', 'Calle 2', -4.01, -79.21 from public.students where first_name = 'Ana';
    raise exception 'FALLO';
  exception when insufficient_privilege then raise notice 'ok  el chofer no puede marcar la casa de un estudiante';
  end;
end $$;
select prueba.espera(:paradas = 2, 'guardar_paradas crea 2 paradas');
select prueba.espera((select code ~ '^BSL-[A-Z2-9]{4}-[A-Z2-9]{4}$' from public.crear_invitacion((select id from public.students where first_name = 'Ana'), 'Mamá de Ana', null, 'Mamá', true)),
                      'crear_invitacion genera el formato BSL-XXXX-XXXX');
select prueba.espera((select count(*) = 1 from public.students), 'el chofer nuevo no ve estudiantes de otro chofer');
select prueba.espera((select (public.iniciar_recorrido((select id from public.routes where name = 'Ruta Prueba'))).status = 'in_progress'), 'el chofer nuevo inicia su recorrido');

-- ── 9b. La casa la marca el representante ──────────────────────────────────
select set_config('request.jwt.claim.sub', :'maria', false);
insert into public.addresses (driver_id, student_id, label, main_street, reference, latitude, longitude)
select public.chofer_de_estudiante(:'mateo'), :'mateo', 'Donde los abuelos', 'Av. Orillas del Zamora', 'Portón verde', -3.9935, -79.2042
returning id as casa_nueva \gset
select public.fijar_casa(:'mateo', :'casa_nueva', 'dropoff');
select prueba.espera((select default_dropoff_address_id = :'casa_nueva' from public.students where id = :'mateo'),
                      'María fija la casa de vuelta de Mateo');
select prueba.espera((select bool_and(address_id = :'casa_nueva') from public.route_stops where student_id = :'mateo' and kind = 'dropoff_home'),
                      'la parada de casa de Mateo en la ruta del chofer usa la nueva casa');
do $$ begin
  begin
    perform public.fijar_casa('a0000000-0000-4000-8000-000000000099', (select id from public.addresses limit 1), 'both');
    raise exception 'FALLO';
  exception when others then if sqlerrm not like '%NO_ES_REPRESENTANTE%' then raise; end if;
    raise notice 'ok  nadie fija la casa de un niño que no representa';
  end;
end $$;

-- ── 10. Cancelar servicio y eliminar cuenta ────────────────────────────────
select set_config('request.jwt.claim.sub', :'chofer', false);
insert into public.route_cancellations (route_id, date, reason) values (:'r_ida', public.hoy() + 1, 'Mantenimiento');
select set_config('request.jwt.claim.sub', :'diego', false);
select prueba.espera((select count(*) = 1 from public.notifications where type = 'service_cancelled'), 'Diego recibió la cancelación');
select public.eliminar_mi_cuenta();
reset role;
select prueba.espera((select count(*) = 0 from public.users where id = :'diego') and (select count(*) = 2 from public.student_guardians where user_id = :'maria'),
                      'eliminar cuenta borra a Diego y conserva a María');
select prueba.espera((select count(*) = 3 from public.trips where summary is not null and date < public.hoy()), 'historial de 3 días con resumen');
\echo
\echo TODOS LOS ESCENARIOS PASARON
