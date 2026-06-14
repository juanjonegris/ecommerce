'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useEffect } from 'react';
import { useFormStatus } from 'react-dom';

import type { Category, Product } from '@repo/types';

import {
  createProductAction,
  updateProductAction,
  type ProductFormState,
} from '@/app/actions/admin/products';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useRouter } from '@/i18n/navigation';

interface ProductFormProps {
  product?: Product;
  categories: Category[];
}

function SubmitButton({ label }: { label: string }): React.ReactElement {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} data-testid="admin-products-submit">
      {pending ? '…' : label}
    </Button>
  );
}

export function ProductForm({ product, categories }: ProductFormProps): React.ReactElement {
  const t = useTranslations('admin.products');
  const tCommon = useTranslations('admin.common');
  const router = useRouter();
  const isEdit = product !== undefined;

  const boundAction = isEdit ? updateProductAction.bind(null, product.id) : createProductAction;

  const [state, formAction] = useActionState<ProductFormState, FormData>(boundAction, {});

  // Sentinel: createProductAction returns fieldErrors.name = '__created:<slug>'
  // on success so we can redirect from the client (Server Actions can't both
  // return state and redirect via useActionState without throwing).
  useEffect(() => {
    const sentinel = state.fieldErrors?.name;
    if (!isEdit && typeof sentinel === 'string' && sentinel.startsWith('__created:')) {
      const slug = sentinel.slice('__created:'.length);
      router.push(`/admin/products/${slug}`);
    }
  }, [state, isEdit, router]);

  const showFieldError = (
    key: keyof NonNullable<ProductFormState['fieldErrors']>,
  ): string | null => {
    const v = state.fieldErrors?.[key];
    if (!v || (key === 'name' && v.startsWith('__created:'))) return null;
    return v;
  };

  return (
    <form
      action={formAction}
      className="flex flex-col gap-6 max-w-2xl"
      data-testid="admin-products-form"
    >
      {state.error ? (
        <p
          className="text-destructive text-sm"
          role="alert"
          data-testid="admin-products-form-error"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="name">{t('name')}</Label>
        <Input
          id="name"
          name="name"
          required
          defaultValue={product?.name ?? ''}
          data-testid="admin-products-name-input"
        />
        {showFieldError('name') ? (
          <p className="text-destructive text-xs">{showFieldError('name')}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">{t('description')}</Label>
        <Textarea
          id="description"
          name="description"
          rows={4}
          defaultValue={product?.description ?? ''}
          data-testid="admin-products-description-input"
        />
        {showFieldError('description') ? (
          <p className="text-destructive text-xs">{showFieldError('description')}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="price">{t('price')}</Label>
        <Input
          id="price"
          name="price"
          type="number"
          step="0.01"
          min="0"
          required
          defaultValue={product?.price.toString() ?? ''}
          data-testid="admin-products-price-input"
        />
        {showFieldError('price') ? (
          <p className="text-destructive text-xs">{showFieldError('price')}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="categoryId">{t('category')}</Label>
        <select
          id="categoryId"
          name="categoryId"
          required
          defaultValue={product?.categoryId ?? ''}
          className="border-input bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm"
          data-testid="admin-products-category-input"
        >
          <option value="" disabled>
            —
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {showFieldError('categoryId') ? (
          <p className="text-destructive text-xs">{showFieldError('categoryId')}</p>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <SubmitButton label={isEdit ? tCommon('save') : tCommon('create')} />
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            router.push('/admin/products');
          }}
        >
          {tCommon('cancel')}
        </Button>
      </div>
    </form>
  );
}
