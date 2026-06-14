'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';

import type { DiscountCode } from '@repo/types';

import {
  createDiscountAction,
  updateDiscountAction,
  type DiscountFormState,
} from '@/app/actions/admin/discounts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRouter } from '@/i18n/navigation';

interface DiscountFormProps {
  discount?: DiscountCode;
}

type FormType = 'percent' | 'amount';

function SubmitButton({ label }: { label: string }): React.ReactElement {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} data-testid="admin-discounts-submit">
      {pending ? '…' : label}
    </Button>
  );
}

function dateInputValue(date: Date | null): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  // YYYY-MM-DD for <input type="date">. Always emit local-equivalent UTC.
  const iso = d.toISOString();
  return iso.slice(0, 10);
}

export function DiscountForm({ discount }: DiscountFormProps): React.ReactElement {
  const t = useTranslations('admin.discounts');
  const tCommon = useTranslations('admin.common');
  const router = useRouter();
  const isEdit = discount !== undefined;

  const initialType: FormType =
    discount?.amountOff !== null && discount?.amountOff !== undefined ? 'amount' : 'percent';
  const [type, setType] = useState<FormType>(initialType);

  const boundAction = isEdit ? updateDiscountAction.bind(null, discount.id) : createDiscountAction;

  const [state, formAction] = useActionState<DiscountFormState, FormData>(boundAction, {});

  // Sentinel on success: createDiscountAction returns { createdId } so we
  // can redirect from the client (Server Actions can't both return state
  // and call redirect() via useActionState — same pattern as products).
  useEffect(() => {
    if (state.createdId) {
      router.push(`/admin/discounts/${state.createdId}`);
    }
  }, [state.createdId, router]);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-6 max-w-xl"
      data-testid="admin-discounts-form"
    >
      {state.error ? (
        <p
          className="text-destructive text-sm"
          role="alert"
          data-testid="admin-discounts-form-error"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="code">{t('code')}</Label>
        <Input
          id="code"
          name="code"
          required
          maxLength={64}
          minLength={3}
          pattern="[A-Za-z0-9_\-]+"
          defaultValue={discount?.code ?? ''}
          data-testid="admin-discounts-code-input"
          className="uppercase"
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium mb-1">{t('type')}</legend>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="type"
              value="percent"
              checked={type === 'percent'}
              onChange={() => {
                setType('percent');
              }}
              data-testid="admin-discounts-type-percent"
            />
            {t('typePercent')}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="type"
              value="amount"
              checked={type === 'amount'}
              onChange={() => {
                setType('amount');
              }}
              data-testid="admin-discounts-type-amount"
            />
            {t('typeAmount')}
          </label>
        </div>
      </fieldset>

      {type === 'percent' ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="percentOff">{t('percentOff')}</Label>
          <Input
            id="percentOff"
            name="percentOff"
            type="number"
            step="1"
            min="1"
            max="100"
            required
            defaultValue={discount?.percentOff?.toString() ?? ''}
            data-testid="admin-discounts-percentoff-input"
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor="amountOff">{t('amountOff')}</Label>
          <Input
            id="amountOff"
            name="amountOff"
            type="number"
            step="0.01"
            min="0.01"
            required
            defaultValue={discount?.amountOff?.toString() ?? ''}
            data-testid="admin-discounts-amountoff-input"
          />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="expiresAt">{t('expiresAt')}</Label>
        <Input
          id="expiresAt"
          name="expiresAt"
          type="date"
          defaultValue={dateInputValue(discount?.expiresAt ?? null)}
          data-testid="admin-discounts-expires-input"
        />
        <p className="text-xs text-muted-foreground">{t('oneOf')}</p>
      </div>

      <div className="flex items-center gap-3">
        <SubmitButton label={isEdit ? tCommon('save') : tCommon('create')} />
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            router.push('/admin/discounts');
          }}
        >
          {tCommon('cancel')}
        </Button>
      </div>
    </form>
  );
}
