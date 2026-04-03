// migrate-data.js
// Ejecutar con: node scripts/migrate-data.js
// Requiere que el schema.sql ya haya sido ejecutado en WOS 3.0

// Requiere variables de entorno (ver .env.local):
// WOS2_URL, WOS2_SERVICE_KEY, WOS3_URL, WOS3_SERVICE_KEY
const WOS2_URL = process.env.WOS2_URL || 'https://zzidqchvcijqgcexrzca.supabase.co';
const WOS2_KEY = process.env.WOS2_SERVICE_KEY;
const WOS3_URL = process.env.WOS3_URL || 'https://mxdesbiyjvdnpehklwcb.supabase.co';
const WOS3_KEY = process.env.WOS3_SERVICE_KEY;

if (!WOS2_KEY || !WOS3_KEY) {
  console.error('ERROR: Faltan WOS2_SERVICE_KEY y/o WOS3_SERVICE_KEY en las variables de entorno.');
  console.error('Ejecutar con: WOS2_SERVICE_KEY=xxx WOS3_SERVICE_KEY=yyy node scripts/migrate-data.js');
  process.exit(1);
}

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

// Sanitize date: returns ISO string or null
function safeDate(val) {
  if (!val) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(val)) return val.substring(0, 10);
  return null; // "Enero 2026", "Dic 2026" etc → null
}

async function main() {
  console.log('Iniciando migracion WOS 2.0 -> WOS 3.0...\n');

  // Pre-fetch reformas to build reforma_id → inmueble_id map
  const reformas = await read('reformas', 'id,inmueble_id');
  const reformaToInmueble = {};
  reformas.forEach(r => { reformaToInmueble[r.id] = r.inmueble_id; });

  // 1. Migrar inmuebles -> proyectos
  console.log('1. Migrando proyectos...');
  const inmuebles = await read('inmuebles', '*');
  const migratedIds = new Set();
  const proyectos = inmuebles.filter(i => !i.is_demo).map(i => {
    migratedIds.add(i.id);
    return {
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
      fecha_compra: safeDate(i.fecha_compra),
      created_at: i.created_at,
      updated_at: i.updated_at
    };
  });
  await write('proyectos', proyectos);

  // 2. Migrar movimientos_empresa -> movimientos
  console.log('2. Migrando movimientos...');
  const movs = await read('movimientos_empresa', '*');
  const movsMapped = movs
    .filter(m => !m.is_demo)
    .map(m => {
      // proyecto_id in WOS2 may be a reforma_id → resolve to inmueble_id
      let pid = m.proyecto_id;
      if (pid && !migratedIds.has(pid) && reformaToInmueble[pid]) {
        pid = reformaToInmueble[pid];
      }
      // Only include if resolved proyecto exists
      if (pid && !migratedIds.has(pid)) pid = null;
      return {
        proyecto_id: pid || null,
        fecha: safeDate(m.fecha) || '2026-01-01',
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
      };
    });
  await write('movimientos', movsMapped);

  // 3. Migrar partidas_reforma_detalladas -> partidas_reforma
  console.log('3. Migrando partidas de reforma...');
  const partidas = await read('partidas_reforma_detalladas', '*');
  const partidasMapped = partidas.filter(p => !p.is_demo).map(p => ({
    proyecto_id: reformaToInmueble[p.reforma_id] || null,
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
  const provsMapped = provs.filter(p => !p.is_demo).map(p => ({
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
  const invsMapped = invs.filter(i => !i.is_demo).map(i => ({
    id: i.id,
    user_id: i.user_id,
    nombre: i.nombre,
    desde: safeDate(i.desde), // "Enero 2026" → null
    created_at: i.created_at
  }));
  await write('inversores', invsMapped);

  // 6. Migrar inversor_operaciones -> proyecto_inversores
  console.log('6. Migrando operaciones de inversores...');
  const ops = await read('inversor_operaciones', '*');
  const opsMapped = ops
    .filter(o => !o.is_demo && migratedIds.has(o.inmueble_id))
    .map(o => ({
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
      fecha_entrada: safeDate(o.fecha_entrada),
      fecha_salida_estimada: safeDate(o.fecha_salida_estimada),
      created_at: o.created_at
    }));
  await write('proyecto_inversores', opsMapped);

  // 7. Migrar hitos_inversor
  console.log('7. Migrando hitos de inversor...');
  const hitos = await read('hitos_inversor', '*');
  const hitosMapped = hitos.map(h => ({
    proyecto_inversor_id: h.operacion_id,
    label: h.titulo || h.descripcion || 'Hito',
    done: h.completado || false,
    fecha: safeDate(h.fecha),
    orden: h.orden || 0,
    created_at: h.created_at
  }));
  await write('hitos_inversor', hitosMapped);

  // 8. Migrar inversor_bitacora -> bitacora_inversor
  console.log('8. Migrando bitacora de inversor...');
  const migratedOpIds = new Set(opsMapped.map(o => o.id));
  const bitacoraInv = await read('inversor_bitacora', '*');
  const bitacoraInvMapped = bitacoraInv.filter(b => migratedOpIds.has(b.operacion_id)).map(b => ({
    proyecto_inversor_id: b.operacion_id,
    partida: b.partida,
    estado: b.estado || 'pendiente',
    fecha: safeDate(b.fecha),
    orden: b.orden || 0,
    created_at: b.created_at
  }));
  await write('bitacora_inversor', bitacoraInvMapped);

  // 9. Migrar tareas_globales -> tareas
  console.log('9. Migrando tareas...');
  const tareas = await read('tareas_globales', '*');
  const tareasMapped = tareas.filter(t => !t.is_demo).map(t => ({
    titulo: t.titulo,
    descripcion: t.descripcion,
    prioridad: t.prioridad,
    estado: t.estado,
    fecha_limite: safeDate(t.fecha_limite),
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
    analizado_en: safeDate(e.created_at),
    created_at: e.created_at,
    updated_at: e.updated_at
  }));
  await write('inmuebles_estudio', estudiosMapped);

  console.log('\nMigracion completada.');
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
