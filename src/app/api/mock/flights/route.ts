import { NextResponse } from 'next/server';

type FlightRecord = {
  airline: string;
  flightNumber: string;
  departTime: string;
  arriveTime: string;
  durationMinutes: number;
  priceUSD: number;
  cabin: 'economy' | 'premium_economy' | 'business';
  notes?: string;
};

const FLIGHT_DATABASE: Record<string, FlightRecord[]> = {
  'SFO->NRT': [
    {
      airline: 'Pacific Horizons',
      flightNumber: 'PH217',
      departTime: '2025-11-14T10:10:00-08:00',
      arriveTime: '2025-11-15T15:25:00+09:00',
      durationMinutes: 655,
      priceUSD: 1120,
      cabin: 'economy',
      notes: 'Non-stop, includes two checked bags.',
    },
    {
      airline: 'SkyLink',
      flightNumber: 'SL903',
      departTime: '2025-11-14T13:45:00-08:00',
      arriveTime: '2025-11-15T19:05:00+09:00',
      durationMinutes: 680,
      priceUSD: 1285,
      cabin: 'premium_economy',
      notes: 'One-stop in Seattle with 90 minute layover.',
    },
  ],
  'NRT->SFO': [
    {
      airline: 'Pacific Horizons',
      flightNumber: 'PH218',
      departTime: '2025-11-18T17:40:00+09:00',
      arriveTime: '2025-11-18T10:05:00-08:00',
      durationMinutes: 640,
      priceUSD: 1095,
      cabin: 'economy',
      notes: 'Non-stop, includes two checked bags.',
    },
    {
      airline: 'SkyLink',
      flightNumber: 'SL904',
      departTime: '2025-11-18T19:20:00+09:00',
      arriveTime: '2025-11-18T13:50:00-08:00',
      durationMinutes: 675,
      priceUSD: 1250,
      cabin: 'premium_economy',
    },
  ],
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const origin = searchParams.get('origin')?.toUpperCase() ?? 'SFO';
  const destination = searchParams.get('destination')?.toUpperCase() ?? 'NRT';
  const date = searchParams.get('date');

  const key = `${origin}->${destination}`;
  const flights = FLIGHT_DATABASE[key] ?? [];

  return NextResponse.json({
    query: { origin, destination, date },
    flights,
    generatedAt: new Date().toISOString(),
  });
}



