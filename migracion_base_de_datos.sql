-- ==========================================
-- Base de datos: TechPro Modulaciones
-- ==========================================

-- 1. Tabla settings
create table if not exists public.settings (
  key text primary key,
  value text not null
);

-- 2. Tabla admins
create table if not exists public.admins (
  user_id uuid primary key
);

-- 3. Tabla motivos
create table if not exists public.motivos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique
);

-- 4. Tabla choferes
create table if not exists public.choferes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique
);

-- 5. Tabla clientes
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  title text,
  numero_cliente text not null unique,
  nombre text,
  domicilio text,
  vendedor text,
  sv text,
  telefono text,
  zona text,
  msj_en_fra text,
  created_at timestamp with time zone default now()
);

-- 6. Tabla puntuaciones
create table if not exists public.puntuaciones (
  id uuid primary key default gen_random_uuid(),
  cliente_numero text not null,
  cliente_nombre text,
  puntuacion int not null check (puntuacion between 0 and 5),
  comentario text,
  fecha timestamp with time zone not null,
  created_at timestamp with time zone default now()
);

-- 7. Tabla modulaciones
create table if not exists public.modulaciones (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone default now(),
  cliente_id uuid references public.clientes(id) on delete set null,
  cliente_numero text not null,
  cliente_nombre text,
  zona text,
  vendedor text,
  sv text,
  motivo text not null,
  chofer text not null,
  bultos numeric not null default 0,
  hl numeric,
  comentario text,
  actualizacion text,
  created_by uuid,
  created_by_email text,
  updated_at timestamp with time zone default now()
);

-- 8. Tabla whatsapp_groups
create table if not exists public.whatsapp_groups (
  id uuid primary key default gen_random_uuid(),
  supervisor_name text not null unique,
  group_link text,
  group_id text,
  active boolean not null default true,
  created_at timestamp with time zone default now()
);

-- ==========================================
-- Row Level Security (RLS) Policies (opcional pero recomendado)
-- ==========================================

-- Habilitar RLS para todas las tablas
alter table public.settings enable row level security;
alter table public.admins enable row level security;
alter table public.motivos enable row level security;
alter table public.choferes enable row level security;
alter table public.clientes enable row level security;
alter table public.puntuaciones enable row level security;
alter table public.modulaciones enable row level security;
alter table public.whatsapp_groups enable row level security;

-- Crear policies (ejemplo: permitir lectura/escritura a usuarios autenticados)
-- Ajusta según tus necesidades de seguridad
create policy "Usuarios autenticados pueden leer settings"
  on public.settings
  for select
  using (auth.uid() is not null);

create policy "Usuarios autenticados pueden leer admins"
  on public.admins
  for select
  using (auth.uid() is not null);

create policy "Usuarios autenticados pueden leer motivos"
  on public.motivos
  for all
  using (auth.uid() is not null);

create policy "Usuarios autenticados pueden leer choferes"
  on public.choferes
  for all
  using (auth.uid() is not null);

create policy "Usuarios autenticados pueden acceder a clientes"
  on public.clientes
  for all
  using (auth.uid() is not null);

create policy "Usuarios autenticados pueden acceder a puntuaciones"
  on public.puntuaciones
  for all
  using (auth.uid() is not null);

create policy "Usuarios autenticados pueden acceder a modulaciones"
  on public.modulaciones
  for all
  using (auth.uid() is not null);

create policy "Usuarios autenticados pueden acceder a whatsapp_groups"
  on public.whatsapp_groups
  for all
  using (auth.uid() is not null);

-- ==========================================
-- Insertar datos iniciales (opcional)
-- ==========================================

-- Insertar un nombre de app por defecto
insert into public.settings (key, value)
values ('app_name', 'DEMO MOD. WHATSAPP')
on conflict (key) do nothing;

-- Insertar algunos motivos y choferes de ejemplo
insert into public.motivos (nombre)
values ('Entrega'), ('Rechazo'), ('Devolución'), ('Retiro')
on conflict (nombre) do nothing;
