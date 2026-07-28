const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

export interface FredObservation {
  date: string;
  value: string;
}

// Fetches the most recent observations for a series. Optionally pass asOfDate
// (YYYY-MM-DD) to get historical observations as of that date, used by the backfill job.
export async function getFredSeries(seriesId: string, limit: number = 10, asOfDate?: string): Promise<FredObservation[]> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) throw new Error('FRED_API_KEY is not set');
  let url = FRED_BASE + '?series_id=' + seriesId + '&api_key=' + apiKey + '&file_type=json&sort_order=desc&limit=' + limit;
  if (asOfDate) {
    url += '&observation_end=' + asOfDate;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error('FRED API error: ' + res.status);
  const data = await res.json();
  return data.observations as FredObservation[];
}

// Common series: DFEDTARU (fed funds upper target), CPIAUCSL (CPI), UNRATE (unemployment)
