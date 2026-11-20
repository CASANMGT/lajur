/** Turn a customer Excel sheet into a customer import plan. */

import { assert, isoNow } from './core.js';
import { createCustomer } from './crm.js';

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

export function normalizeCustomerPhone(value) {
  if (value === null || value === undefined || value === '') return '';
  let raw = typeof value === 'number' ? value.toFixed(0) : String(value).trim();
  if (/e\+?/i.test(raw)) {
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) raw = numeric.toFixed(0);
  }
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('62')) digits = `0${digits.slice(2)}`;
  else if (digits.startsWith('8')) digits = `0${digits}`;
  return digits;
}

export function buildCustomerPlanFromRows(rows, { date, source = 'Upload Excel', key = null } = {}) {
  assert(Array.isArray(rows) && rows.length > 1, 'EMPTY_EXCEL', 'File Excel tidak memiliki baris data.');
  const cleanDate = String(date ?? '').trim();
  assert(/^\d{4}-\d{2}-\d{2}$/.test(cleanDate), 'INVALID_DATE', 'Tanggal import harus YYYY-MM-DD.');
  let headerIndex = -1;
  for (let index = 0; index < Math.min(12, rows.length); index += 1) {
    const cells = (rows[index] ?? []).map((value) => String(value ?? '').trim().toUpperCase());
    if (cells.some((value) => value.includes('NAMA LENGKAP KONTAK') || value.includes('NAMA KONTAK'))) {
      headerIndex = index;
      break;
    }
  }
  assert(headerIndex >= 0, 'INVALID_EXCEL', 'Header NAMA LENGKAP KONTAK tidak ditemukan.');
  const header = (rows[headerIndex] ?? []).map((value) => String(value ?? '').trim().toUpperCase());
  const column = (...names) => header.findIndex((value) => names.some((name) => value.includes(name)));
  const nameIndex = column('NAMA LENGKAP KONTAK', 'NAMA KONTAK');
  const contactIndex = column('PANGGILAN KONTAK');
  const phoneIndex = column('NO. TELP. UTAMA', 'TELP. UTAMA');
  const addressIndex = column('ALAMAT PENGIRIMAN');
  const invoiceAddressIndex = column('ALAMAT INVOICE');
  const cityIndex = column('KOTA ALAMAT PENGIRIMAN');
  const invoiceCityIndex = column('KOTA ALAMAT INVOICE');
  const activeIndex = column('KONTAK AKTIF');
  const codeIndex = column('KODE KONTAK');
  const externalIndex = column('INDEX KONTAK');
  assert(nameIndex >= 0, 'INVALID_EXCEL', 'Kolom NAMA LENGKAP KONTAK wajib ada.');

  const customers = [];
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const name = clean(row[nameIndex]);
    if (!name) continue;
    const phone = normalizeCustomerPhone(row[phoneIndex]);
    const activeRaw = String(row[activeIndex] ?? '').trim().toUpperCase();
    const active = !['0', 'FALSE', 'N', 'NO', 'TIDAK'].includes(activeRaw);
    customers.push({
      row: index + 1,
      name,
      company: name,
      contactName: clean(row[contactIndex]),
      phone,
      whatsapp: phone,
      address: clean(row[addressIndex]) || clean(row[invoiceAddressIndex]),
      city: clean(row[cityIndex]) || clean(row[invoiceCityIndex]),
      active,
      stage: active ? 'pelanggan' : 'prospek',
      externalCode: clean(row[codeIndex]) || clean(row[externalIndex]),
      source,
    });
  }
  assert(customers.length, 'EMPTY_EXCEL', 'Tidak ada pelanggan yang dapat dibaca.');
  return {
    key: key ?? `customers-${cleanDate}`,
    source,
    date: cleanDate,
    customers,
  };
}

export function importCustomerPlan(db, { plan, user } = {}) {
  assert(plan?.key && Array.isArray(plan.customers), 'INVALID_CUSTOMER_PLAN', 'Rencana pelanggan tidak valid.');
  let created = 0;
  let skipped = 0;
  for (const item of plan.customers) {
    const name = String(item.name ?? '').trim();
    if (!name) continue;
    const phone = normalizeCustomerPhone(item.phone);
    const duplicate = db.customers.some((customer) => (
      (phone && normalizeCustomerPhone(customer.phone) === phone)
      || String(customer.name).trim().toLowerCase() === name.toLowerCase()
    ));
    if (duplicate) {
      skipped += 1;
      continue;
    }
    const customer = createCustomer(db, {
      name,
      company: item.company || name,
      phone,
      whatsapp: item.whatsapp || phone,
      email: item.email || '',
      address: item.address || '',
      city: item.city || '',
      stage: item.stage || 'pelanggan',
      salespersonId: user?.id || 'u-sales',
      nextAction: '',
      followUpDate: '',
      notes: [
        item.contactName ? `Kontak: ${item.contactName}` : '',
        item.externalCode ? `Kode: ${item.externalCode}` : '',
        `Sumber: ${plan.source}`,
      ].filter(Boolean).join(' · '),
    }, user);
    customer.contactName = item.contactName || '';
    customer.externalCode = item.externalCode || '';
    customer.source = plan.source;
    customer.importKey = plan.key;
    customer.importedAt = isoNow();
    created += 1;
  }
  return { key: plan.key, date: plan.date, source: plan.source, created, skipped };
}
