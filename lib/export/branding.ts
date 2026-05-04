import { prisma } from '@/lib/db/prisma'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export type Branding = {
  inst_name: string
  tagline: string | null
  address: string | null
  phone: string | null
  email: string | null
  website: string | null
  logo_url: string | null
  brand_color_hex: string
  logo_position: 'left' | 'center' | 'right'
  paper_font: string
  footer_text: string
  show_address: boolean
  show_phone: boolean
  show_website: boolean
}

const DEFAULT_BRANDING: Branding = {
  inst_name: 'Varenyam Coaching Institute',
  tagline: null,
  address: null,
  phone: null,
  email: null,
  website: null,
  logo_url: null,
  brand_color_hex: '1B3A6B',
  logo_position: 'left',
  paper_font: 'formal',
  footer_text: 'Confidential — For Student Use Only',
  show_address: true,
  show_phone: true,
  show_website: false,
}

function asLogoPosition(value: string | null | undefined): Branding['logo_position'] {
  if (value === 'left' || value === 'center' || value === 'right') return value
  return 'left'
}

export async function getInstituteBranding(): Promise<Branding> {
  const row = await prisma.instituteBranding.findFirst({
    orderBy: { updated_at: 'desc' },
  })
  if (!row) return DEFAULT_BRANDING
  return {
    inst_name: row.inst_name,
    tagline: row.tagline,
    address: row.address,
    phone: row.phone,
    email: row.email,
    website: row.website,
    logo_url: row.logo_url,
    brand_color_hex: row.brand_color_hex,
    logo_position: asLogoPosition(row.logo_position),
    paper_font: row.paper_font,
    footer_text: row.footer_text,
    show_address: row.show_address,
    show_phone: row.show_phone,
    show_website: row.show_website,
  }
}

export type TestWithQuestions = NonNullable<Awaited<ReturnType<typeof getTestWithQuestions>>>

export async function getTestWithQuestions(testId: string) {
  return prisma.test.findUnique({
    where: { id: testId },
    include: {
      course: true,
      test_questions: {
        orderBy: { position: 'asc' },
        include: { question: true },
      },
    },
  })
}

const SIGNED_URL_TTL_SECONDS = 60 * 10

// Resolves a logo URL to a signed Supabase URL when the row stores a storage
// path like "branding/logo.png"; pass-through for absolute http(s) URLs.
export async function resolveLogoSignedUrl(logoUrl: string | null): Promise<string | null> {
  if (!logoUrl) return null
  if (/^https?:\/\//i.test(logoUrl)) return logoUrl

  const supabase = createSupabaseServerClient()
  const [bucket, ...rest] = logoUrl.split('/')
  if (!bucket || rest.length === 0) return null
  const path = rest.join('/')

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
  if (error || !data) return null
  return data.signedUrl
}
