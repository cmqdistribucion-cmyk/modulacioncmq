-- ==========================================
-- Agregar tabla de configuración para la funcionalidad automática
-- ==========================================

create table if not exists settings (
  key text primary key,
  value text not null
);

-- Insertar configuración predeterminada (desactivada)
insert into settings (key, value)
values 
  ('auto_status_enabled', 'false'),
  ('auto_status_hour', '21')
on conflict (key) do nothing;

-- ==========================================
-- Agregar policies RLS para settings
-- ==========================================
drop policy if exists "Todos los usuarios autenticados pueden leer y modificar settings" on settings;
create policy "Todos los usuarios autenticados pueden leer y modificar settings"
  on settings
  for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);
