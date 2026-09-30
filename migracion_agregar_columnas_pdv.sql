-- Agregar columnas PDV Crítico Chofer y Feedback PDV a la tabla clientes
alter table public.clientes 
add column if not exists pdv_critico_chofer text,
add column if not exists feedback_pdv text;
