# Model Budget Limits

Budget validation is currently enforced on the persisted parse and judge flows:

- `POST /api/runs/[id]/parse`
- `POST /api/runs/[id]/judge`

These checks prevent expensive model operations from running when the configured budget would be exceeded.

## Configuration

Set these environment variables to tune the limits:

```bash
MAX_JUDGE_BUDGET=2.0
MAX_PARSE_BUDGET=1.0
MODEL_COST_PER_MILLION_TOKENS=0.1
```

## Behavior

- Parse requests validate the estimated cost of processing the uploaded logfile before parsing begins.
- Judge requests validate the estimated cost of the judging payload before the judge step begins.
- When a limit is exceeded, the route returns HTTP `429` with a structured error payload describing the estimated cost and configured limit.

## Implementation

- Core validation lives in `src/lib/runBudgetValidator.ts`.
- Parse enforcement is wired in `src/app/api/runs/[id]/parse/route.ts`.
- Judge enforcement is wired in `src/app/api/runs/[id]/judge/route.ts`.

## Notes

- The old prototype-only live test-harness budget tracker has been removed.
- Budget validation now documents only the supported product flows.
