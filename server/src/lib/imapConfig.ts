import { decrypt, encrypt } from './encryption';

export type StoredImapConfig<T extends { password: string }> = T & {
  passwordEncrypted?: boolean;
};

export function encryptImapConfig<T extends { password: string }>(config: T): StoredImapConfig<T> {
  return {
    ...config,
    password: encrypt(config.password),
    passwordEncrypted: true,
  };
}

export function decryptImapConfig<T extends { password: string }>(config: StoredImapConfig<T>): T {
  if (!config.passwordEncrypted) {
    const { passwordEncrypted: _passwordEncrypted, ...legacyConfig } = config;
    return legacyConfig as T;
  }

  const { passwordEncrypted: _passwordEncrypted, ...rest } = config;
  return {
    ...rest,
    password: decrypt(config.password),
  } as T;
}
