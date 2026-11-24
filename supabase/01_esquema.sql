-- ============================================================================
-- BSL · Busetas Seguras Loja · Esquema 2.0
-- Archivo 1 de 3. Pégalo completo en Supabase → SQL Editor → Run, en un
-- proyecto NUEVO (no en el proyecto de VSL 1.0). Se puede volver a ejecutar.
-- ============================================================================

create extension if not exists pgcrypto;

-- ───────────────────────────── Utilidades ─────────────────────────────────
create or replace function public.hoy() returns date
language sql stable as $$ select (now() at time zone 'America/Guayaquil')::date $$;

create or replace function public.hora_local(ts timestamptz) returns text
language sql stable as $$ select to_char(ts at time zone 'America/Guayaquil', 'HH24:MI') $$;

-- Distancia en metros entre dos puntos (Haversine).
create or replace function public.distancia_m(lat1 double precision, lon1 double precision,
                                              lat2 double precision, lon2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)))
$$;

-- ───────────────────────────── Tablas ─────────────────────────────────────
create table if not exists public.app_config (
  key   text primary key,
  value text not null
);

create table if not exists public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        text not null check (role in ('driver', 'guardian', 'admin')),
  first_name  text not null default '',
  last_name   text not null default '',
  phone       text unique,
  email       text,
  photo_url   text,
  locale      text not null default 'es-EC',
  created_at  timestamptz not null default now()
);

create table if not exists public.drivers (
  id                   uuid primary key references public.users(id) on delete cascade,
  vehicle_brand        text,
  vehicle_model        text,
  vehicle_year         int check (vehicle_year between 1980 and 2100),
  vehicle_color        text,
  plate_number         text check (plate_number ~ '^[A-Z]{3}-[0-9]{3,4}$'),
  vehicle_capacity     int check (vehicle_capacity between 1 and 60),
  verification_status  text not null default 'pending'
                       check (verification_status in ('pending', 'in_review', 'verified', 'rejected')),
  verified_at          timestamptz,
  reviewer_note        text,
  low_power_mode       boolean not null default false,
  absence_cutoff_time  time not null default '05:30',
  quick_messages       text[] not null default array['Tráfico pesado', 'Llego en 5 min'],
  created_at           timestamptz not null default now()
);

-- Datos que solo ve el propio chofer (la licencia no se muestra a los representantes).
create table if not exists public.driver_private (
  driver_id       uuid primary key references public.drivers(id) on delete cascade,
  license_number  text,
  license_type    text,
  license_expiry  date
);

create table if not exists public.driver_documents (
  id             uuid primary key default gen_random_uuid(),
  driver_id      uuid not null references public.drivers(id) on delete cascade,
  kind           text not null check (kind in ('license', 'registration', 'vehicle_photo', 'profile_photo')),
  file_path      text not null,
  status         text not null default 'uploaded' check (status in ('uploaded', 'approved', 'rejected')),
  reviewer_note  text,
  created_at     timestamptz not null default now(),
  unique (driver_id, kind)
);

create table if not exists public.addresses (
  id              uuid primary key default gen_random_uuid(),
  driver_id       uuid not null references public.users(id) on delete cascade,
  student_id      uuid,                       -- FK más abajo (NULL = dirección de una escuela)
  created_by      uuid references public.users(id) on delete set null,
  label           text not null default 'Casa',
  kind            text not null default 'both' check (kind in ('pickup', 'dropoff', 'both', 'school')),
  main_street     text not null default '',
  cross_street    text,
  house_number    text,
  neighborhood    text,
  reference       text,
  receiver_note   text,
  city            text not null default 'Loja',
  latitude        double precision not null,
  longitude       double precision not null,
  gps_accuracy_m  real,
  created_at      timestamptz not null default now()
);

create table if not exists public.schools (
  id              uuid primary key default gen_random_uuid(),
  driver_id       uuid not null references public.users(id) on delete cascade,
  name            text not null,
  short_name      text not null,
  color           text not null default '#14A3A0',
  address_id      uuid references public.addresses(id) on delete set null,
  entry_time      time not null default '07:00',
  exit_time       time not null default '13:00',
  gate_reference  text,
  archived_at     timestamptz,
  created_at      timestamptz not null default now()
);

create table if not exists public.students (
  id                          uuid primary key default gen_random_uuid(),
  driver_id                   uuid not null references public.users(id) on delete cascade,
  first_name                  text not null,
  last_name                   text not null default '',
  nickname                    text,
  birth_date                  date,
  school_id                   uuid references public.schools(id) on delete set null,
  grade                       text,
  notes                       text,
  photo_path                  text,
  default_pickup_address_id   uuid references public.addresses(id) on delete set null,
  default_dropoff_address_id  uuid references public.addresses(id) on delete set null,
  monthly_fee                 numeric(8,2) not null default 35,
  created_at                  timestamptz not null default now()
);

do $$ begin
  alter table public.addresses add constraint addresses_student_fk
    foreign key (student_id) references public.students(id) on delete cascade;
exception when duplicate_object then null; end $$;

create table if not exists public.student_guardians (
  student_id              uuid not null references public.students(id) on delete cascade,
  user_id                 uuid not null references public.users(id) on delete cascade,
  relationship            text not null default 'Representante',
  is_primary              boolean not null default false,
  can_report_absence      boolean not null default true,
  receives_notifications  boolean not null default true,
  created_at              timestamptz not null default now(),
  primary key (student_id, user_id)
);
create index if not exists student_guardians_user_idx on public.student_guardians(user_id);

-- Excepciones por día: "martes y jueves la dejan donde los abuelos".
create table if not exists public.student_address_schedule (
  student_id  uuid not null references public.students(id) on delete cascade,
  weekday     smallint not null check (weekday between 1 and 7),   -- 1 = lunes
  direction   text not null check (direction in ('pickup', 'dropoff')),
  address_id  uuid not null references public.addresses(id) on delete cascade,
  primary key (student_id, weekday, direction)
);

create table if not exists public.invitations (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.students(id) on delete cascade,
  created_by      uuid not null references public.users(id) on delete cascade,
  code            text not null unique,
  guardian_name   text,
  guardian_phone  text,
  relationship    text not null default 'Representante',
  is_primary      boolean not null default false,
  expires_at      timestamptz not null default now() + interval '48 hours',
  redeemed_by     uuid references public.users(id) on delete set null,
  redeemed_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists invitations_student_idx on public.invitations(student_id);

create table if not exists public.routes (
  id              uuid primary key default gen_random_uuid(),
  driver_id       uuid not null references public.users(id) on delete cascade,
  name            text not null,
  color           text not null default '#1B4D89',
  direction       text not null check (direction in ('pickup', 'dropoff')),   -- pickup = ida
  departure_time  time not null default '06:15',
  days_of_week    smallint[] not null default '{1,2,3,4,5}',
  polyline        jsonb,
  created_at      timestamptz not null default now()
);

create table if not exists public.route_stops (
  id              uuid primary key default gen_random_uuid(),
  route_id        uuid not null references public.routes(id) on delete cascade,
  position        int not null,
  kind            text not null check (kind in ('pickup_home', 'dropoff_school', 'pickup_school', 'dropoff_home')),
  student_id      uuid references public.students(id) on delete cascade,
  school_id       uuid references public.schools(id) on delete cascade,
  address_id      uuid references public.addresses(id) on delete set null,
  estimated_time  time,
  check ((kind in ('pickup_home', 'dropoff_home') and student_id is not null and school_id is null)
      or (kind in ('dropoff_school', 'pickup_school') and school_id is not null and student_id is null))
);
create index if not exists route_stops_route_idx on public.route_stops(route_id, position);
create index if not exists route_stops_student_idx on public.route_stops(student_id);

create table if not exists public.trips (
  id                      uuid primary key default gen_random_uuid(),
  route_id                uuid not null references public.routes(id) on delete cascade,
  driver_id               uuid not null references public.users(id) on delete cascade,  -- quien conduce
  date                    date not null default public.hoy(),
  direction               text not null check (direction in ('pickup', 'dropoff')),
  status                  text not null default 'in_progress'
                          check (status in ('in_progress', 'paused', 'finished')),
  started_at              timestamptz not null default now(),
  finished_at             timestamptz,
  planned_stops_snapshot  jsonb not null default '[]',
  summary                 jsonb,
  unique (route_id, date)
);
create index if not exists trips_date_idx on public.trips(date);

create table if not exists public.trip_events (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips(id) on delete cascade,
  type        text not null check (type in ('trip_started', 'bus_near', 'bus_arriving', 'boarded', 'dropped', 'school_arrival',
                                            'paused', 'resumed', 'delay', 'deviation', 'message', 'trip_finished')),
  student_id  uuid references public.students(id) on delete cascade,
  school_id   uuid references public.schools(id) on delete set null,
  stop_id     uuid,
  payload     jsonb not null default '{}',
  latitude    double precision,
  longitude   double precision,
  client_id   uuid unique,                       -- idempotencia de la cola sin conexión
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists trip_events_trip_idx on public.trip_events(trip_id, created_at);
-- Un solo "abordó / entregado / llegó / buseta a 1 km / buseta a 500 m" por niño y viaje.
create unique index if not exists trip_events_once_per_student
  on public.trip_events(trip_id, student_id, type)
  where type in ('bus_near', 'bus_arriving', 'boarded', 'dropped', 'school_arrival');
create unique index if not exists trip_events_once_per_trip
  on public.trip_events(trip_id, type)
  where type in ('trip_started', 'trip_finished', 'delay', 'deviation');

create table if not exists public.trip_locations (
  id           bigint generated always as identity primary key,
  trip_id      uuid not null references public.trips(id) on delete cascade,
  latitude     double precision not null,
  longitude    double precision not null,
  speed        real,
  heading      real,
  recorded_at  timestamptz not null default now()
);
create index if not exists trip_locations_trip_idx on public.trip_locations(trip_id, recorded_at);

create table if not exists public.absences (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.students(id) on delete cascade,
  date           date not null,
  scope          text not null default 'all' check (scope in ('pickup', 'dropoff', 'all')),
  reason         text,
  registered_by  uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (student_id, date)
);

create table if not exists public.route_cancellations (
  id          uuid primary key default gen_random_uuid(),
  route_id    uuid not null references public.routes(id) on delete cascade,
  date        date not null,
  reason      text not null default 'Otro',
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (route_id, date)
);

create table if not exists public.driver_substitutions (
  id             uuid primary key default gen_random_uuid(),
  driver_id      uuid not null references public.users(id) on delete cascade,     -- titular
  substitute_id  uuid not null references public.users(id) on delete cascade,
  date           date not null,
  scope          text not null default 'all' check (scope in ('pickup', 'dropoff', 'all')),
  status         text not null default 'requested'
                 check (status in ('requested', 'accepted', 'rejected', 'revoked')),
  created_at     timestamptz not null default now(),
  responded_at   timestamptz,
  check (driver_id <> substitute_id),
  unique (driver_id, date)
);

create table if not exists public.messages (
  id            uuid primary key default gen_random_uuid(),
  route_id      uuid not null references public.routes(id) on delete cascade,
  trip_id       uuid references public.trips(id) on delete set null,
  sender_id     uuid not null references public.users(id) on delete cascade,
  template_key  text,
  body          text not null,
  recipients    int not null default 0,
  created_at    timestamptz not null default now()
);

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  type        text not null,
  channel     text not null default 'trip' check (channel in ('urgent', 'trip', 'messages')),
  title       text not null,
  body        text not null default '',
  student_id  uuid references public.students(id) on delete cascade,
  trip_id     uuid references public.trips(id) on delete cascade,
  route_id    uuid references public.routes(id) on delete cascade,
  data        jsonb not null default '{}',
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);

create table if not exists public.notification_preferences (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  student_id  uuid references public.students(id) on delete cascade,   -- NULL = todos mis hijos
  urgent      boolean not null default true,
  trip        boolean not null default true,
  messages    boolean not null default true,
  quiet_from  time,
  quiet_to    time
);
create unique index if not exists notification_preferences_uniq
  on public.notification_preferences(user_id, coalesce(student_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table if not exists public.push_tokens (
  token       text primary key,
  user_id     uuid not null references public.users(id) on delete cascade,
  platform    text,
  updated_at  timestamptz not null default now()
);

create table if not exists public.payments (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students(id) on delete cascade,
  driver_id   uuid not null references public.users(id) on delete cascade,
  period      date not null,                      -- primer día del mes
  amount      numeric(8,2) not null default 35,
  status      text not null default 'pending' check (status in ('paid', 'pending')),
  paid_at     timestamptz,
  unique (student_id, period)
);
