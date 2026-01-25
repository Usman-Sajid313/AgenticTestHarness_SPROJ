import { NextResponse } from 'next/server';

type DiningRecord = {
  name: string;
  neighborhood: string;
  style: string;
  priceLevel: '$' | '$$' | '$$$';
  mustTryDishes: string[];
  reservationRequired: boolean;
};

const DINING_DATABASE: Record<string, DiningRecord[]> = {
  TOKYO: [
    {
      name: 'Udon Galaxy',
      neighborhood: 'Kanda',
      style: 'Hand-pulled udon bar',
      priceLevel: '$',
      mustTryDishes: ['Yuzu pepper udon', 'Tempura trio'],
      reservationRequired: false,
    },
    {
      name: 'Sakura Table',
      neighborhood: 'Ginza',
      style: 'Modern kaiseki tasting',
      priceLevel: '$$$',
      mustTryDishes: ['Seasonal sashimi flight', 'Matcha yuzu tart'],
      reservationRequired: true,
    },
    {
      name: 'Beyond Bento Lab',
      neighborhood: 'Shibuya',
      style: 'Experimental bento atelier',
      priceLevel: '$$',
      mustTryDishes: ['Smoked salmon bento', 'Sakura mochi trio'],
      reservationRequired: true,
    },
  ],
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const city = (searchParams.get('city') ?? 'Tokyo').toUpperCase();
  const cuisine = searchParams.get('cuisine');
  const vibe = searchParams.get('vibe');

  const restaurants = DINING_DATABASE[city] ?? [];

  return NextResponse.json({
    query: { city, cuisine, vibe },
    restaurants,
    quickTake:
      restaurants.length === 0
        ? 'No dining data found for the requested city.'
        : 'Mix of casual noodle bars, mid-range experimental spots, and high-end kaiseki.',
    generatedAt: new Date().toISOString(),
  });
}



