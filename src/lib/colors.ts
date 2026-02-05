export const TERRITORY_COLORS = [
  '#E63946', // Red
  '#457B9D', // Steel Blue
  '#2A9D8F', // Teal
  '#E9C46A', // Saffron
  '#F4A261', // Sandy Brown
  '#9B5DE5', // Purple
  '#00BBF9', // Cyan
  '#F15BB5', // Pink
  '#00F5D4', // Turquoise
  '#FEE440', // Yellow
  '#8338EC', // Violet
  '#3A86FF', // Blue
  '#FF006E', // Magenta
  '#FB5607', // Orange
  '#38B000', // Green
  '#7209B7', // Deep Purple
  '#4CC9F0', // Light Blue
  '#B5179E', // Fuchsia
  '#560BAD', // Indigo
  '#480CA8', // Dark Indigo
];

export function getNextColor(usedColors: string[]): string {
  const available = TERRITORY_COLORS.find(c => !usedColors.includes(c));
  if (available) return available;
  // Cycle with slight hue rotation
  const index = usedColors.length % TERRITORY_COLORS.length;
  return TERRITORY_COLORS[index];
}
