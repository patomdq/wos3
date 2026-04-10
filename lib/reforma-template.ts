export type ItemTemplate = { nombre: string; orden: number }

export type PartidaTemplate = {
  nombre:    string
  categoria: string
  orden:     number
  items:     ItemTemplate[]
}

export const PARTIDAS_PLANTILLA: PartidaTemplate[] = [
  {
    nombre: 'Electricidad', categoria: 'obra', orden: 1,
    items: [
      { nombre: 'Cuadro eléctrico',          orden: 1 },
      { nombre: 'Cableado general',           orden: 2 },
      { nombre: 'Enchufes',                   orden: 3 },
      { nombre: 'Interruptores',              orden: 4 },
      { nombre: 'Puntos de luz',              orden: 5 },
      { nombre: 'Mano de obra electricista',  orden: 6 },
    ],
  },
  {
    nombre: 'Pintura', categoria: 'obra', orden: 2,
    items: [
      { nombre: 'Pintura paredes',       orden: 1 },
      { nombre: 'Pintura techos',        orden: 2 },
      { nombre: 'Lacado puertas',        orden: 3 },
      { nombre: 'Papel pintado',         orden: 4 },
      { nombre: 'Mano de obra pintor',   orden: 5 },
    ],
  },
  {
    nombre: 'Albañilería', categoria: 'obra', orden: 3,
    items: [
      { nombre: 'Demoliciones',           orden: 1 },
      { nombre: 'Levantamiento tabiques', orden: 2 },
      { nombre: 'Enfoscados',             orden: 3 },
      { nombre: 'Soleras',                orden: 4 },
      { nombre: 'Alicatados',             orden: 5 },
      { nombre: 'Mano de obra albañil',   orden: 6 },
    ],
  },
  {
    nombre: 'Fontanería', categoria: 'obra', orden: 4,
    items: [
      { nombre: 'Tuberías agua fría',      orden: 1 },
      { nombre: 'Tuberías agua caliente',  orden: 2 },
      { nombre: 'Desagües',                orden: 3 },
      { nombre: 'Llaves de paso',          orden: 4 },
      { nombre: 'Mano de obra fontanero',  orden: 5 },
    ],
  },
  {
    nombre: 'Carpintería', categoria: 'obra', orden: 5,
    items: [
      { nombre: 'Armarios empotrados',     orden: 1 },
      { nombre: 'Estanterías',             orden: 2 },
      { nombre: 'Muebles a medida',        orden: 3 },
      { nombre: 'Mano de obra carpintero', orden: 4 },
    ],
  },
  {
    nombre: 'Cerrajería', categoria: 'obra', orden: 6,
    items: [
      { nombre: 'Puerta de entrada',       orden: 1 },
      { nombre: 'Cerradura blindada',      orden: 2 },
      { nombre: 'Mirilla',                 orden: 3 },
      { nombre: 'Bombín',                  orden: 4 },
      { nombre: 'Mano de obra cerrajero',  orden: 5 },
    ],
  },
  {
    nombre: 'Iluminación', categoria: 'materiales', orden: 7,
    items: [
      { nombre: 'Lámpara salón',           orden: 1 },
      { nombre: 'Lámpara comedor',         orden: 2 },
      { nombre: 'Lámparas habitaciones',   orden: 3 },
      { nombre: 'Focos LED empotrables',   orden: 4 },
      { nombre: 'Apliques',                orden: 5 },
    ],
  },
  {
    nombre: 'Suelos y rodapiés', categoria: 'materiales', orden: 8,
    items: [
      { nombre: 'Tarima flotante',          orden: 1 },
      { nombre: 'Rodapiés',                 orden: 2 },
      { nombre: 'Mano de obra instalación', orden: 3 },
    ],
  },
  {
    nombre: 'Puertas y herrajes', categoria: 'materiales', orden: 9,
    items: [
      { nombre: 'Puerta interior hab. 1',  orden: 1 },
      { nombre: 'Puerta interior hab. 2',  orden: 2 },
      { nombre: 'Puerta interior hab. 3',  orden: 3 },
      { nombre: 'Puerta baño',             orden: 4 },
      { nombre: 'Puerta cocina',           orden: 5 },
      { nombre: 'Manillas y bisagras',     orden: 6 },
    ],
  },
  {
    nombre: 'Ventanas y aluminio', categoria: 'materiales', orden: 10,
    items: [
      { nombre: 'Ventana salón',      orden: 1 },
      { nombre: 'Ventana cocina',     orden: 2 },
      { nombre: 'Ventana hab. 1',     orden: 3 },
      { nombre: 'Ventana hab. 2',     orden: 4 },
      { nombre: 'Ventana hab. 3',     orden: 5 },
      { nombre: 'Ventana baño',       orden: 6 },
    ],
  },
  {
    nombre: 'Cocina – mobiliario', categoria: 'mobiliario', orden: 11,
    items: [
      { nombre: 'Muebles bajos',        orden: 1 },
      { nombre: 'Muebles altos',        orden: 2 },
      { nombre: 'Columna horno/frigo',  orden: 3 },
      { nombre: 'Tirador',              orden: 4 },
      { nombre: 'Mano de obra montaje', orden: 5 },
    ],
  },
  {
    nombre: 'Cocina – encimera y fregadero', categoria: 'materiales', orden: 12,
    items: [
      { nombre: 'Encimera',     orden: 1 },
      { nombre: 'Fregadero',    orden: 2 },
      { nombre: 'Grifo cocina', orden: 3 },
      { nombre: 'Sifón',        orden: 4 },
    ],
  },
  {
    nombre: 'Electrodomésticos', categoria: 'electro', orden: 13,
    items: [
      { nombre: 'Frigorífico',          orden: 1 },
      { nombre: 'Horno',                orden: 2 },
      { nombre: 'Vitrocerámica',        orden: 3 },
      { nombre: 'Campana extractora',   orden: 4 },
      { nombre: 'Lavadora',             orden: 5 },
      { nombre: 'Lavavajillas',         orden: 6 },
      { nombre: 'Termo / calentador',   orden: 7 },
      { nombre: 'Microondas',           orden: 8 },
      { nombre: 'TV',                   orden: 9 },
    ],
  },
  {
    nombre: 'Baño – sanitarios y grifería', categoria: 'materiales', orden: 14,
    items: [
      { nombre: 'Inodoro',                              orden: 1 },
      { nombre: 'Lavabo',                               orden: 2 },
      { nombre: 'Plato ducha',                          orden: 3 },
      { nombre: 'Mampara',                              orden: 4 },
      { nombre: 'Grifo lavabo',                         orden: 5 },
      { nombre: 'Grifo ducha',                          orden: 6 },
      { nombre: 'Accesorios (toallero, portarrollos…)', orden: 7 },
    ],
  },
  {
    nombre: 'Baño – mobiliario y espejo', categoria: 'mobiliario', orden: 15,
    items: [
      { nombre: 'Mueble lavabo',              orden: 1 },
      { nombre: 'Espejo',                     orden: 2 },
      { nombre: 'Aplique iluminación espejo', orden: 3 },
    ],
  },
  {
    nombre: 'Mobiliario salón', categoria: 'mobiliario', orden: 16,
    items: [
      { nombre: 'Sofá',             orden: 1 },
      { nombre: 'Mesa centro',      orden: 2 },
      { nombre: 'Estantería',       orden: 3 },
      { nombre: 'Mueble TV',        orden: 4 },
    ],
  },
  {
    nombre: 'Mobiliario comedor', categoria: 'mobiliario', orden: 17,
    items: [
      { nombre: 'Mesa comedor',  orden: 1 },
      { nombre: 'Sillas comedor', orden: 2 },
      { nombre: 'Aparador',      orden: 3 },
    ],
  },
  {
    nombre: 'Mobiliario habitaciones', categoria: 'mobiliario', orden: 18,
    items: [
      { nombre: 'Cama hab. principal', orden: 1 },
      { nombre: 'Mesillas noche',      orden: 2 },
      { nombre: 'Cómoda',              orden: 3 },
      { nombre: 'Cama hab. 2',         orden: 4 },
      { nombre: 'Cama hab. 3',         orden: 5 },
      { nombre: 'Escritorio',          orden: 6 },
    ],
  },
  {
    nombre: 'Textiles y decoración', categoria: 'decoracion', orden: 19,
    items: [
      { nombre: 'Cortinas / estores',      orden: 1 },
      { nombre: 'Alfombras',               orden: 2 },
      { nombre: 'Cojines',                 orden: 3 },
      { nombre: 'Cuadros / decoración',    orden: 4 },
      { nombre: 'Plantas',                 orden: 5 },
    ],
  },
  {
    nombre: 'Limpieza final y retirada', categoria: 'otros', orden: 20,
    items: [
      { nombre: 'Limpieza final obra',  orden: 1 },
      { nombre: 'Retirada escombros',   orden: 2 },
      { nombre: 'Transporte residuos',  orden: 3 },
    ],
  },
  {
    nombre: 'Otros', categoria: 'otros', orden: 21,
    items: [
      { nombre: 'Otros gastos', orden: 1 },
    ],
  },
]
