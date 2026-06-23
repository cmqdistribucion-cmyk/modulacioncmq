-- ==========================================
-- Configurar RLS para que todos los usuarios autenticados tengan acceso completo
-- ==========================================

-- 1. Eliminar políticas existentes (opcional, para limpiar)
drop policy if exists "Usuarios autenticados pueden leer settings" on settings;
drop policy if exists "Usuarios autenticados pueden leer admins" on admins;
drop policy if exists "Usuarios autenticados pueden leer motivos" on motivos;
drop policy if exists "Usuarios autenticados pueden leer choferes" on choferes;
drop policy if exists "Usuarios autenticados pueden acceder a clientes" on clientes;
drop policy if exists "Usuarios autenticados pueden acceder a puntuaciones" on puntuaciones;
drop policy if exists "Usuarios autenticados pueden acceder a modulaciones" on modulaciones;
drop policy if exists "Usuarios autenticados pueden acceder a whatsapp_groups" on whatsapp_groups;

-- 2. Crear políticas completas para todas las tablas

-- Tabla settings
create policy "Todos los usuarios autenticados pueden leer y modificar settings"
  on settings
  for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- Tabla admins
create policy "Todos los usuarios autenticados pueden leer y modificar admins"
  on admins
  for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- Tabla motivos
create policy "Todos los usuarios autenticados pueden leer y modificar motivos"
  on motivos
  for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- Tabla choferes
create policy "Todos los usuarios autenticados pueden leer y modificar choferes"
  on choferes
  for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- Tabla clientes
create policy "Todos los usuarios autenticados pueden leer y modificar clientes"
  on clientes
  for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- Tabla puntuaciones
create policy "Todos los usuarios autenticados pueden leer y modificar puntuaciones"
  on puntuaciones
  for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- Tabla modulaciones (esta es la más importante para la página de Actualización)
create policy "Todos los usuarios autenticados pueden leer y modificar modulaciones"
  on modulaciones
  for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- Tabla whatsapp_groups
create policy "Todos los usuarios autenticados pueden leer y modificar whatsapp_groups"
  on whatsapp_groups
  for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- ==========================================
-- Listo! Ahora todos los usuarios autenticados pueden ver y modificar todos los datos
-- ==========================================
