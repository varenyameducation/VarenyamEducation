'use client'

import { Suspense, useState } from 'react'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Alert, AlertDescription } from '@/components/ui/alert'

const loginSchema = z.object({
  email: z.string().email({ message: 'Enter a valid email' }),
  password: z.string().min(1, { message: 'Password is required' }),
})

type LoginValues = z.infer<typeof loginSchema>

export default function LoginPage() {
  // useSearchParams() forces a CSR bailout at build time; without a
  // Suspense boundary Next 14's static prerender of the page shell
  // errors out with "should be wrapped in a suspense boundary".
  return (
    <Suspense fallback={<SplitLayout><FormFallback /></SplitLayout>}>
      <LoginPageInner />
    </Suspense>
  )
}

// Shared split-layout shell so the Suspense fallback and the real form
// render in the same visual frame.
function SplitLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background lg:grid lg:grid-cols-[1.1fr_1fr]">
      <BrandPanel />
      <section className="flex min-h-[60vh] items-center justify-center px-4 py-10 sm:px-6 lg:min-h-screen lg:px-12">
        <div className="w-full max-w-md">{children}</div>
      </section>
    </main>
  )
}

function BrandPanel() {
  return (
    <aside className="relative flex items-center justify-center overflow-hidden bg-primary px-6 py-12 text-primary-foreground lg:py-16">
      {/* Soft decorative shapes — picked up from the V mark's accent colours
          but kept low-opacity so they read as ambient gradient, not content. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 -left-20 h-72 w-72 rounded-full"
        style={{
          background:
            'radial-gradient(closest-side, hsl(41 92% 55% / 0.18), transparent)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -right-24 h-96 w-96 rounded-full"
        style={{
          background:
            'radial-gradient(closest-side, hsl(358 73% 47% / 0.22), transparent)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(135deg, transparent 0%, hsl(0 0% 0% / 0.12) 100%)',
        }}
      />

      <div className="relative z-10 flex w-full max-w-md flex-col items-start gap-10">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-white p-1.5 shadow-sm">
            <Image
              src="/brand/varenyam-logo-mark.png"
              alt=""
              width={48}
              height={44}
              priority
              className="h-full w-auto object-contain"
            />
          </span>
          <div className="leading-tight">
            <p className="text-2xl font-bold tracking-tight">Varenyam</p>
            <p className="text-xs uppercase tracking-[0.18em] text-primary-foreground/75">
              Leading the way
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">
            Welcome back.
            <br />
            <span className="text-primary-foreground/80">
              Your classroom, organised.
            </span>
          </h1>
          <p className="max-w-sm text-sm leading-relaxed text-primary-foreground/85">
            Build question banks, generate test papers, and ship them to your
            students in a few clicks.
          </p>
        </div>

        <ul className="space-y-3 text-sm text-primary-foreground/90">
          {[
            'AI-assisted question import from PDF, Word, and image',
            'Smart blueprint test generation with live inventory',
            'Branded PDF & DOCX export, ready to print',
          ].map((line) => (
            <li key={line} className="flex items-start gap-2.5">
              <span
                aria-hidden
                className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary-foreground/70"
              />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}

function FormFallback() {
  return (
    <div className="space-y-2 text-center">
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  )
}

function FormHeader() {
  return (
    <div className="space-y-4">
      {/* Mark sits above the headline on the form side too — reinforces the
          brand without depending on the left panel being visible on mobile. */}
      <div className="flex items-center justify-center lg:justify-start">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-muted/40 p-1.5">
          <Image
            src="/brand/varenyam-logo-mark.png"
            alt="Varenyam"
            width={48}
            height={44}
            priority
            className="h-full w-auto object-contain"
          />
        </span>
      </div>
      <div className="space-y-1.5 text-center lg:text-left">
        <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
        <p className="text-sm text-muted-foreground">
          Enter your administrator-issued credentials to continue.
        </p>
      </div>
    </div>
  )
}

function LoginPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialError =
    searchParams.get('error') === 'inactive'
      ? 'Your account has been deactivated. Please contact an administrator.'
      : null

  const [serverError, setServerError] = useState<string | null>(initialError)
  const [submitting, setSubmitting] = useState(false)

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  async function onSubmit(values: LoginValues) {
    setServerError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) {
        setServerError(json?.error?.message ?? 'Login failed')
        return
      }
      // Dashboard home lives at `/` (route group app/(dashboard)/page.tsx).
      router.push('/')
      router.refresh()
    } catch {
      setServerError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <SplitLayout>
      <div className="space-y-6">
        <FormHeader />

        {serverError ? (
          <Alert variant="destructive">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        ) : null}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      className="h-11"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="current-password"
                      placeholder="********"
                      className="h-11"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="h-11 w-full" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </Form>

        <div className="space-y-2 border-t pt-5 text-center lg:text-left">
          <p className="text-xs text-muted-foreground">
            Accounts are issued by your administrator. Contact them if you need
            access.
          </p>
        </div>
      </div>
    </SplitLayout>
  )
}
