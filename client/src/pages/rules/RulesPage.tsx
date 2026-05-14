import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  Pencil,
  Play,
  PlayCircle,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  Button,
  Card,
  Input,
  Select,
  Modal,
  ModalFooter,
  notify,
  CategoryCombobox,
  SegmentControl,
  ConfirmDialog,
} from "@/components/ui";

// ─── Types ────────────────────────────────────────────────────────────────────

type ConditionField = "merchantName" | "description" | "amount";
type ConditionOperator =
  | "contains"
  | "equals"
  | "startsWith"
  | "endsWith"
  | "gt"
  | "lt"
  | "gte"
  | "lte";
type ActionType = "setCategory" | "addTag" | "hide" | "markReviewed";

interface RuleCondition {
  field: ConditionField;
  operator: ConditionOperator;
  value: string;
}

interface RuleAction {
  type: ActionType;
  value?: string;
}

interface Rule {
  id: string;
  name: string;
  conditions: RuleCondition[];
  actions: RuleAction[];
  strict: boolean;
  isActive: boolean;
  sortOrder: number;
  matchCount?: number;
}

interface Category {
  id: string;
  name: string;
  icon: string | null;
}

// ─── Options ──────────────────────────────────────────────────────────────────

const FIELD_OPTIONS = [
  { value: "merchantName", label: "Merchant name" },
  { value: "description", label: "Description" },
  { value: "amount", label: "Amount" },
];

const STRING_OPERATORS = [
  { value: "contains", label: "contains" },
  { value: "equals", label: "equals" },
  { value: "startsWith", label: "starts with" },
  { value: "endsWith", label: "ends with" },
];

const NUMBER_OPERATORS = [
  { value: "gt", label: "is greater than" },
  { value: "lt", label: "is less than" },
  { value: "gte", label: "is ≥" },
  { value: "lte", label: "is ≤" },
  { value: "equals", label: "equals" },
];

const ACTION_TYPE_OPTIONS = [
  { value: "setCategory", label: "Set category" },
  { value: "addTag", label: "Add tag" },
  { value: "hide", label: "Hide transaction" },
  { value: "markReviewed", label: "Mark as reviewed" },
];

function getOperatorOptions(field: ConditionField) {
  return field === "amount" ? NUMBER_OPERATORS : STRING_OPERATORS;
}

function generateRuleName(
  conditions: RuleCondition[],
  actions: RuleAction[],
  categories: Category[] = [],
): string {
  const condition = conditions[0];
  const action = actions[0];
  if (!condition && !action) return "Untitled rule";

  const conditionText = condition ? conditionLabel(condition) : "";
  const actionText = action ? actionLabel(action, categories) : "";
  if (!conditionText) return actionText;
  if (!actionText) return conditionText;
  return `${conditionText} -> ${actionText}`;
}

// ─── Rule Builder ─────────────────────────────────────────────────────────────

interface RuleFormState {
  name: string;
  strict: boolean;
  conditions: RuleCondition[];
  actions: RuleAction[];
}

const EMPTY_CONDITION: RuleCondition = {
  field: "merchantName",
  operator: "contains",
  value: "",
};
const EMPTY_ACTION: RuleAction = { type: "setCategory", value: "" };

function defaultForm(): RuleFormState {
  return {
    name: "",
    strict: true,
    conditions: [{ ...EMPTY_CONDITION }],
    actions: [{ ...EMPTY_ACTION }],
  };
}

function RuleBuilderModal({
  open,
  onClose,
  initial,
  categories,
  onSave,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  initial: RuleFormState;
  categories: Category[];
  onSave: (form: RuleFormState) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<RuleFormState>(initial);
  const [error, setError] = useState("");

  // Sync when modal opens with new initial (e.g. prefill from URL)
  useEffect(() => {
    if (open) {
      setForm(initial);
      setError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function updateCondition(i: number, patch: Partial<RuleCondition>) {
    setForm((f) => {
      const conditions = f.conditions.map((c, idx) =>
        idx === i ? { ...c, ...patch } : c,
      );
      // Reset operator if field type changes
      if (patch.field) {
        const ops = getOperatorOptions(patch.field);
        if (!ops.find((o) => o.value === conditions[i].operator)) {
          conditions[i].operator = ops[0].value as ConditionOperator;
        }
      }
      return { ...f, conditions };
    });
  }

  function updateAction(i: number, patch: Partial<RuleAction>) {
    setForm((f) => ({
      ...f,
      actions: f.actions.map((a, idx) => (idx === i ? { ...a, ...patch } : a)),
    }));
  }

  function handleSave() {
    setError("");
    if (form.conditions.some((c) => !c.value.trim())) {
      setError("All condition values must be filled in.");
      return;
    }
    if (
      form.actions.some(
        (a) =>
          (a.type === "setCategory" || a.type === "addTag") && !a.value?.trim(),
      )
    ) {
      setError("All action values must be filled in.");
      return;
    }
    onSave({
      ...form,
      name: form.name.trim() || generateRuleName(form.conditions, form.actions, categories),
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial.name ? "Edit Rule" : "New Rule"}
      size="xl"
    >
      <div className="flex flex-col gap-5">
        <Input
          label="Rule name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder={generateRuleName(form.conditions, form.actions, categories)}
        />

        {/* Conditions */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="text-sm font-semibold text-[var(--color-text)]">
              When…
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[var(--color-text-muted)]">
                Match
              </span>
              <SegmentControl
                size="sm"
                value={form.strict ? "all" : "any"}
                onChange={(value) =>
                  setForm((f) => ({ ...f, strict: value === "all" }))
                }
                options={[
                  { value: "all", label: "All" },
                  { value: "any", label: "Any" },
                ]}
              />
            </div>
          </div>
          <div className="flex flex-col gap-3">
            {form.conditions.map((cond, i) => (
              <div key={i} className="flex flex-col gap-1.5">
                {i > 0 && (
                  <div className="text-[0.6875rem] font-semibold text-[var(--color-text-muted)]">
                    {form.strict ? "AND" : "OR"}
                  </div>
                )}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(8.5rem,1fr)_minmax(8.5rem,1fr)_minmax(10rem,1.35fr)_auto] sm:items-end">
                  <Select
                    label={i === 0 ? "Field" : undefined}
                    value={cond.field}
                    options={FIELD_OPTIONS}
                    onChange={(e) =>
                      updateCondition(i, {
                        field: e.target.value as ConditionField,
                      })
                    }
                  />
                  <Select
                    label={i === 0 ? "Operator" : undefined}
                    value={cond.operator}
                    options={getOperatorOptions(cond.field)}
                    onChange={(e) =>
                      updateCondition(i, {
                        operator: e.target.value as ConditionOperator,
                      })
                    }
                  />
                  <Input
                    label={i === 0 ? "Value" : undefined}
                    value={cond.value}
                    onChange={(e) =>
                      updateCondition(i, { value: e.target.value })
                    }
                    placeholder={cond.field === "amount" ? "100" : "Amazon"}
                    type={cond.field === "amount" ? "number" : "text"}
                  />
                  {form.conditions.length > 1 && (
                    <button
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          conditions: f.conditions.filter(
                            (_, idx) => idx !== i,
                          ),
                        }))
                      }
                      className="justify-self-start sm:justify-self-auto bg-transparent border-none cursor-pointer text-[var(--color-danger)] px-1 py-2"
                      aria-label="Remove condition"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  conditions: [...f.conditions, { ...EMPTY_CONDITION }],
                }))
              }
              className="self-start bg-transparent border-none cursor-pointer text-[var(--color-accent)] text-[0.8125rem] font-medium flex items-center gap-1 p-0"
            >
              <Plus size={13} /> Add condition
            </button>
          </div>
        </div>

        {/* Actions */}
        <div>
          <div className="text-sm font-semibold text-[var(--color-text)] mb-2">
            Then…
          </div>
          <div className="flex flex-col gap-2">
            {form.actions.map((action, i) => (
              <div
                key={i}
                className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(10rem,0.85fr)_minmax(12rem,1fr)_auto] sm:items-end"
              >
                <Select
                  label={i === 0 ? "Action" : undefined}
                  value={action.type}
                  options={ACTION_TYPE_OPTIONS}
                  onChange={(e) =>
                    updateAction(i, {
                      type: e.target.value as ActionType,
                      value: "",
                    })
                  }
                />
                {action.type === "setCategory" && (
                  <CategoryCombobox
                    label={i === 0 ? "Category" : undefined}
                    categories={categories}
                    value={action.value ?? ""}
                    onChange={(id) => updateAction(i, { value: id })}
                  />
                )}
                {action.type === "addTag" && (
                  <Input
                    label={i === 0 ? "Tag" : undefined}
                    value={action.value ?? ""}
                    onChange={(e) =>
                      updateAction(i, { value: e.target.value })
                    }
                    placeholder="e.g. work-expense"
                  />
                )}
                {(action.type === "hide" || action.type === "markReviewed") && (
                  <div className="text-[0.8125rem] text-[var(--color-text-muted)] pb-1.5">
                    (no additional value needed)
                  </div>
                )}
                {form.actions.length > 1 && (
                  <button
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        actions: f.actions.filter((_, idx) => idx !== i),
                      }))
                    }
                    className="justify-self-start sm:justify-self-auto bg-transparent border-none cursor-pointer text-[var(--color-danger)] px-1 py-2"
                    aria-label="Remove action"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  actions: [...f.actions, { ...EMPTY_ACTION }],
                }))
              }
              className="self-start bg-transparent border-none cursor-pointer text-[var(--color-accent)] text-[0.8125rem] font-medium flex items-center gap-1 p-0"
            >
              <Plus size={13} /> Add action
            </button>
          </div>
        </div>

        {error && (
          <div className="px-2.5 py-2.5 rounded-[var(--radius-md)] bg-[var(--color-danger-light)] text-[var(--color-danger)] text-sm">
            {error}
          </div>
        )}

        <ModalFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={saving} onClick={handleSave}>
            Save rule
          </Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}

// ─── Rule Row ─────────────────────────────────────────────────────────────────

function conditionLabel(c: RuleCondition): string {
  const field =
    FIELD_OPTIONS.find((f) => f.value === c.field)?.label ?? c.field;
  const ops = [...STRING_OPERATORS, ...NUMBER_OPERATORS];
  const op = ops.find((o) => o.value === c.operator)?.label ?? c.operator;
  return `${field} ${op} "${c.value}"`;
}

function actionLabel(a: RuleAction, categories: Category[]): string {
  switch (a.type) {
    case "setCategory": {
      const cat = categories.find((c) => c.id === a.value);
      return `Set category → ${cat ? `${cat.icon ?? ""} ${cat.name}`.trim() : a.value}`;
    }
    case "addTag":
      return `Add tag "${a.value}"`;
    case "hide":
      return "Hide transaction";
    case "markReviewed":
      return "Mark as reviewed";
  }
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RulesPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [modal, setModal] = useState<{
    mode: "add" | "edit";
    rule?: Rule;
  } | null>(null);
  const [prefillForm, setPrefillForm] = useState<RuleFormState | null>(null);

  useEffect(() => {
    const raw = searchParams.get("prefill");
    if (!raw) return;
    try {
      const parsed = JSON.parse(decodeURIComponent(raw));
      const form = defaultForm();
      if (parsed.name) form.name = parsed.name;
      if (parsed.field) form.conditions[0].field = parsed.field;
      if (parsed.operator) form.conditions[0].operator = parsed.operator;
      if (parsed.value) form.conditions[0].value = parsed.value;
      if (parsed.categoryId) {
        form.actions[0].type = "setCategory";
        form.actions[0].value = parsed.categoryId;
      }
      setPrefillForm(form);
      setModal({ mode: "add" });
      setSearchParams({}, { replace: true });
    } catch {
      // ignore malformed prefill
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [applyTarget, setApplyTarget] = useState<Rule | null>(null);
  const [applyAllConfirm, setApplyAllConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Rule | null>(null);

  const { data: rules = [], isLoading } = useQuery<Rule[]>({
    queryKey: ["rules"],
    queryFn: () => api.get("/rules").then((r) => r.data),
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["categories"],
    queryFn: () => api.get("/categories").then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: Omit<Rule, "id" | "isActive" | "sortOrder">) =>
      api.post("/rules", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rules"] });
      setModal(null);
      notify.success("Rule created");
    },
    onError: () => notify.error("Failed to create rule"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Rule> }) =>
      api.put(`/rules/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rules"] });
      setModal(null);
      notify.success("Rule saved");
    },
    onError: () => notify.error("Failed to save rule"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/rules/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rules"] });
      setDeleteTarget(null);
      notify.success("Rule deleted");
    },
    onError: () => notify.error("Failed to delete rule"),
  });

  const applyMutation = useMutation({
    mutationFn: (id: string) =>
      api.post<{ matched: number }>(`/rules/${id}/apply`).then((r) => r.data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["budget"] });
      setApplyTarget(null);
      notify.success(
        `Rule applied`,
        `Updated ${data.matched} transaction${data.matched !== 1 ? "s" : ""}`,
      );
    },
    onError: () => notify.error("Failed to apply rule"),
  });

  const applyAllMutation = useMutation({
    mutationFn: () =>
      api
        .post<{ totalMatched?: number; matched?: number }>("/rules/apply-all")
        .then((r) => r.data),
    onSuccess: (data) => {
      const matched = data.totalMatched ?? data.matched ?? 0;
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["budget"] });
      setApplyAllConfirm(false);
      notify.success(
        "All rules applied",
        `Updated ${matched} transaction${matched !== 1 ? "s" : ""}`,
      );
    },
    onError: () => notify.error("Failed to apply rules"),
  });

  function handleSave(form: RuleFormState) {
    if (modal?.mode === "edit" && modal.rule) {
      updateMutation.mutate({
        id: modal.rule.id,
        data: {
          name: form.name,
          strict: form.strict,
          conditions: form.conditions,
          actions: form.actions,
        },
      });
    } else {
      createMutation.mutate({
        name: form.name,
        strict: form.strict,
        conditions: form.conditions,
        actions: form.actions,
      });
    }
  }

  function handleReorder(id: string, direction: "up" | "down") {
    const sorted = [...rules].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex((r) => r.id === id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const newOrder = sorted.map((r, i) => {
      if (i === idx) return { id: r.id, sortOrder: sorted[swapIdx].sortOrder };
      if (i === swapIdx) return { id: r.id, sortOrder: sorted[idx].sortOrder };
      return { id: r.id, sortOrder: r.sortOrder };
    });
    api
      .put("/rules/reorder", { order: newOrder })
      .then(() => queryClient.invalidateQueries({ queryKey: ["rules"] }))
      .catch(() => notify.error("Failed to reorder rules"));
  }

  const sortedRules = [...rules].sort((a, b) => a.sortOrder - b.sortOrder);

  const initialForm: RuleFormState =
    modal?.mode === "edit" && modal.rule
      ? {
          name: modal.rule.name,
          strict: modal.rule.strict ?? true,
          conditions: modal.rule.conditions,
          actions: modal.rule.actions,
        }
      : (prefillForm ?? defaultForm());

  return (
    <div className="max-w-[760px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text)] m-0">
            Rules
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            Automatically categorize, tag, or hide transactions based on
            conditions.
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            size="sm"
            icon={<PlayCircle size={15} />}
            disabled={rules.length === 0}
            onClick={() => setApplyAllConfirm(true)}
          >
            Apply all
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={15} />}
            onClick={() => setModal({ mode: "add" })}
          >
            New rule
          </Button>
        </div>
      </div>

      {/* Rule list */}
      {isLoading ? (
        <div className="text-[var(--color-text-muted)] text-sm">Loading…</div>
      ) : sortedRules.length === 0 ? (
        <Card
          padding="lg"
          className="text-center text-[var(--color-text-muted)]"
        >
          <p className="mb-4">
            No rules yet. Create your first rule to automate transaction
            categorization.
          </p>
          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={15} />}
            onClick={() => setModal({ mode: "add" })}
          >
            New rule
          </Button>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {sortedRules.map((rule, idx) => (
            <Card key={rule.id} padding="md">
              <div className="flex gap-3 items-start">
                {/* Reorder buttons */}
                <div className="flex flex-col gap-0.5 shrink-0 mt-0.5">
                  <button
                    onClick={() => handleReorder(rule.id, "up")}
                    disabled={idx === 0}
                    className="bg-transparent border-none px-0.5"
                    style={{
                      cursor: idx === 0 ? "not-allowed" : "pointer",
                      color:
                        idx === 0
                          ? "var(--color-border)"
                          : "var(--color-text-muted)",
                    }}
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    onClick={() => handleReorder(rule.id, "down")}
                    disabled={idx === sortedRules.length - 1}
                    className="bg-transparent border-none px-0.5"
                    style={{
                      cursor:
                        idx === sortedRules.length - 1
                          ? "not-allowed"
                          : "pointer",
                      color:
                        idx === sortedRules.length - 1
                          ? "var(--color-border)"
                          : "var(--color-text-muted)",
                    }}
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="font-semibold text-[0.9375rem] text-[var(--color-text)]">
                      {rule.name.trim() || generateRuleName(rule.conditions, rule.actions, categories)}
                    </span>
                    <span
                      className="text-[0.6875rem] font-semibold px-[0.4rem] py-0.5 rounded-full"
                      style={{
                        backgroundColor: rule.isActive
                          ? "var(--color-success-light, #dcfce7)"
                          : "var(--color-surface-hover)",
                        color: rule.isActive
                          ? "var(--color-success, #16a34a)"
                          : "var(--color-text-muted)",
                      }}
                    >
                      {rule.isActive ? "Active" : "Disabled"}
                    </span>
                    {rule.matchCount !== undefined && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text-muted)' }}>
                        {rule.matchCount} matched
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    <span className="text-[0.6875rem] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">IF</span>
                    {rule.conditions.map((c, i) => {
                      const field = FIELD_OPTIONS.find((f) => f.value === c.field)?.label ?? c.field;
                      const ops = [...STRING_OPERATORS, ...NUMBER_OPERATORS];
                      const op = ops.find((o) => o.value === c.operator)?.label ?? c.operator;
                      return (
                        <span key={i} className="inline-flex items-center gap-1" style={{
                          background: 'var(--color-surface-alt)',
                          border: '1px solid var(--color-border)',
                          borderRadius: 'var(--radius-full)',
                          fontSize: 11,
                          padding: '3px 8px',
                        }}>
                          <span style={{ color: 'var(--color-text-muted)' }}>{field}</span>
                          <span style={{ color: 'var(--color-text)' }}> {op} </span>
                          <span style={{ color: 'var(--color-text)', fontWeight: 700 }}>"{c.value}"</span>
                          {i < rule.conditions.length - 1 && (
                            <span style={{ color: 'var(--color-text-muted)', marginLeft: 4, fontWeight: 600 }}>
                              {(rule.strict ?? true) ? "AND" : "OR"}
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <span className="text-[0.6875rem] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">THEN</span>
                    {rule.actions.map((a, i) => (
                      <span key={i} style={{
                        background: 'var(--color-accent-light)',
                        color: 'var(--color-accent)',
                        border: '1px solid var(--color-accent-light)',
                        borderRadius: 'var(--radius-full)',
                        fontSize: 11,
                        padding: '3px 8px',
                        fontWeight: 500,
                      }}>
                        {actionLabel(a, categories)}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-1.5 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Play size={13} />}
                    onClick={() => setApplyTarget(rule)}
                    title="Apply to existing transactions"
                  >
                    Apply
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Pencil size={13} />}
                    onClick={() => setModal({ mode: "edit", rule })}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Trash2 size={13} />}
                    className="text-[var(--color-danger)]"
                    onClick={() => setDeleteTarget(rule)}
                    loading={
                      deleteMutation.isPending &&
                      deleteMutation.variables === rule.id
                    }
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* New/Edit Rule Modal */}
      {modal && (
        <RuleBuilderModal
          open={!!modal}
          onClose={() => {
            setModal(null);
            setPrefillForm(null);
          }}
          initial={initialForm}
          categories={categories}
          onSave={handleSave}
          saving={createMutation.isPending || updateMutation.isPending}
        />
      )}

      {/* Apply single rule confirm */}
      <Modal
        open={!!applyTarget}
        onClose={() => setApplyTarget(null)}
        title="Apply Rule"
        size="sm"
      >
        <p className="text-sm text-[var(--color-text)] mb-2">
          Apply <strong>{applyTarget?.name}</strong> to all existing
          transactions?
        </p>
        <p className="text-[0.8125rem] text-[var(--color-text-secondary)]">
          Matching transactions will be updated immediately.
        </p>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setApplyTarget(null)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={applyMutation.isPending}
            onClick={() => applyTarget && applyMutation.mutate(applyTarget.id)}
          >
            Apply rule
          </Button>
        </ModalFooter>
      </Modal>

      {/* Apply all confirm */}
      <Modal
        open={applyAllConfirm}
        onClose={() => setApplyAllConfirm(false)}
        title="Apply All Rules"
        size="sm"
      >
        <p className="text-sm text-[var(--color-text)] mb-2">
          Apply all {rules.length} active rule{rules.length !== 1 ? "s" : ""} to
          all existing transactions?
        </p>
        <p className="text-[0.8125rem] text-[var(--color-text-secondary)]">
          Rules are applied in order. This may update many transactions.
        </p>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setApplyAllConfirm(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={applyAllMutation.isPending}
            onClick={() => applyAllMutation.mutate()}
          >
            Apply all rules
          </Button>
        </ModalFooter>
      </Modal>
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Delete Rule"
        message={<>Delete <strong>{deleteTarget?.name}</strong>? This cannot be undone.</>}
        confirmLabel="Delete rule"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
