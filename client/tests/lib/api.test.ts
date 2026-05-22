import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  axiosCreate: vi.fn(),
  axiosPost: vi.fn(),
  requestUse: vi.fn(),
  responseUse: vi.fn(),
}));

vi.mock('axios', () => ({
  default: {
    create: mocks.axiosCreate,
    post: mocks.axiosPost,
  },
}));

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

describe('api session restoration', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    installLocalStorage();
    mocks.axiosCreate.mockReturnValue({
      interceptors: {
        request: { use: mocks.requestUse },
        response: { use: mocks.responseUse },
      },
      get: mocks.apiGet,
      post: mocks.apiPost,
    });
  });

  it('refreshes the access token and restores the user session metadata', async () => {
    const user = {
      id: 'user-1',
      email: 'ada@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      avatar: null,
      timezone: 'UTC',
      theme: 'system',
      householdId: 'household-1',
    };
    mocks.axiosPost.mockResolvedValueOnce({ data: { accessToken: 'new-access-token' } });
    mocks.apiGet.mockResolvedValueOnce({ data: user });

    const [{ restoreSession }, { useAuthStore }] = await Promise.all([
      import('../../src/lib/api'),
      import('../../src/stores/authStore'),
    ]);

    await expect(restoreSession()).resolves.toEqual(user);

    expect(mocks.axiosPost).toHaveBeenCalledWith('/api/v1/auth/refresh', {}, { withCredentials: true });
    expect(mocks.apiGet).toHaveBeenCalledWith('/users/me');
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: 'new-access-token',
      isAuthenticated: true,
      user,
    });
  });
});
