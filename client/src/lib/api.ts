import axios from 'axios';
import { useAuthStore } from '@/stores/authStore';

export const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // Let the browser set Content-Type (with boundary) for multipart uploads
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  return config;
});

let isRefreshing = false;
let refreshQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

export async function refreshAccessToken(): Promise<string> {
  if (isRefreshing) {
    return new Promise((resolve, reject) => {
      refreshQueue.push({ resolve, reject });
    });
  }

  isRefreshing = true;
  try {
    const { data } = await axios.post('/api/v1/auth/refresh', {}, { withCredentials: true });
    const { accessToken } = data;
    useAuthStore.getState().setToken(accessToken);
    refreshQueue.forEach(({ resolve }) => resolve(accessToken));
    refreshQueue = [];
    return accessToken;
  } catch (err) {
    refreshQueue.forEach(({ reject }) => reject(err));
    refreshQueue = [];
    useAuthStore.getState().clearAuth();
    throw err;
  } finally {
    isRefreshing = false;
  }
}

export async function getAccessToken(): Promise<string> {
  return useAuthStore.getState().accessToken ?? refreshAccessToken();
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry && !original.url?.includes('/auth/')) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push({
            resolve: (token) => {
              original.headers.Authorization = `Bearer ${token}`;
              resolve(api(original));
            },
            reject,
          });
        });
      }
      original._retry = true;
      try {
        const accessToken = await refreshAccessToken();
        original.headers.Authorization = `Bearer ${accessToken}`;
        return api(original);
      } catch {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);
