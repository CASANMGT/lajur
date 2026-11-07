/**
 * Optional physical proof. The demo stores metadata only (name, type, size,
 * note, user, time) — file bytes never leave the browser and are not persisted.
 */

import { isoNow } from './core.js';

export function attachmentMeta(file, { note = '' } = {}) {
  if (!file) return null;
  return {
    name: String(file.name ?? 'bukti'),
    type: String(file.type ?? 'application/octet-stream'),
    size: Number(file.size ?? 0),
    note: String(note ?? ''),
  };
}

export function addAttachment(entity, file, { note = '', user } = {}) {
  const meta = attachmentMeta(file, { note });
  if (!meta) return null;
  entity.attachments = entity.attachments ?? [];
  const record = {
    ...meta,
    at: isoNow(),
    by: user?.name ?? 'Sistem',
  };
  entity.attachments.push(record);
  return record;
}

export function hasProof(entity) {
  return Boolean(entity?.attachments?.length);
}

export function proofLabel(entity) {
  const count = entity?.attachments?.length ?? 0;
  if (!count) return '';
  return `${count} bukti`;
}
