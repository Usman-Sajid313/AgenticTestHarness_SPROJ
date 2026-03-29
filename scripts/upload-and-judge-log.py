#!/usr/bin/env python3
"""Upload a local JSONL log, trigger parse and judge, then print the result."""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import sys
import time
import uuid
from pathlib import Path
from typing import Any
from urllib import error, request


DEFAULT_TIMEOUT_SECONDS = 900
DEFAULT_POLL_INTERVAL_SECONDS = 3.0


class ApiError(RuntimeError):
    def __init__(self, status: int, payload: Any):
        self.status = status
        self.payload = payload
        super().__init__(f"API request failed with status {status}: {payload}")


def log(message: str) -> None:
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] {message}", flush=True)


def coerce_payload(raw: bytes, content_type: str | None) -> Any:
    text = raw.decode("utf-8", errors="replace")
    if not text:
        return None

    wants_json = False
    if content_type:
        wants_json = "application/json" in content_type.lower()
    if text[:1] in ("{", "["):
        wants_json = True

    if wants_json:
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return text
    return text


def http_request(
    method: str,
    url: str,
    api_key: str,
    *,
    body: bytes | None = None,
    content_type: str | None = None,
    timeout: int = 60,
) -> Any:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
    }
    if content_type:
        headers["Content-Type"] = content_type

    req = request.Request(url, data=body, method=method, headers=headers)
    try:
        with request.urlopen(req, timeout=timeout) as resp:
            payload = coerce_payload(resp.read(), resp.headers.get("Content-Type"))
            return payload
    except error.HTTPError as exc:
        payload = coerce_payload(exc.read(), exc.headers.get("Content-Type"))
        raise ApiError(exc.code, payload) from exc


def http_json(
    method: str,
    url: str,
    api_key: str,
    payload: dict[str, Any] | None = None,
    *,
    timeout: int = 60,
) -> Any:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    return http_request(
        method,
        url,
        api_key,
        body=body,
        content_type="application/json",
        timeout=timeout,
    )


def encode_multipart(fields: dict[str, str], file_field: str, file_path: Path) -> tuple[bytes, str]:
    boundary = f"----AgenticTestHarness{uuid.uuid4().hex}"
    chunks: list[bytes] = []

    for key, value in fields.items():
        chunks.append(f"--{boundary}\r\n".encode("utf-8"))
        chunks.append(
            f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode("utf-8")
        )
        chunks.append(value.encode("utf-8"))
        chunks.append(b"\r\n")

    filename = file_path.name
    mime_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    file_bytes = file_path.read_bytes()

    chunks.append(f"--{boundary}\r\n".encode("utf-8"))
    chunks.append(
        (
            f'Content-Disposition: form-data; name="{file_field}"; '
            f'filename="{filename}"\r\n'
        ).encode("utf-8")
    )
    chunks.append(f"Content-Type: {mime_type}\r\n\r\n".encode("utf-8"))
    chunks.append(file_bytes)
    chunks.append(b"\r\n")
    chunks.append(f"--{boundary}--\r\n".encode("utf-8"))

    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


def upload_log(
    base_url: str,
    api_key: str,
    project_id: str,
    file_path: Path,
    source_type: str | None,
    format_hint: str | None,
    mapping_config: dict[str, Any] | None,
) -> dict[str, Any]:
    fields = {
        "projectId": project_id,
    }
    if source_type:
        fields["sourceType"] = source_type
    if format_hint:
        fields["formatHint"] = format_hint
    if mapping_config is not None:
        fields["mappingConfig"] = json.dumps(mapping_config)

    body, content_type = encode_multipart(fields, "file", file_path)
    payload = http_request(
        "POST",
        f"{base_url}/api/runs/upload-logfile",
        api_key,
        body=body,
        content_type=content_type,
        timeout=300,
    )
    if not isinstance(payload, dict):
        raise RuntimeError(f"Unexpected upload response: {payload}")
    return payload


def create_project(base_url: str, api_key: str, project_name: str, project_description: str) -> str:
    payload = http_json(
        "POST",
        f"{base_url}/api/projects",
        api_key,
        {
            "name": project_name,
            "description": project_description,
        },
    )
    if not isinstance(payload, dict) or "id" not in payload:
        raise RuntimeError(f"Unexpected create-project response: {payload}")
    return str(payload["id"])


def fetch_run_detail(base_url: str, api_key: str, run_id: str) -> dict[str, Any]:
    payload = http_json("GET", f"{base_url}/api/runs/{run_id}", api_key)
    if not isinstance(payload, dict):
        raise RuntimeError(f"Unexpected run-detail response: {payload}")
    return payload


def wait_for_run_status(
    base_url: str,
    api_key: str,
    run_id: str,
    *,
    target_statuses: set[str],
    terminal_failure_statuses: set[str],
    timeout_seconds: int,
    poll_interval_seconds: float,
) -> dict[str, Any]:
    started = time.time()
    last_status: str | None = None

    while True:
        detail = fetch_run_detail(base_url, api_key, run_id)
        run = detail.get("run") or {}
        status = str(run.get("status"))

        if status != last_status:
            log(f"Run {run_id} status -> {status}")
            last_status = status

        if status in target_statuses:
            return detail

        if status in terminal_failure_statuses:
            raise RuntimeError(f"Run {run_id} entered failure state: {status}")

        if time.time() - started > timeout_seconds:
            raise TimeoutError(
                f"Timed out after {timeout_seconds}s waiting for {sorted(target_statuses)}"
            )

        time.sleep(poll_interval_seconds)


def pretty_dump(value: Any) -> str:
    return json.dumps(value, indent=2, sort_keys=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Upload a local log file, trigger parse + judge, and print the result."
    )
    parser.add_argument("log_file", help="Path to the local JSONL log file.")
    parser.add_argument(
        "--base-url",
        default=os.environ.get("ATH_BASE_URL", "http://localhost:3000"),
        help="App base URL. Defaults to ATH_BASE_URL or http://localhost:3000",
    )
    parser.add_argument(
        "--api-key",
        default=os.environ.get("ATH_API_KEY"),
        help="Bearer token with read+write scopes. Defaults to ATH_API_KEY",
    )
    parser.add_argument(
        "--project-name",
        default=f"Programmatic Upload Demo {time.strftime('%Y-%m-%d %H:%M:%S')}",
        help="Project name to create if --project-id is not supplied.",
    )
    parser.add_argument(
        "--project-description",
        default="Created by scripts/upload-and-judge-log.py",
        help="Description to use when creating a project.",
    )
    parser.add_argument(
        "--project-id",
        help="Existing project ID to use. If omitted, a new project is created.",
    )
    parser.add_argument(
        "--source-type",
        default="generic_jsonl",
        help="Optional source type sent with upload-logfile. Defaults to generic_jsonl.",
    )
    parser.add_argument(
        "--format-hint",
        choices=["json", "jsonl", "text"],
        help="Optional format hint sent with upload-logfile.",
    )
    parser.add_argument(
        "--mapping-config-json",
        help="Inline JSON object to send as mappingConfig during upload.",
    )
    parser.add_argument(
        "--mapping-config-file",
        help="Path to a JSON file to send as mappingConfig during upload.",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=int,
        default=DEFAULT_TIMEOUT_SECONDS,
        help=f"Overall wait timeout per phase. Defaults to {DEFAULT_TIMEOUT_SECONDS}.",
    )
    parser.add_argument(
        "--poll-interval-seconds",
        type=float,
        default=DEFAULT_POLL_INTERVAL_SECONDS,
        help=f"Polling interval. Defaults to {DEFAULT_POLL_INTERVAL_SECONDS}.",
    )
    parser.add_argument(
        "--full-result",
        action="store_true",
        help="Print the full run-detail payload instead of the compact summary.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    if not args.api_key:
        print("Missing API key. Pass --api-key or set ATH_API_KEY.", file=sys.stderr)
        return 2

    file_path = Path(args.log_file).expanduser().resolve()
    if not file_path.is_file():
        print(f"Log file not found: {file_path}", file=sys.stderr)
        return 2

    base_url = args.base_url.rstrip("/")
    log(f"Using base URL: {base_url}")
    log(f"Using log file: {file_path}")

    if args.mapping_config_json and args.mapping_config_file:
        print(
            "Pass only one of --mapping-config-json or --mapping-config-file.",
            file=sys.stderr,
        )
        return 2

    mapping_config: dict[str, Any] | None = None
    if args.mapping_config_json:
        try:
            raw = json.loads(args.mapping_config_json)
        except json.JSONDecodeError as exc:
            print(f"Invalid --mapping-config-json: {exc}", file=sys.stderr)
            return 2
        if not isinstance(raw, dict):
            print("--mapping-config-json must decode to a JSON object.", file=sys.stderr)
            return 2
        mapping_config = raw
    elif args.mapping_config_file:
        mapping_path = Path(args.mapping_config_file).expanduser().resolve()
        if not mapping_path.is_file():
            print(f"Mapping config file not found: {mapping_path}", file=sys.stderr)
            return 2
        try:
            raw = json.loads(mapping_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            print(f"Invalid JSON in mapping config file: {exc}", file=sys.stderr)
            return 2
        if not isinstance(raw, dict):
            print("Mapping config file must contain a JSON object.", file=sys.stderr)
            return 2
        mapping_config = raw

    try:
        if args.project_id:
            project_id = args.project_id
            log(f"Using existing project ID: {project_id}")
        else:
            log(f"Creating project: {args.project_name}")
            project_id = create_project(
                base_url,
                args.api_key,
                args.project_name,
                args.project_description,
            )
            log(f"Created project: {project_id}")

        log("Uploading log file and creating run")
        upload = upload_log(
            base_url,
            args.api_key,
            project_id,
            file_path,
            args.source_type,
            args.format_hint,
            mapping_config,
        )
        run_id = str(upload["runId"])
        log(f"Upload complete: runId={run_id}, status={upload.get('status')}")

        log("Triggering parser")
        parse_response = http_json(
            "POST",
            f"{base_url}/api/runs/{run_id}/parse",
            args.api_key,
            {},
            timeout=300,
        )
        log(f"Parser response: {pretty_dump(parse_response)}")

        wait_for_run_status(
            base_url,
            args.api_key,
            run_id,
            target_statuses={"READY_FOR_JUDGING"},
            terminal_failure_statuses={"FAILED"},
            timeout_seconds=args.timeout_seconds,
            poll_interval_seconds=args.poll_interval_seconds,
        )

        log("Triggering judger")
        judge_response = http_json(
            "POST",
            f"{base_url}/api/runs/{run_id}/judge",
            args.api_key,
            {},
            timeout=300,
        )
        log(f"Judge response: {pretty_dump(judge_response)}")

        final_detail = wait_for_run_status(
            base_url,
            args.api_key,
            run_id,
            target_statuses={"COMPLETED", "COMPLETED_LOW_CONFIDENCE", "FAILED"},
            terminal_failure_statuses=set(),
            timeout_seconds=args.timeout_seconds,
            poll_interval_seconds=args.poll_interval_seconds,
        )

        run = final_detail.get("run") or {}
        evaluation = final_detail.get("evaluation") or {}
        metric_breakdown = evaluation.get("metricBreakdown") or {}
        dimensions = metric_breakdown.get("dimensions") or {}
        dimension_scores = {
            name: values.get("score")
            for name, values in dimensions.items()
            if isinstance(values, dict) and "score" in values
        }
        compact_summary = {
            "runId": run.get("id"),
            "projectId": run.get("projectId"),
            "runStatus": run.get("status"),
            "evaluationStatus": evaluation.get("status"),
            "totalScore": evaluation.get("totalScore"),
            "confidence": evaluation.get("confidence"),
            "summary": evaluation.get("summary"),
            "dimensionScores": dimension_scores,
            "metrics": {
                "totalSteps": (final_detail.get("metrics") or {}).get("totalSteps"),
                "totalToolCalls": (final_detail.get("metrics") or {}).get("totalToolCalls"),
                "totalErrors": (final_detail.get("metrics") or {}).get("totalErrors"),
                "totalRetries": (final_detail.get("metrics") or {}).get("totalRetries"),
                "totalDurationMs": (final_detail.get("metrics") or {}).get("totalDurationMs"),
            },
            "parseReport": ((final_detail.get("traceSummary") or {}).get("parseReport") or {}),
            "ruleFlags": final_detail.get("ruleFlags"),
        }

        log("Final result summary")
        print(pretty_dump(final_detail if args.full_result else compact_summary))
        return 0 if run.get("status") != "FAILED" else 1

    except ApiError as exc:
        print(
            f"Request failed with status {exc.status}.\n{pretty_dump(exc.payload)}",
            file=sys.stderr,
        )
        if not args.project_id:
            print(
                "If project creation failed, try a unique --project-name or reuse an existing --project-id.",
                file=sys.stderr,
            )
        return 1
    except Exception as exc:  # pragma: no cover - CLI guardrail
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
