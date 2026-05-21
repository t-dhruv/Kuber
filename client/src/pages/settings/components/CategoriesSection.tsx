import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, EyeOff, Pencil, Plus, Receipt, Trash2 } from 'lucide-react';

import { Button, Card, Input, Modal, ModalFooter, notify, Select } from '@/components/ui';
import { EmojiPicker } from '@/components/ui/EmojiPicker';
import { api } from '@/lib/api';
import { getApiErrorMessage, getApiErrorStatus } from '@/lib/apiError';
import { SectionHeader } from './SectionHeader';

type BucketType = 'needs' | 'wants' | 'savings' | 'uncategorized';
type CategoryKind = 'expense' | 'income' | 'transfer';

interface Category {
  id: string;
  name: string;
  icon: string | null;
  groupId: string | null;
  groupName: string | null;
  group?: { id: string; name: string } | null;
  isTaxDeductible?: boolean;
  excludeFromReports?: boolean;
}

interface CategoryGroup {
  id: string | null;
  name: string;
  categories: Category[];
}

interface CategoryGroupResponse {
  id: string;
  name: string;
  type: CategoryKind;
  categoryCount: number;
}

interface CategoryBucket {
  id: string;
  name: string;
  icon: string | null;
  bucketType: string;
}

interface CategoryModalState {
  mode: 'add' | 'edit';
  category?: Category;
}

const BUCKET_COLORS: Record<BucketType, { bg: string; text: string; label: string }> = {
  needs: { bg: '#dbeafe', text: '#1d4ed8', label: 'Needs' },
  wants: { bg: '#ffedd5', text: '#c2410c', label: 'Wants' },
  savings: { bg: '#dcfce7', text: '#15803d', label: 'Savings' },
  uncategorized: { bg: '#f1f5f9', text: '#64748b', label: 'Unset' },
};

const CATEGORY_TYPE_OPTIONS = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
];

function toCategoryKind(value: string): CategoryKind {
  if (value === 'income' || value === 'transfer') return value;
  return 'expense';
}

export function CategoriesSection() {
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [modal, setModal] = useState<CategoryModalState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<{ id: string; name: string } | null>(null);
  const [editingBucket, setEditingBucket] = useState<string | null>(null);
  const [showGroupManager, setShowGroupManager] = useState(false);
  const [catName, setCatName] = useState('');
  const [catIcon, setCatIcon] = useState('');
  const [catGroup, setCatGroup] = useState('');
  const [catError, setCatError] = useState('');
  const [catType, setCatType] = useState<CategoryKind>('expense');
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupType, setNewGroupType] = useState<CategoryKind>('expense');

  const { data: rawCategories, isLoading } = useQuery<Category[]>({
    queryKey: ['settings', 'categories'],
    queryFn: () => api.get('/settings/categories').then((response) => response.data),
  });

  const { data: groups } = useQuery<CategoryGroupResponse[]>({
    queryKey: ['settings', 'category-groups'],
    queryFn: () => api.get('/settings/category-groups').then((response) => response.data),
  });

  const { data: buckets } = useQuery<CategoryBucket[]>({
    queryKey: ['wealth', 'category-buckets'],
    queryFn: () => api.get('/wealth/category-buckets').then((response) => response.data),
  });

  const bucketMap = new Map<string, BucketType>(
    (buckets ?? []).map((bucket) => [bucket.id, (bucket.bucketType as BucketType) ?? 'uncategorized'])
  );

  const updateBucketMutation = useMutation({
    mutationFn: ({ categoryId, bucketType }: { categoryId: string; bucketType: BucketType }) =>
      api.put('/wealth/category-buckets', { categoryId, bucketType }),
    onMutate: async ({ categoryId, bucketType }) => {
      await queryClient.cancelQueries({ queryKey: ['wealth', 'category-buckets'] });
      const prev = queryClient.getQueryData<CategoryBucket[]>(['wealth', 'category-buckets']);
      queryClient.setQueryData<CategoryBucket[]>(['wealth', 'category-buckets'], (old) =>
        (old ?? []).map((bucket) => (bucket.id === categoryId ? { ...bucket, bucketType } : bucket))
      );
      return { prev };
    },
    onError: (_error, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['wealth', 'category-buckets'], ctx.prev);
      notify.error('Failed to update bucket');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['wealth', 'category-buckets'] });
      queryClient.invalidateQueries({ queryKey: ['wealth', 'analysis'] });
      setEditingBucket(null);
    },
  });

  const toggleExcludeMutation = useMutation({
    mutationFn: ({ categoryId, excludeFromReports }: { categoryId: string; excludeFromReports: boolean }) =>
      api.put(`/settings/categories/${categoryId}`, { excludeFromReports }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'categories'] });
    },
    onError: () => {
      notify.error('Failed to update report exclusion');
    },
  });

  const toggleTaxMutation = useMutation({
    mutationFn: ({ categoryId, isTaxDeductible }: { categoryId: string; isTaxDeductible: boolean }) =>
      api.put(`/settings/categories/${categoryId}`, { isTaxDeductible }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'categories'] });
    },
    onError: () => {
      notify.error('Failed to update tax setting');
    },
  });

  const resetBucketsMutation = useMutation({
    mutationFn: () => api.post('/wealth/category-buckets/reset'),
    onSuccess: () => {
      notify.success('Buckets reset to defaults');
      queryClient.invalidateQueries({ queryKey: ['wealth', 'category-buckets'] });
      queryClient.invalidateQueries({ queryKey: ['wealth', 'analysis'] });
    },
    onError: () => notify.error('Failed to reset buckets'),
  });

  const createGroupMutation = useMutation({
    mutationFn: () => api.post('/settings/category-groups', { name: newGroupName, type: newGroupType }),
    onSuccess: () => {
      notify.success('Group created');
      setNewGroupName('');
      queryClient.invalidateQueries({ queryKey: ['settings', 'category-groups'] });
      queryClient.invalidateQueries({ queryKey: ['settings', 'categories'] });
    },
    onError: () => notify.error('Failed to create group'),
  });

  const deleteGroupMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/settings/category-groups/${id}`),
    onSuccess: () => {
      notify.success('Group deleted');
      queryClient.invalidateQueries({ queryKey: ['settings', 'category-groups'] });
      queryClient.invalidateQueries({ queryKey: ['settings', 'categories'] });
      setDeleteGroupTarget(null);
    },
    onError: (error: unknown) => {
      notify.error(getApiErrorMessage(error, 'Failed to delete group'));
      setDeleteGroupTarget(null);
    },
  });

  function inferBucketType(name: string, icon: string): BucketType {
    const lowerName = name.toLowerCase();
    const text = `${lowerName} ${icon}`.toLowerCase();

    const needsKeywords = ['rent', 'mortgage', 'electric', 'water', 'gas', 'internet', 'phone', 'insurance',
      'groceries', 'fuel', 'transit', 'medical', 'medicine', 'doctor', 'dentist', 'pharmacy',
      'tax', 'property tax', 'maintenance', 'repair', 'minimum', 'payment', 'loan', 'debt',
      'childcare', 'education', 'tuition', 'school', 'daycare'];

    const wantsKeywords = ['restaurant', 'coffee', 'bar', 'alcohol', 'entertainment', 'movie', 'game', 'hobby',
      'shopping', 'clothing', 'fashion', 'travel', 'vacation', 'gift', 'subscription', 'streaming',
      'netflix', 'spotify', 'hulu', 'disney', 'gym', 'fitness', 'dining', 'takeout', 'delivery',
      'fast food', 'cable', 'tv', 'hobby', 'sport', 'concert', 'event'];

    const savingsKeywords = ['saving', 'investment', 'retirement', '401k', 'ira', 'bond', 'stock',
      'mutual fund', 'etf', 'crypto', 'bitcoin', 'emergency fund', 'college fund', 'down payment'];

    if (savingsKeywords.some((keyword) => text.includes(keyword))) return 'savings';
    if (needsKeywords.some((keyword) => text.includes(keyword))) return 'needs';
    if (wantsKeywords.some((keyword) => text.includes(keyword))) return 'wants';

    if (catType === 'income') return 'uncategorized';
    return 'wants';
  }

  const data: { groups: CategoryGroup[] } | undefined = rawCategories
    ? {
        groups: rawCategories.reduce((acc, category) => {
          const groupId = category.group?.id ?? null;
          const groupName = category.group?.name ?? 'Ungrouped';
          const existing = acc.find((group) => group.id === groupId);
          if (existing) {
            existing.categories.push(category);
          } else {
            acc.push({ id: groupId, name: groupName, categories: [category] });
          }
          return acc;
        }, [] as CategoryGroup[]),
      }
    : undefined;

  function openAdd(group?: string) {
    setCatName('');
    setCatIcon('');
    setCatGroup(group ?? '');
    setCatError('');
    setModal({ mode: 'add' });
  }

  function openEdit(category: Category) {
    setCatName(category.name);
    setCatIcon(category.icon ?? '');
    setCatGroup(category.group?.name ?? '');
    setCatError('');
    setModal({ mode: 'edit', category });
  }

  function closeModal() {
    setModal(null);
    setCatError('');
  }

  const createMutation = useMutation({
    mutationFn: () => {
      const resolvedGroupId = groups?.find((group) => group.name === catGroup)?.id ?? null;
      const inferredBucket = inferBucketType(catName, catIcon);
      return api.post('/settings/categories', {
        name: catName,
        icon: catIcon,
        groupId: resolvedGroupId,
        type: catType,
        bucketType: inferredBucket,
      });
    },
    onSuccess: () => {
      notify.success('Category created');
      queryClient.invalidateQueries({ queryKey: ['settings', 'categories'] });
      queryClient.invalidateQueries({ queryKey: ['wealth', 'category-buckets'] });
      closeModal();
    },
    onError: () => {
      setCatError('Failed to create category.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      const resolvedGroupId = groups?.find((group) => group.name === catGroup)?.id ?? null;
      return api.put(`/settings/categories/${modal?.category?.id}`, {
        name: catName,
        icon: catIcon,
        groupId: resolvedGroupId,
        type: catType,
      });
    },
    onSuccess: () => {
      notify.success('Category updated');
      queryClient.invalidateQueries({ queryKey: ['settings', 'categories'] });
      closeModal();
    },
    onError: () => {
      setCatError('Failed to update category.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/settings/categories/${id}`),
    onSuccess: () => {
      notify.success('Category deleted');
      queryClient.invalidateQueries({ queryKey: ['settings', 'categories'] });
      setDeleteTarget(null);
    },
    onError: (error: unknown) => {
      const status = getApiErrorStatus(error);
      if (status === 400) {
        notify.error('Category is in use by transactions');
      } else {
        notify.error('Failed to delete category');
      }
      setDeleteTarget(null);
    },
  });

  function handleSave() {
    setCatError('');
    if (!catName.trim()) {
      setCatError('Name is required.');
      return;
    }
    if (!catGroup.trim()) {
      setCatError('Group is required.');
      return;
    }
    if (modal?.mode === 'edit') updateMutation.mutate();
    else createMutation.mutate();
  }

  const groupOptions =
    groups?.map((group) => ({ value: group.name, label: group.name })) ?? [];

  if (isLoading) {
    return (
      <div>
        <SectionHeader title="Categories" description="Manage transaction categories." />
        <div className="text-[var(--color-text-muted)] text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
        <SectionHeader title="Categories" description="Manage transaction categories and 50/30/20 buckets." inline />
        <div className="flex gap-2 items-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowGroupManager(!showGroupManager)}
            className="text-[var(--color-text-muted)] text-[0.8125rem]"
          >
            {showGroupManager ? 'Hide' : 'Manage'} Groups
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => resetBucketsMutation.mutate()}
            loading={resetBucketsMutation.isPending}
            className="text-[var(--color-text-muted)] text-[0.8125rem]"
          >
            Reset buckets
          </Button>
          <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => openAdd()}>
            Add category
          </Button>
        </div>
      </div>

      {showGroupManager && (
        <Card className="mb-4 p-4">
          <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Manage Category Groups</h3>
          <div className="flex gap-2 mb-4">
            <Input
              value={newGroupName}
              onChange={(event) => setNewGroupName(event.target.value)}
              placeholder="New group name..."
              className="flex-1"
            />
            <Select
              value={newGroupType}
              onChange={(event) => setNewGroupType(toCategoryKind(event.target.value))}
              options={CATEGORY_TYPE_OPTIONS}
              className="w-32"
            />
            <Button
              variant="primary"
              size="sm"
              onClick={() => createGroupMutation.mutate()}
              loading={createGroupMutation.isPending}
              disabled={!newGroupName.trim()}
            >
              Add
            </Button>
          </div>
          <div className="flex flex-col gap-1">
            {(groups ?? []).map((group) => (
              <div key={group.id} className="flex items-center justify-between py-2 px-3 rounded hover:bg-[var(--color-surface)]">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-[var(--color-text)]">{group.name}</span>
                  <span className="text-xs text-[var(--color-text-muted)]">({group.type})</span>
                  <span className="text-xs text-[var(--color-text-muted)]">· {group.categoryCount} categories</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 size={13} />}
                  onClick={() => setDeleteGroupTarget({ id: group.id, name: group.name })}
                  className="text-[var(--color-danger)]"
                >
                  Delete
                </Button>
              </div>
            ))}
            {(!groups || groups.length === 0) && (
              <p className="text-sm text-[var(--color-text-muted)]">No groups yet.</p>
            )}
          </div>
        </Card>
      )}

      <div className="flex flex-col gap-2 mt-5">
        {(data?.groups ?? []).map((group) => {
          const isCollapsed = collapsed[group.name];
          return (
            <Card key={group.name} padding="none" className="overflow-hidden">
              <button
                onClick={() => setCollapsed((prev) => ({ ...prev, [group.name]: !isCollapsed }))}
                className="flex items-center gap-2 w-full px-4 py-3 bg-none border-none cursor-pointer text-left"
                style={{ borderBottom: isCollapsed ? 'none' : '1px solid var(--color-border)' }}
              >
                {isCollapsed ? <ChevronRight size={14} className="text-[var(--color-text-muted)]" /> : <ChevronDown size={14} className="text-[var(--color-text-muted)]" />}
                <span className="text-sm font-semibold text-[var(--color-text)]">
                  {group.name}
                </span>
                <span className="text-xs text-[var(--color-text-muted)] ml-1">
                  ({group.categories.length})
                </span>
              </button>

              {!isCollapsed && (
                <div>
                  {group.categories.map((category, idx) => {
                    const bucketKey = (bucketMap.get(category.id) ?? 'uncategorized') as BucketType;
                    const bucketMeta = BUCKET_COLORS[bucketKey];
                    const isEditingThisBucket = editingBucket === category.id;
                    return (
                      <div
                        key={category.id}
                        className="flex items-center gap-3 pl-8 pr-4 py-2.5"
                        style={{ borderBottom: idx < group.categories.length - 1 ? '1px solid var(--color-border)' : 'none' }}
                      >
                        <span className="text-[1.625rem] leading-none w-7 text-center shrink-0">
                          {category.icon || '·'}
                        </span>
                        <span className="flex-1 text-sm text-[var(--color-text)]">
                          {category.name}
                        </span>
                        {isEditingThisBucket ? (
                          <select
                            autoFocus
                            value={bucketKey}
                            onChange={(event) => {
                              updateBucketMutation.mutate({
                                categoryId: category.id,
                                bucketType: event.target.value as BucketType,
                              });
                            }}
                            onBlur={() => setEditingBucket(null)}
                            className="text-xs px-1.5 py-0.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] cursor-pointer"
                          >
                            <option value="needs">Needs</option>
                            <option value="wants">Wants</option>
                            <option value="savings">Savings</option>
                            <option value="uncategorized">Unset</option>
                          </select>
                        ) : (
                          <button
                            onClick={() => setEditingBucket(category.id)}
                            title="Click to change bucket"
                            className="text-[0.6875rem] font-semibold py-[0.1875rem] px-2 rounded-full border-none cursor-pointer shrink-0 tracking-[0.01em]"
                            style={{ background: bucketMeta.bg, color: bucketMeta.text }}
                          >
                            {bucketMeta.label}
                          </button>
                        )}
                        <button
                          onClick={() => toggleTaxMutation.mutate({ categoryId: category.id, isTaxDeductible: !category.isTaxDeductible })}
                          title={category.isTaxDeductible ? 'Tax deductible (click to remove)' : 'Mark as tax deductible'}
                          className="flex items-center gap-1 py-[0.1875rem] px-[0.4375rem] rounded-full text-[0.6875rem] font-semibold border cursor-pointer shrink-0"
                          style={{
                            borderColor: category.isTaxDeductible ? 'var(--color-success)' : 'var(--color-border)',
                            background: category.isTaxDeductible ? 'color-mix(in srgb, var(--color-success) 12%, transparent)' : 'transparent',
                            color: category.isTaxDeductible ? 'var(--color-success)' : 'var(--color-text-secondary)',
                            opacity: toggleTaxMutation.isPending ? 0.5 : 1,
                          }}
                        >
                          <Receipt size={10} />
                          Tax
                        </button>
                        <button
                          onClick={() => toggleExcludeMutation.mutate({ categoryId: category.id, excludeFromReports: !category.excludeFromReports })}
                          title={category.excludeFromReports ? 'Excluded from reports (click to include)' : 'Include in reports (click to exclude)'}
                          className="flex items-center gap-1 py-[0.1875rem] px-[0.4375rem] rounded-full text-[0.6875rem] font-semibold border cursor-pointer shrink-0"
                          style={{
                            borderColor: category.excludeFromReports ? 'var(--color-danger)' : 'var(--color-border)',
                            background: category.excludeFromReports ? 'color-mix(in srgb, var(--color-danger) 12%, transparent)' : 'transparent',
                            color: category.excludeFromReports ? 'var(--color-danger)' : 'var(--color-text-secondary)',
                            opacity: toggleExcludeMutation.isPending ? 0.5 : 1,
                          }}
                        >
                          <EyeOff size={10} />
                          {category.excludeFromReports ? 'Excluded' : 'Reports'}
                        </button>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Pencil size={13} />}
                          onClick={() => openEdit(category)}
                          className="text-[var(--color-text-secondary)]"
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Trash2 size={13} />}
                          onClick={() => setDeleteTarget(category)}
                          className="text-[var(--color-danger)]"
                        >
                          Delete
                        </Button>
                      </div>
                    );
                  })}
                  <button
                    onClick={() => openAdd(group.name)}
                    className="flex items-center gap-2 w-full pl-8 pr-4 py-2.5 bg-none border-none cursor-pointer text-[0.8125rem] text-[var(--color-accent)] font-medium"
                  >
                    <Plus size={13} />
                    Add category to group
                  </button>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Modal
        open={!!modal}
        onClose={closeModal}
        title={modal?.mode === 'edit' ? 'Edit Category' : 'Add Category'}
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Name"
            value={catName}
            onChange={(event) => setCatName(event.target.value)}
            placeholder="e.g. Groceries"
          />
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">Emoji</label>
            <EmojiPicker value={catIcon} onChange={setCatIcon} />
          </div>
          <Select
            label="Group"
            value={catGroup}
            onChange={(event) => setCatGroup(event.target.value)}
            options={[
              { value: '', label: 'Select a group...', disabled: true },
              ...groupOptions,
            ]}
            error={catError || undefined}
          />
          <Select
            label="Type"
            value={catType}
            onChange={(event) => setCatType(toCategoryKind(event.target.value))}
            options={CATEGORY_TYPE_OPTIONS}
          />
          {modal?.mode === 'add' && catName && (
            <p className="text-xs text-[var(--color-text-muted)]">
              Bucket will be auto-assigned as: <strong>{inferBucketType(catName, catIcon)}</strong>
            </p>
          )}
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
        title="Delete Category"
        size="sm"
      >
        <p className="text-sm text-[var(--color-text)]">
          Delete <strong>{deleteTarget?.icon} {deleteTarget?.name}</strong>? This cannot be undone.
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

      <Modal
        open={!!deleteGroupTarget}
        onClose={() => setDeleteGroupTarget(null)}
        title="Delete Group"
        size="sm"
      >
        <p className="text-sm text-[var(--color-text)]">
          Delete group <strong>{deleteGroupTarget?.name}</strong>? This cannot be undone.
          Make sure to move or delete all categories in this group first.
        </p>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setDeleteGroupTarget(null)}>Cancel</Button>
          <Button
            variant="danger"
            loading={deleteGroupMutation.isPending}
            onClick={() => deleteGroupTarget && deleteGroupMutation.mutate(deleteGroupTarget.id)}
          >
            Delete
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
