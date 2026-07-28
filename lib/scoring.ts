// Price filter: skip contracts priced under 8c or over 92c (near-certainty, low edge value)
export const MIN_PRICE = 8;
export const MAX_PRICE = 92;

export function scoreEdge(modelProbability: number, marketPrice: number) {
  // marketPrice is 0-100, representing the market's implied probability in cents
  const edge = modelProbability - marketPrice;
  let label: string;
  if (Math.abs(edge) < 5) label = 'No edge';
  else if (edge >= 15) label = 'Strong lean';
  else if (edge > 0) label = 'Lean';
  else label = 'Fade';
  return { edge, label };
}
