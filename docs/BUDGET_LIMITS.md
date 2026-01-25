# Model Budget Limits

This document describes the budget limiting functionality that prevents excessive model API costs during test execution and evaluation.

## Overview

The budget limiting system tracks token usage and validates costs before making LLM API calls. This prevents runaway costs and ensures operations stay within predefined budget limits.

## Features

### 1. Test Suite Run Budget Validation

Budget validation is automatically applied to all test suite runs via the `/api/test-suite/run` endpoint.

**How it works:**
- Tracks token usage for each model call during the test run
- Validates budget before each model invocation
- Aborts the run if budget would be exceeded
- Reports detailed budget usage in the response

**Configuration:**
```typescript
// Example request body
{
  "model": "gpt-4",
  "temperature": 0.3,
  "maxIterations": 6,
  "budget": {
    "maxBudget": 25,              // Maximum budget in USD
    "costPerMillionTokens": 0.1   // Cost per million tokens in USD
  }
}
```

**Default Budgets:**
- `SMOKE_TEST`: $5
- `BASIC_REGRESSION`: $10
- `DAILY_RUN`: $25 (default if not specified)
- `EXTENDED_RUN`: $50
- `LOAD_TEST`: $100

### 2. Supabase Edge Function Budget Validation

Budget validation is applied before calling Supabase edge functions for parse and judge operations.

**Judge Operations** (`/api/runs/[id]/judge`):
- Default budget: $2.00 per operation
- Validates before calling the judge_run edge function
- Estimates tokens based on task definition and payload size

**Parse Operations** (`/api/runs/[id]/parse`):
- Default budget: $1.00 per operation
- Validates before calling the parse_run edge function
- Estimates tokens based on logfile size

## Environment Variables

You can configure default budget limits using environment variables:

```bash
# Maximum budget for judge operations (in USD)
MAX_JUDGE_BUDGET=2.0

# Maximum budget for parse operations (in USD)
MAX_PARSE_BUDGET=1.0

# Cost per million tokens (in USD) - adjust based on your model pricing
MODEL_COST_PER_MILLION_TOKENS=0.1
```

## API Response Events

### Budget Update Event
During test runs, budget updates are streamed as events:

```json
{
  "type": "budget-update",
  "usage": {
    "totalTokens": 1500,
    "totalCost": 0.00015,
    "remainingBudget": 24.99985,
    "percentUsed": 0.0006
  },
  "summary": "Budget: $0.0002 / $25.00 (0.0% used, 1,500 tokens)"
}
```

### Budget Error Event
When budget is exceeded:

```json
{
  "type": "run-error",
  "error": "Budget exceeded: Call would cost $0.0500, but only $0.0200 remains of $25.00 budget. Total spent so far: $24.9800",
  "budgetExceeded": true,
  "budgetUsage": {
    "totalTokens": 249800,
    "totalCost": 24.98,
    "remainingBudget": 0.02,
    "percentUsed": 99.92
  }
}
```

### Run Complete Event
Final budget information is included:

```json
{
  "type": "run-complete",
  "run": { /* run details */ },
  "budgetUsage": {
    "totalTokens": 5000,
    "totalCost": 0.0005,
    "remainingBudget": 24.9995,
    "percentUsed": 0.002
  },
  "budgetSummary": "Budget: $0.0005 / $25.00 (0.0% used, 5,000 tokens)"
}
```

## HTTP Status Codes

### 429 Too Many Requests
Returned when a budget limit would be exceeded:

```json
{
  "error": "Budget limit exceeded",
  "details": "Estimated cost ($2.5000) exceeds judge budget limit ($2.00)",
  "budgetInfo": {
    "estimatedCost": 2.5,
    "budgetLimit": 2.0
  }
}
```

## Token Estimation

The system uses different estimation strategies:

### Test Suite Runs
- **Input tokens**: Counted from all messages in the conversation history
- **Output tokens**: Estimated at 500 tokens per response (can be adjusted)
- Uses `gpt-tokenizer` library for accurate token counting

### Judge Operations
Estimates based on:
- Base judge prompt: ~2000 tokens
- Task definition size
- Input payload size
- Expected response: ~1500 tokens

### Parse Operations
Estimates based on:
- Base parse prompt: ~1500 tokens
- Logfile size (capped at 10k tokens)
- Expected response: ~2000 tokens

## Implementation Details

### Budget Validator (`src/lib/budgetValidator.ts`)

Core class for tracking and validating budget during test runs:

```typescript
import { BudgetTracker, DEFAULT_BUDGETS } from '@/lib/budgetValidator';

// Create tracker
const tracker = new BudgetTracker({
  maxBudget: 25,
  costPerMillionTokens: 0.1
});

// Validate before call
tracker.validateCall(messages, estimatedResponseTokens);

// Record after call
tracker.recordMessageUsage(messages, responseContent);

// Get usage
const usage = tracker.getUsage();
```

### Run Budget Validator (`src/lib/runBudgetValidator.ts`)

Validates budget for Supabase edge function calls:

```typescript
import { validateJudgeBudget, validateParseBudget } from '@/lib/runBudgetValidator';

// Validate judge operation
const validation = await validateJudgeBudget(runId);
if (!validation.allowed) {
  // Reject the request
}

// Validate parse operation
const validation = await validateParseBudget(runId);
if (!validation.allowed) {
  // Reject the request
}
```

## Best Practices

1. **Set Appropriate Budgets**: Choose budgets based on test complexity and expected token usage
2. **Monitor Usage**: Review budget usage metrics to optimize costs
3. **Adjust Estimates**: Fine-tune token estimates based on actual usage patterns
4. **Handle Errors**: Implement proper error handling for budget exceeded scenarios
5. **Environment Configuration**: Use environment variables for production settings

## Example Usage

### Running a Test with Custom Budget

```typescript
const response = await fetch('/api/test-suite/run', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'gpt-4',
    temperature: 0.3,
    budget: {
      maxBudget: 10,           // $10 budget
      costPerMillionTokens: 0.15  // Adjust for your model
    }
  })
});

// Stream events
const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const text = decoder.decode(value);
  const lines = text.split('\n').filter(Boolean);
  
  for (const line of lines) {
    const event = JSON.parse(line);
    
    if (event.type === 'budget-update') {
      console.log('Budget usage:', event.usage);
    } else if (event.type === 'run-error' && event.budgetExceeded) {
      console.error('Budget exceeded!', event.error);
    }
  }
}
```

### Frontend Integration

Display budget information in the UI:

```typescript
function BudgetIndicator({ usage }) {
  const percentUsed = usage.percentUsed;
  const color = percentUsed > 90 ? 'red' : percentUsed > 70 ? 'yellow' : 'green';
  
  return (
    <div>
      <progress value={percentUsed} max={100} color={color} />
      <span>
        ${usage.totalCost.toFixed(4)} / ${usage.maxBudget.toFixed(2)}
        ({percentUsed.toFixed(1)}% used)
      </span>
    </div>
  );
}
```

## Troubleshooting

### Budget Exceeded Too Quickly

**Problem**: Tests abort due to budget limits before completion.

**Solutions**:
- Increase the budget limit
- Optimize prompts to use fewer tokens
- Use a cheaper model for testing
- Reduce `maxIterations` parameter

### Inaccurate Estimates

**Problem**: Actual costs differ significantly from estimates.

**Solutions**:
- Adjust `estimatedResponseTokens` parameter
- Review token estimation logic for your specific use case
- Update `costPerMillionTokens` to match actual model pricing

### Budget Validation Failures

**Problem**: Budget validation fails unexpectedly.

**Solutions**:
- Check environment variables are set correctly
- Verify database connection for run budget validation
- Review logs for detailed error messages
- Ensure model pricing configuration is up to date
