import { useState } from 'react';
import { Download, FileText, FileSpreadsheet } from 'lucide-react';

interface ExportButtonsProps {
  type: 'spending' | 'cashflow' | 'tax';
  from?: string;
  to?: string;
  year?: number;
}

function buildUrl(base: string, params: Record<string, string | number | undefined>): string {
  const url = new URL(base, window.location.origin);
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== '') {
      url.searchParams.set(key, String(val));
    }
  }
  return url.pathname + url.search;
}

export function ExportButtons({ type, from, to, year }: ExportButtonsProps) {
  const [pdfLoading, setPdfLoading] = useState(false);
  const [excelLoading, setExcelLoading] = useState(false);

  async function handleDownload(format: 'pdf' | 'excel', setLoading: (v: boolean) => void) {
    setLoading(true);
    try {
      const params: Record<string, string | number | undefined> = { type };
      if (from) params.from = from;
      if (to) params.to = to;
      if (year !== undefined) params.year = year;

      const url = buildUrl(`/api/v1/reports/export/${format}`, params);
      const res = await fetch(url, { credentials: 'include' });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Export failed' }));
        throw new Error(data.error ?? 'Export failed');
      }

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `kuber-${type}-report.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      console.error('[ExportButtons]', err);
      alert(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setLoading(false);
    }
  }

  const btnBase: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    padding: '0.375rem 0.75rem',
    fontSize: '0.8125rem',
    fontWeight: 500,
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-surface)',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap' as const,
  };

  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
      <button
        style={{ ...btnBase, opacity: pdfLoading ? 0.6 : 1 }}
        onClick={() => handleDownload('pdf', setPdfLoading)}
        disabled={pdfLoading}
        title="Export as PDF"
      >
        <FileText size={14} />
        {pdfLoading ? 'Exporting…' : 'PDF'}
      </button>
      <button
        style={{ ...btnBase, opacity: excelLoading ? 0.6 : 1 }}
        onClick={() => handleDownload('excel', setExcelLoading)}
        disabled={excelLoading}
        title="Export as Excel"
      >
        <FileSpreadsheet size={14} />
        {excelLoading ? 'Exporting…' : 'Excel'}
      </button>
    </div>
  );
}
