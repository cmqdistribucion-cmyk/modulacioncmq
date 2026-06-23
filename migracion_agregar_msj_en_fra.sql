-- Agregar la columna "msj_en_fra" a la tabla clientes
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS msj_en_fra TEXT NULL;

-- Nota: Para ejecutar esto:
-- 1. Ve a tu proyecto en Supabase (https://supabase.com/dashboard)
-- 2. Navega a "SQL Editor"
-- 3. Crea una nueva consulta (New query)
-- 4. Pega este código y haz clic en "Run"
