'use client';

import { ChevronRight, Edit, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import type { Category } from '@repo/types';

import {
  createCategoryAction,
  deleteCategoryAction,
  updateCategoryAction,
  type CategoryActionResult,
} from '@/app/actions/admin/categories';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { EmptyState } from '@/components/admin/empty-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface CategoryTreeProps {
  categories: Category[];
}

interface CategoryNode {
  category: Category;
  children: CategoryNode[];
}

/** Build a parent→children index from the flat list. Returns root nodes. */
function buildTree(categories: Category[]): CategoryNode[] {
  const byId = new Map<string, CategoryNode>();
  for (const c of categories) byId.set(c.id, { category: c, children: [] });
  const roots: CategoryNode[] = [];
  for (const c of categories) {
    const node = byId.get(c.id);
    if (!node) continue;
    if (c.parentId) {
      const parent = byId.get(c.parentId);
      if (parent) parent.children.push(node);
      else roots.push(node); // orphan — treat as root for visibility
    } else {
      roots.push(node);
    }
  }
  // Stable alphabetic sort at every level.
  const sortRec = (nodes: CategoryNode[]): void => {
    nodes.sort((a, b) => a.category.name.localeCompare(b.category.name));
    for (const n of nodes) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}

type DialogMode =
  | { kind: 'closed' }
  | { kind: 'create'; parent: Category | null }
  | { kind: 'edit'; category: Category };

function NameDialog({
  mode,
  onClose,
  onSubmit,
  pending,
}: {
  mode: DialogMode;
  onClose: () => void;
  onSubmit: (name: string) => void;
  pending: boolean;
}): React.ReactElement {
  const tCommon = useTranslations('admin.common');
  const t = useTranslations('admin.categories');
  const initialName = mode.kind === 'edit' ? mode.category.name : '';
  const [name, setName] = useState(initialName);

  const open = mode.kind !== 'closed';
  const title =
    mode.kind === 'edit'
      ? tCommon('edit')
      : mode.kind === 'create' && mode.parent
        ? `${t('addChild')}: ${mode.parent.name}`
        : t('new');

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="category-name">{t('new')}</Label>
          <Input
            id="category-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
            autoFocus
            data-testid="admin-categories-name-input"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {tCommon('cancel')}
          </Button>
          <Button
            onClick={() => {
              onSubmit(name);
            }}
            disabled={pending || name.trim().length === 0}
            data-testid="admin-categories-submit"
          >
            {tCommon('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface NodeRowProps {
  node: CategoryNode;
  depth: number;
  onEdit: (category: Category) => void;
  onCreateChild: (parent: Category) => void;
  onDelete: (category: Category) => Promise<void>;
}

function NodeRow({
  node,
  depth,
  onEdit,
  onCreateChild,
  onDelete,
}: NodeRowProps): React.ReactElement {
  const t = useTranslations('admin.categories');
  const tCommon = useTranslations('admin.common');
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;

  return (
    <li className="flex flex-col gap-1" data-testid={`admin-categories-node-${node.category.slug}`}>
      <div
        className="flex items-center gap-2 py-2 px-2 rounded hover:bg-muted/50"
        style={{ paddingLeft: `${String(depth * 16 + 8)}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => {
              setExpanded((e) => !e);
            }}
            className="text-muted-foreground hover:text-foreground"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            <ChevronRight
              className={`size-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
              aria-hidden
            />
          </button>
        ) : (
          <span className="w-4" aria-hidden />
        )}
        <span
          className="flex-1 font-medium"
          data-testid={`admin-categories-name-${node.category.slug}`}
        >
          {node.category.name}
        </span>
        <span className="text-xs text-muted-foreground font-mono">{node.category.slug}</span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            onCreateChild(node.category);
          }}
          title={t('addChild')}
          data-testid={`admin-categories-addchild-${node.category.slug}`}
        >
          <Plus className="size-4" aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            onEdit(node.category);
          }}
          title={tCommon('edit')}
          data-testid={`admin-categories-edit-${node.category.slug}`}
        >
          <Edit className="size-4" aria-hidden />
        </Button>
        <ConfirmDialog
          title={tCommon('delete')}
          description={t('deleteBlocked')}
          action={() => onDelete(node.category)}
          testid={`admin-categories-delete-trigger-${node.category.slug}`}
          trigger={
            <Button
              variant="ghost"
              size="icon"
              title={tCommon('delete')}
              data-testid={`admin-categories-delete-${node.category.slug}`}
              className="text-destructive"
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          }
        />
      </div>
      {expanded && hasChildren ? (
        <ul className="flex flex-col">
          {node.children.map((child) => (
            <NodeRow
              key={child.category.id}
              node={child}
              depth={depth + 1}
              onEdit={onEdit}
              onCreateChild={onCreateChild}
              onDelete={onDelete}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function CategoryTree({ categories }: CategoryTreeProps): React.ReactElement {
  const t = useTranslations('admin.categories');
  const tCommon = useTranslations('admin.common');
  const tree = useMemo(() => buildTree(categories), [categories]);
  const [dialog, setDialog] = useState<DialogMode>({ kind: 'closed' });
  const [pending, startTransition] = useTransition();

  const handleResult = (result: CategoryActionResult, successLabel: string): void => {
    if (result.ok) {
      toast.success(successLabel);
      setDialog({ kind: 'closed' });
      return;
    }
    if (result.errorCode === 'CONFLICT') {
      toast.error(t('deleteBlocked'));
    } else {
      toast.error(result.error ?? tCommon('error'));
    }
  };

  const onSubmit = (name: string): void => {
    if (dialog.kind === 'closed') return;
    const trimmed = name.trim();
    if (trimmed.length === 0) return;

    if (dialog.kind === 'edit') {
      const id = dialog.category.id;
      startTransition(async () => {
        const result = await updateCategoryAction(id, { name: trimmed });
        handleResult(result, tCommon('save'));
      });
    } else {
      const parentId = dialog.parent?.id ?? null;
      startTransition(async () => {
        const result = await createCategoryAction({ name: trimmed, parentId });
        handleResult(result, tCommon('create'));
      });
    }
  };

  const onDelete = async (category: Category): Promise<void> => {
    const result = await deleteCategoryAction(category.id);
    handleResult(result, tCommon('delete'));
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{categories.length} total</p>
        <Button
          onClick={() => {
            setDialog({ kind: 'create', parent: null });
          }}
          data-testid="admin-categories-new-button"
        >
          <Plus className="size-4 mr-2" aria-hidden />
          {t('new')}
        </Button>
      </div>

      {tree.length === 0 ? (
        <EmptyState title={tCommon('empty')} />
      ) : (
        <Card>
          <CardContent className="p-2">
            <ul className="flex flex-col" data-testid="admin-categories-tree">
              {tree.map((node) => (
                <NodeRow
                  key={node.category.id}
                  node={node}
                  depth={0}
                  onEdit={(c) => {
                    setDialog({ kind: 'edit', category: c });
                  }}
                  onCreateChild={(c) => {
                    setDialog({ kind: 'create', parent: c });
                  }}
                  onDelete={onDelete}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <NameDialog
        mode={dialog}
        onClose={() => {
          setDialog({ kind: 'closed' });
        }}
        onSubmit={onSubmit}
        pending={pending}
      />
    </>
  );
}
