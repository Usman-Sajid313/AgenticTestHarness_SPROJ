import { NextResponse } from 'next/server';

type BudgetRequest = {
  city: string;
  travelers: number;
  nights: number;
  flightClass?: 'economy' | 'premium_economy' | 'business';
  activities?: string[];
};

const BASE_CITY_MULTIPLIER: Record<string, number> = {
  TOKYO: 1.15,
};

const FLIGHT_CLASS_MULTIPLIER: Record<NonNullable<BudgetRequest['flightClass']>, number> = {
  economy: 1,
  premium_economy: 1.35,
  business: 2.1,
};

const ACTIVITY_COSTS: Record<string, number> = {
  'teamLab Planets': 42,
  'Ghibli Museum': 30,
  'Tsukiji Breakfast Tour': 55,
  'Sumo Practice Visit': 60,
};

function calculateBudget(input: BudgetRequest) {
  const travelers = Math.max(1, input.travelers);
  const nights = Math.max(1, input.nights);
  const cityKey = input.city.toUpperCase();

  const cityMultiplier = BASE_CITY_MULTIPLIER[cityKey] ?? 1;
  const classMultiplier = FLIGHT_CLASS_MULTIPLIER[input.flightClass ?? 'economy'];

  const baselineFlight = 980;
  const baselineHotel = 180;
  const dailyMeals = 65;

  const flightCost = baselineFlight * classMultiplier * travelers;
  const lodgingCost = baselineHotel * cityMultiplier * nights;
  const mealCost = dailyMeals * cityMultiplier * nights * travelers;

  const activities = input.activities?.map((name) => ({
    name,
    cost: ACTIVITY_COSTS[name] ?? 40,
  })) ?? [];

  const activityTotal = activities.reduce((sum, item) => sum + item.cost, 0);
  const contingency = 0.12 * (flightCost + lodgingCost + mealCost + activityTotal);

  return {
    breakdown: {
      flights: flightCost,
      lodging: lodgingCost,
      meals: mealCost,
      activities: activityTotal,
      contingency: Math.round(contingency),
    },
    activities,
    totalUSD: Math.round(flightCost + lodgingCost + mealCost + activityTotal + contingency),
  };
}

export async function POST(req: Request) {
  let payload: BudgetRequest;
  try {
    payload = (await req.json()) as BudgetRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload?.city) {
    return NextResponse.json({ error: 'city is required' }, { status: 400 });
  }

  const result = calculateBudget(payload);

  return NextResponse.json({
    query: payload,
    estimate: result,
    notes: [
      'Includes a 12% contingency for transit, souvenirs, and unexpected costs.',
      'Adjust flightClass or activities to see how the estimate changes.',
    ],
    generatedAt: new Date().toISOString(),
  });
}



