// Rough stake tiers for the EV table (personal-use bankroll is tracked as a tier, not an exact figure)
export const STAKE_TIERS = [10, 50, 100, 500];

export function calculateEV(modelProbability: number, marketPriceCents: number, stakes: number[] = STAKE_TIERS) {
  // marketPriceCents: cost per contract in cents (0-100); each contract pays $1 if it resolves YES
const priceDollars = marketPriceCents / 100;
  const probability = modelProbability / 100;

return stakes.map((stake) => {
  const shares = priceDollars > 0 ? stake / priceDollars : 0;
  const payoutIfCorrect = shares * 1;
  const profitIfCorrect = payoutIfCorrect - stake;
  const ev = probability * profitIfCorrect - (1 - probability) * stake;
  return {
    stake,
    shares: Math.round(shares * 100) / 100,
    payoutIfCorrect: Math.round(payoutIfCorrect * 100) / 100,
    profitIfCorrect: Math.round(profitIfCorrect * 100) / 100,
    ev: Math.round(ev * 100) / 100,
    maxLoss: stake,
  };
});
}

// Fractional Kelly Criterion, expressed as a % of bankroll. Floored at 0 (never suggests negative stakes).
export function kellyFraction(modelProbability: number, marketPriceCents: number) {
  const p = modelProbability / 100;
  const price = marketPriceCents / 100;
  if (price <= 0 || price >= 1) return 0;
  const b = (1 - price) / price;
  const q = 1 - p;
  const f = (b * p - q) / b;
  return Math.max(0, Math.round(f * 10000) / 100);
}

// Gates Kelly sizing to 0 whenever the score label indicates no actionable edge, regardless of
// what the raw formula would otherwise return. Fixes the bug where "No edge" alerts could still
// carry a nonzero Kelly recommendation because kellyFraction had no threshold awareness.
export function gatedKellyFraction(modelProbability: number, marketPriceCents: number, scoreLabel: string) {
  if (scoreLabel === 'No edge') return 0;
  return kellyFraction(modelProbability, marketPriceCents);
}

// EV/Kelly for the "NO" side of a market. Used when scoreLabel is 'Fade': the model thinks the
// market's YES price is overpriced, which means the actionable trade is buying NO -- not simply
// avoiding YES. Mirrors the same conservative-end-of-range convention used on the YES side.
export function calculateFadeSideEV(
  probabilityLow: number,
  probabilityHigh: number,
  marketPriceCents: number,
  stakes: number[] = STAKE_TIERS
  ) {
  const noPriceCents = 100 - marketPriceCents;
  const noProbLow = 100 - probabilityHigh;
  const noProbHigh = 100 - probabilityLow;
  const conservativeNoProb = noProbLow;

const evRows = calculateEV(conservativeNoProb, noPriceCents, stakes);
  const kelly = kellyFraction(conservativeNoProb, noPriceCents);

return { noPriceCents, conservativeNoProb, noProbLow, noProbHigh, evRows, kelly };
}
