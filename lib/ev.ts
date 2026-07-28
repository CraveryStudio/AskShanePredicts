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
