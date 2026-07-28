import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Manual "I bet $X" logging. ASP never places trades or touches your Kalshi account —
// this just records that you personally acted on a prediction, separate from the
// automatic prediction log. Call with:
// POST /api/log-bet
// Authorization: Bearer <CRON_SECRET>
// Body: { "prediction_id": "<uuid>", "stake_amount": 50, "notes": "optional" }
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { prediction_id, stake_amount, notes } = body;

  if (!prediction_id || typeof stake_amount !== 'number') {
    return NextResponse.json(
      { error: 'prediction_id (string) and stake_amount (number) are required' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from('bets_logged')
    .insert({ prediction_id, stake_amount, notes: notes ?? null })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}
