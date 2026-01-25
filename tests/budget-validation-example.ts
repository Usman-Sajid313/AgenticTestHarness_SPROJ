/**
 * Budget Validation Example
 * 
 * This file demonstrates how to use the budget validation system.
 * Run with: npx tsx tests/budget-validation-example.ts
 */

import { BudgetTracker, DEFAULT_BUDGETS } from '../src/lib/budgetValidator';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';

console.log('=== Budget Validation Example ===\n');

// Example 1: Basic usage
console.log('Example 1: Basic Budget Tracking');
console.log('-----------------------------------');

const tracker = new BudgetTracker({
  maxBudget: 10,
  costPerMillionTokens: 0.1,
});

const messages = [
  new SystemMessage('You are a helpful assistant that helps with travel planning.'),
  new HumanMessage('Plan a 3-day trip to Tokyo'),
];

console.log('Initial budget:', tracker.getSummary());

// Simulate a model call
try {
  tracker.validateCall(messages, 500);
  console.log('✓ Budget validation passed');
  
  // Simulate the response
  const response = 'Here is a detailed 3-day itinerary for Tokyo...';
  tracker.recordMessageUsage(messages, response);
  
  console.log('After call:', tracker.getSummary());
  console.log('Usage:', tracker.getUsage());
} catch (error) {
  console.error('✗ Budget validation failed:', (error as Error).message);
}

console.log('\n');

// Example 2: Budget exhaustion
console.log('Example 2: Budget Exhaustion');
console.log('-----------------------------------');

const smallTracker = new BudgetTracker({
  maxBudget: 0.01, // Very small budget
  costPerMillionTokens: 0.1,
});

console.log('Initial budget:', smallTracker.getSummary());

// Try to make multiple calls
for (let i = 1; i <= 5; i++) {
  try {
    smallTracker.validateCall(messages, 500);
    smallTracker.recordUsage(10000, 500); // Simulate usage
    console.log(`Call ${i}: ✓ Success - ${smallTracker.getSummary()}`);
  } catch (error) {
    console.log(`Call ${i}: ✗ Failed - ${(error as Error).message}`);
    break;
  }
}

console.log('\n');

// Example 3: Using default budgets
console.log('Example 3: Default Budget Configurations');
console.log('-----------------------------------');

for (const [name, config] of Object.entries(DEFAULT_BUDGETS)) {
  console.log(`${name}:`, {
    maxBudget: `$${config.maxBudget}`,
    costPerMillionTokens: `$${config.costPerMillionTokens}`,
  });
}

console.log('\n');

// Example 4: Cost estimation
console.log('Example 4: Cost Estimation');
console.log('-----------------------------------');

const estimator = new BudgetTracker({
  maxBudget: 100,
  costPerMillionTokens: 0.1,
});

const testMessages = [
  new SystemMessage('You are a code review assistant.'),
  new HumanMessage('Review this Python function: def add(a, b): return a + b'),
];

const estimatedTokens = estimator.estimateCallTokens(testMessages, 1000);
const estimatedCost = estimator.calculateCost(estimatedTokens);

console.log('Estimated tokens:', estimatedTokens);
console.log('Estimated cost:', `$${estimatedCost.toFixed(6)}`);
console.log('Can afford call:', estimatedCost <= 100);

console.log('\n');

// Example 5: Real-world scenario
console.log('Example 5: Real-world Test Run Scenario');
console.log('-----------------------------------');

const testRunTracker = new BudgetTracker(DEFAULT_BUDGETS.DAILY_RUN);

console.log('Starting test run with budget:', testRunTracker.getSummary());

// Simulate multiple iterations of a test run
const iterations = [
  { input: 'Initialize test environment', response: 'Environment ready', tokens: 150 },
  { input: 'Execute test case 1', response: 'Test passed with output...', tokens: 300 },
  { input: 'Execute test case 2', response: 'Test passed with output...', tokens: 280 },
  { input: 'Execute test case 3', response: 'Test failed with error...', tokens: 350 },
  { input: 'Analyze failures', response: 'Failure analysis complete...', tokens: 400 },
];

for (let i = 0; i < iterations.length; i++) {
  const iteration = iterations[i];
  const iterationMessages = [
    new SystemMessage('You are a test execution agent.'),
    new HumanMessage(iteration.input),
  ];
  
  try {
    testRunTracker.validateCall(iterationMessages, iteration.tokens);
    testRunTracker.recordMessageUsage(iterationMessages, iteration.response);
    
    const usage = testRunTracker.getUsage();
    console.log(`Iteration ${i + 1}: ✓ ${iteration.input}`);
    console.log(`  Cost: $${usage.totalCost.toFixed(6)} (${usage.percentUsed.toFixed(2)}% used)`);
  } catch (error) {
    console.log(`Iteration ${i + 1}: ✗ Budget exceeded`);
    console.log(`  ${(error as Error).message}`);
    break;
  }
}

console.log('\nFinal:', testRunTracker.getSummary());
console.log('Test run completed:', !testRunTracker.isExhausted() ? '✓' : '✗ (budget exhausted)');

console.log('\n=== Example Complete ===');
