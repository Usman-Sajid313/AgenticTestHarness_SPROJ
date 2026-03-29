# Showcase Synthetic Logs

This repo now includes a demo-ready fixture set under [tests/fixtures/showcase](/home/shaheer/sproj/AgenticTestHarness_SPROJ/tests/fixtures/showcase) so you can show that the parser accepts multiple agent-log formats, not just one JSONL dialect.

## Included Samples

| File | Parser path | What it demonstrates | Upload metadata |
| --- | --- | --- | --- |
| `openai-agents-multi-tool-success.jsonl` | `openai_agents` adapter | OpenAI Agents style JSONL with `tool_call_id` and `response.output_text` | `sourceType=openai_agents` |
| `langchain-retry-and-recovery.jsonl` | `langchain` adapter | LangChain event stream with repeated `weather_check` call showing retry/recovery | `sourceType=langchain` |
| `generic-jsonl-redaction-and-error.jsonl` | generic JSONL adapter | Generic JSONL, explicit error event, retry, and redactable API key | `sourceType=generic_jsonl` |
| `public-data-trajectories-dual.json` | `public_data_trajectory` adapter | Public benchmark-style JSON with two trajectories in one file | `sourceType=public_data_trajectory`, `formatHint=json`, optional `mappingConfig={"publicDataTrajectoryIndex":0}` or `1` |
| `custom-mapped-json-array.json` | generic JSON adapter | Nonstandard JSON array that needs custom field mapping | `sourceType=generic_json`, `formatHint=json`, `mappingConfig={"idPath":"entry_ref","typePath":"kind","timestampPath":"when","dataPath":"payload"}` |
| `plain-text-agent-session.log` | text fallback | Plain text ingestion when structured JSON is unavailable | `sourceType=generic`, `formatHint=text` |

## Fast Demo Commands

OpenAI Agents sample:

```bash
python3 scripts/upload-and-judge-log.py \
  tests/fixtures/showcase/openai-agents-multi-tool-success.jsonl \
  --base-url http://localhost:3000 \
  --api-key "$ATH_API_KEY" \
  --project-name "Professor Demo OpenAI" \
  --source-type openai_agents
```

LangChain sample:

```bash
python3 scripts/upload-and-judge-log.py \
  tests/fixtures/showcase/langchain-retry-and-recovery.jsonl \
  --base-url http://localhost:3000 \
  --api-key "$ATH_API_KEY" \
  --project-name "Professor Demo LangChain" \
  --source-type langchain
```

Public trajectory sample, first trajectory:

```bash
python3 scripts/upload-and-judge-log.py \
  tests/fixtures/showcase/public-data-trajectories-dual.json \
  --base-url http://localhost:3000 \
  --api-key "$ATH_API_KEY" \
  --project-name "Professor Demo Public Data" \
  --source-type public_data_trajectory \
  --format-hint json \
  --mapping-config-json '{"publicDataTrajectoryIndex":0}'
```

Mapped JSON array sample:

```bash
python3 scripts/upload-and-judge-log.py \
  tests/fixtures/showcase/custom-mapped-json-array.json \
  --base-url http://localhost:3000 \
  --api-key "$ATH_API_KEY" \
  --project-name "Professor Demo Mapped JSON" \
  --source-type generic_json \
  --format-hint json \
  --mapping-config-json '{"idPath":"entry_ref","typePath":"kind","timestampPath":"when","dataPath":"payload"}'
```

Plain text fallback sample:

```bash
python3 scripts/upload-and-judge-log.py \
  tests/fixtures/showcase/plain-text-agent-session.log \
  --base-url http://localhost:3000 \
  --api-key "$ATH_API_KEY" \
  --project-name "Professor Demo Plain Text" \
  --source-type generic \
  --format-hint text
```

## Verification

The fixture set is covered by [tests/unit/showcase-fixtures-parser.test.ts](/home/shaheer/sproj/AgenticTestHarness_SPROJ/tests/unit/showcase-fixtures-parser.test.ts), which validates adapter selection, retry/error heuristics, redaction, public trajectory selection, custom mapping, and plain-text fallback.
