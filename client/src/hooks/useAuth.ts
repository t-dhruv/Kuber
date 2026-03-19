import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import type { UserDto } from '@kuber/shared';

export function useLogin() {
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (data: { email: string; password: string }) =>
      api.post<{ data: { user: UserDto; accessToken: string } }>('/auth/login', data),
    onSuccess: ({ data }) => {
      setAuth(data.data.user, data.data.accessToken);
      navigate('/');
    },
  });
}

export function useSignup() {
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (data: { email: string; password: string; firstName: string; lastName: string; householdName: string }) =>
      api.post<{ data: { user: UserDto; accessToken: string } }>('/auth/signup', data),
    onSuccess: ({ data }) => {
      setAuth(data.data.user, data.data.accessToken);
      navigate('/');
    },
  });
}

export function useLogout() {
  const { clearAuth } = useAuthStore();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSettled: () => { clearAuth(); navigate('/login'); },
  });
}
