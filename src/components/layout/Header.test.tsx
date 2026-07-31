import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';

const pbMock = vi.hoisted(() => ({
  collection: vi.fn(),
  files: { getURL: vi.fn() },
  authStore: { record: null, isValid: false, clear: vi.fn(), onChange: vi.fn() },
  autoCancellation: vi.fn(),
}));

vi.mock(import('@/lib/pb'), async () => ({ pb: pbMock as never }));
vi.mock(import('@/lib/pb-auth'), async () => ({ auth: { signOut: vi.fn() } as never }));

import { useAuthStore } from '@/features/auth/store';
import { pb } from '@/lib/pb';

void pb;

function setAuth(authed: boolean) {
  useAuthStore.setState({
    user: authed ? { id: 'u1', email: 'a@b.com' } : null,
    isAuthenticated: authed,
  });
}

beforeEach(() => {
  setAuth(false);
});

function StartRouteStub() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate('/start')} data-testid="go-start">
      go
    </button>
  );
}

function renderHeader() {
  return render(
    <MemoryRouter initialEntries={['/initial']}>
      <Header />
      <StartRouteStub />
    </MemoryRouter>,
  );
}

import Header from './Header';

describe('Header', () => {
  it('renders the PSflix brand link to /', () => {
    renderHeader();
    const link = screen.getByRole('link', { name: /psflix home/i });
    expect(link).toHaveAttribute('href', '/');
    expect(screen.getByText('PSflix')).toBeInTheDocument();
  });

  it('shows the Account button when unauthenticated and opens SignInDialog', () => {
    renderHeader();
    const btn = screen.getByRole('button', { name: /^account$/i });
    fireEvent.click(btn);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows the AccountMenu when authenticated', () => {
    setAuth(true);
    renderHeader();
    expect(screen.getByRole('button', { name: /account menu/i })).toBeInTheDocument();
  });

  it('renders navigation buttons for back and forward', () => {
    renderHeader();
    expect(screen.getByRole('button', { name: /go back/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /go forward/i })).toBeInTheDocument();
  });

  it('navigates back and forward when the controls are clicked', () => {
    renderHeader();
    fireEvent.click(screen.getByTestId('go-start'));
    expect(window.location.hash).toBe(''); // MemoryRouter
    fireEvent.click(screen.getByRole('button', { name: /go back/i }));
    fireEvent.click(screen.getByRole('button', { name: /go forward/i }));
  });

  it('opens the sign-in dialog automatically when the user signs out', () => {
    setAuth(true);
    const { rerender } = renderHeader();
    setAuth(false);
    rerender(
      <MemoryRouter initialEntries={['/']}>
        <Header />
      </MemoryRouter>,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
