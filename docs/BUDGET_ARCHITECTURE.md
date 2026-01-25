# Budget Validation Architecture

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                            │
├─────────────────────────────────────────────────────────────────┤
│  • Test Harness UI                                              │
│  • Project Management UI                                        │
│  • Run Viewer UI                                                │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ HTTP Requests
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API Routes Layer                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────────────────────────────────────────┐    │
│  │  /api/test-suite/run                                  │    │
│  │  ┌─────────────────────────────────────────────────┐  │    │
│  │  │  1. Parse request with budget config           │  │    │
│  │  │  2. Create BudgetTracker instance               │  │    │
│  │  │  3. For each model call:                        │  │    │
│  │  │     • validateCall(messages, estimatedTokens)   │  │    │
│  │  │     • invoke model                              │  │    │
│  │  │     • recordMessageUsage(messages, response)    │  │    │
│  │  │     • stream budget-update event                │  │    │
│  │  │  4. Return final budget usage                   │  │    │
│  │  └─────────────────────────────────────────────────┘  │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌───────────────────────────────────────────────────────┐    │
│  │  /api/runs/[id]/judge                                 │    │
│  │  ┌─────────────────────────────────────────────────┐  │    │
│  │  │  1. Fetch run from database                     │  │    │
│  │  │  2. validateJudgeBudget(runId)                  │  │    │
│  │  │  3. If allowed:                                 │  │    │
│  │  │     • Call Supabase edge function               │  │    │
│  │  │  4. Else:                                       │  │    │
│  │  │     • Return 429 with budget info               │  │    │
│  │  └─────────────────────────────────────────────────┘  │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌───────────────────────────────────────────────────────┐    │
│  │  /api/runs/[id]/parse                                 │    │
│  │  ┌─────────────────────────────────────────────────┐  │    │
│  │  │  1. Fetch run from database                     │  │    │
│  │  │  2. validateParseBudget(runId)                  │  │    │
│  │  │  3. If allowed:                                 │  │    │
│  │  │     • Call Supabase edge function               │  │    │
│  │  │  4. Else:                                       │  │    │
│  │  │     • Return 429 with budget info               │  │    │
│  │  └─────────────────────────────────────────────────┘  │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ Uses
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Budget Validation Layer                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────────────────────────────────────────┐    │
│  │  BudgetTracker (budgetValidator.ts)                   │    │
│  │  ┌─────────────────────────────────────────────────┐  │    │
│  │  │  • Tracks token usage in real-time              │  │    │
│  │  │  • Validates before each model call             │  │    │
│  │  │  • Calculates costs                             │  │    │
│  │  │  • Provides usage statistics                    │  │    │
│  │  │                                                  │  │    │
│  │  │  Methods:                                        │  │    │
│  │  │  • validateCall()                               │  │    │
│  │  │  • recordUsage()                                │  │    │
│  │  │  • recordMessageUsage()                         │  │    │
│  │  │  • getUsage()                                   │  │    │
│  │  │  • getSummary()                                 │  │    │
│  │  └─────────────────────────────────────────────────┘  │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌───────────────────────────────────────────────────────┐    │
│  │  Run Budget Validator (runBudgetValidator.ts)         │    │
│  │  ┌─────────────────────────────────────────────────┐  │    │
│  │  │  • Validates edge function calls                │  │    │
│  │  │  • Estimates tokens for operations              │  │    │
│  │  │  • Checks against configured limits             │  │    │
│  │  │                                                  │  │    │
│  │  │  Functions:                                      │  │    │
│  │  │  • validateJudgeBudget(runId)                   │  │    │
│  │  │  • validateParseBudget(runId)                   │  │    │
│  │  │  • getRunBudgetConfig()                         │  │    │
│  │  └─────────────────────────────────────────────────┘  │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ Uses
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Supporting Services                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌───────────────┐  │
│  │  gpt-tokenizer  │  │  Prisma Client  │  │  Environment  │  │
│  │  ─────────────  │  │  ─────────────  │  │  Variables    │  │
│  │  Token counting │  │  Database       │  │  ───────────  │  │
│  │  for accurate   │  │  queries for    │  │  Budget       │  │
│  │  cost estimates │  │  run data       │  │  configuration│  │
│  └─────────────────┘  └─────────────────┘  └───────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Test Suite Run with Budget Validation

```
┌─────────┐
│ Client  │
└────┬────┘
     │
     │ POST /api/test-suite/run
     │ { budget: { maxBudget: 25, costPerMillionTokens: 0.1 } }
     │
     ▼
┌─────────────────────────────────────────────┐
│ API Route Handler                           │
│                                             │
│ 1. Parse request                            │
│ 2. Create BudgetTracker                     │
│    ┌─────────────────────────────────────┐ │
│    │ BudgetTracker                       │ │
│    │ maxBudget: $25                      │ │
│    │ costPerMillionTokens: $0.1          │ │
│    │ totalTokens: 0                      │ │
│    │ totalCost: $0                       │ │
│    └─────────────────────────────────────┘ │
│                                             │
│ 3. Start test run loop                      │
└─────────────────────────────────────────────┘
     │
     │ For each iteration:
     │
     ▼
┌─────────────────────────────────────────────┐
│ Before Model Call                           │
│                                             │
│ validateCall(messages, 500)                 │
│    │                                        │
│    ├─> Count tokens in messages             │
│    ├─> Add estimated response tokens        │
│    ├─> Calculate estimated cost             │
│    ├─> Check: totalCost + cost <= budget?   │
│    │                                        │
│    ├─> YES: Continue                        │
│    └─> NO: Throw BudgetExceededError        │
│                                             │
└─────────────────────────────────────────────┘
     │
     │ If validation passed:
     │
     ▼
┌─────────────────────────────────────────────┐
│ Model Invocation                            │
│                                             │
│ response = await model.invoke(messages)     │
│                                             │
└─────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────┐
│ After Model Call                            │
│                                             │
│ recordMessageUsage(messages, response)      │
│    │                                        │
│    ├─> Count actual input tokens            │
│    ├─> Count actual output tokens           │
│    ├─> Calculate actual cost                │
│    ├─> Update totalTokens                   │
│    └─> Update totalCost                     │
│                                             │
│ Stream budget-update event                  │
│    {                                        │
│      type: 'budget-update',                 │
│      usage: {                               │
│        totalTokens: 1500,                   │
│        totalCost: 0.00015,                  │
│        remainingBudget: 24.99985,           │
│        percentUsed: 0.0006                  │
│      }                                      │
│    }                                        │
│                                             │
└─────────────────────────────────────────────┘
     │
     │ Continue loop or complete
     │
     ▼
┌─────────────────────────────────────────────┐
│ Run Complete                                │
│                                             │
│ Stream run-complete event                   │
│    {                                        │
│      type: 'run-complete',                  │
│      run: { ... },                          │
│      budgetUsage: {                         │
│        totalTokens: 5000,                   │
│        totalCost: 0.0005,                   │
│        remainingBudget: 24.9995,            │
│        percentUsed: 0.002                   │
│      },                                     │
│      budgetSummary: "Budget: $0.0005 / ... │
│    }                                        │
│                                             │
└─────────────────────────────────────────────┘
     │
     ▼
┌─────────┐
│ Client  │
│ (Done)  │
└─────────┘
```

### Judge Operation with Budget Validation

```
┌─────────┐
│ Client  │
└────┬────┘
     │
     │ POST /api/runs/[id]/judge
     │
     ▼
┌─────────────────────────────────────────────┐
│ API Route Handler                           │
│                                             │
│ 1. Fetch run from database                  │
│ 2. Check run status                         │
│                                             │
└─────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────┐
│ Budget Validation                           │
│                                             │
│ validation = validateJudgeBudget(runId)     │
│    │                                        │
│    ├─> Get budget config from env           │
│    ├─> Fetch run data (task, payload)       │
│    ├─> Estimate tokens:                     │
│    │   • Base judge prompt: ~2000           │
│    │   • Task definition size               │
│    │   • Input payload size                 │
│    │   • Expected response: ~1500           │
│    ├─> Calculate estimated cost             │
│    └─> Check: cost <= budgetLimit?          │
│                                             │
└─────────────────────────────────────────────┘
     │
     ├─> If NOT allowed:
     │   │
     │   ▼
     │   ┌───────────────────────────────────┐
     │   │ Return 429 Error                  │
     │   │                                   │
     │   │ {                                 │
     │   │   error: "Budget limit exceeded", │
     │   │   details: "...",                 │
     │   │   budgetInfo: {                   │
     │   │     estimatedCost: 2.5,           │
     │   │     budgetLimit: 2.0              │
     │   │   }                               │
     │   │ }                                 │
     │   └───────────────────────────────────┘
     │
     └─> If allowed:
         │
         ▼
     ┌───────────────────────────────────────┐
     │ Call Supabase Edge Function           │
     │                                       │
     │ POST /functions/v1/judge_run          │
     │ { runId: id }                         │
     │                                       │
     └───────────────────────────────────────┘
         │
         ▼
     ┌───────────────────────────────────────┐
     │ Return Success                        │
     │                                       │
     │ {                                     │
     │   success: true,                      │
     │   runId: id,                          │
     │   status: "JUDGING"                   │
     │ }                                     │
     └───────────────────────────────────────┘
         │
         ▼
     ┌─────────┐
     │ Client  │
     └─────────┘
```

## Configuration Flow

```
┌──────────────────────────────────────────────────────────────┐
│                    Configuration Sources                     │
└──────────────────────────────────────────────────────────────┘
     │
     ├─────────────────────┬──────────────────────┬────────────┐
     │                     │                      │            │
     ▼                     ▼                      ▼            ▼
┌─────────┐      ┌──────────────┐      ┌──────────────┐  ┌─────────┐
│ Request │      │ Environment  │      │   Defaults   │  │ Presets │
│ Body    │      │ Variables    │      │              │  │         │
└─────────┘      └──────────────┘      └──────────────┘  └─────────┘
│                │                      │                  │
│ budget: {      │ MAX_JUDGE_BUDGET     │ Judge: $2.00     │ SMOKE   │
│   maxBudget,   │ MAX_PARSE_BUDGET     │ Parse: $1.00     │ BASIC   │
│   costPer...   │ MODEL_COST_PER...    │ Cost: $0.10      │ DAILY   │
│ }              │                      │                  │ EXTENDED│
│                │                      │                  │ LOAD    │
└────────┬───────┴──────────┬───────────┴──────────┬───────┴─────────┘
         │                  │                      │
         │   Priority: Request > Environment > Defaults > Presets
         │
         ▼
┌──────────────────────────────────────────────────────────────┐
│                    Budget Configuration                      │
│                                                              │
│  For Test Runs:                                              │
│  • Check request body for budget config                      │
│  • If not provided, use DEFAULT_BUDGETS.DAILY_RUN ($25)      │
│                                                              │
│  For Judge/Parse:                                            │
│  • Check environment variables                               │
│  • If not set, use hardcoded defaults                        │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## Error Handling Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Budget Exceeded Error                    │
└─────────────────────────────────────────────────────────────┘
     │
     ├─────────────────────┬──────────────────────────────────┐
     │                     │                                  │
     ▼                     ▼                                  ▼
┌──────────────┐  ┌──────────────────┐  ┌──────────────────────┐
│ Test Run     │  │ Judge Operation  │  │ Parse Operation      │
│ (In-flight)  │  │ (Pre-call)       │  │ (Pre-call)           │
└──────────────┘  └──────────────────┘  └──────────────────────┘
     │                     │                      │
     │                     │                      │
     ▼                     ▼                      ▼
┌──────────────┐  ┌──────────────────┐  ┌──────────────────────┐
│ Abort run    │  │ Return 429       │  │ Return 429           │
│ Set status:  │  │ Don't update     │  │ Don't update         │
│ 'error'      │  │ run status       │  │ run status           │
│              │  │                  │  │                      │
│ Stream:      │  │ Response:        │  │ Response:            │
│ run-error    │  │ {                │  │ {                    │
│ {            │  │   error: "...",  │  │   error: "...",      │
│   error,     │  │   details,       │  │   details,           │
│   budgetEx-  │  │   budgetInfo     │  │   budgetInfo         │
│   ceeded:    │  │ }                │  │ }                    │
│   true,      │  │                  │  │                      │
│   budgetUs-  │  │                  │  │                      │
│   age        │  │                  │  │                      │
│ }            │  │                  │  │                      │
└──────────────┘  └──────────────────┘  └──────────────────────┘
     │                     │                      │
     └─────────────────────┴──────────────────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │ Log warning     │
                  │ with details    │
                  └─────────────────┘
```

## Key Design Decisions

### 1. Two-Layer Validation

- **Real-time tracking** (BudgetTracker): For test runs where multiple model calls happen
- **Pre-call validation** (runBudgetValidator): For single edge function calls

### 2. Token Estimation

- Uses `gpt-tokenizer` for accurate counting
- Estimates response tokens conservatively
- Includes overhead for message structure

### 3. Error Handling

- 429 status code for budget exceeded (standard for rate limiting)
- Detailed error messages with cost breakdown
- Non-destructive (doesn't update run status on validation failure)

### 4. Configuration Priority

1. Request body (most specific)
2. Environment variables (deployment-specific)
3. Hardcoded defaults (fallback)
4. Presets (convenience)

### 5. Streaming Updates

- Real-time budget updates during test runs
- Allows UI to show progress and warn users
- Final summary in completion event

## Integration Points

### Frontend Integration

```typescript
// Listen for budget events
const reader = response.body.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const event = JSON.parse(decoder.decode(value));
  
  if (event.type === 'budget-update') {
    updateBudgetUI(event.usage);
  } else if (event.type === 'run-error' && event.budgetExceeded) {
    showBudgetExceededError(event.error);
  }
}
```

### Backend Integration

```typescript
// In API route
import { BudgetTracker, DEFAULT_BUDGETS } from '@/lib/budgetValidator';

const tracker = new BudgetTracker(config);

// Before each model call
tracker.validateCall(messages, estimatedTokens);

// After each model call
tracker.recordMessageUsage(messages, response);

// Get current usage
const usage = tracker.getUsage();
```

## Performance Characteristics

- **Token counting**: ~1ms for typical messages
- **Budget validation**: <1ms (simple arithmetic)
- **Database queries**: Only for edge function validation
- **Memory usage**: Minimal (tracks counters only)
- **Network overhead**: None (all local computation)

## Security Considerations

- Budget limits prevent cost-based attacks
- Validation happens before expensive operations
- Environment variables for sensitive configuration
- No sensitive data in error messages
- Logging includes validation details for audit
