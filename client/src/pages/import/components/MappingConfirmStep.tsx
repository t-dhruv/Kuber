/**
 * MappingConfirmStep.tsx
 * Shows auto-detected column mappings and lets the user correct them
 * before proceeding to the import preview.
 */

import { useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, ArrowRight } from 'lucide-react';
import { Button, Select } from '@/components/ui';

export type StandardField = 'date' | 'description' | 'amount' | 'debit' | 'credit';
export type AmountStrategy = 'single' | 'debit-credit';
export type LocaleFormat = 'us' | 'eu';

export interface ColumnMappingItem {
  field: StandardField;
  csvHeader: string;
  confidence: number;
}

export interface DetectMappingResult {
  headers: string[];
  mappings: ColumnMappingItem[];
  unmapped: string[];
  amountStrategy: AmountStrategy;
  localeFormat: LocaleFormat;
  preview: Array<{
    rawDate: string;
    parsedDate: string | null;
    description: string;
    amount: number | null;
  }>;
}

export interface ConfirmedMapping {
  dateColumn: string;
  descriptionColumn: string;
  descriptionColumn2?: string;
  descriptionSeparator?: string;
  amountStrategy: AmountStrategy;
  amountColumn?: string;
  debitColumn?: string;
  creditColumn?: string;
  localeFormat: LocaleFormat;
}

interface Props {
  result: DetectMappingResult;
  onConfirm: (mapping: ConfirmedMapping) => void;
  onCancel: () => void;
}

const FIELD_LABELS: Record<StandardField, string> = {
  date: 'Date',
  description: 'Description',
  amount: 'Amount',
  debit: 'Debit (money out)',
  credit: 'Credit (money in)',
};

const REQUIRED_FIELDS_SINGLE: StandardField[] = ['date', 'description', 'amount'];
const REQUIRED_FIELDS_SPLIT: StandardField[] = ['date', 'description', 'debit'];

function ConfidenceIcon({ confidence }: { confidence: number }) {
  if (confidence >= 0.8) return <CheckCircle2 size={14} className="text-green-500 shrink-0" />;
  if (confidence >= 0.5) return <AlertTriangle size={14} className="text-yellow-500 shrink-0" />;
  return <XCircle size={14} className="text-red-500 shrink-0" />;
}

export default function MappingConfirmStep({ result, onConfirm, onCancel }: Props) {
  const headerOptions = [
    { value: '', label: '— Skip —' },
    ...result.headers.map((h) => ({ value: h, label: h })),
  ];

  // Build initial state from detected mappings
  const getDetected = (field: StandardField) =>
    result.mappings.find((m) => m.field === field)?.csvHeader ?? '';

  const [descCol2, setDescCol2] = useState('');
  const [descSeparator, setDescSeparator] = useState(' – ');
  const [amountStrategy, setAmountStrategy] = useState<AmountStrategy>(result.amountStrategy);
  const [localeFormat, setLocaleFormat] = useState<LocaleFormat>(result.localeFormat);
  const [cols, setCols] = useState<Record<StandardField, string>>({
    date: getDetected('date'),
    description: getDetected('description'),
    amount: getDetected('amount'),
    debit: getDetected('debit'),
    credit: getDetected('credit'),
  });

  const getConfidence = (field: StandardField) =>
    result.mappings.find((m) => m.field === field)?.confidence ?? 0;

  const requiredFields = amountStrategy === 'single' ? REQUIRED_FIELDS_SINGLE : REQUIRED_FIELDS_SPLIT;
  const missingRequired = requiredFields.filter((f) => !cols[f]);
  const canConfirm = missingRequired.length === 0;

  function handleConfirm() {
    onConfirm({
      dateColumn: cols.date,
      descriptionColumn: cols.description,
      ...(descCol2 ? { descriptionColumn2: descCol2, descriptionSeparator: descSeparator } : {}),
      amountStrategy,
      amountColumn: amountStrategy === 'single' ? cols.amount : undefined,
      debitColumn: amountStrategy === 'debit-credit' ? cols.debit : undefined,
      creditColumn: amountStrategy === 'debit-credit' ? cols.credit : undefined,
      localeFormat,
    });
  }

  const visibleFields: StandardField[] =
    amountStrategy === 'single'
      ? ['date', 'description', 'amount']
      : ['date', 'description', 'debit', 'credit'];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Confirm Column Mapping</h2>
        <p className="text-sm text-[color:var(--color-text-secondary)] mt-1">
          We auto-detected your CSV columns. Review and adjust if needed before importing.
        </p>
      </div>

      {/* Amount strategy toggle */}
      <div className="flex gap-3 items-center">
        <span className="text-sm font-medium">Amount format:</span>
        <button
          type="button"
          onClick={() => setAmountStrategy('single')}
          className={`px-3 py-1 rounded-full text-sm border transition-colors ${
            amountStrategy === 'single'
              ? 'bg-[color:var(--color-primary)] text-white border-[color:var(--color-primary)]'
              : 'border-[color:var(--color-border)] hover:border-[color:var(--color-primary)]'
          }`}
        >
          Single column
        </button>
        <button
          type="button"
          onClick={() => setAmountStrategy('debit-credit')}
          className={`px-3 py-1 rounded-full text-sm border transition-colors ${
            amountStrategy === 'debit-credit'
              ? 'bg-[color:var(--color-primary)] text-white border-[color:var(--color-primary)]'
              : 'border-[color:var(--color-border)] hover:border-[color:var(--color-primary)]'
          }`}
        >
          Debit / Credit columns
        </button>
        <span className="text-sm font-medium ml-4">Number format:</span>
        <button
          type="button"
          onClick={() => setLocaleFormat('us')}
          className={`px-3 py-1 rounded-full text-sm border transition-colors ${
            localeFormat === 'us'
              ? 'bg-[color:var(--color-primary)] text-white border-[color:var(--color-primary)]'
              : 'border-[color:var(--color-border)] hover:border-[color:var(--color-primary)]'
          }`}
        >
          1,234.56
        </button>
        <button
          type="button"
          onClick={() => setLocaleFormat('eu')}
          className={`px-3 py-1 rounded-full text-sm border transition-colors ${
            localeFormat === 'eu'
              ? 'bg-[color:var(--color-primary)] text-white border-[color:var(--color-primary)]'
              : 'border-[color:var(--color-border)] hover:border-[color:var(--color-primary)]'
          }`}
        >
          1.234,56
        </button>
      </div>

      {/* Column mapping grid */}
      <div className="grid gap-3">
        {visibleFields.map((field) => {
          const isRequired = requiredFields.includes(field);
          const confidence = getConfidence(field);
          const value = cols[field];
          const isMissing = isRequired && !value;

          return (
            <div
              key={field}
              className={`flex items-center gap-4 p-3 rounded-lg border ${
                isMissing
                  ? 'border-red-400 bg-red-50 dark:bg-red-900/10'
                  : 'border-[color:var(--color-border)]'
              }`}
            >
              <div className="w-36 shrink-0">
                <span className="text-sm font-medium">{FIELD_LABELS[field]}</span>
                {isRequired && <span className="text-red-500 ml-1 text-xs">*</span>}
              </div>

              {value ? (
                <ConfidenceIcon confidence={confidence} />
              ) : (
                <XCircle size={14} className="text-[color:var(--color-text-secondary)] shrink-0" />
              )}

              <div className="flex-1">
                <Select
                  id={`mapping-${field}`}
                  label={`Map ${FIELD_LABELS[field]} column`}
                  value={value}
                  onChange={(e) => setCols((prev) => ({ ...prev, [field]: e.target.value }))}
                  options={headerOptions}
                />
              </div>

              {value && confidence > 0 && (
                <span className="text-xs text-[color:var(--color-text-secondary)] shrink-0 w-16 text-right">
                  {Math.round(confidence * 100)}% match
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Description column combiner */}
      <div className="p-3 rounded-lg border border-[color:var(--color-border)] space-y-3">
        <p className="text-sm font-medium">Combine description columns <span className="text-[color:var(--color-text-secondary)] font-normal">(optional)</span></p>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <Select
              id="desc-col2"
              label="Add second column"
              value={descCol2}
              onChange={(e) => setDescCol2(e.target.value)}
              options={headerOptions}
            />
          </div>
          {descCol2 && (
            <div className="w-36">
              <label className="block text-xs text-[color:var(--color-text-secondary)] mb-1">Separator</label>
              <input
                type="text"
                value={descSeparator}
                onChange={(e) => setDescSeparator(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-[color:var(--color-border)] rounded-md bg-[color:var(--color-surface)] focus:outline-none focus:border-[color:var(--color-primary)]"
                placeholder=" – "
              />
            </div>
          )}
        </div>
        {descCol2 && cols.description && (
          <p className="text-xs text-[color:var(--color-text-secondary)]">
            Result: <span className="font-mono">[{cols.description}]{descSeparator}[{descCol2}]</span>
          </p>
        )}
      </div>

      {/* Preview sample */}
      {result.preview.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-2">Preview (first {result.preview.length} rows)</p>
          <div className="overflow-x-auto rounded-lg border border-[color:var(--color-border)]">
            <table className="w-full text-xs">
              <thead className="bg-[color:var(--color-surface-secondary)]">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Date</th>
                  <th className="px-3 py-2 text-left font-medium">Description</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {result.preview.map((row, i) => (
                  <tr key={i} className="border-t border-[color:var(--color-border)]">
                    <td className="px-3 py-2 font-mono">
                      {row.parsedDate ?? <span className="text-red-400">{row.rawDate || '—'}</span>}
                    </td>
                    <td className="px-3 py-2 max-w-[260px] truncate">{row.description || '—'}</td>
                    <td className={`px-3 py-2 text-right font-mono ${
                      row.amount === null ? 'text-red-400' : row.amount < 0 ? 'text-red-500' : 'text-green-600'
                    }`}>
                      {row.amount === null ? '—' : row.amount.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {missingRequired.length > 0 && (
        <p className="text-sm text-red-500">
          Required fields missing: {missingRequired.map((f) => FIELD_LABELS[f]).join(', ')}
        </p>
      )}

      <div className="flex gap-3 justify-end">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={handleConfirm} disabled={!canConfirm}>
          Continue
          <ArrowRight size={16} className="ml-1.5" />
        </Button>
      </div>
    </div>
  );
}
