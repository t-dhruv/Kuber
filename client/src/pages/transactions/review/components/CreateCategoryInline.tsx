import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, Input, Select, notify } from '@/components/ui';

interface Props {
  suggestedName: string;
  onCreated: (categoryId: string, categoryName: string) => void;
  onCancel: () => void;
}

const TYPE_OPTIONS = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
];

export function CreateCategoryInline({ suggestedName, onCreated, onCancel }: Props) {
  const qc = useQueryClient();
  const [name, setName] = useState(suggestedName);
  const [type, setType] = useState('expense');
  const [emoji, setEmoji] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/categories', { name: name.trim(), type, emoji: emoji || null }).then((r) => r.data),
    onSuccess: (cat) => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      notify.success(`Category "${cat.name}" created`);
      onCreated(cat.id, cat.name);
    },
    onError: () => notify.error('Failed to create category'),
  });

  return (
    <div className="flex items-center gap-2 mt-2 p-3 rounded-[var(--radius-md)] bg-[var(--color-surface-hover)] border border-[var(--color-border)]">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Category name"
        className="w-40"
      />
      <Select
        value={type}
        onChange={(e) => setType(e.target.value)}
        options={TYPE_OPTIONS}
        className="w-32"
      />
      <Input
        value={emoji}
        onChange={(e) => setEmoji(e.target.value)}
        placeholder="Emoji (optional)"
        className="w-24"
        maxLength={4}
      />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={!name.trim() || mutation.isPending}>
        Create
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}
