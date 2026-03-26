/**
 * ReceiptOcrModal.tsx
 * Upload a receipt photo/image → AI extracts merchant, amount, date → create transaction.
 * Shows AiSetupNudge if no provider configured.
 */
import { useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Upload, Loader2, CheckCircle2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, notify } from '@/components/ui';
import { AiSetupNudge } from '@/components/ui/AiSetupNudge';

interface Props {
  onClose: () => void;
  accountId?: string;
}

interface OcrResult {
  merchant?: string;
  amount?: number;
  date?: string;
  description?: string;
  notConfigured?: boolean;
  setupMessage?: string;
}

export function ReceiptOcrModal({ onClose, accountId }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [form, setForm] = useState({ description: '', amount: '', date: new Date().toISOString().slice(0, 10) });
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Check AI status
  const { data: status } = useQuery({
    queryKey: ['auto-categorize-status'],
    queryFn: () => api.get('/auto-categorize/status').then(r => r.data),
  });

  const ocrMutation = useMutation({
    mutationFn: async (f: File) => {
      const fd = new FormData();
      fd.append('receipt', f);
      const res = await api.post('/receipts/ocr', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data as OcrResult;
    },
    onSuccess: (data) => {
      setOcrResult(data);
      if (!data.notConfigured) {
        setForm({
          description: data.merchant ?? data.description ?? '',
          amount: data.amount != null ? Math.abs(data.amount).toFixed(2) : '',
          date: data.date ?? new Date().toISOString().slice(0, 10),
        });
      }
    },
    onError: () => notify.error('OCR failed. Please try again.'),
  });

  const createMutation = useMutation({
    mutationFn: () => api.post('/transactions', {
      description: form.description,
      amount: -Math.abs(parseFloat(form.amount)),
      date: form.date,
      accountId,
    }),
    onSuccess: () => {
      notify.success('Transaction created from receipt');
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      onClose();
    },
    onError: () => notify.error('Could not create transaction'),
  });

  function handleFile(f: File) {
    setFile(f);
    setOcrResult(null);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(f);
    ocrMutation.mutate(f);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-[color:var(--surface)] rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[color:var(--border)]">
          <div className="flex items-center gap-2">
            <Camera size={18} />
            <h2 className="font-semibold">Scan Receipt</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-[color:var(--surface-hover)]">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* AI not configured nudge */}
          {status?.configured === false && (
            <AiSetupNudge message="Receipt scanning requires an AI provider. Set one up to extract merchant, amount, and date automatically." />
          )}

          {/* Upload area */}
          {!file && (
            <div
              className="border-2 border-dashed border-[color:var(--border)] rounded-xl p-8 text-center cursor-pointer hover:border-indigo-400 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={28} className="mx-auto text-[color:var(--text-secondary)] mb-2" />
              <p className="text-sm font-medium">Drop receipt photo or click to upload</p>
              <p className="text-xs text-[color:var(--text-secondary)] mt-1">JPG, PNG, HEIC, WebP</p>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>
          )}

          {/* Preview + OCR result */}
          {file && (
            <div className="space-y-3">
              {preview && (
                <img src={preview} alt="Receipt" className="w-full max-h-48 object-contain rounded-lg border border-[color:var(--border)]" />
              )}

              {ocrMutation.isPending && (
                <div className="flex items-center gap-2 text-sm text-[color:var(--text-secondary)]">
                  <Loader2 size={15} className="animate-spin" /> Extracting details…
                </div>
              )}

              {ocrResult && !ocrResult.notConfigured && (
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                  <CheckCircle2 size={15} /> Details extracted — review below
                </div>
              )}

              {ocrResult?.notConfigured && (
                <AiSetupNudge compact message={ocrResult.setupMessage} />
              )}

              {/* Editable form */}
              <div className="space-y-2">
                <input
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-hover)]"
                  placeholder="Description / Merchant"
                  value={form.description}
                  onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                />
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[color:var(--text-secondary)]">$</span>
                    <input
                      className="w-full pl-6 pr-3 py-2 text-sm rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-hover)]"
                      placeholder="Amount"
                      type="number"
                      value={form.amount}
                      onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))}
                    />
                  </div>
                  <input
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-hover)]"
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-between items-center px-5 pb-5">
          <button onClick={() => { setFile(null); setPreview(null); setOcrResult(null); }} className="text-sm text-[color:var(--text-secondary)] hover:underline">
            {file ? 'Change photo' : 'Cancel'}
          </button>
          <Button
            variant="primary"
            disabled={!file || !form.description || !form.amount || createMutation.isPending || ocrMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? <Loader2 size={15} className="animate-spin mr-1" /> : null}
            Create transaction
          </Button>
        </div>
      </div>
    </div>
  );
}
