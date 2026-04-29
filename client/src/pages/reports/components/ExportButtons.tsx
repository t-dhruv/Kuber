import { useState } from 'react';
import { FileText, FileSpreadsheet } from 'lucide-react';

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

  const btnClass = "inline-flex items-center gap-1.5 px-3 py-1.5 text-[0.8125rem] font-medium rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] cursor-pointer transition-all duration-150 whitespace-nowrap";

  return (
    <div className="flex gap-2 items-center">
      <button
        className={btnClass}
        aria-label="Export report as PDF"
        style={{ opacity: pdfLoading ? 0.6 : 1 }}
        onClick={() => handleDownload('pdf', setPdfLoading)}
        disabled={pdfLoading}
        title="Export as PDF"
      >
        <FileText size={14} />
        {pdfLoading ? 'Exporting…' : 'PDF'}
      </button>
      <button
        className={btnClass}
        aria-label="Export report as Excel"
        style={{ opacity: excelLoading ? 0.6 : 1 }}
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
