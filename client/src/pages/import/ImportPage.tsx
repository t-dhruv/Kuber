/**
 * ImportPage.tsx
 * Smart bank statement import — drag-drop CSV or PDF, auto-detect bank format,
 * preview with dedup flagging, confirm, and track history.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Upload, History } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui';
import DropZone from './components/DropZone';
import ImportPreview from './components/ImportPreview';
import ImportHistory from './components/ImportHistory';

interface Account {
  id: string;
  name: string;
  institution?: string;
  type: string;
}

type View = 'upload' | 'history';

export default function ImportPage() {
  const [view, setView] = useState<View>('upload');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [uploadMeta, setUploadMeta] = useState<{ filename: string; accountId: string } | null>(null);

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

  function handleParsed(result: ParseResult, filename: string, accountId: string) {
    setParseResult(result);
    setUploadMeta({ filename, accountId });
  }

  function handleImportDone() {
    setParseResult(null);
    setUploadMeta(null);
    setView('history');
  }

  function handleCancel() {
    setParseResult(null);
    setUploadMeta(null);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Import Transactions</h1>
          <p className="text-[color:var(--text-secondary)] text-sm mt-1">
            Drop a CSV or PDF bank statement — Kuber auto-detects your bank format and flags duplicates.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={view === 'upload' ? 'primary' : 'secondary'}
            onClick={() => { setView('upload'); handleCancel(); }}
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
      {view === 'upload' && !parseResult && (
        <DropZone accounts={accounts} onParsed={handleParsed} />
      )}
      {view === 'upload' && parseResult && uploadMeta && (
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
