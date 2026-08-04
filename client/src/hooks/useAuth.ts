import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import type { UserDto } from '@kuber/shared';

export type MfaMethod = 'totp' | 'email' | 'backup';

export type LoginResponse =
  | { user: UserDto; accessToken: string; requireMfa?: never }
  | { requireMfa: true; tempToken: string; methods: MfaMethod[] };

export function isMfaLoginResponse(data: LoginResponse): data is Extract<LoginResponse, { requireMfa: true }> {
  return 'requireMfa' in data && data.requireMfa === true;
}

export function mfaMethodLabel(method: MfaMethod): string {
  if (method === 'totp') return 'Authenticator';
  if (method === 'email') return 'Email';
  return 'Backup';
}

// ADR-0003. On an Instance with no email provider, signup verifies the address
// immediately and signs the new Owner in — there is no inbox to send them to.
// With a provider configured, verification is still required first.
export type SignupResponse =
  | { requireEmailVerification: true; email: string; message: string }
  | { requireEmailVerification: false; user: UserDto; accessToken: string };

export function isPendingVerificationSignup(
  data: SignupResponse,
): data is Extract<SignupResponse, { requireEmailVerification: true }> {
  return data.requireEmailVerification;
}

type EmailVerificationResponse = {
  message: string;
};

export function useLogin() {
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (data: { email: string; password: string; rememberMe?: boolean }) =>
      api.post<LoginResponse>('/auth/login', data).then(r => r.data),
    onSuccess: (data) => {
      if (isMfaLoginResponse(data)) return; // caller handles MFA step
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
      api.post<SignupResponse>('/auth/signup', data).then(r => r.data),
    onSuccess: (data) => {
      if (isPendingVerificationSignup(data)) return; // caller shows the check-your-email step
      setAuth(data.user, data.accessToken);
      navigate('/');
    },
  });
}

export function useVerifyEmail() {
  return useMutation({
    mutationFn: (token: string) =>
      api.post<EmailVerificationResponse>('/auth/verify-email', { token }).then(r => r.data),
  });
}

export function useResendVerification() {
  return useMutation({
    mutationFn: (email: string) =>
      api.post<EmailVerificationResponse>('/auth/resend-verification', { email }).then(r => r.data),
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

export function useSendEmailMfaCode() {
  return useMutation({
    mutationFn: (tempToken: string) =>
      api.post<{ message: string }>('/auth/mfa/email/send', { tempToken }).then(r => r.data),
  });
}

export function useMfaVerify() {
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (data: { tempToken: string; method: MfaMethod; code: string }) =>
      api.post<{ user: UserDto; accessToken: string }>('/auth/mfa/verify', data).then(r => r.data),
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken);
      navigate('/');
    },
  });
}

export type MfaStatus = {
  emailVerified: boolean;
  totpEnabled: boolean;
  emailMfaEnabled: boolean;
  backupCodesRemaining: number;
};

export function useTotpStatus() {
  return useQuery<MfaStatus>({
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

export function useEmailMfaEnable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { password: string }) =>
      api.post('/auth/mfa/email/enable', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auth', '2fa-status'] }),
  });
}

export function useEmailMfaDisable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { password: string }) =>
      api.post('/auth/mfa/email/disable', data),
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
