export type EncryptedField = {
  v: 1;
  alg: 'AES-GCM';
  kid: string;
  iv: string;
  ct: string;
};

export type FieldAssociatedData = {
  householdId: string;
  model: string;
  field: string;
  recordId: string;
  keyVersion: number;
};

export function isEncryptedField(value: unknown): value is EncryptedField {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<EncryptedField>;
  return candidate.v === 1
    && candidate.alg === 'AES-GCM'
    && typeof candidate.kid === 'string'
    && typeof candidate.iv === 'string'
    && typeof candidate.ct === 'string';
}
