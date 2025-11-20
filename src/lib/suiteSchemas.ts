import { z } from 'zod';

export const testSuiteSchema = z.object({
  name: z.string().trim().min(1, "Task name is required").max(100),
  
  corePrompt: z.string().trim().min(10, "Prompt must be at least 10 characters"),
  
  toolIds: z.array(z.string()).min(1, "Select at least one tool"),
  
  config: z.object({
    model: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().optional(),
  }).optional(),
  
  variables: z.record(z.string(), z.string()).optional(),
});

export type TestSuitePayload = z.infer<typeof testSuiteSchema>;