export type PartidaTemplate = {
  nombre: string
  categoria: string
  orden: number
}

export const PARTIDAS_PLANTILLA: PartidaTemplate[] = [
  { nombre: 'Electricidad',                  categoria: 'obra',        orden: 1  },
  { nombre: 'Pintura',                        categoria: 'obra',        orden: 2  },
  { nombre: 'Albañilería',                    categoria: 'obra',        orden: 3  },
  { nombre: 'Fontanería',                     categoria: 'obra',        orden: 4  },
  { nombre: 'Carpintería',                    categoria: 'obra',        orden: 5  },
  { nombre: 'Cerrajería',                     categoria: 'obra',        orden: 6  },
  { nombre: 'Iluminación',                    categoria: 'materiales',  orden: 7  },
  { nombre: 'Suelos y rodapiés',              categoria: 'materiales',  orden: 8  },
  { nombre: 'Puertas y herrajes',             categoria: 'materiales',  orden: 9  },
  { nombre: 'Ventanas y aluminio',            categoria: 'materiales',  orden: 10 },
  { nombre: 'Cocina – mobiliario',            categoria: 'mobiliario',  orden: 11 },
  { nombre: 'Cocina – encimera y fregadero',  categoria: 'materiales',  orden: 12 },
  { nombre: 'Electrodomésticos',              categoria: 'electro',     orden: 13 },
  { nombre: 'Baño – sanitarios y grifería',   categoria: 'materiales',  orden: 14 },
  { nombre: 'Baño – mobiliario y espejo',     categoria: 'mobiliario',  orden: 15 },
  { nombre: 'Mobiliario salón',               categoria: 'mobiliario',  orden: 16 },
  { nombre: 'Mobiliario comedor',             categoria: 'mobiliario',  orden: 17 },
  { nombre: 'Mobiliario habitaciones',        categoria: 'mobiliario',  orden: 18 },
  { nombre: 'Textiles y decoración',          categoria: 'decoracion',  orden: 19 },
  { nombre: 'Limpieza final y retirada',      categoria: 'otros',       orden: 20 },
  { nombre: 'Otros',                          categoria: 'otros',       orden: 21 },
]
