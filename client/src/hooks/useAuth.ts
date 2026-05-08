import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import type { UserDto } from '@kuber/shared';

type LoginResponse =
  | { user: UserDto; accessToken: string; requireTotp?: never }
  | { requireTotp: true; tempToken: string };

export function useLogin() {
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (data: { email: string; password: string; rememberMe?: boolean }) =>
      api.post<LoginResponse>('/auth/login', data).then(r => r.data),
    onSuccess: (data) => {
      if (data.requireTotp) return; // caller handles 2FA step
      setAuth(data.user, data.accessToken);
      navigate('/');
    },
  });
}

export function useSignup() {
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (data: { email: string; password: string; firstName: string; lastName: string; householdName?: string; inviteToken?: string }) =>
      api.post<{ user: UserDto; accessToken: string }>('/auth/signup', data).then(r => r.data),
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken);
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

export function useTotpValidate() {
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (data: { tempToken: string; code: string }) =>
      api.post<{ user: UserDto; accessToken: string }>('/auth/2fa/validate', data).then(r => r.data),
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken);
      navigate('/');
    },
  });
}

export function useTotpStatus() {
  return useQuery<{ totpEnabled: boolean; backupCodesRemaining: number }>({
    queryKey: ['auth', '2fa-status'],
    queryFn: () => api.get('/auth/2fa/status').then(r => r.data),
  });
}

export function useTotpSetup() {
  return useMutation({
    mutationFn: () =>
      api.post<{ secret: string; qrCodeDataUrl: string }>('/auth/2fa/setup').then(r => r.data),
  });
}

export function useTotpEnable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { code: string }) =>
      api.post<{ backupCodes: string[] }>('/auth/2fa/enable', data).then(r => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auth', '2fa-status'] }),
  });
}

export function useTotpDisable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { password: string }) =>
      api.post('/auth/2fa/disable', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auth', '2fa-status'] }),
  });
}

export function useTotpBackup() {
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (data: { tempToken: string; backupCode: string }) =>
      api.post<{ user: UserDto; accessToken: string }>('/auth/2fa/use-backup', data).then(r => r.data),
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken);
      navigate('/');
    },
  });
}
