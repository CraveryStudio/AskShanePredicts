// Price filter: skip contracts priced under 8c or over 92c (near-certainty, low edge value)
export const MIN_PRICE = 8;
export const MAX_PRICE = 92;

// Minimum adjusted edge (in points) required before a tier is considered actionable.
export const MIN_ACTIONABLE_EDGE = 5;

// Band-width penalty: a probabilityHigh - probabilityLow spread at or above this (in probability
// points) applies the maximum discount to edge and downstream Kelly sizing. A wide range means
// the model itself is uncertain, so the effective edge should shrink even if the raw gap is large.
const SPREAD_THRESHOLD = 20;

export function scoreEdge(probabilityLow: number, probabilityHigh: number, marketPrice: number) {
  // marketPrice is 0-100, representing the market's implied probability in cents.
  // Use the conservative (low) end of the model's range for edge, not the midpoint or high end.
  const rawEdge = probabilityLow - marketPrice;

  const bandWidth = probabilityHigh - probabilityLow;
  const discountFactor = Math.max(0, 1 - bandWidth / SPREAD_THRESHOLD);
  const edge = Math.round(rawEdge * discountFactor);

  let label: string;
  if (Math.abs(edge) < MIN_ACTIONABLE_EDGE) label = 'No edge';
  else if (edge >= 15) label = 'Strong lean';
  else if (edge > 0) label = 'Lean';
  else label = 'Fade';

  return { edge, rawEdge, discountFactor: Math.round(discountFactor * 100) / 100, label };
}
