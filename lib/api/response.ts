import { NextResponse } from 'next/server'

export interface ApiError {
  code: string
  message: string
  details?: unknown
}

export function ok<T>(data: T, init?: { status?: number; meta?: Record<string, unknown> }) {
  return NextResponse.json(
    { success: true, data, ...(init?.meta ? { meta: init.meta } : {}) },
    { status: init?.status ?? 200 },
  )
}

export function err(status: number, error: ApiError) {
  return NextResponse.json({ success: false, error }, { status })
}
