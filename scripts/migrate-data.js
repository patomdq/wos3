// migrate-data.js
// Ejecutar con: node scripts/migrate-data.js
// Requiere que el schema.sql ya haya sido ejecutado en WOS 3.0

const WOS2_URL = 'https://zzidqchvcijqgcexrzca.supabase.co';
const WOS2_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6aWRxY2h2Y2lqcWdjZXhyemNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5NTIwMjksImV4cCI6MjA3NTUyODAyOX0.KuYlzOtPkzazko6V89Q97QRHOD2tY0FOKqHsFdbzxs8';

const WOS3_URL = 'https://mxdesbiyjvdnpehklwcb.supabase.co';
const WOS3_KEY = 'sb_publishable_MYqIATd2mFpdCf8m-m_a0Q_Z_MFhaLQ';

async function read(table, select = '*') {
  const res = await fetch(`${WOS2_URL}/rest/v1/${table}?select=${select}`, {
    headers: { apikey: WOS2_KEY, Authorization: `Bearer ${WOS2_KEY}` }
  });
  if (!res.ok) { console.error(`Error reading ${table}:`, await res.text()); return []; }
  return res.json();
}

async function write(table, data) {
  if (!data || data.length === 0) { console.log(`  skip ${table}: sin datos`); return; }
  const res = await fetch(`${WOS3_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { apikey: WOS3_KEY, Authorization: `Bearer ${WOS3_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(data)
  });
  if (!res.ok) { const t = await res.text(); console.error(`Error writing ${table}:`, t); }
  else { console.log(`  OK ${table}: ${data.length} registros migrados`); }
}

async function main() {
  console.log('Iniciando migracion WOS 2.0 -> WOS 3.0...\n');

  // 1. Migrar inmuebles -> proyectos
  console.log('1. Migrando proyectos...');
  const inmuebles = await read('inmuebles', '*');
  const proyectos = inmuebles.filter(i => !i.is_demo).map(i => ({
    id: i.id,
    nombre: i.nombre,
    direccion: i.direccion,
    ciudad: i.ciudad,
    tipo: i.tipo || 'piso',
    estado: mapEstado(i.estado),
    precio_compra: i.precio_compra,
    precio_venta_estimado: i.precio_venta,
    superficie: i.superficie,
    habitaciones: i.habitaciones,
    banos: i.banos,
    porcentaje_hasu: i.porcentaje_hasu || 100,
    socio_nombre: i.socio_nombre,
    inversion_hasu: i.inversion_hasu,
    valor_total_operacion: i.valor_total_operacion,
    fecha_compra: i.fecha_compra,
    created_at: i.created_at,
    updated_at: i.updated_at
  }));
  await write('proyectos', proyectos);

  // 2. Migrar movimientos_empresa -> movimientos
  console.log('2. Migrando movimientos...');
  const movs = await read('movimientos_empresa', '*');
  const movsMapped = movs.filter(m => !m.is_demo).map(m => ({
    proyecto_id: m.proyecto_id,
    fecha: m.fecha,
    tipo: m.tipo,
    categoria: m.categoria,
    concepto: m.concepto,
    monto: m.monto,
    cuenta: m.cuenta,
    forma_pago: m.forma_pago,
    proveedor: m.proveedor,
    numero_factura: m.numero_factura,
    observaciones: m.observaciones,
    created_at: m.created_at
  }));
  await write('movimientos', movsMapped);

  // 3. Migrar partidas_reforma_detalladas -> partidas_reforma
  console.log('3. Migrando partidas de reforma...');
  const partidas = await read('partidas_reforma_detalladas', '*');
  // Necesitamos mapear reforma_id -> proyecto_id via tabla reformas
  const reformas = await read('reformas', '*');
  const reformaMap = {};
  reformas.forEach(r => { reformaMap[r.id] = r.inmueble_id; });

  const partidasMapped = partidas.filter(p => !p.is_demo).map(p => ({
    proyecto_id: reformaMap[p.reforma_id] || null,
    nombre: p.nombre,
    categoria: p.categoria,
    estado: p.estado === 'ok' ? 'ok' : p.estado === 'en_curso' ? 'en_curso' : 'pendiente',
    ejecutado: p.total_calculado || 0,
    orden: p.orden,
    notas: p.notas,
    created_at: p.created_at,
    updated_at: p.updated_at
  }));
  await write('partidas_reforma', partidasMapped);

  // 4. Migrar proveedores
  console.log('4. Migrando proveedores...');
  const provs = await read('proveedores', '*');
  const provsMapped = provs.map(p => ({
    nombre: p.nombre,
    rubro: p.rubro,
    contacto: p.contacto,
    cif: p.cif,
    email: p.email,
    telefono: p.telefono,
    created_at: p.created_at,
    updated_at: p.updated_at
  }));
  await write('proveedores', provsMapped);

  // 5. Migrar inversores
  console.log('5. Migrando inversores...');
  const invs = await read('inversores', '*');
  const invsMapped = invs.map(i => ({
    id: i.id,
    user_id: i.user_id,
    nombre: i.nombre,
    desde: i.desde,
    created_at: i.created_at
  }));
  await write('inversores', invsMapped);

  // 6. Migrar inversor_operaciones -> proyecto_inversores
  console.log('6. Migrando operaciones de inversores...');
  const ops = await read('inversor_operaciones', '*');
  const opsMapped = ops.map(o => ({
    id: o.id,
    proyecto_id: o.inmueble_id,
    inversor_id: o.inversor_id,
    capital_invertido: o.capital_invertido,
    participacion: o.participacion,
    retorno_estimado: o.retorno_estimado,
    retorno_propio: o.retorno_propio,
    roi: o.roi,
    capital_total_operacion: o.capital_total_operacion,
    costes_totales: o.costes_totales,
    duracion_meses: o.duracion_meses,
    fecha_entrada: o.fecha_entrada,
    fecha_salida_estimada: o.fecha_salida_estimada,
    created_at: o.created_at
  }));
  await write('proyecto_inversores', opsMapped);

  // 7. Migrar hitos_inversor
  console.log('7. Migrando hitos de inversor...');
  const hitos = await read('hitos_inversor', '*');
  // hitos_inversor en WOS2 tiene operacion_id -> proyecto_inversor_id en WOS3
  const hitosMapped = hitos.map(h => ({
    proyecto_inversor_id: h.operacion_id,
    label: h.titulo || h.descripcion || 'Hito',
    done: h.completado || false,
    fecha: h.fecha,
    orden: h.orden || 0,
    created_at: h.created_at
  }));
  await write('hitos_inversor', hitosMapped);

  // 8. Migrar inversor_bitacora -> bitacora_inversor
  console.log('8. Migrando bitacora de inversor...');
  const bitacoraInv = await read('inversor_bitacora', '*');
  const bitacoraInvMapped = bitacoraInv.map(b => ({
    proyecto_inversor_id: b.operacion_id,
    partida: b.partida,
    estado: b.estado || 'pendiente',
    fecha: b.fecha,
    orden: b.orden || 0,
    created_at: b.created_at
  }));
  await write('bitacora_inversor', bitacoraInvMapped);

  // 9. Migrar tareas_globales -> tareas
  console.log('9. Migrando tareas...');
  const tareas = await read('tareas_globales', '*');
  const tareasMapped = tareas.map(t => ({
    titulo: t.titulo,
    descripcion: t.descripcion,
    prioridad: t.prioridad,
    estado: t.estado,
    fecha_limite: t.fecha_limite,
    created_at: t.created_at,
    updated_at: t.updated_at
  }));
  await write('tareas', tareasMapped);

  // 10. Migrar proyectos_rentabilidad -> inmuebles_estudio
  console.log('10. Migrando inmuebles en estudio...');
  const estudios = await read('proyectos_rentabilidad', '*');
  const estudiosMapped = estudios.filter(e => !e.is_demo).map(e => ({
    nombre: e.nombre,
    precio_compra: e.precio_compra_estimado || e.precio_compra_real,
    precio_venta_objetivo: e.precio_venta_realista,
    roi_estimado: e.rentabilidad_realista,
    direccion: e.direccion,
    ciudad: e.ciudad,
    estado: e.estado === 'terminado' ? 'aprobado' : e.estado === 'descartado' ? 'descartado' : 'en_estudio',
    created_at: e.created_at,
    updated_at: e.updated_at
  }));
  await write('inmuebles_estudio', estudiosMapped);

  console.log('\nMigracion completada exitosamente.');
}

function mapEstado(estado) {
  const map = {
    'CAPTADO': 'captado', 'ANALISIS': 'analisis', 'OFERTADO': 'ofertado',
    'COMPRADO': 'comprado', 'EN_REFORMA': 'reforma', 'EN_VENTA': 'venta',
    'VENDIDO': 'cerrado', 'CERRADO': 'cerrado'
  };
  return map[estado?.toUpperCase()] || 'captado';
}

main().catch(console.error);
