'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
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

const setupSchema = z
  .object({
    email: z.string().email({ message: 'Enter a valid email' }),
    password: z.string().min(8, { message: 'At least 8 characters' }),
    confirm: z.string().min(1, { message: 'Confirm your password' }),
  })
  .refine((v) => v.password === v.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  })

type SetupValues = z.infer<typeof setupSchema>

type Availability = 'loading' | 'available' | 'locked' | 'error'

export default function SetupPage() {
  const router = useRouter()
  const [availability, setAvailability] = useState<Availability>('loading')
  const [serverError, setServerError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  const form = useForm<SetupValues>({
    resolver: zodResolver(setupSchema),
    defaultValues: { email: '', password: '', confirm: '' },
  })

  useEffect(() => {
    let active = true
    fetch('/api/auth/setup-super-admin')
      .then((r) => r.json())
      .then((json) => {
        if (!active) return
        if (json?.success && json.data?.available) setAvailability('available')
        else setAvailability('locked')
      })
      .catch(() => active && setAvailability('error'))
    return () => {
      active = false
    }
  }, [])

  async function onSubmit(values: SetupValues) {
    setServerError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/setup-super-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: values.email, password: values.password }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) {
        setServerError(json?.error?.message ?? 'Setup failed')
        return
      }
      setSuccess(true)
      setTimeout(() => router.push('/login'), 1500)
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
          <CardTitle>One-time setup</CardTitle>
          <CardDescription>
            Create the first super admin account for this Varenyam install.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {availability === 'loading' ? (
            <p className="text-center text-sm text-muted-foreground">Checking…</p>
          ) : null}

          {availability === 'locked' ? (
            <Alert>
              <AlertDescription>
                This setup page has already been used. Sign in normally, or contact your existing
                super admin if you need access.
              </AlertDescription>
            </Alert>
          ) : null}

          {availability === 'error' ? (
            <Alert variant="destructive">
              <AlertDescription>Could not check setup status. Refresh and try again.</AlertDescription>
            </Alert>
          ) : null}

          {availability === 'available' && success ? (
            <Alert>
              <AlertDescription>
                Super admin created. Redirecting to sign in…
              </AlertDescription>
            </Alert>
          ) : null}

          {availability === 'available' && !success ? (
            <>
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
                        <FormLabel>New password</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            autoComplete="new-password"
                            placeholder="At least 8 characters"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="confirm"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm password</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            autoComplete="new-password"
                            placeholder="Re-enter password"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting ? 'Setting up…' : 'Create super admin'}
                  </Button>
                </form>
              </Form>

              <p className="text-center text-xs text-muted-foreground">
                This page disables itself after the first successful setup.
              </p>
            </>
          ) : null}
        </CardContent>
      </Card>
    </main>
  )
}
