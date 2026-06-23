-- Agregar la columna "msj_en_fra" a la tabla clientes
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS msj_en_fra TEXT NULL;
