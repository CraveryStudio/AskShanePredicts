import { supabase } from '@/lib/supabase';
import { gatedKellyFraction } from '@/lib/ev';

export const dynamic = 'force-dynamic';

interface PredictionRow {
  id: string;
  created_at: string;
  category: string;
  event_title: string;
  market_price: number;
  model_probability: number;
  edge: number;
  score_label: string;
  rationale: string;
}

interface OutcomeRow {
  prediction_id: string;
  was_correct: boolean;
  actual_result: string;
}

const TIERS = ['Strong lean', 'Lean', 'No edge', 'Fade'];
const CATEGORIES = ['weather', 'fed_macro'];

function formatET(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const tierColors: Record<string, string> = {
  'Strong lean': '#3FB950',
  Lean: '#58A6FF',
  'No edge': '#8A94A6',
  Fade: '#F0883E',
};

// Buckets resolved alerts by the model's stated confidence -- whichever direction it leaned
// (a 15% YES estimate is really an 85%-confident NO lean) -- against how often that lean was
// actually correct. A well-calibrated model's actual accuracy in each row should land close
// to the confidence range itself.
function computeCalibration(rows: { id: string; model_probability: number }[], outcomeMap: Map<string, OutcomeRow>) {
  const buckets = [
    { label: '50-60%', min: 50, max: 60 },
    { label: '60-70%', min: 60, max: 70 },
    { label: '70-80%', min: 70, max: 80 },
    { label: '80-90%', min: 80, max: 90 },
    { label: '90-100%', min: 90, max: 100 },
  ];
  const results = buckets.map((b) => ({ ...b, total: 0, correct: 0 }));

  rows.forEach((r) => {
    const outcome = outcomeMap.get(r.id);
    if (!outcome) return;
    const confidence = r.model_probability >= 50 ? r.model_probability : 100 - r.model_probability;
    const bucket = results.find((b) => (confidence >= b.min && confidence < b.max) || (confidence === 100 && b.max === 100));
    if (!bucket) return;
    bucket.total += 1;
    if (outcome.was_correct) bucket.correct += 1;
  });

  return results;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { category?: string; tier?: string; days?: string };
}) {
  const days = Number(searchParams.days) || 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: predictions, error } = await supabase
    .from('predictions')
    .select('id, created_at, category, event_title, market_price, model_probability, edge, score_label, rationale')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(500);

  const { data: outcomes } = await supabase
    .from('outcomes')
    .select('prediction_id, was_correct, actual_result');

  const outcomeMap = new Map<string, OutcomeRow>();
  (outcomes || []).forEach((o) => outcomeMap.set(o.prediction_id, o as OutcomeRow));

  let rows = (predictions || []) as PredictionRow[];

  if (searchParams.category) {
    rows = rows.filter((r) => r.category === searchParams.category);
  }

  // Captured before the tier filter: calibration should reflect the full confidence
  // spectrum (category/date filters still apply), not just whichever tier is selected.
  const calibrationRows = rows;

  if (searchParams.tier) {
    rows = rows.filter((r) => r.score_label === searchParams.tier);
  }

  const tierCounts: Record<string, number> = {};
  rows.forEach((r) => {
    tierCounts[r.score_label] = (tierCounts[r.score_label] || 0) + 1;
  });

  const resolved = rows.filter((r) => outcomeMap.has(r.id));
  const correct = resolved.filter((r) => outcomeMap.get(r.id)?.was_correct);
  const accuracyPct = resolved.length > 0 ? Math.round((correct.length / resolved.length) * 100) : null;

  const calibration = computeCalibration(calibrationRows, outcomeMap);
  const calibrationHasData = calibration.some((b) => b.total > 0);

  function buildLink(overrides: { category?: string | null; tier?: string | null; days?: number }) {
    const params = new URLSearchParams();
    const nextCategory = overrides.category !== undefined ? overrides.category : searchParams.category;
    const nextTier = overrides.tier !== undefined ? overrides.tier : searchParams.tier;
    const nextDays = overrides.days !== undefined ? overrides.days : days;
    if (nextCategory) params.set('category', nextCategory);
    if (nextTier) params.set('tier', nextTier);
    if (nextDays) params.set('days', String(nextDays));
    const qs = params.toString();
    return '/dashboard' + (qs ? '?' + qs : '');
  }

  const pillStyle = (active: boolean) => ({
    display: 'inline-block',
    padding: '6px 14px',
    marginRight: 8,
    marginBottom: 8,
    borderRadius: 20,
    fontSize: 13,
    textDecoration: 'none',
    border: active ? '1px solid #C9A227' : '1px solid #2A3B57',
    background: active ? 'rgba(201,162,39,0.15)' : 'transparent',
    color: active ? '#C9A227' : '#8A94A6',
  });

  return (
    <main style={{ padding: '2rem', maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.8rem', color: '#C9A227', marginBottom: 4, letterSpacing: '0.03em' }}>
        ASP Dashboard
      </h1>
      <p style={{ color: '#8A94A6', marginBottom: 24, fontSize: 14 }}>
        AskShanePredicts &mdash; alert history, tier breakdown, and resolved accuracy
      </p>

      <section style={{ display: 'flex', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
        <StatCard label="Alerts" value={String(rows.length)} />
        <StatCard
          label="Strong lean / Lean"
          value={String((tierCounts['Strong lean'] || 0) + (tierCounts['Lean'] || 0))}
        />
        <StatCard label="Fade" value={String(tierCounts['Fade'] || 0)} />
        <StatCard label="No edge" value={String(tierCounts['No edge'] || 0)} />
        <StatCard
          label="Resolved accuracy"
          value={accuracyPct !== null ? accuracyPct + '%' : String.fromCharCode(8212)}
          sub={resolved.length + ' resolved'}
        />
      </section>

      <div style={{ marginBottom: 8 }}>
        <span style={{ color: '#8A94A6', fontSize: 12, marginRight: 8 }}>RANGE</span>
        {[1, 7, 30, 90].map((d) => (
          <a key={d} href={buildLink({ days: d })} style={pillStyle(days === d)}>
            {d}d
          </a>
        ))}
      </div>

      <div style={{ marginBottom: 8 }}>
        <span style={{ color: '#8A94A6', fontSize: 12, marginRight: 8 }}>CATEGORY</span>
        <a href={buildLink({ category: null })} style={pillStyle(!searchParams.category)}>
          All
        </a>
        {CATEGORIES.map((c) => (
          <a key={c} href={buildLink({ category: c })} style={pillStyle(searchParams.category === c)}>
            {c === 'fed_macro' ? 'Fed/Macro' : 'Weather'}
          </a>
        ))}
      </div>

      <div style={{ marginBottom: 24 }}>
        <span style={{ color: '#8A94A6', fontSize: 12, marginRight: 8 }}>TIER</span>
        <a href={buildLink({ tier: null })} style={pillStyle(!searchParams.tier)}>
          All
        </a>
        {TIERS.map((t) => (
          <a key={t} href={buildLink({ tier: t })} style={pillStyle(searchParams.tier === t)}>
            {t}
          </a>
        ))}
      </div>

      {error ? (
        <p style={{ color: '#F85149' }}>Error loading predictions: {error.message}</p>
      ) : rows.length === 0 ? (
        <p style={{ color: '#8A94A6' }}>No alerts in this range.</p>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #2A3B57', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#0F2A4A', textAlign: 'left' }}>
                {['Time (ET)', 'Category', 'Event', 'Price', 'Model', 'Edge', 'Tier', 'Kelly', 'Result'].map((h) => (
                  <th
                    key={h}
                    style={{ padding: '10px 12px', color: '#8A94A6', fontWeight: 500, borderBottom: '1px solid #2A3B57' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const outcome = outcomeMap.get(r.id);
                const kelly = gatedKellyFraction(r.model_probability, r.market_price, r.score_label);
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid #1B2A42' }}>
                    <td style={{ padding: '10px 12px', color: '#E5E5E5', whiteSpace: 'nowrap' }}>
                      {formatET(r.created_at)}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#E5E5E5' }}>
                      {r.category === 'fed_macro' ? 'Fed/Macro' : 'Weather'}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#E5E5E5', maxWidth: 320 }}>{r.event_title}</td>
                    <td style={{ padding: '10px 12px', color: '#E5E5E5' }}>{r.market_price}&cent;</td>
                    <td style={{ padding: '10px 12px', color: '#E5E5E5' }}>{r.model_probability}%</td>
                    <td style={{ padding: '10px 12px', color: r.edge >= 0 ? '#3FB950' : '#F0883E' }}>
                      {r.edge > 0 ? '+' : ''}
                      {r.edge}pt
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ color: tierColors[r.score_label] || '#8A94A6', fontWeight: 600 }}>
                        {r.score_label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#E5E5E5' }}>
                      {r.score_label === 'Fade' ? 'see alert' : kelly + '%'}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {outcome ? (
                        <span style={{ color: outcome.was_correct ? '#3FB950' : '#F85149' }}>
                          {outcome.was_correct ? 'Correct' : 'Wrong'}
                        </span>
                      ) : (
                        <span style={{ color: '#8A94A6' }}>Pending</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ color: '#5A6478', fontSize: 12, marginTop: 16 }}>
        Kelly shown here is quarter-Kelly, gated to 0% on &quot;No edge&quot;. Fade-tier sizing (the NO-side trade) isn&apos;t
        reconstructable from stored data yet &mdash; check the original Telegram alert for that number.
      </p>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: '1.1rem', color: '#C9A227', marginBottom: 4 }}>Calibration</h2>
        <p style={{ color: '#8A94A6', fontSize: 12, marginBottom: 12 }}>
          For resolved alerts in this range, buckets the model&apos;s stated confidence (whichever direction it leaned)
          against how often that lean was actually correct. A well-calibrated model&apos;s actual accuracy should land
          close to each row&apos;s confidence range.
        </p>
        {!calibrationHasData ? (
          <p style={{ color: '#8A94A6', fontSize: 13 }}>Not enough resolved alerts yet to compute calibration.</p>
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid #2A3B57', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#0F2A4A', textAlign: 'left' }}>
                  {['Confidence range', 'Resolved', 'Correct', 'Actual accuracy', 'Gap'].map((h) => (
                    <th
                      key={h}
                      style={{ padding: '10px 12px', color: '#8A94A6', fontWeight: 500, borderBottom: '1px solid #2A3B57' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {calibration.map((b) => {
                  const actualPct = b.total > 0 ? Math.round((b.correct / b.total) * 100) : null;
                  const midpoint = (b.min + b.max) / 2;
                  const gap = actualPct !== null ? Math.round(actualPct - midpoint) : null;
                  return (
                    <tr key={b.label} style={{ borderBottom: '1px solid #1B2A42' }}>
                      <td style={{ padding: '10px 12px', color: '#E5E5E5' }}>{b.label}</td>
                      <td style={{ padding: '10px 12px', color: '#E5E5E5' }}>{b.total}</td>
                      <td style={{ padding: '10px 12px', color: '#E5E5E5' }}>{b.correct}</td>
                      <td style={{ padding: '10px 12px', color: '#E5E5E5' }}>
                        {actualPct !== null ? actualPct + '%' : String.fromCharCode(8212)}
                      </td>
                      <td
                        style={{
                          padding: '10px 12px',
                          color: gap === null ? '#8A94A6' : Math.abs(gap) <= 10 ? '#3FB950' : '#F0883E',
                        }}
                      >
                        {gap !== null ? (gap > 0 ? '+' : '') + gap + 'pt' : String.fromCharCode(8212)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: '#0F2A4A', border: '1px solid #2A3B57', borderRadius: 8, padding: '14px 18px', minWidth: 140 }}>
      <div style={{ color: '#8A94A6', fontSize: 12, marginBottom: 4 }}>{label}</div>
      <div style={{ color: '#E5E5E5', fontSize: 22, fontWeight: 600 }}>{value}</div>
      {sub && <div style={{ color: '#5A6478', fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
