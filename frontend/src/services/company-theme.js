export function companyTheme(companyId) {
  const id = Number(companyId);
  const hue = Number.isSafeInteger(id) && id > 0 ? ((id - 1) * 137.508 + 215) % 360 : 215;
  const color = (saturation, lightness) => `hsl(${hue.toFixed(3)} ${saturation}% ${lightness}%)`;
  return {
    '--primary': color(52, 30),
    '--primary-hover': color(52, 24),
    '--primary-soft': color(38, 95),
    '--primary-border': color(32, 72),
    '--primary-focus': color(60, 48),
    '--primary-surface': color(28, 98),
  };
}
