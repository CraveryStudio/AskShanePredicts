import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const FENCE: string = String.fromCharCode(96, 96, 96);

function extractJsonText(raw: string): string {
  let text = raw.trim();
  if (text.startsWith(FENCE)) {
    const firstNewline = text.indexOf('\n');
    text = firstNewline !== -1 ? text.slice(firstNewline + 1) : text.slice(FENCE.length);
    const closingIndex = text.lastIndexOf(FENCE);
    if (closingIndex !== -1) text = text.slice(0, closingIndex);
    text = text.trim();
  }
  return text;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function parseEstimate(raw: string): { probabilityLow: number; probabilityHigh: number; rationale: string } {
  const text = extractJsonText(raw);
  try {
    const parsed = JSON.parse(text);
    let low = Number(parsed.probabilityLow);
    let high = Number(parsed.probabilityHigh);
    if (!Number.isFinite(low) || !Number.isFinite(high)) throw new Error('missing range');
    if (low > high) {
      const tmp = low;
      low = high;
      high = tmp;
    }
    low = clamp(low, 0, 100);
    high = clamp(high, 0, 100);
    return { probabilityLow: low, probabilityHigh: high, rationale: String(parsed.rationale) };
  } catch (e) {
    const lowMatch = text.match(/"probabilityLow"\s*:\s*(-?\d+(?:\.\d+)?)/);
    const highMatch = text.match(/"probabilityHigh"\s*:\s*(-?\d+(?:\.\d+)?)/);
    const rationaleMatch = text.match(/"rationale"\s*:\s*"([\s\S]*)"\s*\}\s*$/);
    const low = lowMatch ? clamp(Number(lowMatch[1]), 0, 100) : 45;
    const high = highMatch ? clamp(Number(highMatch[1]), 0, 100) : 55;
    const rationale = rationaleMatch ? rationaleMatch[1] : text.slice(0, 300);
    return { probabilityLow: Math.min(low, high), probabilityHigh: Math.max(low, high), rationale: rationale };
  }
}

export async function getProbabilityEstimate(params: {
  eventTitle: string;
  marketPrice: number;
  supportingData: string;
}): Promise<{ probabilityLow: number; probabilityHigh: number; rationale: string }> {
  const eventTitle = params.eventTitle;
  const marketPrice = params.marketPrice;
  const supportingData = params.supportingData;
  const promptLines: string[] = [
    'You are a probability estimation assistant for a personal prediction-market tool.',
    '',
    'Event: ' + eventTitle,
    'Current Kalshi market price (implied probability, 0-100): ' + marketPrice,
    'Supporting data:',
    supportingData,
    '',
    'Based on the supporting data, estimate the true probability (0-100) that this event resolves YES.',
    'Express your uncertainty as a range: probabilityLow is the conservative, lower-confidence end of your estimate, and probabilityHigh is the optimistic end. A wider range means you are less certain; a narrower range means you are more certain. If you are very confident, probabilityLow and probabilityHigh can be close together or equal.',
    'Respond ONLY in this exact JSON format, no other text, no markdown code fences.',
    'Do not use double-quote characters anywhere inside the rationale text, use single quotes instead if needed.',
    '{"probabilityLow": <number 0-100>, "probabilityHigh": <number 0-100>, "rationale": "<2-3 sentence explanation>"}',
    ];
  const prompt = promptLines.join(String.fromCharCode(10));
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  });
  const block = msg.content[0];
  const rawText = block.type === 'text' ? block.text : '{}';
  return parseEstimate(rawText);
}
