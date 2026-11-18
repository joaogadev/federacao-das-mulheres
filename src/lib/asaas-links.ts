/** Only build-time, public hosted links. Secrets must never be imported here. */
export function hostedAsaasLink(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (
      !['asaas.com', 'www.asaas.com', 'sandbox.asaas.com'].includes(
        url.hostname,
      )
    )
      return null;
    if (url.pathname === '/' && !url.search) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function donationPaymentLink(
  institutionalUrl: string | undefined,
  buildUrl: string | undefined,
  affiliationUrl: string | undefined,
): string | null {
  const affiliation = hostedAsaasLink(affiliationUrl);
  for (const candidate of [institutionalUrl, buildUrl]) {
    const donation = hostedAsaasLink(candidate);
    if (donation && donation !== affiliation) return donation;
  }
  return null;
}

export function publicHttpsLink(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}
