// Get CSS custom property value from document root
export function getCSSVariable(varName: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

// Get color token by name (e.g., "accent", "success", "danger", "chart-6")
export function getColorToken(colorName: string): string {
  return getCSSVariable(`--color-${colorName}`);
}

// Get chart-specific color token (convenience alias)
export function getChartColor(index: 1 | 2 | 3 | 4 | 5 | 6): string {
  return getColorToken(`chart-${index}`);
}
