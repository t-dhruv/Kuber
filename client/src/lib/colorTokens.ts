/**
 * Color token accessor for dynamic theme-aware colors.
 * Used for chart components that need to respond to theme changes.
 */
export function getColorToken(tokenName: string): string {
  const root = document.documentElement;
  const value = getComputedStyle(root)
    .getPropertyValue(`--color-${tokenName}`)
    .trim();
  return value || '#000000';
}

export const chartColors = {
  accent: () => getColorToken('accent'),
  success: () => getColorToken('success'),
  danger: () => getColorToken('danger'),
  warning: () => getColorToken('warning'),
  info: () => getColorToken('info'),
};
