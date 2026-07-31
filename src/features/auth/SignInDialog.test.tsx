import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const authState = vi.hoisted(() => ({
  signIn: vi.fn(),
}));

const pbMock = vi.hoisted(() => ({
  collection: vi.fn(),
  files: { getURL: vi.fn() },
  authStore: { record: null, isValid: false, clear: vi.fn(), onChange: vi.fn() },
  autoCancellation: vi.fn(),
}));

vi.mock(import('@/lib/pb'), async () => ({ pb: pbMock as never }));
vi.mock(import('@/lib/pb-auth'), async () => ({
  auth: {
    signInWithPassword: authState.signIn,
    signUp: vi.fn(),
    signOut: vi.fn(),
  } as never,
}));

import { SignInDialog } from './SignInDialog';
import { pb } from '@/lib/pb';

void pb;

beforeEach(() => {
  authState.signIn.mockReset();
});

function getDialog() {
  const dlg = document.querySelector('dialog');
  if (!dlg) throw new Error('dialog missing');
  return dlg as HTMLDialogElement;
}

describe('SignInDialog', () => {
  it('opens the underlying <dialog> when open=true and calls onClose on backdrop click', () => {
    const onClose = vi.fn();
    render(<SignInDialog open onClose={onClose} onSwitchToSignUp={() => {}} />);
    const dlg = getDialog();
    expect(dlg.open).toBe(true);
    dlg.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClose).toHaveBeenCalled();
  });

  it('does not open when open=false', () => {
    render(<SignInDialog open={false} onClose={() => {}} onSwitchToSignUp={() => {}} />);
    const dlg = getDialog();
    expect(dlg.open).toBe(false);
  });

  it('shows validation errors for invalid email and short password', async () => {
    render(<SignInDialog open onClose={() => {}} onSwitchToSignUp={() => {}} />);
    fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } });
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
    });
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
  });

  it('calls auth.signInWithPassword on valid submit', async () => {
    authState.signIn.mockResolvedValue({ id: 'u1', email: 'a@b.com' });
    const onClose = vi.fn();
    render(<SignInDialog open onClose={onClose} onSwitchToSignUp={() => {}} />);
    fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'longenoughpw' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(authState.signIn).toHaveBeenCalledWith('a@b.com', 'longenoughpw'));
  });

  it('surfaces a root error when signIn throws', async () => {
    authState.signIn.mockRejectedValue({ data: { message: 'Invalid credentials' } });
    render(<SignInDialog open onClose={() => {}} onSwitchToSignUp={() => {}} />);
    fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'longenoughpw' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(screen.getByText('Invalid credentials')).toBeInTheDocument());
  });

  it('fires onSwitchToSignUp when the link is clicked', () => {
    const onSwitch = vi.fn();
    render(<SignInDialog open onClose={() => {}} onSwitchToSignUp={onSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: /create an account/i }));
    expect(onSwitch).toHaveBeenCalled();
  });
});
