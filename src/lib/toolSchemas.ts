import { z } from "zod";

export const parameterTypes = [
  "string",
  "integer",
  "number",
  "boolean",
] as const;

const parameterTypeByJsonType: Record<string, (typeof parameterTypes)[number]> =
  {
    string: "string",
    integer: "integer",
    number: "number",
    boolean: "boolean",
  };

export const toolParameterSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Parameter name is required")
    .max(50, "Parameter name must be 50 characters or fewer")
    .regex(
      /^[a-zA-Z][a-zA-Z0-9_]*$/,
      "Parameter name must start with a letter and contain only letters, numbers, or underscores"
    ),
  type: z.enum(parameterTypes, { message: "Parameter type is invalid" }),
  description: z
    .string()
    .trim()
    .max(200, "Parameter description must be 200 characters or fewer")
    .optional()
    .transform((value) => (value ? value : undefined)),
  required: z.boolean().default(true),
});

export const outputFormats = ["text", "json"] as const;

export const toolOutputSchema = z.object({
  format: z.enum(outputFormats, { message: "Output format is invalid" }),
  schema: z.any().optional(),
});

export const toolCreatePayloadSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters long")
      .max(100, "Name must be 100 characters or fewer"),
    description: z
      .string()
      .trim()
      .min(10, "Description must be at least 10 characters long")
      .max(1000, "Description must be 1000 characters or fewer"),
    parameters: z
      .array(toolParameterSchema)
      .max(20, "A tool can have at most 20 parameters"),
    output: toolOutputSchema,
  })
  .superRefine((data, ctx) => {
    const seen = new Set<string>();
    data.parameters.forEach((param, index) => {
      const key = param.name.toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["parameters", index, "name"],
          message: "Parameter names must be unique (case-insensitive)",
        });
      } else {
        seen.add(key);
      }
    });

    if (data.output.format === "json") {
      if (data.output.schema === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["output", "schema"],
          message: "Output schema is required when format is JSON",
        });
      } else if (
        typeof data.output.schema !== "object" ||
        data.output.schema === null ||
        Array.isArray(data.output.schema)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["output", "schema"],
          message: "Output schema must be a JSON object",
        });
      }
    }
  });

export type ToolCreatePayload = z.infer<typeof toolCreatePayloadSchema>;
export type ToolParameter = z.infer<typeof toolParameterSchema>;

export type JsonSchema = Record<string, unknown>;

const jsonTypeMap: Record<(typeof parameterTypes)[number], string> = {
  string: "string",
  integer: "integer",
  number: "number",
  boolean: "boolean",
};

export function createEmptyParameter(): ToolParameter {
  return {
    name: "",
    type: "string",
    description: undefined,
    required: true,
  };
}

export function buildInputJsonSchema(parameters: ToolParameter[]): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];

  parameters.forEach((param) => {
    properties[param.name] = {
      type: jsonTypeMap[param.type],
      ...(param.description ? { description: param.description } : {}),
    };
    if (param.required) {
      required.push(param.name);
    }
  });

  return {
    type: "object",
    title: "Tool Input Schema",
    description: "Input parameters accepted by this tool",
    properties,
    required,
    additionalProperties: false,
  } satisfies JsonSchema;
}

export function buildOutputJsonSchema(
  output: ToolCreatePayload["output"]
): JsonSchema {
  if (output.format === "text") {
    return {
      type: "string",
      description: "Free-form text response returned by this tool",
      "x-agentic-format": "text",
    } satisfies JsonSchema;
  }

  const schema = {
    title: "Tool Output Schema",
    description: "JSON response returned by this tool",
    ...((output.schema as JsonSchema) ?? {}),
  } satisfies JsonSchema;

  return {
    ...schema,
    "x-agentic-format": "json",
  } satisfies JsonSchema;
}

export function parseInputJsonSchema(schema: unknown): ToolParameter[] {
  if (!schema || typeof schema !== "object") return [];
  const record = schema as Record<string, unknown>;
  const properties =
    (record.properties as Record<string, unknown> | undefined) ?? {};
  const required = Array.isArray(record.required)
    ? (record.required as string[])
    : [];

  return Object.entries(properties).map(([name, value]) => {
    const details = (value as Record<string, unknown>) ?? {};
    const typeRaw = typeof details.type === "string" ? details.type : "string";
    const mappedType = parameterTypeByJsonType[typeRaw] ?? "string";
    const description =
      typeof details.description === "string" ? details.description : undefined;
    return {
      name,
      type: mappedType,
      description,
      required: required.includes(name),
    } satisfies ToolParameter;
  });
}

export function parseOutputJsonSchema(
  schema: unknown
): ToolCreatePayload["output"] {
  if (!schema || typeof schema !== "object") {
    return { format: "text" };
  }

  const withFormat = schema as Record<string, unknown> & {
    "x-agentic-format"?: unknown;
  };
  const formatTag = withFormat["x-agentic-format"];

  if (formatTag === "text") {
    return { format: "text" };
  }

  const cloned = { ...withFormat } as Record<string, unknown>;
  delete cloned["x-agentic-format"];

  if (formatTag === "json") {
    return { format: "json", schema: cloned };
  }

  if (
    (withFormat.type === "string" || cloned.type === "string") &&
    !("properties" in cloned)
  ) {
    return { format: "text" };
  }

  return { format: "json", schema: cloned };
}
