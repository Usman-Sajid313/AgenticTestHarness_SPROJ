import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // ← Add this block as the FIRST entry → global ignore
  {
    ignores: [
      "supabase/functions/**",      // ignore entire supabase/functions folder recursively
      "supabase/functions/**/*",    // optional extra coverage
    ],
  },

  // Your existing Next.js + TypeScript config
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
