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
}): string {
  const predictionId = params.predictionId;
  const eventTitle = params.eventTitle;
  const category = params.category;
  const marketPrice = params.marketPrice;
  const modelProbability = params.modelProbability;
  const edge = params.edge;
  const scoreLabel = params.scoreLabel;
  const rationale = params.rationale;

  const evRows = calculateEV(modelProbability, marketPrice);
  const kelly = kellyFraction(modelProbability, marketPrice);

  const evLines = evRows
    .map(function (r) {
      return '  $' + r.stake + ' -> profit if right: $' + r.profitIfCorrect + ', EV: $' + r.ev;
    })
    .join(String.fromCharCode(10));

  const edgeSign = edge > 0 ? '+' : '';

  const messageLines = [
    scoreLabel.toUpperCase() + ' — ' + category.toUpperCase(),
    eventTitle,
    '',
    'Market price: ' + marketPrice + 'c | Model: ' + modelProbability + '% | Edge: ' + edgeSign + edge + 'pt',
    '',
    rationale,
    '',
    'EV by stake:',
    evLines,
    '',
    'Kelly suggestion: ~' + kelly + '% of bankroll',
    '',
    'Prediction ID: ' + predictionId,
  ];

  return messageLines.join(String.fromCharCode(10));
}
