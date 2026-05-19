const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function getCategoryPillStyle(color?: string | null) {
  const normalized = color?.trim();

  if (!normalized) {
    return {
      color: 'var(--color-accent)',
      backgroundColor: 'var(--color-accent-light)',
    };
  }

  return {
    color: normalized,
    backgroundColor: HEX_COLOR.test(normalized) ? `${normalized}18` : 'var(--color-accent-light)',
  };
}
