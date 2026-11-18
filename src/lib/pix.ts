export interface PixCode {
  code: string;
  amount: number | null;
  recipient: string;
  city: string;
}

function tlv(value: string): Map<string, string> | null {
  const fields = new Map<string, string>();
  for (let index = 0; index < value.length;) {
    const tag = value.slice(index, index + 2);
    const size = value.slice(index + 2, index + 4);
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(size)) return null;
    const length = Number(size);
    const end = index + 4 + length;
    if (end > value.length || fields.has(tag)) return null;
    fields.set(tag, value.slice(index + 4, end));
    index = end;
  }
  return fields;
}

function crc16(value: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(value)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++)
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Checks the Pix copy-and-paste payload before rendering its QR Code. */
export function parsePixCode(value: string | undefined): PixCode | null {
  if (!value) return null;
  const code = value.trim();
  if (!/^[\x20-\x7E]+$/.test(code) || !/6304[0-9A-Fa-f]{4}$/.test(code))
    return null;
  const fields = tlv(code);
  const merchant = tlv(fields?.get('26') ?? '');
  const expectedCrc = code.slice(-4).toUpperCase();
  if (
    !fields ||
    fields.get('00') !== '01' ||
    fields.get('01') !== '11' ||
    fields.get('53') !== '986' ||
    fields.get('58') !== 'BR' ||
    fields.get('63')?.toUpperCase() !== expectedCrc ||
    merchant?.get('00') !== 'br.gov.bcb.pix' ||
    !fields.get('59') ||
    !fields.get('60') ||
    crc16(code.slice(0, -4)) !== expectedCrc
  )
    return null;
  const rawAmount = fields.get('54');
  if (rawAmount && !/^\d+\.\d{2}$/.test(rawAmount)) return null;
  const amount = rawAmount ? Number(rawAmount) : null;
  if (amount !== null && (!Number.isFinite(amount) || amount <= 0)) return null;
  return {
    code,
    amount,
    recipient: fields.get('59')!,
    city: fields.get('60')!,
  };
}
