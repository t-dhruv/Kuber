import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserDto } from '@kuber/shared';

interface AuthState {
  user: UserDto | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  setAuth: (user: UserDto, token: string) => void;
  clearAuth: () => void;
  setToken: (token: string) => void;
}

type PersistedAuthState = Pick<AuthState, 'user' | 'isAuthenticated'> & {
  accessToken?: unknown;
};

function sanitizePersistedAuthState(state: unknown): Pick<AuthState, 'user' | 'isAuthenticated'> {
  const persisted = (state ?? {}) as Partial<PersistedAuthState>;
  return {
    user: persisted.user ?? null,
    isAuthenticated: persisted.isAuthenticated ?? false,
  };
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      setAuth: (user, accessToken) => set({ user, accessToken, isAuthenticated: true }),
      clearAuth: () => {
        localStorage.removeItem('kuber-onboarding-done');
        set({ user: null, accessToken: null, isAuthenticated: false });
      },
      setToken: (accessToken) => set({ accessToken }),
    }),
    {
      name: 'kuber-auth',
      partialize: (s) => ({ user: s.user, isAuthenticated: s.isAuthenticated }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...sanitizePersistedAuthState(persistedState),
        accessToken: null,
      }),
    }
  )
);
