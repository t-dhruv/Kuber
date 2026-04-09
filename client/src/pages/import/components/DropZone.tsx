/**
 * DropZone.tsx
 * Drag-and-drop or click-to-upload for CSV and PDF bank statements.
 * On file selection + account selection, calls POST /api/v1/import/parse
 * and returns the parsed result to the parent.
 */

import { useState, useRef, useCallback } from 'react';
import { Upload, FileText, AlertCircle, Loader2, Download } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui';
import type { ParseResult } from '../ImportPage';

const SAMPLE_CSV = `Date,Description,Amount,Reference
2024-03-01,Grocery Store,-52.40,TXN001
2024-03-02,Salary Deposit,3500.00,TXN002
2024-03-03,Netflix Subscription,-15.99,TXN003
2024-03-05,Electric Bill,-120.00,TXN004
2024-03-07,Coffee Shop,-4.75,TXN005
`;

function downloadSample() {
  const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'kuber-sample-transactions.csv';
  a.click();
  URL.revokeObjectURL(url);
}

interface Account {
  id: string;
  name: string;
  institution?: string;
  type: string;
}

interface Props {
  accounts: Account[];
  onParsed: (result: ParseResult, filename: string, accountId: string) => void;
  onSmartDetect?: (result: unknown, file: File, accountId: string) => void;
}


export default function DropZone({ accounts, onParsed, onSmartDetect }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [accountId, setAccountId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && isValidFile(dropped)) setFile(dropped);
    else setError('Only CSV and PDF files are accepted.');
  }, []);

  function isValidFile(f: File) {
    return (
      f.type === 'text/csv' ||
      f.type === 'application/pdf' ||
      f.name.endsWith('.csv') ||
      f.name.endsWith('.pdf')
    );
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    if (picked && isValidFile(picked)) { setFile(picked); setError(null); }
    else setError('Only CSV and PDF files are accepted.');
  }

  async function handleParse() {
    if (!file || !accountId) return;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('accountId', accountId);

      const isCsv = file.name.endsWith('.csv') || file.type === 'text/csv';
      if (isCsv && onSmartDetect) {
        // For CSVs with smart detect enabled: call /detect-mapping first
        const res = await api.post('/import/detect-mapping', formData);
        onSmartDetect(res.data, file, accountId);
      } else {
        const res = await api.post('/import/parse', formData);
        onParsed(res.data, file.name, accountId);
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Parse failed. Check your file and try again.');
    } finally {
      setLoading(false);
    }
  }

  const canParse = !!file && !!accountId && !loading;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Drop area */}
      <div
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
          isDragging
            ? 'border-[color:var(--color-primary)] bg-[color:var(--color-primary)]/5'
            : 'border-[color:var(--color-border)] hover:border-[color:var(--color-primary)]/50'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.pdf,text/csv,application/pdf"
          className="hidden"
          onChange={handleFileChange}
        />
        {file ? (
          <div className="flex flex-col items-center gap-2">
            <FileText size={40} className="text-[color:var(--color-primary)]" />
            <p className="font-medium">{file.name}</p>
            <p className="text-sm text-[color:var(--color-text-secondary)]">
              {(file.size / 1024).toFixed(1)} KB
            </p>
            <button
              className="text-xs text-[color:var(--color-text-secondary)] underline mt-1"
              onClick={(e) => { e.stopPropagation(); setFile(null); }}
            >
              Change file
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Upload size={40} className="text-[color:var(--color-text-secondary)]" />
            <div>
              <p className="font-medium">Drop your bank statement here</p>
              <p className="text-sm text-[color:var(--color-text-secondary)] mt-1">
                CSV or PDF · Max 20 MB · TD, RBC, CIBC, BMO, Scotiabank, Chase, BofA and more
              </p>
            </div>
            <p className="text-xs text-[color:var(--color-text-secondary)]">or click to browse</p>
          </div>
        )}
      </div>

      {/* Account selector */}
      <div>
        <label className="block text-sm font-medium mb-1.5">Import into account</label>
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--color-primary)]/40"
        >
          <option value="">Select account…</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.institution ? `${a.institution} — ` : ''}{a.name}
            </option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Tips */}
      <div className="bg-[color:var(--color-surface-hover)] rounded-lg p-4 text-sm space-y-2">
        <div className="flex items-center justify-between">
          <p className="font-medium">Tips</p>
          <button
            type="button"
            onClick={downloadSample}
            className="flex items-center gap-1 text-xs text-[color:var(--color-primary)] hover:underline"
          >
            <Download size={12} />
            Download sample CSV
          </button>
        </div>
        <ul className="text-[color:var(--color-text-secondary)] space-y-0.5 list-disc list-inside">
          <li>Download CSV export from your bank's online portal</li>
          <li>Kuber auto-detects TD, RBC, CIBC, BMO, Scotiabank, Chase, BofA, Wells Fargo, Capital One & Amex</li>
          <li>Duplicate transactions are flagged automatically — you choose what to import</li>
          <li>PDF statements are supported for most digital (non-scanned) bank PDFs</li>
        </ul>
      </div>

      {/* Action */}
      <Button
        variant="primary"
        disabled={!canParse}
        onClick={handleParse}
        className="w-full"
      >
        {loading ? (
          <><Loader2 size={16} className="mr-2 animate-spin" />Analysing…</>
        ) : (
          <><Upload size={16} className="mr-2" />Analyse File</>
        )}
      </Button>
    </div>
  );
}
