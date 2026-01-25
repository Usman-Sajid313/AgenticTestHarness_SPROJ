import { NextResponse } from 'next/server';

type HotelRecord = {
  name: string;
  neighborhood: string;
  rating: number;
  pricePerNightUSD: number;
  amenities: string[];
  walkScore: number;
};

const HOTEL_DATABASE: Record<string, HotelRecord[]> = {
  TOKYO: [
    {
      name: 'Shinjuku Nexus Hotel',
      neighborhood: 'Shinjuku',
      rating: 4.6,
      pricePerNightUSD: 210,
      amenities: ['Rooftop bar', 'Onsen spa', 'Late checkout'],
      walkScore: 94,
    },
    {
      name: 'Techwave Capsule Suites',
      neighborhood: 'Akihabara',
      rating: 4.3,
      pricePerNightUSD: 135,
      amenities: ['Workspace pods', 'Complimentary ramen', 'VR lounge'],
      walkScore: 97,
    },
    {
      name: 'Hanami Riverside Inn',
      neighborhood: 'Asakusa',
      rating: 4.8,
      pricePerNightUSD: 260,
      amenities: ['River view', 'Tea ceremony', 'Free bike rental'],
      walkScore: 92,
    },
  ],
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const city = (searchParams.get('city') ?? 'Tokyo').toUpperCase();
  const checkIn = searchParams.get('checkIn');
  const nights = Number.parseInt(searchParams.get('nights') ?? '3', 10);

  const hotels = HOTEL_DATABASE[city] ?? [];

  return NextResponse.json({
    query: { city, checkIn, nights },
    hotels,
    recommendations: hotels.slice(0, 2).map((hotel) => ({
      name: hotel.name,
      reason: `High rating (${hotel.rating}) and walk score ${hotel.walkScore}.`,
    })),
    generatedAt: new Date().toISOString(),
  });
}



