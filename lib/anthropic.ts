import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const FENCE = String.fromCharCode(96, 96, 96); // triple backtick, built this way to avoid escaping issues

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

function parseEstimate(raw: string): { probability: number; rationale: string } {
  const text = extractJsonText(raw);
  try {
    const parsed = JSON.parse(text);
    return { probability: Number(parsed.probability), rationale: String(parsed.rationale) };
  } catch {
    // Fallback: the model included an unescaped quote or similar inside rationale, breaking strict JSON.
    // Pull the fields out with regex instead of failing outright.
    const probMatch = text.match(/"probability"\s*:\s*(-?\d+(?:\.\d+)?)/);
    const rationaleMatch = text.match(/"rationale"\s*:\s*"([\s\S]*)"\s*\}\s*$/);
    const probability = probMatch ? Number(probMatch[1]) : 50;
    const rationale = rationaleMatch ? rationaleMatch[1] : text.slice(0, 300);
    return { probability, rationale };
  }
}

export async function getProbabilityEstimate(params: {
  eventTitle: string;
  marketPrice: number;
  supportingData: string;
}) {
  const { eventTitle, marketPrice, supportingData } = params;
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 500,
    messages: [
      {
        role: 'user',
        content: `You are a probability estimation assistant for a personal prediction-market tool.

Event: ${eventTitle}
Current Kalshi market price (implied probability, 0-100): ${marketPrice}
Supporting data:
${supportingData}

Based on the supporting data, estimate the true probability (0-100) that this event resolves YES.
Respond ONLY in this exact JSON format, no other text, no markdown code fences.
Do not use double-quote characters anywhere inside the rationale text — use single quotes instead if needed.
{"probability": <number 0-100>, "rationale": "<2-3 sentence explanation>"}`,
      },
    ],
  });
  const block = msg.content[0];
  const rawText = block.type === 'text' ? block.text : '{}';
  return parseEstimate(rawText);
}
