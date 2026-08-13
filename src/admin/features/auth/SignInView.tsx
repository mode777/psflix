import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { adminAuth } from '@/admin/lib/pb-auth';
import { cn } from '@/lib/cn';

const signInSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type SignInFormValues = z.infer<typeof signInSchema>;

/**
 * Superuser sign-in view. On invalid credentials the attempt is rejected, no
 * session is established, and an error is shown (see spec: "Invalid credentials
 * are rejected"). Styled with the shared Obsidian Console tokens.
 */
export function SignInView() {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInFormValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await adminAuth.signInWithPassword(values.email, values.password);
    } catch {
      // No session is established on failure; the auth store stays clear.
      setSubmitError('Invalid superuser credentials');
    }
  });

  return (
    <div className="min-h-screen flex items-center justify-center px-margin-mobile md:px-margin-desktop">
      <div
        className={cn(
          'glass-panel rounded-xl p-8 w-full max-w-md ambient-shadow',
          'border border-white/10 flex flex-col gap-6',
        )}
      >
        <header className="flex flex-col gap-1">
          <h1 className="text-headline-lg text-white">Admin sign in</h1>
          <p className="text-on-surface-variant text-body-md">Superuser access required.</p>
        </header>

        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <Field
            label="Email"
            id="admin-email"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            registration={register('email')}
          />
          <Field
            label="Password"
            id="admin-password"
            type="password"
            autoComplete="current-password"
            error={errors.password?.message}
            registration={register('password')}
          />

          {submitError && (
            <p
              role="alert"
              className="text-error text-body-md font-medium bg-error-container/10 border border-error/20 rounded-lg px-3 py-2"
            >
              {submitError}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className={cn(
              'bg-primary text-on-primary font-body-md font-semibold',
              'px-6 py-3 rounded-lg flex items-center justify-center gap-2',
              'hover:bg-primary/90 hover:scale-[1.02] transition-all duration-200',
              'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100',
            )}
          >
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

type FieldProps = {
  label: string;
  id: string;
  type: 'email' | 'password' | 'text';
  autoComplete?: string;
  error?: string;
  registration: ReturnType<ReturnType<typeof useForm<SignInFormValues>>['register']>;
};

function Field({ label, id, type, autoComplete, error, registration }: FieldProps) {
  const isPassword = type === 'password';
  const [revealed, setRevealed] = useState(false);
  const inputType = isPassword && revealed ? 'text' : type;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-on-surface font-label-caps text-label-caps">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={inputType}
          autoComplete={autoComplete}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cn(
            'bg-surface-container-high/40 border rounded-lg w-full',
            'px-3 py-2.5 text-on-surface placeholder:text-outline',
            'focus:outline-none focus:ring-1 transition-all font-body-md text-body-md',
            isPassword ? 'pr-11' : '',
            error
              ? 'border-error focus:border-error focus:ring-error'
              : 'border-white/10 focus:border-primary focus:ring-primary',
          )}
          {...registration}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? 'Hide password' : 'Show password'}
            aria-pressed={revealed}
            tabIndex={-1}
            className={cn(
              'absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full',
              'text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-colors',
            )}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              {revealed ? 'visibility_off' : 'visibility'}
            </span>
          </button>
        )}
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-error text-body-md">
          {error}
        </p>
      )}
    </div>
  );
}
