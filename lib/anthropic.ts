import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
Respond ONLY in this exact JSON format, no other text:
{"probability": <number 0-100>, "rationale": "<2-3 sentence explanation>"}`,
      },
    ],
  });
  const block = msg.content[0];
  const text = block.type === 'text' ? block.text : '{}';
  return JSON.parse(text) as { probability: number; rationale: string };
}
