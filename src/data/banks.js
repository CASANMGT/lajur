/** Indonesian bank marks used in payment entry and receipts. */

export const BANKS = [
  { id: 'bca', name: 'BCA', short: 'BCA', color: '#0060af', fg: '#ffffff' },
  { id: 'mandiri', name: 'Bank Mandiri', short: 'mandiri', color: '#003d79', fg: '#ffffff', accent: '#f9a51a' },
  { id: 'bni', name: 'BNI', short: 'BNI', color: '#f15a22', fg: '#ffffff' },
  { id: 'bri', name: 'BRI', short: 'BRI', color: '#00529c', fg: '#ffffff' },
  { id: 'bsi', name: 'BSI', short: 'BSI', color: '#00a39d', fg: '#ffffff' },
  { id: 'permata', name: 'PermataBank', short: 'Permata', color: '#009a44', fg: '#ffffff' },
  { id: 'cimb', name: 'CIMB Niaga', short: 'CIMB', color: '#ec1c24', fg: '#ffffff' },
  { id: 'danamon', name: 'Bank Danamon', short: 'Danamon', color: '#ffb700', fg: '#003d79' },
  { id: 'btn', name: 'BTN', short: 'BTN', color: '#005e9e', fg: '#ffffff' },
  { id: 'jago', name: 'Bank Jago', short: 'Jago', color: '#f5a623', fg: '#172b3a' },
  { id: 'seabank', name: 'SeaBank', short: 'SeaBank', color: '#0f4c81', fg: '#ffffff' },
  { id: 'other', name: 'Bank lain', short: 'BANK', color: '#62727c', fg: '#ffffff' },
];

export function bankById(id) {
  return BANKS.find((bank) => bank.id === id) ?? BANKS[BANKS.length - 1];
}

export function bankMarkHtml(bank, { small = false } = {}) {
  if (!bank) return '';
  return `<span class="bank-mark${small ? ' bank-mark-sm' : ''}" style="background:${bank.color};color:${bank.fg}">${bank.short}</span>`;
}
