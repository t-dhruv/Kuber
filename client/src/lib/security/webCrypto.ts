import type { EncryptedField, FieldAssociatedData } from './encryptedField';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function encodeAad(aad: FieldAssociatedData): Uint8Array {
  return textEncoder.encode(JSON.stringify({
    householdId: aad.householdId,
    model: aad.model,
    field: aad.field,
    recordId: aad.recordId,
    keyVersion: aad.keyVersion,
  }));
}

export async function generateDataKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function exportRawKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return bytesToBase64Url(new Uint8Array(raw));
}

export async function importRawKey(rawKey: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', toArrayBuffer(base64UrlToBytes(rawKey)), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}

export async function deriveWrappingKey(passphrase: string, salt: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', textEncoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: textEncoder.encode(salt), iterations: 310000 },
    material,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptField(
  plaintext: string,
  key: CryptoKey,
  keyId: string,
  aad: FieldAssociatedData,
): Promise<EncryptedField> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv), additionalData: toArrayBuffer(encodeAad(aad)) },
    key,
    toArrayBuffer(textEncoder.encode(plaintext)),
  );
  return {
    v: 1,
    alg: 'AES-GCM',
    kid: keyId,
    iv: bytesToBase64Url(iv),
    ct: bytesToBase64Url(new Uint8Array(ct)),
  };
}

export async function decryptField(
  encrypted: EncryptedField,
  key: CryptoKey,
  aad: FieldAssociatedData,
): Promise<string> {
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(base64UrlToBytes(encrypted.iv)),
      additionalData: toArrayBuffer(encodeAad(aad)),
    },
    key,
    toArrayBuffer(base64UrlToBytes(encrypted.ct)),
  );
  return textDecoder.decode(plaintext);
}
