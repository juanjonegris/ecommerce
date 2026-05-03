'use client';

import { Button } from '@/components/ui/button';
import { useCartStore } from '@/stores/cart.store';

interface AddToCartButtonProps {
  productId: string;
  slug: string;
  name: string;
  price: number;
}

export function AddToCartButton({
  productId,
  slug,
  name,
  price,
}: AddToCartButtonProps): React.ReactElement {
  const addItem = useCartStore((s) => s.addItem);
  return (
    <Button
      data-testid="add-to-cart-button"
      onClick={() => {
        addItem({ productId, slug, name, price, quantity: 1 });
      }}
    >
      Add to cart
    </Button>
  );
}
