import { redirect } from 'next/navigation'

// Los inmuebles en estudio viven ahora en la tabla unificada `inmuebles` — el mismo
// id se preservó en la migración, así que redirigimos al informe unificado.
export default function InformeEstudioRedirect({ params }: { params: { id: string } }) {
  redirect(`/informe/inmueble/${params.id}`)
}
