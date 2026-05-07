import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lookup } from 'dns/promises';
import { assertSafeOutboundUrl } from './safeOutboundUrl';

vi.mock('dns/promises', () => ({
  lookup: vi.fn(),
}));

describe('assertSafeOutboundUrl', () => {
  beforeEach(() => vi.clearAllMocks());

  it('allows public http and https URLs after DNS resolution', async () => {
    vi.mocked(lookup).mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as any);

    await expect(assertSafeOutboundUrl('https://example.com/webhook')).resolves.toBe('https://example.com/webhook');
    await expect(assertSafeOutboundUrl('  https://example.com/webhook  ')).resolves.toBe('https://example.com/webhook');
  });

  it('rejects direct loopback and metadata-service IP URLs', async () => {
    await expect(assertSafeOutboundUrl('http://127.0.0.1:9002/internal')).rejects.toThrow('private or reserved');
    await expect(assertSafeOutboundUrl('http://[::1]:9002/internal')).rejects.toThrow('private or reserved');
    await expect(assertSafeOutboundUrl('http://[::ffff:127.0.0.1]/internal')).rejects.toThrow('private or reserved');
    await expect(assertSafeOutboundUrl('http://[fd00::1]/internal')).rejects.toThrow('private or reserved');
    await expect(assertSafeOutboundUrl('http://[fe80::1]/internal')).rejects.toThrow('private or reserved');
    await expect(assertSafeOutboundUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow('private or reserved');
  });

  it('rejects hostnames that resolve to private addresses', async () => {
    vi.mocked(lookup).mockResolvedValue([{ address: '10.0.0.5', family: 4 }] as any);

    await expect(assertSafeOutboundUrl('https://internal.example.test/hook')).rejects.toThrow('private or reserved');
  });

  it('rejects localhost names without relying on DNS behavior', async () => {
    await expect(assertSafeOutboundUrl('http://localhost:9002/internal')).rejects.toThrow('private or reserved');
    await expect(assertSafeOutboundUrl('http://api.localhost/internal')).rejects.toThrow('private or reserved');
    expect(lookup).not.toHaveBeenCalled();
  });

  it('rejects hostnames that cannot be resolved', async () => {
    vi.mocked(lookup).mockRejectedValue(new Error('ENOTFOUND'));

    await expect(assertSafeOutboundUrl('https://missing.example.test/hook')).rejects.toThrow('could not be resolved');
  });

  it('rejects non-http protocols and embedded credentials', async () => {
    await expect(assertSafeOutboundUrl('file:///etc/passwd')).rejects.toThrow('http or https');
    await expect(assertSafeOutboundUrl('https://user:pass@example.com/hook')).rejects.toThrow('embedded credentials');
  });
});
