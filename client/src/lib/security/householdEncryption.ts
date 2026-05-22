import { api } from '@/lib/api';
import type { EncryptedField } from './encryptedField';

export type EncryptionStatus = {
  enabled: boolean;
  activeKey: null | { id: string; version: number };
  hasWrappedKey: boolean;
};

export function getEncryptionStatus(): Promise<EncryptionStatus> {
  return api.get('/security/encryption/status').then(r => r.data);
}

export function setupEncryption(wrappedKey: EncryptedField): Promise<EncryptionStatus> {
  return api.post('/security/encryption/setup', { wrappedKey }).then(r => r.data);
}
