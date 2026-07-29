import { calculateEV, gatedKellyFraction, calculateFadeSideEV } from './ev';

export function formatAlertMessage(params: {
  predictionId: string;
  eventTitle: string;
  category: string;
  marketPrice: number;
  probabilityLow: number;
  probabilityHigh: number;
  edge: number;
  scoreLabel: string;
  rationale: string;
}): string {
  const predictionId = params.predictionId;
  const eventTitle = params.eventTitle;
  const category = params.category;
  const marketPrice = params.marketPrice;
  const probabilityLow = params.probabilityLow;
  const probabilityHigh = params.probabilityHigh;
  const edge = params.edge;
  const scoreLabel = params.scoreLabel;
  const rationale = params.rationale;

const modelDisplay =
  probabilityLow === probabilityHigh ? probabilityLow + '%' : probabilityLow + '-' + probabilityHigh + '%';

const isFade = scoreLabel === 'Fade';
  const fadeResult = isFade ? calculateFadeSideEV(probabilityLow, probabilityHigh, marketPrice) : null;

const evRows = isFade && fadeResult ? fadeResult.evRows : calculateEV(probabilityLow, marketPrice);
  const kelly = isFade && fadeResult ? fadeResult.kelly : gatedKellyFraction(probabilityLow, marketPrice, scoreLabel);

const evLines = evRows
  .map(function (r) {
    return ' $' + r.stake + ' -> profit if right: $' + r.profitIfCorrect + ', EV: $' + r.ev;
  })
  .join(String.fromCharCode(10));

const edgeSign = edge > 0 ? '+' : '';
  const sideLabel = isFade ? ' (NO side)' : '';

const messageLines = [
  scoreLabel.toUpperCase() + ' — ' + category.toUpperCase(),
  eventTitle,
  '',
  'Market price: ' + marketPrice + 'c | Model: ' + modelDisplay + ' | Edge: ' + edgeSign + edge + 'pt',
  '',
  rationale,
  '',
  'EV by stake' + sideLabel + ':',
  evLines,
  '',
  'Kelly suggestion: ~' + kelly + '% of bankroll',
  '',
  'Prediction ID: ' + predictionId,
  ];

return messageLines.join(String.fromCharCode(10));
}
