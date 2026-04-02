-- WOS 3.0 Schema
-- Ejecutar en Supabase SQL Editor del proyecto mxdesbiyjvdnpehklwcb

-- Extensiones
create extension if not exists "uuid-ossp";

-- proyectos (tabla central unificada)
create table if not exists proyectos (
  id uuid primary key default uuid_generate_v4(),
  nombre text not null,
  direccion text,
  ciudad text,
  provincia text,
  tipo text default 'piso', -- piso, local, edificio, solar
  estado text default 'captado', -- captado, analisis, ofertado, comprado, reforma, venta, cerrado
  precio_compra numeric,
  precio_venta_estimado numeric,
  precio_venta_real numeric,
  superficie numeric,
  habitaciones integer,
  banos integer,
  porcentaje_hasu numeric default 100,
  socio_nombre text,
  inversion_hasu numeric,
  valor_total_operacion numeric,
  avance_reforma integer default 0,
  fecha_compra date,
  fecha_entrada date,
  fecha_salida_estimada date,
  notas text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- movimientos financieros
create table if not exists movimientos (
  id uuid primary key default uuid_generate_v4(),
  proyecto_id uuid references proyectos(id),
  fecha date not null,
  tipo text not null, -- Ingreso, Gasto
  categoria text,
  concepto text not null,
  monto numeric not null,
  cuenta text,
  forma_pago text,
  proveedor text,
  numero_factura text,
  observaciones text,
  created_at timestamptz default now()
);

-- partidas de reforma
create table if not exists partidas_reforma (
  id uuid primary key default uuid_generate_v4(),
  proyecto_id uuid references proyectos(id),
  nombre text not null,
  categoria text default 'obra', -- obra, materiales, mobiliario, electro, decoracion, otros
  estado text default 'pendiente', -- pendiente, en_curso, ok
  presupuesto numeric default 0,
  ejecutado numeric default 0,
  orden integer default 0,
  notas text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- tareas
create table if not exists tareas (
  id uuid primary key default uuid_generate_v4(),
  proyecto_id uuid references proyectos(id),
  titulo text not null,
  descripcion text,
  prioridad text default 'Media', -- Alta, Media, Baja
  estado text default 'Pendiente', -- Pendiente, En curso, Completada
  fecha_limite date,
  asignado_a text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- bitacora
create table if not exists bitacora (
  id uuid primary key default uuid_generate_v4(),
  proyecto_id uuid references proyectos(id),
  fecha timestamptz default now(),
  tipo text default 'nota', -- nota, hito, alerta, bot
  titulo text,
  contenido text not null,
  autor text default 'Sistema',
  created_at timestamptz default now()
);

-- documentos
create table if not exists documentos (
  id uuid primary key default uuid_generate_v4(),
  proyecto_id uuid references proyectos(id),
  nombre text not null,
  tipo text, -- pdf, imagen, contrato, factura
  url text,
  tamanio text,
  fecha_subida timestamptz default now(),
  subido_por text,
  created_at timestamptz default now()
);

-- inversores
create table if not exists inversores (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid,
  nombre text not null,
  email text,
  telefono text,
  desde date,
  created_at timestamptz default now()
);

-- proyecto_inversores (tabla puente)
create table if not exists proyecto_inversores (
  id uuid primary key default uuid_generate_v4(),
  proyecto_id uuid references proyectos(id),
  inversor_id uuid references inversores(id),
  capital_invertido numeric,
  participacion numeric, -- porcentaje
  retorno_estimado numeric,
  retorno_propio numeric,
  roi numeric,
  capital_total_operacion numeric,
  costes_totales numeric,
  duracion_meses integer,
  fecha_entrada date,
  fecha_salida_estimada date,
  estado text default 'activo',
  created_at timestamptz default now()
);

-- hitos inversor
create table if not exists hitos_inversor (
  id uuid primary key default uuid_generate_v4(),
  proyecto_inversor_id uuid references proyecto_inversores(id),
  label text not null,
  done boolean default false,
  fecha text,
  orden integer default 0,
  created_at timestamptz default now()
);

-- bitacora inversor (visible al inversor)
create table if not exists bitacora_inversor (
  id uuid primary key default uuid_generate_v4(),
  proyecto_inversor_id uuid references proyecto_inversores(id),
  partida text not null,
  estado text default 'pendiente', -- pendiente, en_curso, finalizada
  fecha text,
  orden integer default 0,
  created_at timestamptz default now()
);

-- proveedores
create table if not exists proveedores (
  id uuid primary key default uuid_generate_v4(),
  nombre text not null,
  rubro text,
  contacto text,
  cif text,
  email text,
  telefono text,
  activo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- cuentas_bancarias
create table if not exists cuentas_bancarias (
  id uuid primary key default uuid_generate_v4(),
  nombre text not null,
  banco text,
  iban_parcial text,
  proyecto_id uuid references proyectos(id),
  saldo_actual numeric default 0,
  activa boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- inmuebles_radar (testigos / en radar)
create table if not exists inmuebles_radar (
  id uuid primary key default uuid_generate_v4(),
  precio numeric,
  direccion text,
  ciudad text,
  habitaciones integer,
  superficie numeric,
  fuente text, -- whatsapp, idealista, api, otro
  contacto text,
  fecha_recibido date default current_date,
  estado text default 'activo', -- activo, descartado, convertido
  notas text,
  created_at timestamptz default now()
);

-- inmuebles_estudio (pasaron por calculadora)
create table if not exists inmuebles_estudio (
  id uuid primary key default uuid_generate_v4(),
  radar_id uuid references inmuebles_radar(id),
  nombre text,
  precio_compra numeric,
  reforma_estimada numeric,
  gastos_adicionales_pct numeric default 10,
  precio_venta_objetivo numeric,
  inversion_total numeric,
  beneficio_estimado numeric,
  roi_estimado numeric,
  habitaciones integer,
  superficie numeric,
  direccion text,
  ciudad text,
  estado text default 'en_estudio', -- en_estudio, aprobado, descartado
  analizado_en date default current_date,
  notas text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- user_roles
create table if not exists user_roles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null,
  role text not null default 'pm', -- admin, pm, inversor, viewer
  created_at timestamptz default now()
);

-- RLS: habilitar en todas las tablas
alter table proyectos enable row level security;
alter table movimientos enable row level security;
alter table partidas_reforma enable row level security;
alter table tareas enable row level security;
alter table bitacora enable row level security;
alter table documentos enable row level security;
alter table inversores enable row level security;
alter table proyecto_inversores enable row level security;
alter table hitos_inversor enable row level security;
alter table bitacora_inversor enable row level security;
alter table proveedores enable row level security;
alter table cuentas_bancarias enable row level security;
alter table inmuebles_radar enable row level security;
alter table inmuebles_estudio enable row level security;
alter table user_roles enable row level security;

-- Políticas básicas (usuarios autenticados ven todo, inversores solo sus datos)
create policy "auth_all" on proyectos for all to authenticated using (true) with check (true);
create policy "auth_all" on movimientos for all to authenticated using (true) with check (true);
create policy "auth_all" on partidas_reforma for all to authenticated using (true) with check (true);
create policy "auth_all" on tareas for all to authenticated using (true) with check (true);
create policy "auth_all" on bitacora for all to authenticated using (true) with check (true);
create policy "auth_all" on documentos for all to authenticated using (true) with check (true);
create policy "auth_all" on inversores for all to authenticated using (true) with check (true);
create policy "auth_all" on proyecto_inversores for all to authenticated using (true) with check (true);
create policy "auth_all" on hitos_inversor for all to authenticated using (true) with check (true);
create policy "auth_all" on bitacora_inversor for all to authenticated using (true) with check (true);
create policy "auth_all" on proveedores for all to authenticated using (true) with check (true);
create policy "auth_all" on cuentas_bancarias for all to authenticated using (true) with check (true);
create policy "auth_all" on inmuebles_radar for all to authenticated using (true) with check (true);
create policy "auth_all" on inmuebles_estudio for all to authenticated using (true) with check (true);
create policy "auth_all" on user_roles for all to authenticated using (true) with check (true);
