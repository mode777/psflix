import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AccountMenu } from './AccountMenu';

const authState = vi.hoisted(() => ({
  user: {
    id: 'u1',
    email: 'demo@example.com',
    name: 'Demo',
  } as { id: string; email: string; name?: string; avatar?: string } | null,
  signOut: vi.fn(),
}));

const pbMock = vi.hoisted(() => ({
  collection: vi.fn(),
  files: { getURL: vi.fn(() => 'https://cdn.example.com/avatar.png') },
  authStore: {
    record: null,
    isValid: false,
    clear: vi.fn(),
    onChange: vi.fn(),
  },
  autoCancellation: vi.fn(),
}));

vi.mock(import('@/lib/pb'), async () => ({ pb: pbMock as never }));
vi.mock(import('@/lib/pb-auth'), async () => ({
  auth: {
    signOut: authState.signOut,
  } as never,
}));

import { useAuthStore } from './store';
import { pb } from '@/lib/pb';
import { auth } from '@/lib/pb-auth';

void pb;
void auth;

function setUser(user: typeof authState.user) {
  useAuthStore.setState({ user, isAuthenticated: !!user });
}

beforeEach(() => {
  authState.user = { id: 'u1', email: 'demo@example.com', name: 'Demo' };
  authState.signOut.mockClear();
  setUser(authState.user);
});

describe('AccountMenu', () => {
  it('renders nothing when there is no user', () => {
    setUser(null);
    const { container } = render(<AccountMenu />);
    expect(container).toBeEmptyDOMElement();
  });

  it('toggles the menu on click', () => {
    render(<AccountMenu />);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /account menu/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /account menu/i }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('shows the display name and email in the menu', () => {
    render(<AccountMenu />);
    fireEvent.click(screen.getByRole('button', { name: /account menu/i }));
    expect(screen.getByText('Demo')).toBeInTheDocument();
    expect(screen.getByText('demo@example.com')).toBeInTheDocument();
  });

  it('falls back to the email when name is missing', () => {
    setUser({ id: 'u1', email: 'demo@example.com' });
    render(<AccountMenu />);
    fireEvent.click(screen.getByRole('button', { name: /account menu/i }));
    expect(screen.getByText('demo@example.com')).toBeInTheDocument();
  });

  it('closes the menu and signs out when the menu item is clicked', () => {
    render(<AccountMenu />);
    fireEvent.click(screen.getByRole('button', { name: /account menu/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /sign out/i }));
    expect(authState.signOut).toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('renders an Admin link that navigates to the separate admin bundle', () => {
    render(<AccountMenu />);
    fireEvent.click(screen.getByRole('button', { name: /account menu/i }));
    const adminLink = screen.getByRole('menuitem', { name: /admin/i }) as HTMLAnchorElement;
    expect(adminLink.tagName).toBe('A');
    expect(adminLink.getAttribute('href')).toBe('/admin.html');
  });

  it('closes the menu when Escape is pressed', () => {
    render(<AccountMenu />);
    fireEvent.click(screen.getByRole('button', { name: /account menu/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
