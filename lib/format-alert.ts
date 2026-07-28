import { calculateEV, kellyFraction } from './ev';

export function formatAlertMessage(params: {
  predictionId: string;
  eventTitle: string;
  category: string;
  marketPrice: number;
  modelProbability: number;
  edge: number;
  scoreLabel: string;
  rationale: string;
}) {
  const { predictionId, eventTitle, category, marketPrice, modelProbability, edge, scoreLabel, rationale } = params;
  const evRows = calculateEV(modelProbability, marketPrice);
  const kelly = kellyFraction(modelProbability, marketPrice);

  const evLines = evRows
    .map((r) => `  $${r.stake} → profit if right: $${r.profitIfCorrect}, EV: $${r.ev}`)
    .join('\n');

  return `<b>${scoreLabel}</b> — ${category.toUpperCase()}
<b>${eventTitle}</b>

Market price: ${marketPrice}c | Model: ${modelProbability}% | Edge: ${edge > 0 ? '+' : ''}${edge}pt

${rationale}

<b>EV by stake:</b>
${evLines}

Kelly suggestion: ~${kelly}% of bankroll

Prediction ID: ${predictionId}`;
}
