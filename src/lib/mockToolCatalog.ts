export type MockToolParameter = {
  name: string;
  description: string;
  type: 'string' | 'number' | 'date' | 'enum';
  required: boolean;
  example?: string;
};

export type MockToolDefinition = {
  id: string;
  name: string;
  description: string;
  method: 'GET' | 'POST';
  path: string;
  parameters: MockToolParameter[];
  sampleResponse: unknown;
};

export type TestSuiteStep = {
  id: string;
  title: string;
  description: string;
  suggestedTools: string[];
  successCriteria: string[];
};

export type TestSuite = {
  id: string;
  name: string;
  description: string;
  goal: string;
  narrative: string;
  toolIds: string[];
  steps: TestSuiteStep[];
  deliverables: string[];
  systemPrompt: string;
  userPrompt: string;
};

export const MOCK_TOOL_BASE_PATH = '/api/mock';

const MOCK_TOOLS: MockToolDefinition[] = [
  {
    id: 'mock-flight-search',
    name: 'Flight Search',
    description: 'Returns curated flight options between two airports with pricing and timing details.',
    method: 'GET',
    path: `${MOCK_TOOL_BASE_PATH}/flights`,
    parameters: [
      { name: 'origin', description: 'IATA code for departure airport.', type: 'string', required: true, example: 'SFO' },
      { name: 'destination', description: 'IATA code for arrival airport.', type: 'string', required: true, example: 'NRT' },
      { name: 'date', description: 'Date of departure in YYYY-MM-DD format.', type: 'date', required: false, example: '2025-11-14' },
    ],
    sampleResponse: {
      query: { origin: 'SFO', destination: 'NRT', date: '2025-11-14' },
      flights: [
        {
          airline: 'Pacific Horizons',
          flightNumber: 'PH217',
          departTime: '2025-11-14T10:10:00-08:00',
          arriveTime: '2025-11-15T15:25:00+09:00',
          durationMinutes: 655,
          priceUSD: 1120,
          cabin: 'economy',
        },
      ],
    },
  },
  {
    id: 'mock-hotel-finder',
    name: 'Hotel Finder',
    description: 'Provides boutique hotel recommendations with amenities and pricing.',
    method: 'GET',
    path: `${MOCK_TOOL_BASE_PATH}/hotels`,
    parameters: [
      { name: 'city', description: 'Target city name.', type: 'string', required: true, example: 'Tokyo' },
      { name: 'checkIn', description: 'Desired check-in date YYYY-MM-DD.', type: 'date', required: false, example: '2025-11-14' },
      { name: 'nights', description: 'Number of nights to stay.', type: 'number', required: false, example: '3' },
    ],
    sampleResponse: {
      query: { city: 'TOKYO', checkIn: '2025-11-14', nights: 3 },
      hotels: [
        {
          name: 'Shinjuku Nexus Hotel',
          neighborhood: 'Shinjuku',
          rating: 4.6,
          pricePerNightUSD: 210,
          amenities: ['Rooftop bar', 'Onsen spa', 'Late checkout'],
        },
      ],
    },
  },
  {
    id: 'mock-weather-outlook',
    name: 'Weather Outlook',
    description: 'Returns a short-term forecast with conditions and packing tips.',
    method: 'GET',
    path: `${MOCK_TOOL_BASE_PATH}/weather`,
    parameters: [
      { name: 'city', description: 'Target city name.', type: 'string', required: true, example: 'Tokyo' },
      { name: 'startDate', description: 'Forecast start date YYYY-MM-DD.', type: 'date', required: false, example: '2025-11-14' },
      { name: 'days', description: 'Number of days to include.', type: 'number', required: false, example: '3' },
    ],
    sampleResponse: {
      query: { city: 'TOKYO', startDate: '2025-11-14', days: 3 },
      forecast: [
        { date: '2025-11-14', condition: 'Partly Cloudy', highC: 18, lowC: 11 },
      ],
      packingTips: ['Layered clothing', 'Light jacket', 'Compact umbrella'],
    },
  },
  {
    id: 'mock-event-calendar',
    name: 'Local Event Calendar',
    description: 'Surfaces featured events, tours, and cultural experiences.',
    method: 'GET',
    path: `${MOCK_TOOL_BASE_PATH}/events`,
    parameters: [
      { name: 'city', description: 'Target city name.', type: 'string', required: true, example: 'Tokyo' },
      { name: 'startDate', description: 'Start date YYYY-MM-DD.', type: 'date', required: false, example: '2025-11-14' },
      { name: 'endDate', description: 'End date YYYY-MM-DD.', type: 'date', required: false, example: '2025-11-16' },
    ],
    sampleResponse: {
      query: { city: 'TOKYO' },
      events: [
        {
          name: 'Akihabara Tech Night Tour',
          startTime: '2025-11-14T19:00:00+09:00',
          venue: 'Akihabara Radio Center',
          priceUSD: 48,
        },
      ],
    },
  },
  {
    id: 'mock-dining-guide',
    name: 'Dining Guide',
    description: 'Suggests restaurants segmented by vibe, cuisine, and price level.',
    method: 'GET',
    path: `${MOCK_TOOL_BASE_PATH}/dining`,
    parameters: [
      { name: 'city', description: 'Target city name.', type: 'string', required: true, example: 'Tokyo' },
      { name: 'cuisine', description: 'Cuisine focus (optional).', type: 'string', required: false, example: 'seafood' },
      { name: 'vibe', description: 'Ambience preference such as casual or celebratory.', type: 'string', required: false, example: 'casual' },
    ],
    sampleResponse: {
      query: { city: 'TOKYO', cuisine: 'seafood' },
      quickTake: 'Mix of casual noodle bars, mid-range experimental spots, and high-end kaiseki.',
      restaurants: [
        {
          name: 'Udon Galaxy',
          neighborhood: 'Kanda',
          priceLevel: '$',
          mustTryDishes: ['Yuzu pepper udon', 'Tempura trio'],
        },
      ],
    },
  },
  {
    id: 'mock-budget-estimator',
    name: 'Budget Estimator',
    description: 'Builds a cost projection for the trip including flights, lodging, meals, and activities.',
    method: 'POST',
    path: `${MOCK_TOOL_BASE_PATH}/budget`,
    parameters: [
      { name: 'city', description: 'Target city name.', type: 'string', required: true, example: 'Tokyo' },
      { name: 'travelers', description: 'Number of travelers.', type: 'number', required: true, example: '2' },
      { name: 'nights', description: 'Trip length in nights.', type: 'number', required: true, example: '3' },
      { name: 'flightClass', description: 'Desired flight cabin class.', type: 'enum', required: false, example: 'premium_economy' },
    ],
    sampleResponse: {
      query: { city: 'Tokyo', travelers: 2, nights: 3, flightClass: 'premium_economy' },
      estimate: {
        breakdown: { flights: 2646, lodging: 621, meals: 448, activities: 147, contingency: 437 },
        totalUSD: 4299,
      },
    },
  },
];

export const DEFAULT_SUITE_ID = 'tokyo-weekender';

export function getMockToolCatalog(): MockToolDefinition[] {
  return [...MOCK_TOOLS];
}

export function getMockToolById(id: string): MockToolDefinition | undefined {
  return MOCK_TOOLS.find((tool) => tool.id === id);
}

export function buildDefaultTestSuite(): TestSuite {
  const toolIds = MOCK_TOOLS.map((tool) => tool.id);
  const sharedContext = 'You are evaluating tools for planning a tech-forward long weekend in Tokyo for two travelers.';

  return {
    id: DEFAULT_SUITE_ID,
    name: 'Tokyo Weekend Planner',
    description: 'Plan a three-day Tokyo getaway that balances tech experiences, food, and culture.',
    goal: 'Produce a day-by-day itinerary with bookings and budget notes ready for human review.',
    narrative: `${sharedContext} Incorporate weather, dining, events, and clear budgeting.`,
    toolIds,
    deliverables: [
      'Day-by-day itinerary with morning, afternoon, and evening plans.',
      'Flight and lodging recommendation with justification.',
      'Budget summary highlighting major cost buckets and total.',
      'Risks or follow-ups that require a human to complete.',
    ],
    steps: [
      {
        id: 'step-flights',
        title: 'Secure Flights',
        description: 'Compare outbound and return options that minimize travel fatigue and align with a Friday departure and Monday return.',
        suggestedTools: ['mock-flight-search'],
        successCriteria: [
          'Outbound and return flights fall within the requested travel window.',
          'Pricing includes cabin selection and baggage expectations.',
        ],
      },
      {
        id: 'step-lodging',
        title: 'Book Lodging',
        description: 'Pick a boutique hotel convenient to transit and nightlife while keeping cost under $260 per night.',
        suggestedTools: ['mock-hotel-finder'],
        successCriteria: [
          'Highlight amenities that support remote work or relaxation.',
          'Flag cancellation policies or booking constraints if noted.',
        ],
      },
      {
        id: 'step-weather',
        title: 'Check Weather Outlook',
        description: 'Adapt the itinerary to weather, suggesting rain-friendly alternates if necessary.',
        suggestedTools: ['mock-weather-outlook'],
        successCriteria: [
          'Mention notable advisories and packing tips relevant to forecast.',
          'Tie weather notes to the planned activities for each day.',
        ],
      },
      {
        id: 'step-experiences',
        title: 'Plan Experiences',
        description: 'Blend tech, culture, and food experiences with smart pacing.',
        suggestedTools: ['mock-event-calendar', 'mock-dining-guide'],
        successCriteria: [
          'Ensure each day has an evening highlight or reservation-worthy activity.',
          'Call out booking deadlines or ticket needs from the event data.',
        ],
      },
      {
        id: 'step-budget',
        title: 'Finalize Budget',
        description: 'Estimate all-in costs and call out trade-offs if the budget is tight.',
        suggestedTools: ['mock-budget-estimator'],
        successCriteria: [
          'Break down costs by flights, lodging, meals, activities, contingency.',
          'Offer suggestions to trim spending if total exceeds $4,400.',
        ],
      },
    ],
    systemPrompt:
      'You are an elite travel operations agent. Use the provided tools to gather evidence before proposing recommendations. Always cite tool outputs explicitly in your reasoning.',
    userPrompt:
      `${sharedContext} Travelers depart San Francisco on Friday morning and return Monday evening. They value immersive experiences, small-group tours, and memorable dining. Build a polished briefing they can execute immediately.`,
  };
}



