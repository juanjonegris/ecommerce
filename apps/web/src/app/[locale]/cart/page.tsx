'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { useCartStore } from '@/stores/cart.store';

export default function CartPage(): React.ReactElement {
  const params = useParams<{ locale: string }>();
  const items = useCartStore((s) => s.items);
  const removeItem = useCartStore((s) => s.removeItem);
  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <main className="container mx-auto p-8 flex flex-col gap-6 max-w-2xl">
      <h1 className="text-3xl font-bold">Cart</h1>
      {items.length === 0 ? (
        <p className="text-muted-foreground" data-testid="cart-empty">
          Your cart is empty.
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-3" data-testid="cart-items">
            {items.map((i) => (
              <li
                key={i.productId}
                className="flex justify-between items-center gap-4 border-b pb-3"
                data-testid={`cart-line-${i.slug}`}
              >
                <div>
                  <span data-testid="cart-line-name">{i.name}</span> ×{' '}
                  <span data-testid="cart-line-quantity">{i.quantity}</span>
                </div>
                <div className="flex gap-3 items-center">
                  <span data-testid="cart-line-price">${(i.price * i.quantity).toFixed(2)}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid={`cart-remove-${i.slug}`}
                    onClick={() => {
                      removeItem(i.productId);
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <p className="font-semibold" data-testid="cart-total">
            Total: ${total.toFixed(2)}
          </p>
          <Link href={`/${params.locale}/checkout`}>
            <Button data-testid="proceed-to-checkout">Proceed to checkout</Button>
          </Link>
        </>
      )}
    </main>
  );
}
