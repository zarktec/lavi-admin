-- Esquema inicial: catálogo, tags, uso, puntos, integración y administración.
-- Las horas se guardan en UTC (timestamptz); nombres de tablas y columnas en inglés.

-- ───────────── Catálogo ─────────────
create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  name text not null,
  sku text unique,
  shopify_variant_id text,
  volume_ml integer,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Reglas de uso y puntos por presentación. Versionadas e inmutables.
create table variant_configs (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references product_variants(id),
  version integer not null,
  effective_from timestamptz not null default now(),
  doses_per_day integer not null check (doses_per_day between 1 and 12),
  default_reminder_times text[] not null,
  window_minutes_before integer not null check (window_minutes_before >= 0),
  window_minutes_after integer not null check (window_minutes_after >= 0),
  duration_days integer not null check (duration_days > 0),
  points_per_dose integer not null check (points_per_dose >= 0),
  missed_dose_penalty integer not null default 0 check (missed_dose_penalty >= 0),
  late_dose_avoids_penalty boolean not null default false,
  max_points_per_treatment integer check (max_points_per_treatment is null or max_points_per_treatment >= 0),
  welcome_points integer not null default 0 check (welcome_points >= 0),
  reminder_nudges jsonb not null default '[]'::jsonb,   -- minutos desde la apertura de la ventana, p. ej. [0,15,30]
  backup_push_enabled boolean not null default true,
  schedule_change_min_notice_hours integer not null default 0,
  schedule_change_max_count integer not null default 0,
  schedule_change_period_days integer not null default 30,
  repurchase_reminder_days integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (variant_id, version)
);

create table streak_rules (
  id uuid primary key default gen_random_uuid(),
  config_id uuid not null references variant_configs(id),
  streak_length integer not null check (streak_length > 0),
  bonus_points integer not null check (bonus_points >= 0),
  repeatable boolean not null default false
);

-- Una configuración publicada nunca se edita: un cambio crea una versión nueva.
create function forbid_mutation() returns trigger language plpgsql as $$
begin
  raise exception '% es inmutable (%)', tg_table_name, tg_op;
end $$;

create trigger variant_configs_immutable before update or delete on variant_configs
  for each row execute function forbid_mutation();
create trigger streak_rules_immutable before update or delete on streak_rules
  for each row execute function forbid_mutation();

-- ───────────── Usuarias ─────────────
create table users (
  id uuid primary key default gen_random_uuid(),
  shopify_customer_id text not null unique,
  email text,
  name text,
  phone text,
  timezone text not null default 'America/Bogota',
  status text not null default 'active' check (status in ('active', 'blocked', 'deleted')),
  data_consent_at timestamptz,
  created_at timestamptz not null default now()
);
create index users_email_idx on users (lower(email));

create table devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  push_token text not null unique,
  platform text not null check (platform in ('ios', 'android')),
  last_seen timestamptz not null default now()
);
create index devices_user_idx on devices (user_id);

create table refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- ───────────── Tags ─────────────
create table tag_batches (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references product_variants(id),
  batch_code text not null unique,
  status text not null default 'active' check (status in ('active', 'blocked')),
  imported_at timestamptz not null default now(),
  imported_by uuid
);

create table tags (
  uid text primary key check (uid ~ '^[0-9A-F]{14}$'),
  batch_id uuid not null references tag_batches(id),
  variant_id uuid not null references product_variants(id),
  key_ref text not null,
  last_counter integer not null default -1,
  status text not null default 'unclaimed' check (status in ('unclaimed', 'claimed', 'blocked')),
  claimed_by uuid references users(id),
  claimed_at timestamptz,
  shopify_order_id text,
  blocked_reason text
);
create index tags_batch_idx on tags (batch_id);
create index tags_claimed_by_idx on tags (claimed_by);

-- ───────────── Uso ─────────────
create table treatments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  tag_uid text not null unique references tags(uid),
  config_id uuid not null references variant_configs(id),
  start_date date not null,
  end_date date not null,
  reminder_times text[] not null,
  status text not null default 'active' check (status in ('active', 'finished', 'cancelled')),
  points_earned integer not null default 0,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index treatments_user_idx on treatments (user_id, status);

create table schedule_changes (
  id uuid primary key default gen_random_uuid(),
  treatment_id uuid not null references treatments(id),
  old_times text[] not null,
  new_times text[] not null,
  effective_from timestamptz not null,
  created_at timestamptz not null default now()
);

create table scans (
  id uuid primary key default gen_random_uuid(),
  tag_uid text references tags(uid),
  user_id uuid references users(id),
  dose_id uuid,
  counter integer,
  cmac_valid boolean not null default false,
  counted boolean not null default false,          -- la lectura consumió el contador del tag
  result text not null,
  reason text,
  response jsonb,
  server_time timestamptz not null default now(),
  device_time timestamptz,
  offline boolean not null default false
);
-- Idempotencia por identificador de tag y contador
create unique index scans_tag_counter_uidx on scans (tag_uid, counter) where counted;
create index scans_user_idx on scans (user_id, server_time desc);
create index scans_tag_idx on scans (tag_uid, server_time desc);
create index scans_result_idx on scans (result, server_time desc);

create table doses (
  id uuid primary key default gen_random_uuid(),
  treatment_id uuid not null references treatments(id),
  window_start timestamptz not null,
  window_end timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'on_time', 'late', 'missed')),
  scan_id uuid references scans(id),
  recorded_at timestamptz,
  backup_push_sent_at timestamptz,
  check (window_end > window_start)
);
create index doses_treatment_idx on doses (treatment_id, window_start);
create index doses_open_idx on doses (window_end) where status = 'scheduled';

alter table scans add constraint scans_dose_fk foreign key (dose_id) references doses(id);

-- ───────────── Puntos ─────────────
-- El saldo es la suma del libro. Nunca se edita ni se borra un movimiento.
create table points_ledger (
  id bigserial primary key,
  user_id uuid not null references users(id),
  amount integer not null check (amount <> 0),
  reason text not null,
  reference_type text,
  reference_id text,
  expires_at timestamptz,
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index points_ledger_user_idx on points_ledger (user_id, created_at);
-- Un hecho (dosis, canje, ajuste…) da puntos una sola vez
create unique index points_ledger_ref_uidx on points_ledger (reference_type, reference_id)
  where reference_type is not null;

create trigger points_ledger_immutable before update or delete on points_ledger
  for each row execute function forbid_mutation();

create table redemption_options (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  points_cost integer not null check (points_cost > 0),
  reward_type text not null check (reward_type in ('fixed_amount', 'percentage', 'free_product', 'free_shipping')),
  reward_value numeric,                              -- COP (fixed_amount) o 0-100 (percentage)
  shopify_product_id text,                           -- requerido para free_product y opcional para limitar el descuento
  combines_with jsonb not null default '{"productDiscounts":false,"orderDiscounts":false,"shippingDiscounts":false}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  option_id uuid not null references redemption_options(id),
  points integer not null,
  code text not null unique,
  shopify_discount_id text,
  status text not null default 'pending' check (status in ('pending', 'issued', 'used', 'expired', 'failed')),
  error text,
  expires_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index redemptions_user_idx on redemptions (user_id, created_at desc);
create index redemptions_status_idx on redemptions (status);

create table idempotency_keys (
  user_id uuid not null references users(id),
  key text not null,
  status text not null default 'in_progress' check (status in ('in_progress', 'done')),
  http_status integer,
  response jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);

create table points_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  amount integer not null check (amount <> 0),
  reason text not null,
  status text not null default 'applied' check (status in ('pending_approval', 'applied', 'rejected')),
  requested_by uuid not null,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

-- ───────────── Integración ─────────────
create table shopify_orders (
  id uuid primary key default gen_random_uuid(),
  shopify_order_id text not null unique,
  user_id uuid references users(id),
  customer_gid text,
  email text,
  items jsonb not null default '[]'::jsonb,           -- [{variant_id, product_id, quantity}]
  discount_codes text[] not null default '{}',
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table webhook_events (
  webhook_id text primary key,
  topic text not null,
  received_at timestamptz not null default now(),
  processed boolean not null default false
);

-- ───────────── Administración ─────────────
create table settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table permissions (
  code text primary key,
  description text not null
);

create table roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_superadmin boolean not null default false,
  is_system boolean not null default false,
  max_adjustment integer,                            -- tope de ajuste manual de puntos por movimiento (null = sin tope propio)
  created_at timestamptz not null default now()
);

create table role_permissions (
  role_id uuid not null references roles(id) on delete cascade,
  permission_code text not null references permissions(code),
  primary key (role_id, permission_code)
);

create table admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null,
  password_hash text not null,
  totp_secret_ref text,                              -- secreto TOTP cifrado (AES-256-GCM)
  role_id uuid not null references roles(id),
  status text not null default 'pending' check (status in ('pending', 'active', 'disabled')),
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index admin_users_email_uidx on admin_users (lower(email));

create table admin_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references admin_users(id),
  token_hash text not null unique,
  mfa_verified boolean not null default false,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text,
  role_id uuid not null references roles(id),
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  invited_by uuid references admin_users(id),
  created_at timestamptz not null default now()
);

create table password_resets (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references admin_users(id),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table audit_log (
  id bigserial primary key,
  admin_user_id uuid references admin_users(id),
  action text not null,
  entity text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_created_idx on audit_log (created_at desc);

-- ───────────── Datos de referencia (no son valores de negocio) ─────────────
insert into permissions (code, description) values
  ('dashboard.view', 'Ver el inicio'),
  ('catalog.view', 'Ver catálogo y configuraciones'),
  ('catalog.manage', 'Gestionar productos, presentaciones, versiones de configuración y reglas de racha'),
  ('tags.view', 'Buscar tags y ver su historial'),
  ('tags.manage', 'Importar lotes y bloquear/desbloquear tags'),
  ('tags.transfer', 'Transferir tags entre clientas'),
  ('customers.view', 'Buscar clientas y ver su ficha'),
  ('points.adjust', 'Registrar ajustes manuales de puntos'),
  ('points.approve', 'Aprobar ajustes manuales por encima del umbral'),
  ('redemptions.view', 'Ver opciones y cola de canjes'),
  ('redemptions.manage', 'Gestionar opciones de canje y resolver canjes con problemas'),
  ('settings.view', 'Ver ajustes globales'),
  ('settings.manage', 'Editar ajustes globales y textos'),
  ('reports.view', 'Ver reportes'),
  ('team.manage', 'Gestionar usuarios, roles e invitaciones'),
  ('audit.view', 'Ver la bitácora');

insert into roles (name, description, is_superadmin, is_system, max_adjustment) values
  ('Superadministrador', 'Todo, incluidos ajustes globales, usuarios y roles', true, true, null),
  ('Operaciones', 'Catálogo, configuraciones de puntos, lotes de tags, opciones de canje', false, true, null),
  ('Servicio al cliente', 'Búsqueda y ficha de clientas, transferencias de tags, ajustes de puntos hasta un límite', false, true, 500),
  ('Analista', 'Solo reportes', false, true, null);

insert into role_permissions (role_id, permission_code)
select r.id, p.code from roles r join permissions p on (
  (r.name = 'Operaciones' and p.code in ('dashboard.view','catalog.view','catalog.manage','tags.view','tags.manage','redemptions.view','redemptions.manage','settings.view','reports.view'))
  or (r.name = 'Servicio al cliente' and p.code in ('dashboard.view','customers.view','tags.view','tags.transfer','points.adjust','redemptions.view'))
  or (r.name = 'Analista' and p.code in ('reports.view'))
);
