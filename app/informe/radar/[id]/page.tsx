import { redirect } from 'next/navigation'

// Los inmuebles del radar viven ahora en la tabla unificada `inmuebles` — el mismo
// id se preservó en la migración, así que redirigimos al informe unificado.
export default function InformeRadarRedirect({ params }: { params: { id: string } }) {
  redirect(`/informe/inmueble/${params.id}`)
}
