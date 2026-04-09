/**
 * AccountBulkImportPage
 * Upload a CSV to create or update multiple accounts at once.
 *
 * Flow: Download template → fill in → upload → preview with per-row
 * validation → confirm → done.
 */

import { useState, useRef, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Upload, Download, FileText, AlertCircle, CheckCircle2,
  RefreshCw, ChevronDown, ChevronUp, X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button, notify } from '@/components/ui';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PreviewRow {
  rowIndex: number;
  action:   'create' | 'update' | 'skip';
  data:     Record<string, unknown>;
  errors:   string[];
  warnings: string[];
}

interface PreviewResult {
  summary: { total: number; creates: number; updates: number; errors: number };
  rows:    PreviewRow[];
}

interface ConfirmResult {
  created:  number;
  updated:  number;
  failed:   number;
  errors:   Array<{ error: string }>;
}

// ── Constants ────────────────────────────────────────────────────────────────

const COLUMN_DESCRIPTIONS = [
  { col: 'name',                  req: true,  desc: 'Account display name' },
  { col: 'type',                  req: true,  desc: 'CHECKING | SAVINGS | CREDIT_CARD | INVESTMENT | LOAN | OTHER | TFSA | RRSP' },
  { col: 'balance',               req: true,  desc: 'Current balance (negative for credit/loan)' },
  { col: 'institution',           req: false, desc: 'Bank/institution name' },
  { col: 'last_four',             req: false, desc: 'Last 4 digits of card/account number' },
  { col: 'currency',              req: false, desc: '3-letter ISO currency code (default USD)' },
  { col: 'credit_limit',          req: false, desc: 'Credit limit (CREDIT_CARD only)' },
  { col: 'exclude_from_net_worth',req: false, desc: 'true/false — omit from net worth calculation' },
  { col: 'id',                    req: false, desc: 'Leave blank to CREATE; paste existing account ID to UPDATE' },
];

const ACTION_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  create: { bg: 'rgba(16,185,129,0.08)', color: 'var(--color-success)', label: 'Create' },
  update: { bg: 'rgba(99,102,241,0.08)', color: '#6366f1',              label: 'Update' },
  skip:   { bg: 'rgba(239,68,68,0.08)',  color: 'var(--color-danger)',   label: 'Skip'   },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function downloadTemplate() {
  api.get('/accounts/bulk-import/template', { responseType: 'blob' }).then((res) => {
    const url  = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'accounts-import-template.csv'; link.click();
    URL.revokeObjectURL(url);
  });
}

// ── Upload zone ───────────────────────────────────────────────────────────────

function UploadZone({ onFile }: { onFile: (f: File) => void }) {
  const [dragging, setDragging] = useState(false);
  const [file, setFile]         = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f?.name.endsWith('.csv')) { setFile(f); onFile(f); }
  }, [onFile]);

  function pick(f: File) { setFile(f); onFile(f); }

  return (
    <div
      className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors"
      style={{ borderColor: dragging ? 'var(--color-accent)' : 'var(--color-border)', backgroundColor: dragging ? 'rgba(99,102,241,0.04)' : undefined }}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); }} />
      {file ? (
        <div className="flex flex-col items-center gap-2">
          <FileText size={36} style={{ color: 'var(--color-accent)' }} />
          <p className="font-medium text-sm">{file.name}</p>
          <p className="text-xs text-[var(--color-text-muted)]">{(file.size / 1024).toFixed(1)} KB</p>
          <button className="text-xs underline text-[var(--color-text-muted)]"
            onClick={(e) => { e.stopPropagation(); setFile(null); }}>
            Change file
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <Upload size={36} style={{ color: 'var(--color-text-muted)' }} />
          <div>
            <p className="font-medium text-sm">Drop your accounts CSV here</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">CSV only · Max 5 MB</p>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">or click to browse</p>
        </div>
      )}
    </div>
  );
}

// ── Preview table ─────────────────────────────────────────────────────────────

function PreviewTable({
  rows,
  onToggleSkip,
}: {
  rows: PreviewRow[];
  onToggleSkip: (idx: number) => void;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  function toggle(i: number) {
    setExpanded((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[0.8125rem] border-collapse">
        <thead>
          <tr className="border-b border-[var(--color-border)]">
            {['Row', 'Action', 'Name', 'Type', 'Balance', 'Institution', 'Currency', ''].map((h) => (
              <th key={h} className="text-left py-2 px-2 font-semibold text-[var(--color-text-secondary)] whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const style = ACTION_STYLES[row.action];
            const hasIssues = row.errors.length > 0 || row.warnings.length > 0;
            const exp = expanded.has(i);
            return (
              <>
                <tr
                  key={`r-${i}`}
                  className="border-b border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]"
                  style={{ opacity: row.action === 'skip' ? 0.5 : 1 }}
                >
                  <td className="py-2 px-2 text-[var(--color-text-muted)]">{row.rowIndex}</td>
                  <td className="py-2 px-2">
                    <span className="text-[0.6875rem] font-semibold px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: style.bg, color: style.color }}>
                      {style.label}
                    </span>
                  </td>
                  <td className="py-2 px-2 font-medium">{String(row.data.name ?? '—')}</td>
                  <td className="py-2 px-2 text-[var(--color-text-muted)]">{String(row.data.type ?? '—')}</td>
                  <td className="py-2 px-2 font-mono">
                    {row.data.balance != null
                      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: String(row.data.currency || 'USD') }).format(Number(row.data.balance))
                      : '—'}
                  </td>
                  <td className="py-2 px-2 text-[var(--color-text-muted)]">{String(row.data.institution ?? '—')}</td>
                  <td className="py-2 px-2 text-[var(--color-text-muted)]">{String(row.data.currency ?? 'USD')}</td>
                  <td className="py-2 px-2">
                    <div className="flex items-center gap-1">
                      {hasIssues && (
                        <button onClick={() => toggle(i)} className="bg-transparent border-0 cursor-pointer p-0.5 text-[var(--color-text-muted)]">
                          {exp ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      )}
                      {row.action !== 'skip' && row.errors.length === 0 && (
                        <button onClick={() => onToggleSkip(i)}
                          className="bg-transparent border-0 cursor-pointer p-0.5"
                          style={{ color: 'var(--color-text-muted)' }} title="Exclude this row">
                          <X size={13} />
                        </button>
                      )}
                      {row.action === 'skip' && row.errors.length === 0 && (
                        <button onClick={() => onToggleSkip(i)}
                          className="bg-transparent border-0 cursor-pointer p-0.5"
                          style={{ color: 'var(--color-success)' }} title="Re-include this row">
                          <RefreshCw size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {exp && hasIssues && (
                  <tr key={`e-${i}`} className="border-b border-[var(--color-border)]">
                    <td colSpan={8} className="px-4 pb-2 pt-1">
                      {row.errors.map((e, j) => (
                        <div key={j} className="flex items-start gap-1.5 text-[0.75rem] mb-1" style={{ color: 'var(--color-danger)' }}>
                          <AlertCircle size={12} className="mt-0.5 shrink-0" /> {e}
                        </div>
                      ))}
                      {row.warnings.map((w, j) => (
                        <div key={j} className="flex items-start gap-1.5 text-[0.75rem] mb-1 text-[#f59e0b]">
                          <AlertCircle size={12} className="mt-0.5 shrink-0" /> {w}
                        </div>
                      ))}
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Step = 'upload' | 'preview' | 'done';

export default function AccountBulkImportPage() {
  const qc = useQueryClient();

  const [step,    setStep]    = useState<Step>('upload');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [rows,    setRows]    = useState<PreviewRow[]>([]);
  const [result,  setResult]  = useState<ConfirmResult | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  // ── Mutations ────────────────────────────────────────────────────────────

  const parseMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.post<PreviewResult>('/accounts/bulk-import/preview', fd).then((r) => r.data);
    },
    onSuccess: (data) => {
      setPreview(data);
      setRows(data.rows);
      setStep('preview');
    },
    onError: (err: any) => notify.error(err?.response?.data?.error ?? 'Failed to parse CSV'),
  });

  const confirmMutation = useMutation({
    mutationFn: () => {
      const actionable = rows.filter((r) => r.action !== 'skip' && r.errors.length === 0);
      return api.post<ConfirmResult>('/accounts/bulk-import/confirm', { rows: actionable }).then((r) => r.data);
    },
    onSuccess: (data) => {
      setResult(data);
      setStep('done');
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['networth'] });
    },
    onError: (err: any) => notify.error(err?.response?.data?.error ?? 'Import failed'),
  });

  // ── Row toggle ────────────────────────────────────────────────────────────

  function toggleSkip(idx: number) {
    setRows((prev) => prev.map((r, i) => {
      if (i !== idx) return r;
      const wasSkipped = r.action === 'skip';
      // Restore to original action stored in preview, or default to create
      const original = preview?.rows[i].action ?? 'create';
      return { ...r, action: wasSkipped ? original : 'skip' };
    }));
  }

  // ── Derived summary ───────────────────────────────────────────────────────

  const actionable = rows.filter((r) => r.action !== 'skip' && r.errors.length === 0);
  const errorCount = rows.filter((r) => r.errors.length > 0).length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="py-4 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)] m-0">Bulk Import Accounts</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1 m-0">
            Create or update multiple accounts at once via CSV
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" icon={<Download size={14} />} onClick={downloadTemplate}>
            Download Template
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowGuide((v) => !v)}>
            {showGuide ? 'Hide Guide' : 'CSV Guide'}
          </Button>
        </div>
      </div>

      {/* CSV column guide */}
      {showGuide && (
        <div className="mb-6 border border-[var(--color-border)] rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-[var(--color-surface-hover)] text-[0.8125rem] font-semibold text-[var(--color-text-secondary)] uppercase tracking-[0.04em]">
            CSV Column Reference
          </div>
          <table className="w-full text-[0.8125rem]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="text-left px-4 py-2 font-semibold text-[var(--color-text-secondary)]">Column</th>
                <th className="text-left px-4 py-2 font-semibold text-[var(--color-text-secondary)]">Required</th>
                <th className="text-left px-4 py-2 font-semibold text-[var(--color-text-secondary)]">Description</th>
              </tr>
            </thead>
            <tbody>
              {COLUMN_DESCRIPTIONS.map((c) => (
                <tr key={c.col} className="border-b border-[var(--color-border)]">
                  <td className="px-4 py-2 font-mono text-[0.75rem]">{c.col}</td>
                  <td className="px-4 py-2">
                    <span className="text-[0.6875rem] font-semibold px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: c.req ? 'rgba(239,68,68,0.1)' : 'rgba(0,0,0,0.05)', color: c.req ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
                      {c.req ? 'Required' : 'Optional'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-[var(--color-text-secondary)]">{c.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Step: Upload ─────────────────────────────────────────────────── */}
      {step === 'upload' && (
        <div className="flex flex-col gap-6 max-w-xl">
          <UploadZone onFile={(f) => parseMutation.mutate(f)} />
          {parseMutation.isPending && (
            <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
              <RefreshCw size={14} className="animate-spin" /> Parsing CSV…
            </div>
          )}
        </div>
      )}

      {/* ── Step: Preview ────────────────────────────────────────────────── */}
      {step === 'preview' && preview && (
        <div className="flex flex-col gap-4">
          {/* Summary bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total rows',    value: preview.summary.total,   color: 'var(--color-text)' },
              { label: 'To create',     value: rows.filter((r) => r.action === 'create').length, color: 'var(--color-success)' },
              { label: 'To update',     value: rows.filter((r) => r.action === 'update').length, color: '#6366f1' },
              { label: 'With errors',   value: errorCount,              color: errorCount > 0 ? 'var(--color-danger)' : 'var(--color-text-muted)' },
            ].map((s) => (
              <div key={s.label} className="bg-[var(--color-surface-hover)] rounded-xl px-4 py-3">
                <div className="text-[0.625rem] uppercase tracking-[0.05em] text-[var(--color-text-muted)] mb-0.5">{s.label}</div>
                <div className="text-xl font-bold" style={{ color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {errorCount > 0 && (
            <div className="flex items-center gap-2 text-[0.8125rem] px-3 py-2 rounded-lg"
              style={{ backgroundColor: 'rgba(239,68,68,0.08)', color: 'var(--color-danger)' }}>
              <AlertCircle size={14} />
              {errorCount} row{errorCount > 1 ? 's have' : ' has'} validation errors and will be skipped. Expand the row to see details.
            </div>
          )}

          {/* Preview table */}
          <div className="border border-[var(--color-border)] rounded-xl overflow-hidden">
            <PreviewTable rows={rows} onToggleSkip={toggleSkip} />
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <Button variant="ghost" onClick={() => { setStep('upload'); setPreview(null); setRows([]); }}>
              Back
            </Button>
            <Button
              onClick={() => confirmMutation.mutate()}
              loading={confirmMutation.isPending}
              disabled={actionable.length === 0}
            >
              Import {actionable.length} account{actionable.length !== 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      )}

      {/* ── Step: Done ───────────────────────────────────────────────────── */}
      {step === 'done' && result && (
        <div className="flex flex-col items-center gap-6 py-12 max-w-md mx-auto text-center">
          <CheckCircle2 size={56} style={{ color: 'var(--color-success)' }} />
          <div>
            <h2 className="text-xl font-bold m-0 mb-2">Import complete</h2>
            <p className="text-[var(--color-text-muted)] text-sm m-0">
              {result.created > 0 && <><strong>{result.created}</strong> account{result.created !== 1 ? 's' : ''} created. </>}
              {result.updated > 0 && <><strong>{result.updated}</strong> account{result.updated !== 1 ? 's' : ''} updated. </>}
              {result.failed  > 0 && <><strong className="text-[var(--color-danger)]">{result.failed}</strong> failed.</>}
            </p>
          </div>
          {result.errors.length > 0 && (
            <div className="w-full text-left">
              {result.errors.map((e, i) => (
                <div key={i} className="text-[0.75rem] text-[var(--color-danger)] mb-1 flex items-start gap-1.5">
                  <AlertCircle size={12} className="mt-0.5 shrink-0" /> {e.error}
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => { setStep('upload'); setPreview(null); setRows([]); setResult(null); }}>
              Import more
            </Button>
            <Button onClick={() => window.history.back()}>
              Back to accounts
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
