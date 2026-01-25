import { encode } from 'gpt-tokenizer';
import { BaseMessage } from '@langchain/core/messages';

const MILLION = 1_000_000;

/**
 * Configuration for budget validation
 */
export interface BudgetConfig {
  /** Maximum budget in USD */
  maxBudget: number;
  /** Cost per million tokens in USD */
  costPerMillionTokens: number;
}

/**
 * Tracks budget usage across model calls
 */
export class BudgetTracker {
  private totalTokens: number = 0;
  private totalCost: number = 0;
  private config: BudgetConfig;

  constructor(config: BudgetConfig) {
    this.config = config;
    
    if (config.maxBudget <= 0) {
      throw new Error('Budget must be greater than 0');
    }
    
    if (config.costPerMillionTokens <= 0) {
      throw new Error('Cost per million tokens must be greater than 0');
    }
  }

  /**
   * Count tokens in a text string
   */
  private countTokens(text: string): number {
    return encode(text).length;
  }

  /**
   * Count tokens in a message array
   */
  private countMessagesTokens(messages: BaseMessage[]): number {
    let total = 0;
    
    for (const message of messages) {
      // Count content tokens
      if (typeof message.content === 'string') {
        total += this.countTokens(message.content);
      } else if (Array.isArray(message.content)) {
        for (const part of message.content) {
          if (typeof part === 'string') {
            total += this.countTokens(part);
          } else if ('text' in part && typeof part.text === 'string') {
            total += this.countTokens(part.text);
          } else {
            // For other content types, estimate based on JSON length
            total += this.countTokens(JSON.stringify(part));
          }
        }
      }
      
      // Count role/metadata tokens (approximately 4 tokens per message for role and structure)
      total += 4;
    }
    
    return total;
  }

  /**
   * Estimate tokens for the upcoming model call
   * This includes the messages being sent
   */
  estimateCallTokens(messages: BaseMessage[], estimatedResponseTokens: number = 500): number {
    const inputTokens = this.countMessagesTokens(messages);
    return inputTokens + estimatedResponseTokens;
  }

  /**
   * Calculate cost for a given number of tokens
   */
  calculateCost(tokens: number): number {
    return Number(((tokens / MILLION) * this.config.costPerMillionTokens).toFixed(6));
  }

  /**
   * Validate if a model call can be made without exceeding budget
   * @returns true if call can proceed, false otherwise
   * @throws Error with details if budget would be exceeded
   */
  validateCall(messages: BaseMessage[], estimatedResponseTokens: number = 500): boolean {
    const estimatedTokens = this.estimateCallTokens(messages, estimatedResponseTokens);
    const estimatedCost = this.calculateCost(estimatedTokens);
    const projectedTotal = this.totalCost + estimatedCost;

    if (projectedTotal > this.config.maxBudget) {
      const remaining = this.config.maxBudget - this.totalCost;
      throw new Error(
        `Budget exceeded: Call would cost $${estimatedCost.toFixed(4)}, ` +
        `but only $${remaining.toFixed(4)} remains of $${this.config.maxBudget.toFixed(2)} budget. ` +
        `Total spent so far: $${this.totalCost.toFixed(4)}`
      );
    }

    return true;
  }

  /**
   * Record actual token usage after a model call
   * @param inputTokens Number of tokens in the input
   * @param outputTokens Number of tokens in the output
   */
  recordUsage(inputTokens: number, outputTokens: number): void {
    const totalCallTokens = inputTokens + outputTokens;
    const callCost = this.calculateCost(totalCallTokens);
    
    this.totalTokens += totalCallTokens;
    this.totalCost += callCost;
  }

  /**
   * Record usage based on messages and response
   */
  recordMessageUsage(messages: BaseMessage[], responseContent: string): void {
    const inputTokens = this.countMessagesTokens(messages);
    const outputTokens = this.countTokens(responseContent);
    this.recordUsage(inputTokens, outputTokens);
  }

  /**
   * Get current usage statistics
   */
  getUsage() {
    return {
      totalTokens: this.totalTokens,
      totalCost: this.totalCost,
      remainingBudget: Math.max(0, this.config.maxBudget - this.totalCost),
      percentUsed: (this.totalCost / this.config.maxBudget) * 100,
    };
  }

  /**
   * Check if budget is exhausted
   */
  isExhausted(): boolean {
    return this.totalCost >= this.config.maxBudget;
  }

  /**
   * Get formatted usage summary
   */
  getSummary(): string {
    const usage = this.getUsage();
    return (
      `Budget: $${this.totalCost.toFixed(4)} / $${this.config.maxBudget.toFixed(2)} ` +
      `(${usage.percentUsed.toFixed(1)}% used, ${usage.totalTokens.toLocaleString()} tokens)`
    );
  }
}

/**
 * Default budget configurations for different scenarios
 */
export const DEFAULT_BUDGETS = {
  SMOKE_TEST: { maxBudget: 5, costPerMillionTokens: 0.1 },
  BASIC_REGRESSION: { maxBudget: 10, costPerMillionTokens: 0.1 },
  DAILY_RUN: { maxBudget: 25, costPerMillionTokens: 0.1 },
  EXTENDED_RUN: { maxBudget: 50, costPerMillionTokens: 0.1 },
  LOAD_TEST: { maxBudget: 100, costPerMillionTokens: 0.1 },
} as const;
