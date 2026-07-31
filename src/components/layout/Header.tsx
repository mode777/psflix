import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/features/auth/store';
import { SignInDialog } from '@/features/auth/SignInDialog';
import { SignUpDialog } from '@/features/auth/SignUpDialog';
import { AccountMenu } from '@/features/auth/AccountMenu';

type DialogMode = 'signin' | 'signup';

export default function Header() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const wasAuthenticatedRef = useRef(isAuthenticated);
  const [signInOpen, setSignInOpen] = useState(false);
  const [signUpOpen, setSignUpOpen] = useState(false);

  useEffect(() => {
    const wasAuthed = wasAuthenticatedRef.current;
    wasAuthenticatedRef.current = isAuthenticated;
    if (wasAuthed && !isAuthenticated) {
      setSignInOpen(true);
    }
  }, [isAuthenticated]);

  return (
    <>
      <header
        className={cn(
          'fixed top-0 w-full z-50 bg-background/80 backdrop-blur-xl',
          'border-b border-white/10 shadow-2xl shadow-primary/5',
          'h-20 transition-all duration-300',
        )}
      >
        <div className="max-w-container-max mx-auto flex justify-between items-center px-margin-mobile md:px-margin-desktop h-full">
          <div className="flex items-center">
            <Link to="/" aria-label="PSflix home" className="block">
              <h1
                className={cn(
                  'font-bold text-2xl md:text-3xl tracking-tighter select-none',
                  'hover:scale-105 transition-all duration-300',
                )}
                style={{
                  color: '#E50914',
                  fontFamily: 'Inter, sans-serif',
                  fontStretch: 'condensed',
                  textTransform: 'uppercase',
                }}
              >
                PSflix
              </h1>
            </Link>
            <div className="flex items-center gap-4 ml-4">
              <button
                type="button"
                aria-label="Go Back"
                onClick={() => navigate(-1)}
                className="p-2 rounded-full hover:bg-surface-variant/50 active:scale-95 transition-transform group"
              >
                <span className="material-symbols-outlined text-on-surface-variant opacity-60 group-hover:text-primary group-hover:opacity-100 group-hover:scale-105 transition-all duration-300">
                  arrow_back
                </span>
              </button>
              <button
                type="button"
                aria-label="Go Forward"
                onClick={() => navigate(1)}
                className="p-2 rounded-full hover:bg-surface-variant/50 active:scale-95 transition-transform group hidden md:block"
              >
                <span className="material-symbols-outlined text-on-surface-variant opacity-60 group-hover:text-primary group-hover:opacity-100 group-hover:scale-105 transition-all duration-300">
                  arrow_forward
                </span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            <button
              type="button"
              aria-label="Settings"
              className="p-2 rounded-full hover:bg-surface-variant/50 active:scale-95 transition-transform group"
            >
              <span className="material-symbols-outlined text-on-surface-variant opacity-60 group-hover:text-primary group-hover:opacity-100 group-hover:scale-105 transition-all duration-300">
                settings
              </span>
            </button>
            {isAuthenticated ? (
              <AccountMenu />
            ) : (
              <button
                type="button"
                aria-label="Account"
                onClick={() => setSignInOpen(true)}
                className="p-2 rounded-full hover:bg-surface-variant/50 active:scale-95 transition-transform group"
              >
                <span className="material-symbols-outlined text-on-surface-variant opacity-60 group-hover:text-primary group-hover:opacity-100 group-hover:scale-105 transition-all duration-300">
                  account_circle
                </span>
              </button>
            )}
          </div>
        </div>
      </header>

      <SignInDialog
        open={signInOpen}
        onClose={() => setSignInOpen(false)}
        onSwitchToSignUp={() => {
          setSignInOpen(false);
          setSignUpOpen(true);
        }}
      />
      <SignUpDialog
        open={signUpOpen}
        onClose={() => setSignUpOpen(false)}
        onSwitchToSignIn={() => {
          setSignUpOpen(false);
          setSignInOpen(true);
        }}
      />
    </>
  );
}

// `DialogMode` is reserved for future expansion (e.g. a single dialog with mode switch).
export type { DialogMode };
