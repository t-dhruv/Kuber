import { beforeEach, describe, expect, it, vi } from 'vitest';

function installLocalStorage() {
  const values = new Map<string, string>();
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn((key: string) => { values.delete(key); }),
    clear: vi.fn(() => { values.clear(); }),
    key: vi.fn((index: number) => Array.from(values.keys())[index] ?? null),
    get length() { return values.size; },
  };

  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
  });

  return storage;
}

describe('useAuthStore persistence', () => {
  beforeEach(() => {
    vi.resetModules();
    installLocalStorage();
  });

  it('persists user session metadata without writing the bearer access token', async () => {
    const { useAuthStore } = await import('./authStore');

    useAuthStore.getState().setAuth({
      id: 'user-1',
      email: 'ada@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
    }, 'secret-access-token');

    const persisted = JSON.parse(localStorage.getItem('kuber-auth') ?? '{}');

    expect(persisted.state).toMatchObject({
      user: {
        id: 'user-1',
        email: 'ada@example.com',
      },
      isAuthenticated: true,
    });
    expect(persisted.state).not.toHaveProperty('accessToken');
  });

  it('drops access tokens from older persisted auth state during hydration', async () => {
    localStorage.setItem('kuber-auth', JSON.stringify({
      state: {
        user: { id: 'user-1', email: 'ada@example.com' },
        accessToken: 'old-token',
        isAuthenticated: true,
      },
      version: 0,
    }));

    const { useAuthStore } = await import('./authStore');

    expect(useAuthStore.getState().user?.email).toBe('ada@example.com');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('updates the in-memory access token without persisting it', async () => {
    const { useAuthStore } = await import('./authStore');

    useAuthStore.getState().setToken('rotated-access-token');

    expect(useAuthStore.getState().accessToken).toBe('rotated-access-token');
    expect(localStorage.getItem('kuber-auth')).not.toContain('rotated-access-token');
  });

  it('clears auth state and onboarding marker on logout', async () => {
    const storage = installLocalStorage();
    localStorage.setItem('kuber-onboarding-done', 'true');
    const { useAuthStore } = await import('./authStore');

    useAuthStore.getState().setAuth({
      id: 'user-1',
      email: 'ada@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
    }, 'secret-access-token');
    useAuthStore.getState().clearAuth();

    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      accessToken: null,
      isAuthenticated: false,
    });
    expect(storage.removeItem).toHaveBeenCalledWith('kuber-onboarding-done');
  });
});
