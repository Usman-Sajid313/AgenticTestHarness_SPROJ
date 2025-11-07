import { NextResponse } from 'next/server';

type ForecastDay = {
  date: string;
  condition: string;
  highC: number;
  lowC: number;
  precipitationChance: number;
  advisories?: string[];
};

const TOKYO_FORECAST: ForecastDay[] = [
  {
    date: '2025-11-14',
    condition: 'Partly Cloudy',
    highC: 18,
    lowC: 11,
    precipitationChance: 20,
  },
  {
    date: '2025-11-15',
    condition: 'Sunny',
    highC: 20,
    lowC: 12,
    precipitationChance: 10,
    advisories: ['Ideal day for outdoor walking tours.'],
  },
  {
    date: '2025-11-16',
    condition: 'Light Rain Showers',
    highC: 17,
    lowC: 10,
    precipitationChance: 60,
    advisories: ['Pack a compact umbrella.', 'Consider indoor activities in the afternoon.'],
  },
];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const city = (searchParams.get('city') ?? 'Tokyo').toUpperCase();
  const startDate = searchParams.get('startDate') ?? TOKYO_FORECAST[0]!.date;
  const days = Number.parseInt(searchParams.get('days') ?? '3', 10);

  const forecast = city === 'TOKYO' ? TOKYO_FORECAST.slice(0, days) : [];

  return NextResponse.json({
    query: { city, startDate, days },
    forecast,
    summary:
      forecast.length === 0
        ? 'No forecast data available for the requested city.'
        : 'Mostly mild autumn weather with a chance of showers on day three.',
    packingTips:
      forecast.length === 0
        ? []
        : ['Layered clothing', 'Light jacket', 'Compact umbrella for potential rain'],
    generatedAt: new Date().toISOString(),
  });
}



