/**
 * ImportPage.tsx
 * Smart bank statement import — drag-drop CSV or PDF, auto-detect bank format,
 * preview with dedup flagging, confirm, and track history.
 *
 * Flow for CSV: DropZone → /detect-mapping → MappingConfirmStep → /parse-with-mapping → ImportPreview → /confirm
 * Flow for PDF: DropZone → /parse → ImportPreview → /confirm
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Upload, History } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui';
import { notify } from '@/components/ui';
import DropZone from './components/DropZone';
import ImportPreview from './components/ImportPreview';
import ImportHistory from './components/ImportHistory';
import MappingConfirmStep, {
  type DetectMappingResult,
  type ConfirmedMapping,
} from './components/MappingConfirmStep';

interface Account {
  id: string;
  name: string;
  institution?: string;
  type: string;
}

type Step = 'upload' | 'mapping' | 'preview';
type View = 'upload' | 'history';

export default function ImportPage() {
  const [view, setView] = useState<View>('upload');
  const [step, setStep] = useState<Step>('upload');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [uploadMeta, setUploadMeta] = useState<{ filename: string; accountId: string } | null>(null);
  const [mappingData, setMappingData] = useState<{ result: DetectMappingResult; file: File; accountId: string } | null>(null);

  const accountsQuery = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const res = await api.get('/accounts');
      return res.data;
    },
    select: (data: unknown): Account[] => {
      if (!data) return [];
      if (Array.isArray(data)) return data as Account[];
      const d = data as { groups?: Array<{ accounts: Account[] }> };
      if (d.groups) return d.groups.flatMap((g) => g.accounts);
      return [];
    },
  });

  const accounts = accountsQuery.data ?? [];

  // PDF / known-bank CSV path: DropZone already parsed → go straight to preview
  function handleParsed(result: ParseResult, filename: string, accountId: string) {
    setParseResult(result);
    setUploadMeta({ filename, accountId });
    setStep('preview');
  }

  // CSV smart-detect path: DropZone returned detect-mapping result
  function handleSmartDetect(rawResult: unknown, file: File, accountId: string) {
    setMappingData({ result: rawResult as DetectMappingResult, file, accountId });
    setStep('mapping');
  }

  // User confirmed mapping → call /parse-with-mapping
  async function handleMappingConfirmed(mapping: ConfirmedMapping) {
    if (!mappingData) return;
    try {
      const formData = new FormData();
      formData.append('file', mappingData.file);
      // Send mapping fields as individual form fields (multer parses body)
      Object.entries(mapping).forEach(([k, v]) => {
        if (v !== undefined) formData.append(k, String(v));
      });
      formData.append('accountId', mappingData.accountId);

      const res = await api.post('/import/parse-with-mapping', formData);
      setParseResult(res.data as ParseResult);
      setUploadMeta({ filename: mappingData.file.name, accountId: mappingData.accountId });
      setStep('preview');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      notify.error(msg ?? 'Failed to parse with mapping. Please try again.');
    }
  }

  function handleImportDone() {
    resetState();
    setView('history');
  }

  function handleCancel() {
    resetState();
  }

  function resetState() {
    setParseResult(null);
    setUploadMeta(null);
    setMappingData(null);
    setStep('upload');
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Import Transactions</h1>
          <p className="text-[color:var(--color-text-secondary)] text-sm mt-1">
            Drop any CSV or PDF bank statement — Kuber auto-detects columns and flags duplicates.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={view === 'upload' ? 'primary' : 'secondary'}
            onClick={() => { setView('upload'); resetState(); }}
          >
            <Upload size={16} className="mr-1.5" />
            Upload
          </Button>
          <Button
            variant={view === 'history' ? 'primary' : 'secondary'}
            onClick={() => setView('history')}
          >
            <History size={16} className="mr-1.5" />
            History
          </Button>
        </div>
      </div>

      {/* Content */}
      {view === 'upload' && step === 'upload' && (
        <DropZone
          accounts={accounts}
          onParsed={handleParsed}
          onSmartDetect={handleSmartDetect}
        />
      )}

      {view === 'upload' && step === 'mapping' && mappingData && (
        <MappingConfirmStep
          result={mappingData.result}
          onConfirm={handleMappingConfirmed}
          onCancel={handleCancel}
        />
      )}

      {view === 'upload' && step === 'preview' && parseResult && uploadMeta && (
        <ImportPreview
          result={parseResult}
          filename={uploadMeta.filename}
          accountId={uploadMeta.accountId}
          onDone={handleImportDone}
          onCancel={handleCancel}
        />
      )}

      {view === 'history' && <ImportHistory />}
    </div>
  );
}

// Re-export type for ImportPreview
export interface ParsedRow {
  date: string;
  description: string;
  amount: number;
  reference?: string;
  hash: string;
  isDuplicate: boolean;
  status: 'new' | 'duplicate' | 'invalid';
  error?: string;
  investmentType?: 'buy' | 'sell' | 'dividend' | 'transfer' | 'fee' | 'other';
  ticker?: string | null;
  suggestedCategoryId?: string | null;
  suggestedCategoryName?: string | null;
}

export interface ParseResult {
  bankSource: string;
  confidence: number;
  totalRows: number;
  newCount: number;
  dupCount: number;
  invalidCount: number;
  rows: ParsedRow[];
}
