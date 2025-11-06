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
```

- `OPENAI_API_KEY` – secret used to authenticate with your OpenAI-compatible endpoint.
- `OPENAI_BASE_URL` – base URL for the REST API (should include the `/v1` prefix if required by the provider).
- `OPENAI_MODEL` – default model identifier to run the suite with (e.g. `gpt-4.1-mini`).
- `OPENAI_MODEL_<suffix>` – optional additional models (for any suffix like `_1`, `_PREVIEW`, etc.) that appear in the test harness model dropdown.
- `OPENAI_API_KEY_<suffix>` – optional additional API keys (for any suffix like `_1`, `_BACKUP`, etc.); use the “Rotate API Keys” button in the test harness to cycle through them at runtime.

Restart the dev server after changing any of the above.
