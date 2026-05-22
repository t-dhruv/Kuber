import { z } from 'zod';

export const encryptedFieldSchema = z.object({
  v: z.literal(1),
  alg: z.literal('AES-GCM'),
  kid: z.string().min(1),
  iv: z.string().min(1),
  ct: z.string().min(1),
});

export type EncryptedField = z.infer<typeof encryptedFieldSchema>;

export function parseEncryptedField(value: unknown): EncryptedField | null {
  if (value === null || value === undefined) return null;
  return encryptedFieldSchema.parse(value);
}
