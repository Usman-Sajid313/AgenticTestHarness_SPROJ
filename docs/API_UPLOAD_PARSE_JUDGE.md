# Programmatic Upload, Parse, and Judge

This document describes the simplest API flow for taking a local agent log file, uploading it to the app, parsing it, judging it, and retrieving the final result using a bearer token.

## Requirements

- An API token with both `read` and `write` scopes
- A local `.jsonl` log file
- A running app instance, for example `http://46.225.10.148:9998`

## Endpoints Used

- `POST /api/projects`
  Creates a project. This requires `write`.
- `POST /api/runs/upload-logfile`
  Uploads a local log file and creates a run in `UPLOADED` state. This requires `write`.
- `POST /api/runs/{runId}/parse`
  Triggers parsing. A successful parse moves the run to `READY_FOR_JUDGING`. This requires `write`.
- `POST /api/runs/{runId}/judge`
  Triggers judging. A successful judge moves the run to `COMPLETED` or `COMPLETED_LOW_CONFIDENCE`. This requires `write`.
- `GET /api/runs/{runId}`
  Fetches the run, parser output, and judge output. This requires `read`.

## Lifecycle

1. Create or choose a project.
2. Upload the `.jsonl` file with `POST /api/runs/upload-logfile`.
3. Trigger parsing with `POST /api/runs/{runId}/parse`.
4. Poll `GET /api/runs/{runId}` until the run reaches `READY_FOR_JUDGING`.
5. Trigger judging with `POST /api/runs/{runId}/judge`.
6. Poll `GET /api/runs/{runId}` until the run reaches `COMPLETED`, `COMPLETED_LOW_CONFIDENCE`, or `FAILED`.

## Minimal curl Example

```bash
TOKEN='your_read_write_token'
BASE='http://46.225.10.148:9998'

PROJECT_ID=$(
  curl -sS -X POST "$BASE/api/projects" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    --data '{"name":"integration-project","description":"programmatic ingest"}' \
  | jq -r '.id'
)

RUN_ID=$(
  curl -sS -X POST "$BASE/api/runs/upload-logfile" \
    -H "Authorization: Bearer $TOKEN" \
    -F "file=@/absolute/path/to/run.jsonl;type=application/x-ndjson" \
    -F "projectId=$PROJECT_ID" \
    -F "sourceType=generic_jsonl" \
  | jq -r '.runId'
)

curl -sS -X POST "$BASE/api/runs/$RUN_ID/parse" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{}'

curl -sS -X POST "$BASE/api/runs/$RUN_ID/judge" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{}'

curl -sS "$BASE/api/runs/$RUN_ID" \
  -H "Authorization: Bearer $TOKEN" | jq
```

## Python Demo Script

Use [scripts/upload-and-judge-log.py](/home/shaheer/sproj/AgenticTestHarness_SPROJ/scripts/upload-and-judge-log.py). It:

- creates a project unless `--project-id` is supplied
- uploads a local log file
- triggers parse and judge
- polls the run until each stage completes
- prints verbose progress and the final result JSON

Example:

```bash
python3 scripts/upload-and-judge-log.py /absolute/path/to/run.jsonl \
  --base-url http://46.225.10.148:9998 \
  --api-key 'your_read_write_token' \
  --project-name 'Professor Demo'
```

If you already have a project:

```bash
python3 scripts/upload-and-judge-log.py /absolute/path/to/run.jsonl \
  --base-url http://46.225.10.148:9998 \
  --api-key 'your_read_write_token' \
  --project-id your_existing_project_id
```

To print the full raw run-detail payload instead of the compact summary:

```bash
python3 scripts/upload-and-judge-log.py /absolute/path/to/run.jsonl \
  --base-url http://46.225.10.148:9998 \
  --api-key 'your_read_write_token' \
  --project-name 'Professor Demo' \
  --full-result
```

## Notes

- `write` does not imply `read`. Use one token with both scopes for full API automation.
- `/api/account/*` routes are session-only and cannot be used with bearer tokens.
- If project creation fails because the project name already exists in the workspace, use a unique `--project-name` or reuse an existing `--project-id`.
