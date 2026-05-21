import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';

import { Button, Card, Input, Modal, ModalFooter, notify } from '@/components/ui';
import { api } from '@/lib/api';
import { SectionHeader } from './SectionHeader';

interface TagData {
  id: string;
  name: string;
  color: string;
  transactionCount: number;
}

interface TagModalState {
  mode: 'add' | 'edit';
  tag?: TagData;
}

const TAG_PRESET_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6'];

export function TagsSection() {
  const queryClient = useQueryClient();
  const [modal, setModal] = useState<TagModalState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TagData | null>(null);
  const [tagName, setTagName] = useState('');
  const [tagColor, setTagColor] = useState(TAG_PRESET_COLORS[4]);
  const [tagError, setTagError] = useState('');

  const { data: tags, isLoading } = useQuery<TagData[]>({
    queryKey: ['settings', 'tags'],
    queryFn: () => api.get('/settings/tags').then((response) => response.data),
  });

  function openAdd() {
    setTagName('');
    setTagColor(TAG_PRESET_COLORS[4]);
    setTagError('');
    setModal({ mode: 'add' });
  }

  function openEdit(tag: TagData) {
    setTagName(tag.name);
    setTagColor(tag.color);
    setTagError('');
    setModal({ mode: 'edit', tag });
  }

  function closeModal() {
    setModal(null);
    setTagError('');
  }

  const createMutation = useMutation({
    mutationFn: () => api.post('/settings/tags', { name: tagName, color: tagColor }),
    onSuccess: () => {
      notify.success('Tag created');
      queryClient.invalidateQueries({ queryKey: ['settings', 'tags'] });
      closeModal();
    },
    onError: () => setTagError('Failed to create tag.'),
  });

  const updateMutation = useMutation({
    mutationFn: () => api.put(`/settings/tags/${modal?.tag?.id}`, { name: tagName, color: tagColor }),
    onSuccess: () => {
      notify.success('Tag updated');
      queryClient.invalidateQueries({ queryKey: ['settings', 'tags'] });
      closeModal();
    },
    onError: () => setTagError('Failed to update tag.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/settings/tags/${id}`),
    onSuccess: () => {
      notify.success('Tag deleted');
      queryClient.invalidateQueries({ queryKey: ['settings', 'tags'] });
      setDeleteTarget(null);
    },
    onError: () => {
      notify.error('Failed to delete tag');
      setDeleteTarget(null);
    },
  });

  function handleSave() {
    setTagError('');
    if (!tagName.trim()) {
      setTagError('Name is required.');
      return;
    }

    if (modal?.mode === 'edit') updateMutation.mutate();
    else createMutation.mutate();
  }

  if (isLoading) {
    return (
      <div>
        <SectionHeader title="Tags" description="Manage transaction tags." />
        <div className="text-[var(--color-text-muted)] text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <SectionHeader title="Tags" description="Manage transaction tags." inline />
        <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={openAdd}>
          New Tag
        </Button>
      </div>

      <Card padding="none">
        {(!tags || tags.length === 0) ? (
          <div className="p-8 text-center text-[var(--color-text-muted)] text-sm">
            No tags yet. Create one to start organizing transactions.
          </div>
        ) : (
          tags.map((tag, idx) => (
            <div
              key={tag.id}
              className="flex items-center gap-3 px-4 py-2.5"
              style={{ borderBottom: idx < tags.length - 1 ? '1px solid var(--color-border)' : 'none' }}
            >
              <div
                className="w-4 h-4 rounded-[var(--radius-full)] shrink-0"
                style={{ backgroundColor: tag.color }}
              />
              <span className="flex-1 text-sm text-[var(--color-text)] font-medium">
                {tag.name}
              </span>
              <span className="text-xs font-semibold text-[var(--color-text-muted)] bg-[var(--color-surface-hover)] rounded-[var(--radius-full)] px-2 py-0.5">
                {tag.transactionCount} {tag.transactionCount === 1 ? 'tx' : 'txs'}
              </span>
              <Button
                variant="ghost"
                size="sm"
                icon={<Pencil size={13} />}
                onClick={() => openEdit(tag)}
                className="text-[var(--color-text-secondary)]"
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 size={13} />}
                onClick={() => setDeleteTarget(tag)}
                className="text-[var(--color-danger)]"
              >
                Delete
              </Button>
            </div>
          ))
        )}
      </Card>

      <Modal
        open={!!modal}
        onClose={closeModal}
        title={modal?.mode === 'edit' ? 'Edit Tag' : 'New Tag'}
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Name"
            value={tagName}
            onChange={(event) => setTagName(event.target.value)}
            placeholder="e.g. Business"
            error={tagError || undefined}
          />
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
              Color
            </label>
            <div className="flex gap-2">
              {TAG_PRESET_COLORS.map((color) => (
                <div
                  key={color}
                  onClick={() => setTagColor(color)}
                  className="w-7 h-7 rounded-[var(--radius-full)] cursor-pointer transition-[outline] duration-100"
                  style={{
                    backgroundColor: color,
                    outline: tagColor === color ? `3px solid ${color}` : '3px solid transparent',
                    outlineOffset: 2,
                  }}
                />
              ))}
            </div>
          </div>
          <ModalFooter>
            <Button variant="ghost" onClick={closeModal}>Cancel</Button>
            <Button
              variant="primary"
              loading={createMutation.isPending || updateMutation.isPending}
              onClick={handleSave}
            >
              {modal?.mode === 'edit' ? 'Save' : 'Create'}
            </Button>
          </ModalFooter>
        </div>
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Tag"
        size="sm"
      >
        <p className="text-sm text-[var(--color-text)]">
          This tag will be removed from all transactions. Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?
        </p>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button
            variant="danger"
            loading={deleteMutation.isPending}
            onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
          >
            Delete
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
