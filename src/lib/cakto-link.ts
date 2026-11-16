/** Accept only public hosted checkouts. This value is never an API credential. */
export function hostedCaktoCheckout(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'pay.cakto.com.br' ||
      url.username ||
      url.password ||
      !/^\/[a-zA-Z0-9_-]+$/.test(url.pathname)
    )
      return null;
    return url.toString();
  } catch {
    return null;
  }
}
