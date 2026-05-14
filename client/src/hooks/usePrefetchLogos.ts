import { useEffect } from 'react';

export function usePrefetchLogos(
  items: { name: string | null | undefined; type: 'bank' | 'merchant' }[]
) {
  useEffect(() => {
    if (!items.length) return;

    const seen = new Set<string>();
    items.forEach(({ name, type }) => {
      if (!name) return;
      const key = `${type}:${name}`;
      if (seen.has(key)) return;
      seen.add(key);

      const img = new Image();
      img.src = `/api/v1/logos/${type}?name=${encodeURIComponent(name)}`;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);
}
