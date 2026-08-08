import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, Input } from "@/components/ui";

export type SelectOption = {
  label: string;
  value: string;
};

export const controlStyle: React.CSSProperties = {
  width: "100%",
  minHeight: "2.5rem",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  background: "var(--color-surface)",
  color: "var(--color-text)",
  fontSize: "0.875rem",
};

export function FilterField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
      <span
        style={{
          fontSize: "0.8125rem",
          fontWeight: 600,
          color: "var(--color-text)",
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

export function NativeSelect({
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  ariaLabel?: string;
}) {
  return (
    <select
      value={value}
      aria-label={ariaLabel ?? placeholder}
      onChange={(event) => onChange(event.target.value)}
      style={{
        ...controlStyle,
        padding: "0 0.625rem",
      }}
    >
      {placeholder && <option value="">{placeholder}</option>}

      {options.map((option) => (
        <option
          key={option.value}
          value={option.value}
          style={{
            background: "var(--color-surface)",
            color: "var(--color-text)",
          }}
        >
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      style={{
        ...controlStyle,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "0.75rem",
        padding: "0 0.75rem",
        cursor: "pointer",
      }}
    >
      <span>{label}</span>

      <span
        aria-hidden="true"
        style={{
          width: "2rem",
          height: "1.125rem",
          borderRadius: "var(--radius-full)",
          border: "1px solid var(--color-border-strong)",
          background: checked ? "var(--color-accent-light)" : "var(--color-surface-alt)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: checked ? "flex-end" : "flex-start",
          padding: "0.125rem",
        }}
      >
        <span
          style={{
            width: "0.75rem",
            height: "0.75rem",
            borderRadius: "var(--radius-full)",
            background: checked ? "var(--color-accent)" : "var(--color-text-muted)",
          }}
        />
      </span>
    </button>
  );
}

export function SearchableMultiSelect({
  value,
  options,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  onChange,
}: {
  value: string[];
  options: SelectOption[];
  placeholder: string;
  searchPlaceholder: string;
  emptyMessage: string;
  onChange: (value: string[]) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedValueSet = useMemo(() => new Set(value), [value]);

  const selectedOptions = useMemo(
    () => options.filter((option) => selectedValueSet.has(option.value)),
    [options, selectedValueSet],
  );

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) return options;

    return options.filter((option) => option.label.toLowerCase().includes(normalizedQuery));
  }, [options, query]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!open) return;

    const timeout = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [open]);

  const toggleValue = (nextValue: string) => {
    if (selectedValueSet.has(nextValue)) {
      onChange(value.filter((item) => item !== nextValue));
      return;
    }

    onChange([...value, nextValue]);
  };

  const selectVisible = () => {
    const next = new Set(value);

    filteredOptions.forEach((option) => {
      next.add(option.value);
    });

    onChange(Array.from(next));
  };

  const clearVisible = () => {
    const visibleValues = new Set(filteredOptions.map((option) => option.value));

    onChange(value.filter((item) => !visibleValues.has(item)));
  };

  const summary =
    selectedOptions.length === 0
      ? placeholder
      : selectedOptions.length === 1
        ? selectedOptions[0].label
        : `${selectedOptions.length} selected`;

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        style={{
          width: "100%",
          minHeight: "2.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
          padding: "0.375rem 0.625rem",
          border: "1px solid var(--color-border, ButtonBorder)",
          borderRadius: "0.5rem",
          background: "var(--color-surface, ButtonFace)",
          color: "var(--color-text, ButtonText)",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontSize: "0.875rem",
          }}
        >
          {summary}
        </span>

        <span aria-hidden="true">▾</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            zIndex: 30,
            top: "calc(100% + 0.375rem)",
            left: 0,
            right: 0,
            border: "1px solid var(--color-border, ButtonBorder)",
            borderRadius: "0.75rem",
            background: "var(--color-surface, Canvas)",
            boxShadow: "var(--shadow-lg, 0 12px 30px rgba(0, 0, 0, 0.14))",
            padding: "0.5rem",
          }}
        >
          <Input
            ref={searchInputRef}
            value={query}
            placeholder={searchPlaceholder}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                setOpen(false);
              }
            }}
          />

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "0.5rem",
              marginTop: "0.5rem",
              marginBottom: "0.5rem",
            }}
          >
            <Button size="sm" variant="ghost" onClick={selectVisible}>
              Select visible
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={clearVisible}
              disabled={value.length === 0}
            >
              Clear visible
            </Button>
          </div>

          <div
            role="listbox"
            aria-multiselectable="true"
            style={{
              maxHeight: "16rem",
              overflowY: "auto",
              display: "grid",
              gap: "0.25rem",
            }}
          >
            {filteredOptions.length === 0 && (
              <div
                style={{
                  padding: "0.75rem",
                  fontSize: "0.875rem",
                  color: "var(--color-text-secondary)",
                }}
              >
                {emptyMessage}
              </div>
            )}

            {filteredOptions.map((option) => {
              const selected = selectedValueSet.has(option.value);

              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => toggleValue(option.value)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                    width: "100%",
                    padding: "0.5rem 0.625rem",
                    border: 0,
                    borderRadius: "0.5rem",
                    background: selected ? "var(--color-surface-muted, ButtonFace)" : "transparent",
                    color: "var(--color-text, ButtonText)",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: "0.875rem",
                  }}
                >
                  <span>{option.label}</span>
                  {selected && <span aria-hidden="true">✓</span>}
                </button>
              );
            })}
          </div>

          {selectedOptions.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.375rem",
                marginTop: "0.5rem",
                paddingTop: "0.5rem",
                borderTop: "1px solid var(--color-border, ButtonBorder)",
              }}
            >
              {selectedOptions.slice(0, 4).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggleValue(option.value)}
                  title={`Remove ${option.label}`}
                  style={{
                    border: "1px solid var(--color-border, ButtonBorder)",
                    borderRadius: "999px",
                    background: "transparent",
                    color: "var(--color-text, ButtonText)",
                    cursor: "pointer",
                    fontSize: "0.75rem",
                    padding: "0.25rem 0.5rem",
                  }}
                >
                  {option.label} ×
                </button>
              ))}

              {selectedOptions.length > 4 && (
                <span
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--color-text-secondary)",
                    padding: "0.25rem 0",
                  }}
                >
                  +{selectedOptions.length - 4} more
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
