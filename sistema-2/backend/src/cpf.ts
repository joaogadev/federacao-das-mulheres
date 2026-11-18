export function validCpf(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  for (const size of [9, 10]) {
    const sum = [...digits.slice(0, size)].reduce((total, digit, index) => total + Number(digit) * (size + 1 - index), 0);
    const check = (sum * 10) % 11 % 10;
    if (check !== Number(digits[size])) return false;
  }
  return true;
}
