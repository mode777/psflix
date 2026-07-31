import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const authState = vi.hoisted(() => ({
  signUp: vi.fn(),
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
    signUp: authState.signUp,
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
  } as never,
}));

import { SignUpDialog } from './SignUpDialog';
import { pb } from '@/lib/pb';

void pb;

beforeEach(() => {
  authState.signUp.mockReset();
});

function getDialog() {
  const dlg = document.querySelector('dialog');
  if (!dlg) throw new Error('dialog missing');
  return dlg as HTMLDialogElement;
}

describe('SignUpDialog', () => {
  it('opens and closes the dialog based on the open prop', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <SignUpDialog open={false} onClose={onClose} onSwitchToSignIn={() => {}} />,
    );
    expect(getDialog().open).toBe(false);
    rerender(<SignUpDialog open onClose={onClose} onSwitchToSignIn={() => {}} />);
    expect(getDialog().open).toBe(true);
  });

  it('shows a mismatch error when passwords differ', async () => {
    render(<SignUpDialog open onClose={() => {}} onSwitchToSignIn={() => {}} />);
    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Alex' } });
    fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'longenough1' } });
    fireEvent.input(screen.getByLabelText('Confirm password'), {
      target: { value: 'longenough2' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    await waitFor(() => expect(screen.getByText('Passwords do not match')).toBeInTheDocument());
  });

  it('validates name, email, and password minimums', async () => {
    render(<SignUpDialog open onClose={() => {}} onSwitchToSignIn={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeInTheDocument();
    });
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
  });

  it('calls auth.signUp on valid submit', async () => {
    authState.signUp.mockResolvedValue({ id: 'u1', email: 'a@b.com' });
    render(<SignUpDialog open onClose={() => {}} onSwitchToSignIn={() => {}} />);
    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Alex' } });
    fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'longenough1' } });
    fireEvent.input(screen.getByLabelText('Confirm password'), {
      target: { value: 'longenough1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    await waitFor(() =>
      expect(authState.signUp).toHaveBeenCalledWith('a@b.com', 'longenough1', 'Alex'),
    );
  });

  it('surfaces a root error when signUp throws', async () => {
    authState.signUp.mockRejectedValue({ message: 'Email taken' });
    render(<SignUpDialog open onClose={() => {}} onSwitchToSignIn={() => {}} />);
    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Alex' } });
    fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'longenough1' } });
    fireEvent.input(screen.getByLabelText('Confirm password'), {
      target: { value: 'longenough1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    await waitFor(() => expect(screen.getByText('Email taken')).toBeInTheDocument());
  });

  it('fires onSwitchToSignIn when the link is clicked', () => {
    const onSwitch = vi.fn();
    render(<SignUpDialog open onClose={() => {}} onSwitchToSignIn={onSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: /already have an account/i }));
    expect(onSwitch).toHaveBeenCalled();
  });
});
