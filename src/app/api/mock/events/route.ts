import { NextResponse } from 'next/server';

type EventRecord = {
  name: string;
  startTime: string;
  venue: string;
  priceUSD: number;
  summary: string;
  bookingUrl: string;
};

const EVENT_DATABASE: Record<string, EventRecord[]> = {
  TOKYO: [
    {
      name: 'Akihabara Tech Night Tour',
      startTime: '2025-11-14T19:00:00+09:00',
      venue: 'Akihabara Radio Center',
      priceUSD: 48,
      summary: 'Guided evening tour of retro game arcades and gadget boutiques with local guides.',
      bookingUrl: 'https://example.com/events/akiba-tech-night',
    },
    {
      name: 'Shibuya Jazz Rooftop',
      startTime: '2025-11-15T21:30:00+09:00',
      venue: 'Shibuya Sky Terrace',
      priceUSD: 35,
      summary: 'Live quartet with skyline views and seasonal cocktails.',
      bookingUrl: 'https://example.com/events/shibuya-jazz-rooftop',
    },
    {
      name: 'Tsukiji Market Dawn Tasting',
      startTime: '2025-11-16T05:30:00+09:00',
      venue: 'Tsukiji Outer Market',
      priceUSD: 60,
      summary: 'Early morning seafood tasting with sushi chef-led workshop.',
      bookingUrl: 'https://example.com/events/tsukiji-dawn',
    },
  ],
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const city = (searchParams.get('city') ?? 'Tokyo').toUpperCase();
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  const events = EVENT_DATABASE[city] ?? [];

  return NextResponse.json({
    query: { city, startDate, endDate },
    events,
    highlights: events.slice(0, 2).map((event) => ({
      name: event.name,
      startTime: event.startTime,
      whyGo: event.summary,
    })),
    generatedAt: new Date().toISOString(),
  });
}



