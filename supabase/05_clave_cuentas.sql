-- BSL · Pone la contraseña de prueba Bsl2026demo a las cuentas de Mónica y Rodrigo.
update auth.users
   set encrypted_password = crypt('Bsl2026demo', gen_salt('bf')), updated_at = now()
 where email in ('monica@bsl.app', 'rodrigo@bsl.app');

select email, encrypted_password = crypt('Bsl2026demo', encrypted_password) as clave_ok
from auth.users order by email;
