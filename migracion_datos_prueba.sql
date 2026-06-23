-- ==========================================
-- Insertar datos de prueba para verificar que la página de Actualización funcione
-- ==========================================

-- 1. Insertar un cliente de prueba si no existe
insert into clientes (numero_cliente, nombre, domicilio, zona, vendedor, sv, msj_en_fra)
values ('12345', 'Cliente de Prueba SRL', 'Calle Falsa 123', 'Zona 1', 'Perez, Juan', 'Gomez, Maria', 'Llamar antes de entregar')
on conflict (numero_cliente) do nothing;

-- 2. Insertar un cliente con msj_en_fra
insert into clientes (numero_cliente, nombre, domicilio, zona, vendedor, sv, msj_en_fra)
values ('98765', 'Comercio Prueba', 'Av. Siempre Viva 742', 'Zona 2', 'Garcia, Carlos', 'Lopez, Ana', 'Solo entregar por la tarde')
on conflict (numero_cliente) do nothing;

-- 3. Insertar modulaciones de prueba para hoy
-- Obtener la fecha actual en tu zona horaria o usar UTC
-- Para asegurarte de que se vean, insertamos modulaciones con created_at en el día de hoy

-- Obtenemos los ids de los clientes
with clientes_test as (
  select id, numero_cliente, nombre, zona, vendedor, sv
  from clientes
  where numero_cliente in ('12345', '98765')
)

insert into modulaciones (
  cliente_id, 
  cliente_numero, 
  cliente_nombre, 
  zona, 
  vendedor, 
  sv, 
  motivo, 
  chofer, 
  bultos, 
  hl, 
  comentario, 
  actualizacion
)
select 
  id,
  numero_cliente,
  nombre,
  zona,
  vendedor,
  sv,
  'Entrega' as motivo,
  'Chofer de Prueba' as chofer,
  10.5 as bultos, -- Prueba con decimal
  2.75 as hl,
  'Modulación de prueba para verificar la página' as comentario,
  'pendiente' as actualizacion
from clientes_test
on conflict do nothing;

-- 4. Insertar puntuación de prueba
with cliente_test as (
  select numero_cliente from clientes where numero_cliente = '12345'
)
insert into puntuaciones (cliente_numero, cliente_nombre, puntuacion, comentario, fecha)
select numero_cliente, 'Cliente de Prueba SRL', 5 as puntuacion, 'Excelente servicio', now() as fecha
from cliente_test
on conflict do nothing;

-- ==========================================
-- Listo! Ahora deberías ver datos en la página de Actualización
-- ==========================================
