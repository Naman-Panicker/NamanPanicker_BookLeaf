'use client';

import { loginRequestSchema } from '@bookleaf/shared';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiRequestError, findCurrentUser, logIn } from '@/lib/api';
import { homePath } from '@/lib/home-path';

type FieldErrors = Record<string, string>;

export default function SignInPage() {
  const router = useRouter();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Someone who's already signed in has nothing to do here.
  useEffect(() => {
    findCurrentUser().then(
      (user) => {
        if (user) router.replace(homePath(user.role));
      },
      // The form still works if this check fails, and submitting it reports any real problem.
      () => {},
    );
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const form = new FormData(event.currentTarget);
    const parsed = loginRequestSchema.safeParse({ email: form.get('email'), password: form.get('password') });
    if (!parsed.success) {
      setFieldErrors(
        Object.fromEntries(parsed.error.issues.map(({ path, message }) => [path.join('.'), message])),
      );
      return;
    }

    setFieldErrors({});
    setSubmitting(true);
    try {
      const user = await logIn(parsed.data);
      router.replace(homePath(user.role));
    } catch (error) {
      setSubmitting(false);
      if (error instanceof ApiRequestError) {
        setFieldErrors(error.fieldErrors);
        if (error.code !== 'VALIDATION_FAILED') setFormError(error.message);
      } else {
        setFormError('Something went wrong. Please try again.');
      }
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in to BookLeaf</CardTitle>
          <CardDescription>Use the email and password for your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
            <Field label="Email" name="email" type="email" autoComplete="email" error={fieldErrors.email} />
            <Field
              label="Password"
              name="password"
              type="password"
              autoComplete="current-password"
              error={fieldErrors.password}
            />
            {formError && (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            )}
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

type FieldProps = {
  label: string;
  name: string;
  type: string;
  autoComplete: string;
  error: string | undefined;
};

function Field({ label, name, type, autoComplete, error }: FieldProps) {
  const errorId = `${name}-error`;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
