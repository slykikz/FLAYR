type Line = {
  product: { id: string };
  size: string;
  variantId?: string;
  quantity: number;
};
export type PurchasedLine = {
  productId: string;
  size: string;
  variantId?: string;
  quantity: number;
};
/** Remove only the purchased quantities, preserving anything added afterwards. */
export function subtractPurchased<T extends Line>(
  cart: T[],
  purchased: PurchasedLine[],
): T[] {
  return cart.flatMap((line) => {
    const bought = purchased.find(
      (item) =>
        item.productId === line.product.id &&
        item.size === line.size &&
        item.variantId === line.variantId,
    );
    const quantity = line.quantity - (bought?.quantity || 0);
    return quantity > 0 ? [{ ...line, quantity }] : [];
  });
}
