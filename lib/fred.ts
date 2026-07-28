const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

export async function getFredSeries(seriesId: string, limit = 10) {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) throw new Error('FRED_API_KEY is not set');
  const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FRED API error: ${res.status}`);
  const data = await res.json();
  return data.observations as Array<{ date: string; value: string }>;
}

// Common series: DFEDTARU (fed funds upper target), CPIAUCSL (CPI), UNRATE (unemployment)
