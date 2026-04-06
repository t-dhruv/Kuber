import { useState, useRef, useCallback, ChangeEvent, DragEvent } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Upload, ArrowRight, ArrowLeft, FileText, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Modal, ModalFooter, Button, toast } from '@/components/ui';

// Native select wrapper so we can use children-style options
const NativeSelect = ({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
}) => (
  <div className="relative">
    <select
      value={value}
      onChange={onChange}
      className="w-full appearance-none rounded-[var(--radius-md)] border border-[var(--color-border)] py-2 pl-3 pr-8 text-sm bg-[var(--color-surface)] text-[var(--color-text)] cursor-pointer font-[inherit]"
    >
      {children}
    </select>
    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--color-text-muted)]">
      ▾
    </span>
  </div>
);

// ─── Types ────────────────────────────────────────────────────────────────────

interface Account {
  id: string;
  name: string;
}

interface CsvMapping {
  date: string;
  description: string;
  amount: string;
  category?: string;
  notes?: string;
}

interface PreviewRow {
  date: string;
  description: string;
  amount: number;
  category: string | null;
  notes: string | null;
}

interface PreviewResponse {
  headers: string[];
  preview: PreviewRow[];
  errors: Array<{ row: number; message: string }>;
  totalDataRows: number;
}

interface ImportResponse {
  imported: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DATE_FORMATS = [
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (e.g. 2024-01-31)' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (e.g. 01/31/2024)' },
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (e.g. 31/01/2024)' },
  { value: 'MM-DD-YYYY', label: 'MM-DD-YYYY (e.g. 01-31-2024)' },
];

const REQUIRED_FIELDS: { key: keyof CsvMapping; label: string; required: true }[] = [
  { key: 'date', label: 'Date', required: true },
  { key: 'description', label: 'Description', required: true },
  { key: 'amount', label: 'Amount', required: true },
];

const OPTIONAL_FIELDS: { key: keyof CsvMapping; label: string; required: false }[] = [
  { key: 'category', label: 'Category (optional)', required: false },
  { key: 'notes', label: 'Notes (optional)', required: false },
];

const SKIP = '-- skip --';

// ─── Smart auto-mapping ───────────────────────────────────────────────────────

function autoMap(headers: string[]): CsvMapping {
  const find = (patterns: string[]) =>
    headers.find(h => patterns.some(p => h.toLowerCase().includes(p))) ?? SKIP;

  return {
    date: find(['date']),
    description: find(['desc', 'merchant', 'payee', 'name', 'memo', 'narration']),
    amount: find(['amount', 'debit', 'credit', 'value', 'sum']),
    category: find(['category', 'cat', 'type']),
    notes: find(['note', 'memo', 'comment', 'remark']),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function estimateRowCount(text: string): number {
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  return Math.max(0, lines.length - 1);
}

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

// ─── Step 1: Upload ───────────────────────────────────────────────────────────

interface Step1Props {
  file: File | null;
  rowEstimate: number;
  accountId: string;
  dateFormat: string;
  accounts: Account[];
  onFile: (f: File, text: string) => void;
  onAccountId: (id: string) => void;
  onDateFormat: (fmt: string) => void;
  onNext: () => void;
}

function Step1Upload({
  file, rowEstimate, accountId, dateFormat,
  accounts, onFile, onAccountId, onDateFormat, onNext,
}: Step1Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = useCallback((f: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) ?? '';
      onFile(f, text);
    };
    reader.readAsText(f);
  }, [onFile]);

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const canProceed = !!file && !!accountId;

  return (
    <div className="flex flex-col gap-4">
      {/* Drop zone */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        style={{
          border: `2px dashed ${dragging ? 'var(--color-accent)' : 'var(--color-border)'}`,
          backgroundColor: dragging ? 'var(--color-accent-light)' : 'var(--color-bg)',
        }}
        className="rounded-[var(--radius-lg)] p-8 text-center cursor-pointer transition-all duration-[150ms]"
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={onInputChange}
        />
        {file ? (
          <div className="flex flex-col items-center gap-2">
            <FileText size={28} className="text-[var(--color-accent)]" />
            <span className="font-semibold text-[var(--color-text)]">{file.name}</span>
            <span className="text-[0.8125rem] text-[var(--color-text-muted)]">
              ~{rowEstimate} data rows detected
            </span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload size={28} className="text-[var(--color-text-muted)]" />
            <span className="font-medium text-[var(--color-text)]">Drag & drop a CSV file</span>
            <span className="text-[0.8125rem] text-[var(--color-text-muted)]">
              or <span className="text-[var(--color-accent)] underline">browse</span>
            </span>
          </div>
        )}
      </div>

      {/* Account selector */}
      <div>
        <label className="block text-[0.8125rem] font-medium text-[var(--color-text)] mb-1.5">
          Import into account <span className="text-[var(--color-error)]">*</span>
        </label>
        <NativeSelect
          value={accountId}
          onChange={(e) => onAccountId(e.target.value)}
        >
          <option value="">Select account...</option>
          {accounts.map(a => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </NativeSelect>
      </div>

      {/* Date format */}
      <div>
        <label className="block text-[0.8125rem] font-medium text-[var(--color-text)] mb-1.5">
          Date format in CSV
        </label>
        <NativeSelect value={dateFormat} onChange={(e) => onDateFormat(e.target.value)}>
          {DATE_FORMATS.map(df => (
            <option key={df.value} value={df.value}>{df.label}</option>
          ))}
        </NativeSelect>
      </div>

      <ModalFooter style={{ marginTop: 0 }}>
        <Button
          variant="primary"
          icon={<ArrowRight size={14} />}
          disabled={!canProceed}
          onClick={onNext}
        >
          Next
        </Button>
      </ModalFooter>
    </div>
  );
}

// ─── Step 2: Map Columns ──────────────────────────────────────────────────────

interface Step2Props {
  headers: string[];
  csvText: string;
  mapping: CsvMapping;
  onMapping: (m: CsvMapping) => void;
  onBack: () => void;
  onNext: () => void;
}

function Step2Map({ headers, csvText, mapping, onMapping, onBack, onNext }: Step2Props) {
  const options = [SKIP, ...headers];

  const set = (key: keyof CsvMapping, val: string) => {
    onMapping({ ...mapping, [key]: val === SKIP ? undefined : val } as CsvMapping);
  };

  // Parse first 3 data rows client-side for preview
  const allRows = csvText.split('\n').filter(l => l.trim().length > 0);
  const previewDataRows = allRows.slice(1, 4);

  const getCell = (row: string, col: string) => {
    if (col === SKIP || !col) return '—';
    const fields = row.split(',').map(s => s.replace(/^"|"$/g, '').trim());
    const idx = headers.indexOf(col);
    return idx >= 0 ? (fields[idx] ?? '—') : '—';
  };

  const requiredMapped = mapping.date && mapping.description && mapping.amount;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        {REQUIRED_FIELDS.map(({ key, label }) => (
          <div key={key}>
            <label className="block text-[0.8125rem] font-medium text-[var(--color-text)] mb-1">
              {label} <span className="text-[var(--color-error)]">*</span>
            </label>
            <NativeSelect
              value={mapping[key] ?? SKIP}
              onChange={(e) => set(key, e.target.value)}
            >
              <option value={SKIP}>— skip —</option>
              {headers.map(h => <option key={h} value={h}>{h}</option>)}
            </NativeSelect>
          </div>
        ))}
        {OPTIONAL_FIELDS.map(({ key, label }) => (
          <div key={key}>
            <label className="block text-[0.8125rem] font-medium text-[var(--color-text-muted)] mb-1">
              {label}
            </label>
            <NativeSelect
              value={mapping[key] ?? SKIP}
              onChange={(e) => set(key, e.target.value)}
            >
              {options.map(h => <option key={h} value={h}>{h}</option>)}
            </NativeSelect>
          </div>
        ))}
      </div>

      {/* Preview table */}
      {previewDataRows.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.05em] mb-2">
            Preview (first 3 rows)
          </p>
          <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-border)]">
            <table className="w-full border-collapse text-[0.8125rem]">
              <thead>
                <tr className="bg-[var(--color-bg)]">
                  {['Date', 'Description', 'Amount', 'Category', 'Notes'].map(h => (
                    <th key={h} className="px-3 py-[0.4rem] text-left font-semibold text-[var(--color-text-muted)] border-b border-[var(--color-border)] whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewDataRows.map((row, i) => (
                  <tr key={i} style={{ borderBottom: i < previewDataRows.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                    <td className="px-3 py-[0.4rem] text-[var(--color-text)]">{getCell(row, mapping.date)}</td>
                    <td className="px-3 py-[0.4rem] text-[var(--color-text)]">{getCell(row, mapping.description)}</td>
                    <td className="px-3 py-[0.4rem] text-[var(--color-text)]">{getCell(row, mapping.amount)}</td>
                    <td className="px-3 py-[0.4rem] text-[var(--color-text-muted)]">{getCell(row, mapping.category ?? SKIP)}</td>
                    <td className="px-3 py-[0.4rem] text-[var(--color-text-muted)]">{getCell(row, mapping.notes ?? SKIP)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ModalFooter style={{ marginTop: 0 }}>
        <Button variant="ghost" icon={<ArrowLeft size={14} />} onClick={onBack}>Back</Button>
        <Button
          variant="primary"
          icon={<ArrowRight size={14} />}
          disabled={!requiredMapped}
          onClick={onNext}
        >
          Preview
        </Button>
      </ModalFooter>
    </div>
  );
}

// ─── Step 3: Preview & Import ─────────────────────────────────────────────────

interface Step3Props {
  file: File;
  accountId: string;
  dateFormat: string;
  mapping: CsvMapping;
  onBack: () => void;
  onDone: () => void;
}

function Step3Preview({ file, accountId, dateFormat, mapping, onBack, onDone }: Step3Props) {
  const previewQuery = useQuery<PreviewResponse>({
    queryKey: ['import-preview', file.name, accountId, dateFormat, JSON.stringify(mapping)],
    queryFn: async () => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('accountId', accountId);
      formData.append('dateFormat', dateFormat);
      formData.append('mapping', JSON.stringify(mapping));
      const res = await api.post<PreviewResponse>('/transactions/import/preview', formData);
      return res.data;
    },
    retry: false,
  });

  const importMutation = useMutation<ImportResponse>({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('accountId', accountId);
      formData.append('dateFormat', dateFormat);
      formData.append('mapping', JSON.stringify(mapping));
      const res = await api.post<ImportResponse>('/transactions/import', formData);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(`Imported ${data.imported} transactions${data.skipped ? ` (${data.skipped} skipped)` : ''}`);
      onDone();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error ?? 'Import failed');
    },
  });

  const preview = previewQuery.data;
  const totalRows = preview?.totalDataRows ?? 0;
  const hasErrors = (preview?.errors.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-4">
      {previewQuery.isLoading && (
        <div className="p-8 text-center text-[var(--color-text-muted)]">
          Parsing CSV...
        </div>
      )}

      {previewQuery.isError && (
        <div className="flex items-center gap-2 p-3 rounded-[var(--radius-md)] bg-[var(--color-error-light,#fef2f2)] text-[var(--color-error,#dc2626)]">
          <AlertTriangle size={16} />
          <span className="text-sm">{(previewQuery.error as any)?.response?.data?.error ?? 'Failed to parse CSV'}</span>
        </div>
      )}

      {preview && (
        <>
          {/* Summary badge */}
          <div className="flex items-center gap-2 px-4 py-3 rounded-[var(--radius-md)] bg-[var(--color-accent-light)] border border-[var(--color-accent)]">
            <CheckCircle2 size={16} className="text-[var(--color-accent)] shrink-0" />
            <span className="text-sm text-[var(--color-text)] font-medium">
              {totalRows} rows found — up to {totalRows - (preview.errors.length)} will be imported
            </span>
          </div>

          {/* Errors warning */}
          {hasErrors && (
            <div className="p-3 rounded-[var(--radius-md)] bg-[var(--color-warning-light,#fffbeb)] border border-[var(--color-warning,#f59e0b)]">
              <div className="flex items-center gap-1.5 mb-1.5">
                <AlertTriangle size={14} className="text-[var(--color-warning,#f59e0b)] shrink-0" />
                <span className="text-[0.8125rem] font-semibold text-[var(--color-text)]">
                  {preview.errors.length} row{preview.errors.length !== 1 ? 's' : ''} will be skipped
                </span>
              </div>
              <ul className="m-0 pl-5 text-[0.8125rem] text-[var(--color-text-muted)]">
                {preview.errors.slice(0, 5).map(e => (
                  <li key={e.row}>Row {e.row}: {e.message}</li>
                ))}
                {preview.errors.length > 5 && <li>…and {preview.errors.length - 5} more</li>}
              </ul>
            </div>
          )}

          {/* Preview table (up to 10 rows) */}
          {preview.preview.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.05em] mb-2">
                First {preview.preview.length} rows
              </p>
              <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-border)]">
                <table className="w-full border-collapse text-[0.8125rem]">
                  <thead>
                    <tr className="bg-[var(--color-bg)]">
                      {['Date', 'Description', 'Amount', 'Category'].map(h => (
                        <th key={h} className="px-3 py-[0.4rem] text-left font-semibold text-[var(--color-text-muted)] border-b border-[var(--color-border)] whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.preview.map((row, i) => (
                      <tr key={i} style={{ borderBottom: i < preview.preview.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                        <td className="px-3 py-[0.4rem] text-[var(--color-text)] whitespace-nowrap">{row.date}</td>
                        <td className="px-3 py-[0.4rem] text-[var(--color-text)] max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap">{row.description}</td>
                        <td className="px-3 py-[0.4rem] whitespace-nowrap [font-variant-numeric:tabular-nums]" style={{ color: row.amount < 0 ? 'var(--color-error,#dc2626)' : 'var(--color-success,#16a34a)' }}>
                          {fmtCurrency(row.amount)}
                        </td>
                        <td className="px-3 py-[0.4rem] text-[var(--color-text-muted)]">{row.category ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalRows > 5 && (
                <p className="text-xs text-[var(--color-text-muted)] mt-1.5">
                  Showing first 5 of {totalRows} rows
                </p>
              )}
            </div>
          )}
        </>
      )}

      <ModalFooter style={{ marginTop: 0 }}>
        <Button variant="ghost" icon={<ArrowLeft size={14} />} onClick={onBack} disabled={importMutation.isPending}>
          Back
        </Button>
        <Button
          variant="primary"
          disabled={!preview || previewQuery.isError || importMutation.isPending}
          loading={importMutation.isPending}
          onClick={() => importMutation.mutate()}
        >
          {importMutation.isPending ? 'Importing…' : `Import ${totalRows > 0 ? totalRows - (preview?.errors.length ?? 0) : ''} Transactions`}
        </Button>
      </ModalFooter>
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

export function ImportModal({ open, onClose, onImported }: ImportModalProps) {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [csvText, setCsvText] = useState('');
  const [rowEstimate, setRowEstimate] = useState(0);
  const [accountId, setAccountId] = useState('');
  const [dateFormat, setDateFormat] = useState('YYYY-MM-DD');
  const [mapping, setMapping] = useState<CsvMapping>({ date: '', description: '', amount: '' });

  const accountsQuery = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const res = await api.get('/accounts');
      return res.data;
    },
    // select normalizes BOTH fresh fetches AND stale cache from TransactionsPage
    // (which stores the full { groups, netWorth } object) to a flat Account[]
    select: (data: unknown): Account[] => {
      if (!data) return [];
      if (Array.isArray(data)) return data as Account[];
      const d = data as { groups?: Array<{ accounts: Account[] }> };
      if (d.groups) return d.groups.flatMap((g) => g.accounts);
      return [];
    },
    enabled: open,
  });

  const handleClose = () => {
    setStep(1);
    setFile(null);
    setCsvText('');
    setRowEstimate(0);
    setAccountId('');
    setDateFormat('YYYY-MM-DD');
    setMapping({ date: '', description: '', amount: '' });
    onClose();
  };

  const handleFile = (f: File, text: string) => {
    setFile(f);
    setCsvText(text);
    setRowEstimate(estimateRowCount(text));
  };

  const handleToStep2 = () => {
    // Parse headers and auto-map
    const lines = csvText.split('\n').filter(l => l.trim().length > 0);
    const headers = lines[0]?.split(',').map(h => h.replace(/^"|"$/g, '').trim()) ?? [];
    setMapping(autoMap(headers));
    setStep(2);
  };

  const headers = csvText
    ? csvText.split('\n').filter(l => l.trim().length > 0)[0]?.split(',').map(h => h.replace(/^"|"$/g, '').trim()) ?? []
    : [];

  const STEP_TITLES: Record<number, string> = {
    1: 'Import CSV — Upload',
    2: 'Import CSV — Map Columns',
    3: 'Import CSV — Preview & Import',
  };

  const STEP_DESCRIPTIONS: Record<number, string> = {
    1: 'Upload a CSV file and select the target account.',
    2: 'Map CSV columns to transaction fields.',
    3: 'Review parsed transactions before importing.',
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={STEP_TITLES[step]}
      description={STEP_DESCRIPTIONS[step]}
      size="xl"
      closeOnBackdrop={false}
    >
      {step === 1 && (
        <Step1Upload
          file={file}
          rowEstimate={rowEstimate}
          accountId={accountId}
          dateFormat={dateFormat}
          accounts={accountsQuery.data ?? []}
          onFile={handleFile}
          onAccountId={setAccountId}
          onDateFormat={setDateFormat}
          onNext={handleToStep2}
        />
      )}
      {step === 2 && (
        <Step2Map
          headers={headers}
          csvText={csvText}
          mapping={mapping}
          onMapping={setMapping}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}
      {step === 3 && file && (
        <Step3Preview
          file={file}
          accountId={accountId}
          dateFormat={dateFormat}
          mapping={mapping}
          onBack={() => setStep(2)}
          onDone={() => { onImported(); handleClose(); }}
        />
      )}
    </Modal>
  );
}
