import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const TABLES: string[] = ['predictions', 'outcomes', 'bets_logged', 'alerts_sent'];

// Monthly job: copies a stable snapshot of every table to Supabase Storage.
// Nothing is ever deleted from the live tables -- this is purely an archival copy.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== 'Bearer ' + process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const snapshot: Record<string, unknown[]> = {};
    for (const table of TABLES) {
      const { data, error } = await supabase.from(table).select('*');
      if (error) throw error;
      snapshot[table] = data || [];
    }

    const now = new Date();
    const yearMonth = now.toISOString().slice(0, 7);
    const fileName = 'archive-' + yearMonth + '.json';
    const body = JSON.stringify(snapshot, null, 2);

    const { error: uploadError } = await supabase.storage
      .from('asp-archives')
      .upload(fileName, body, { contentType: 'application/json', upsert: true });

    if (uploadError) throw uploadError;

    const counts: Record<string, number> = {};
    TABLES.forEach(function (t) { counts[t] = (snapshot[t] || []).length; });

    return NextResponse.json({ success: true, file: fileName, counts: counts });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
