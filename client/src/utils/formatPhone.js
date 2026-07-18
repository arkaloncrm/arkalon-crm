// Display-only AU phone formatting — storage stays raw/unchanged, and tel:
// links must keep using the raw digits, never this formatted string.
//
//   0412345678  -> "0412 345 678"   (mobile)
//   0295556666  -> "(02) 9555 6666" (landline)
//   1300123456  -> "1300 123 456"   (1300/1800)
//   +61412345678 -> "+61412345678"  (international — preserved as stored)
//
// Anything that doesn't match a recognised 10-digit AU shape is returned
// exactly as stored rather than risking a wrong reformat.
export function formatPhoneAU(raw) {
  if (!raw) return raw;
  const trimmed = String(raw).trim();
  if (!trimmed) return trimmed;

  // International format — preserve as stored, never reformatted.
  if (trimmed.startsWith('+')) return trimmed;

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length !== 10) return trimmed;

  if (digits.startsWith('1300') || digits.startsWith('1800')) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 10)}`;
  }
  if (digits.startsWith('04')) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 10)}`;
  }
  if (digits.startsWith('0')) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)} ${digits.slice(6, 10)}`;
  }
  return trimmed;
}
