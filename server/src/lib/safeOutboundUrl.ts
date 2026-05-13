import { lookup } from 'dns/promises';
import net from 'net';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

export async function assertSafeOutboundUrl(rawUrl: string): Promise<string> {
  const parsed = parseOutboundUrl(rawUrl);
  const host = parsed.hostname;
  const addressHost = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  const normalizedHost = addressHost.toLowerCase().replace(/\.$/, '');

  if (normalizedHost === 'localhost' || normalizedHost.endsWith('.localhost')) {
    throw new Error('URL host resolves to a private or reserved address');
  }

  const directIpVersion = net.isIP(addressHost);

  if (directIpVersion) {
    if (isPrivateOrReservedAddress(addressHost)) {
      throw new Error('URL host resolves to a private or reserved address');
    }
    return parsed.toString();
  }

  let records: Array<{ address: string }> = [];
  try {
    records = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new Error('URL host could not be resolved');
  }

  if (records.length === 0) {
    throw new Error('URL host could not be resolved');
  }

  if (records.some(record => isPrivateOrReservedAddress(record.address))) {
    throw new Error('URL host resolves to a private or reserved address');
  }

  return parsed.toString();
}

function parseOutboundUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error('URL must be valid');
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error('URL must use http or https');
  }

  if (!parsed.hostname) {
    throw new Error('URL must include a host');
  }

  if (parsed.username || parsed.password) {
    throw new Error('URL must not include embedded credentials');
  }

  return parsed;
}

function isPrivateOrReservedAddress(address: string): boolean {
  const ipv4 = parseIpv4(address);
  if (ipv4) return isPrivateOrReservedIpv4(ipv4);

  const lower = address.toLowerCase();
  if (lower.startsWith('::ffff:')) {
    const mapped = parseIpv4(lower.slice('::ffff:'.length));
    return mapped ? isPrivateOrReservedIpv4(mapped) : true;
  }

  return lower === '::'
    || lower === '::1'
    || lower.startsWith('fc')
    || lower.startsWith('fd')
    || lower.startsWith('fe8')
    || lower.startsWith('fe9')
    || lower.startsWith('fea')
    || lower.startsWith('feb');
}

function parseIpv4(address: string): number[] | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;

  const octets = parts.map(part => {
    if (!/^\d+$/.test(part)) return Number.NaN;
    const value = Number(part);
    return Number.isInteger(value) && value >= 0 && value <= 255 ? value : Number.NaN;
  });

  return octets.some(Number.isNaN) ? null : octets;
}

function isPrivateOrReservedIpv4([a, b]: number[]): boolean {
  return a === 0
    || a === 10
    || a === 127
    || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19));
}
