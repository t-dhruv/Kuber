import axios from 'axios';

interface ApiErrorBody {
  error?: string;
}

export function getApiErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    return error.response?.data?.error ?? fallback;
  }

  return fallback;
}

export function getApiErrorStatus(error: unknown) {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    return error.response?.status;
  }

  return undefined;
}
