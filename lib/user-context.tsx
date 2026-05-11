'use client'
import { createContext, useContext } from 'react'

export type UserPermisos = {
  pages: string[]          // ['bot', 'proyectos', 'mercado', 'hasu']
  project_ids: string[] | null  // null = todos los proyectos
} | null  // null = acceso total (admin/pm)

export type UserInfo = {
  email: string
  role: string
  nombre?: string
  handle?: string
  permisos: UserPermisos
}

export const UserContext = createContext<UserInfo | null>(null)
export const useUser = () => useContext(UserContext)

export function canAccessPage(permisos: UserPermisos, page: string): boolean {
  if (!permisos) return true
  return permisos.pages.includes(page)
}

export function canAccessProject(permisos: UserPermisos, projectId: string): boolean {
  if (!permisos) return true
  if (!permisos.project_ids) return true
  return permisos.project_ids.includes(projectId)
}
