import type { EncryptedField } from '@/lib/security/encryptedField';

type AccountLike = {
  name: string;
  nameEncrypted?: EncryptedField | null;
};

export function displayAccountLabel(account: AccountLike, decryptedName: string | null): string {
  if (decryptedName) return decryptedName;
  if (account.nameEncrypted) return 'Locked account';
  return account.name;
}
