import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, Input, Select, notify, Modal, ModalFooter } from '@/components/ui';
import { IconPicker } from '@/components/ui/IconPicker';

interface Props {
  suggestedName: string;
  onCreated: (categoryId: string) => void;
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
  const [iconId, setIconId] = useState<string | null>(null);
  const [showIconPicker, setShowIconPicker] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/categories', { name: name.trim(), type, icon: iconId }).then((r) => r.data),
    onSuccess: (cat) => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      notify.success(`Category "${cat.name}" created`);
      onCreated(cat.id);
    },
    onError: () => notify.error('Failed to create category'),
  });

  return (
    <div className="flex items-center gap-2 mt-2 p-3 rounded-[var(--radius-md)] bg-[var(--color-surface-hover)] border border-[var(--color-border)]">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Category name"
        className="flex-1"
      />
      <Select
        value={type}
        onChange={(e) => setType(e.target.value)}
        options={TYPE_OPTIONS}
        className="w-32"
      />
      <Button
        size="sm"
        variant="secondary"
        onClick={() => setShowIconPicker(true)}
        className="w-10 p-2"
        aria-label="Select icon"
      >
        {iconId ? (
          <IconPicker.IconDisplay iconId={iconId} size={18} />
        ) : (
          <span className="text-xs text-[var(--color-text-muted)]">Icon</span>
        )}
      </Button>
      <Button size="sm" onClick={() => mutation.mutate()} disabled={!name.trim() || mutation.isPending}>
        Create
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>

      <Modal
        open={showIconPicker}
        onClose={() => setShowIconPicker(false)}
        title="Select Icon"
        size="sm"
      >
        <IconPicker value={iconId} onChange={setIconId} />
        <ModalFooter>
          <Button size="sm" onClick={() => setShowIconPicker(false)}>Done</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
