This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Environment Variables

Create a `.env.local` file and set the following keys so the LangChain-backed runner can reach your model gateway:

```
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://your-endpoint.example.com/v1
OPENAI_MODEL=gpt-4.1-mini
OPENAI_MODEL_1=gpt-4.1
OPENAI_MODEL_2=gpt-4.1-mini
OPENAI_API_KEY_1=another-api-key
OPENAI_API_KEY_2=third-api-key

# Budget Limits (optional)
MAX_JUDGE_BUDGET=2.0
MAX_PARSE_BUDGET=1.0
MODEL_COST_PER_MILLION_TOKENS=0.1
```

### Model Configuration

- `OPENAI_API_KEY` – secret used to authenticate with your OpenAI-compatible endpoint.
- `OPENAI_BASE_URL` – base URL for the REST API (should include the `/v1` prefix if required by the provider).
- `OPENAI_MODEL` – default model identifier to run the suite with (e.g. `gpt-4.1-mini`).
- `OPENAI_MODEL_<suffix>` – optional additional models (for any suffix like `_1`, `_PREVIEW`, etc.) that appear in the test harness model dropdown.
- `OPENAI_API_KEY_<suffix>` – optional additional API keys (for any suffix like `_1`, `_BACKUP`, etc.); use the "Rotate API Keys" button in the test harness to cycle through them at runtime.

### Budget Limits (Optional)

- `MAX_JUDGE_BUDGET` – maximum budget in USD for judge operations (default: $2.00)
- `MAX_PARSE_BUDGET` – maximum budget in USD for parse operations (default: $1.00)
- `MODEL_COST_PER_MILLION_TOKENS` – cost per million tokens in USD (default: $0.10)

See [docs/BUDGET_LIMITS.md](docs/BUDGET_LIMITS.md) for detailed information about budget limiting.

Restart the dev server after changing any of the above.

## Features

### Model Budget Limits

The system includes built-in budget validation to prevent excessive API costs:

- **Test Suite Runs**: Budget is validated before each model call during test execution
- **Parse Operations**: Budget validation before parsing log files
- **Judge Operations**: Budget validation before judging agent runs
- **Real-time Tracking**: Token usage and costs are tracked and reported in real-time
- **Configurable Limits**: Set custom budget limits per operation or use sensible defaults

Budget exceeded errors return HTTP 429 status codes with detailed cost information.

For complete documentation, see [docs/BUDGET_LIMITS.md](docs/BUDGET_LIMITS.md).
