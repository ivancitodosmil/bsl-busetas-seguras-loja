-- ============================================================================
-- BSL · Reinicio de cuentas: borra TODAS las cuentas (y con ellas, en cascada, sus
-- estudiantes, rutas, recorridos, avisos y pagos) y deja solo dos:
--   monica@bsl.app    Mónica León       · representante
--   rodrigo@bsl.app   Rodrigo González  · chofer verificado
-- La contraseña de las dos es la misma que tenían las cuentas de 03_datos_demo.sql:
-- se copia su hash antes de borrar, así este archivo no guarda ninguna contraseña.
-- No se puede deshacer.
-- ============================================================================
do $$
declare
  v_hash   text;
  r_monica constant uuid := 'b0000000-0000-4000-8000-000000000001';
  r_rodrigo constant uuid := 'b0000000-0000-4000-8000-000000000002';
  u record;
begin
  select encrypted_password into v_hash from auth.users
   where email in ('maria@bsl.app', 'chofer@bsl.app', 'monica@bsl.app') and encrypted_password <> ''
   order by email limit 1;
  if v_hash is null then
    raise exception 'No hay una cuenta de demostración de la que copiar la contraseña. No se borró nada.';
  end if;

  delete from auth.users;

  for u in
    select * from (values
      (r_monica,  'monica@bsl.app',  'guardian', 'Mónica',  'León'),
      (r_rodrigo, 'rodrigo@bsl.app', 'driver',   'Rodrigo', 'González')
    ) as t(id, email, role, first_name, last_name)
  loop
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change, email_change_token_new)
    values ('00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
            v_hash, now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            jsonb_build_object('role', u.role, 'first_name', u.first_name, 'last_name', u.last_name),
            now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), u.id, u.id::text,
            jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
            'email', now(), now(), now());
  end loop;

  -- Verificado para que pueda iniciar recorridos (el vehículo lo completa él en la app).
  update public.drivers set verification_status = 'verified' where id = r_rodrigo;

  raise notice 'Listo: quedan monica@bsl.app y rodrigo@bsl.app.';
end $$;

select u.email, p.first_name, p.last_name, p.role, d.verification_status
from auth.users u join public.users p on p.id = u.id left join public.drivers d on d.id = u.id
order by p.role;
