import { toast } from 'sonner';
import { CheckCircle, XCircle, AlertTriangle, Info, Loader2 } from 'lucide-react';

// Re-export the sonner toast API with typed helpers
export { toast };

export const notify = {
  success: (message: string, description?: string) =>
    toast.success(message, {
      description,
      icon: <CheckCircle size={16} className="text-[var(--color-success)]" />,
    }),

  error: (message: string, description?: string) =>
    toast.error(message, {
      description,
      icon: <XCircle size={16} className="text-[var(--color-danger)]" />,
    }),

  warning: (message: string, description?: string) =>
    toast.warning(message, {
      description,
      icon: <AlertTriangle size={16} className="text-[var(--color-warning)]" />,
    }),

  info: (message: string, description?: string) =>
    toast.info(message, {
      description,
      icon: <Info size={16} className="text-[var(--color-info)]" />,
    }),

  loading: (message: string) =>
    toast.loading(message, {
      icon: <Loader2 size={16} className="animate-spin text-[var(--color-accent)]" />,
    }),

  promise: <T,>(
    promise: Promise<T>,
    messages: { loading: string; success: string; error: string }
  ) => toast.promise(promise, messages),
};
