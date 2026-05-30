export interface CartItem {
  productId: string;
  name: string;
  slug: string;
  price: number;
  quantity: number;
}

export interface Cart {
  items: CartItem[];
}
