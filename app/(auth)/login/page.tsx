'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
    <Suspense fallback={<LoginCardFallback />}>
      <LoginPageInner />
    </Suspense>
  )
}

function LoginCardFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <CardTitle>Sign in to Varenyam</CardTitle>
          <CardDescription>Access your question bank and tests</CardDescription>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">
          Loading…
        </CardContent>
      </Card>
    </main>
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
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <CardTitle>Sign in to Varenyam</CardTitle>
          <CardDescription>Access your question bank and tests</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Signing in...' : 'Sign in'}
              </Button>
            </form>
          </Form>

          <p className="text-center text-xs text-muted-foreground">
            Accounts are issued by your administrator. Contact them if you need access.
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
