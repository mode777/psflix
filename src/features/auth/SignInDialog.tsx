import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { auth } from '@/lib/pb-auth';
import { cn } from '@/lib/cn';
import { useFocusOnDialog } from '@/hooks/useFocusOnDialog';
import { extractErrorMessage } from './extractErrorMessage';

const signInSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export type SignInFormValues = z.infer<typeof signInSchema>;

export type SignInDialogProps = {
  open: boolean;
  onClose: () => void;
  onSwitchToSignUp: () => void;
};

export function SignInDialog({ open, onClose, onSwitchToSignUp }: SignInDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const isOpenRef = useRef(false);

  useFocusOnDialog(open, dialogRef);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignInFormValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !isOpenRef.current) {
      dlg.showModal();
      isOpenRef.current = true;
      reset();
    } else if (!open && isOpenRef.current) {
      dlg.close();
      isOpenRef.current = false;
    }
  }, [open, reset]);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    const handleClose = () => {
      isOpenRef.current = false;
      onClose();
    };
    const handleClick = (e: MouseEvent) => {
      if (e.target === dlg) dlg.close();
    };
    dlg.addEventListener('close', handleClose);
    dlg.addEventListener('click', handleClick);
    return () => {
      dlg.removeEventListener('close', handleClose);
      dlg.removeEventListener('click', handleClick);
    };
  }, [onClose]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await auth.signInWithPassword(values.email, values.password);
      dialogRef.current?.close();
    } catch (err) {
      const message = extractErrorMessage(err, 'Invalid email or password');
      setError('root', { message });
    }
  });

  return (
    <dialog
      ref={dialogRef}
      className="bg-transparent backdrop:bg-black/70 backdrop:backdrop-blur-sm p-0 m-0 max-w-none max-h-none w-screen h-screen"
    >
      <div className="w-screen h-screen flex items-center justify-center p-4">
        <div
          className={cn(
            'glass-panel rounded-xl p-8 w-full max-w-md ambient-shadow',
            'border border-white/10 flex flex-col gap-6',
          )}
        >
          <header className="flex flex-col gap-1">
            <h2 className="text-headline-lg text-white">Sign in</h2>
            <p className="text-on-surface-variant text-body-md">
              Welcome back. Sign in to continue.
            </p>
          </header>

          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <Field
              label="Email"
              id="signin-email"
              type="email"
              autoComplete="email"
              error={errors.email?.message}
              registration={register('email')}
            />
            <Field
              label="Password"
              id="signin-password"
              type="password"
              autoComplete="current-password"
              error={errors.password?.message}
              registration={register('password')}
            />

            {errors.root?.message && (
              <p
                role="alert"
                className="text-error text-body-md font-medium bg-error-container/10 border border-error/20 rounded-lg px-3 py-2"
              >
                {errors.root.message}
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

          <div className="flex items-center justify-between text-body-md">
            <button
              type="button"
              onClick={onSwitchToSignUp}
              className="text-primary hover:text-primary/80 transition-colors"
            >
              Create an account
            </button>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="text-on-surface-variant hover:text-on-surface transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </dialog>
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
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-on-surface font-label-caps text-label-caps">
        {label}
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(
          'bg-surface-container-high/40 border rounded-lg',
          'px-3 py-2.5 text-on-surface placeholder:text-outline',
          'focus:outline-none focus:ring-1 transition-all font-body-md text-body-md',
          error
            ? 'border-error focus:border-error focus:ring-error'
            : 'border-white/10 focus:border-primary focus:ring-primary',
        )}
        {...registration}
      />
      {error && (
        <p id={`${id}-error`} role="alert" className="text-error text-body-md">
          {error}
        </p>
      )}
    </div>
  );
}
