export const TYPE_COLOR_PALETTE = [
  '#0f766e',
  '#2563eb',
  '#f59e0b',
  '#dc2626',
  '#7c3aed',
  '#16a34a',
  '#c2410c',
  '#0891b2',
  '#be185d',
  '#4d7c0f',
];

export function getTypeColor(type = 'waypoint') {
  const text = String(type || 'waypoint');
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return TYPE_COLOR_PALETTE[hash % TYPE_COLOR_PALETTE.length];
}
