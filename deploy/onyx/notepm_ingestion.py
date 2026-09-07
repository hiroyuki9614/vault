#!/usr/bin/env python3
"""Bounded reference adapter for indexing NotePM pages into Onyx.

This is an optional deployment helper, not part of the Public Vault canonical runtime.
Real credentials are supplied through environment variables and must never be committed.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections.abc import Iterator, Mapping
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

DEFAULT_TIMEOUT_SECONDS = 20
DEFAULT_PER_PAGE = 100


class SyncError(RuntimeError):
    """Semantic failure that is safe to show without provider response bodies."""


def _required_string(record: Mapping[str, Any], key: str) -> str:
    value = record.get(key)
    if not isinstance(value, str) or not value.strip():
        raise SyncError(f"invalid_source_page:{key}")
    return value.strip()


def _optional_string(record: Mapping[str, Any], key: str) -> str | None:
    value = record.get(key)
    if value is None:
        return None
    if not isinstance(value, str):
        raise SyncError(f"invalid_source_page:{key}")
    value = value.strip()
    return value or None


def _tag_names(record: Mapping[str, Any]) -> list[str]:
    raw = record.get("tags", [])
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise SyncError("invalid_source_page:tags")

    names: list[str] = []
    for item in raw:
        if not isinstance(item, Mapping):
            raise SyncError("invalid_source_page:tags")
        name = item.get("name")
        if isinstance(name, str) and name.strip():
            names.append(name.strip())
    return names


def derive_page_base_url(api_base_url: str) -> str:
    normalized = api_base_url.rstrip("/")
    suffix = "/api/v1"
    if not normalized.endswith(suffix):
        raise SyncError("NOTEPM_BASE_URL_must_end_with_/api/v1")
    return normalized[: -len(suffix)]


def build_page_search_url(
    api_base_url: str,
    *,
    page: int,
    per_page: int = DEFAULT_PER_PAGE,
    include_archived: bool = False,
) -> str:
    if page < 1:
        raise SyncError("page_must_be_positive")
    if per_page < 1 or per_page > 100:
        raise SyncError("per_page_out_of_range")

    query = urlencode(
        {
            "include_archived": 1 if include_archived else 0,
            "page": page,
            "per_page": per_page,
        }
    )
    return f"{api_base_url.rstrip('/')}/pages?{query}"


def to_onyx_payload(
    page: Mapping[str, Any],
    *,
    cc_pair_id: int,
    page_base_url: str,
) -> dict[str, Any]:
    if cc_pair_id < 1:
        raise SyncError("ONYX_CC_PAIR_ID_must_be_positive")

    page_code = _required_string(page, "page_code")
    note_code = _required_string(page, "note_code")
    title = _required_string(page, "title")
    body = _optional_string(page, "body") or title
    updated_at = _optional_string(page, "updated_at")
    tags = _tag_names(page)
    link = f"{page_base_url.rstrip('/')}/page/{page_code}"

    metadata: dict[str, Any] = {
        "source_system": "notepm",
        "source_page_code": page_code,
        "source_note_code": note_code,
    }
    if tags:
        metadata["tags"] = tags

    document: dict[str, Any] = {
        "id": f"notepm:{page_code}",
        "semantic_identifier": title,
        "title": title,
        "sections": [{"text": body, "link": link}],
        "source": "file",
        "metadata": metadata,
        "from_ingestion_api": True,
    }
    if updated_at is not None:
        document["doc_updated_at"] = updated_at

    return {"document": document, "cc_pair_id": cc_pair_id}


def _request_json(
    request: Request,
    *,
    operation: str,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
) -> Mapping[str, Any]:
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            raw = response.read()
    except HTTPError as exc:
        raise SyncError(f"{operation}_http_{exc.code}") from exc
    except URLError as exc:
        raise SyncError(f"{operation}_unavailable") from exc

    try:
        value = json.loads(raw.decode("utf-8")) if raw else {}
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise SyncError(f"{operation}_invalid_json") from exc
    if not isinstance(value, Mapping):
        raise SyncError(f"{operation}_invalid_response")
    return value


def fetch_notepm_page_batch(
    *,
    api_base_url: str,
    token: str,
    page_number: int,
    include_archived: bool,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
) -> tuple[list[Mapping[str, Any]], bool]:
    url = build_page_search_url(
        api_base_url,
        page=page_number,
        include_archived=include_archived,
    )
    request = Request(
        url,
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        method="GET",
    )
    response = _request_json(request, operation="notepm_fetch", timeout_seconds=timeout_seconds)

    raw_pages = response.get("pages")
    meta = response.get("meta")
    if not isinstance(raw_pages, list) or not isinstance(meta, Mapping):
        raise SyncError("notepm_fetch_invalid_response")
    pages: list[Mapping[str, Any]] = []
    for item in raw_pages:
        if not isinstance(item, Mapping):
            raise SyncError("notepm_fetch_invalid_page")
        pages.append(item)

    has_next = meta.get("next_page") is not None
    return pages, has_next


def iter_notepm_pages(
    *,
    api_base_url: str,
    token: str,
    include_archived: bool = False,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
) -> Iterator[Mapping[str, Any]]:
    page_number = 1
    while True:
        pages, has_next = fetch_notepm_page_batch(
            api_base_url=api_base_url,
            token=token,
            page_number=page_number,
            include_archived=include_archived,
            timeout_seconds=timeout_seconds,
        )
        yield from pages
        if not has_next:
            break
        page_number += 1


def ingest_onyx_document(
    *,
    api_base_url: str,
    api_key: str,
    payload: Mapping[str, Any],
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
) -> None:
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    request = Request(
        f"{api_base_url.rstrip('/')}/onyx-api/ingestion",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        data=body,
        method="POST",
    )
    _request_json(request, operation="onyx_ingest", timeout_seconds=timeout_seconds)


def _required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SyncError(f"missing_environment:{name}")
    return value


def run_sync(*, dry_run: bool, include_archived: bool, max_documents: int | None) -> int:
    notepm_base_url = _required_env("NOTEPM_BASE_URL")
    notepm_token = _required_env("NOTEPM_TOKEN")
    onyx_api_base_url = _required_env("ONYX_API_BASE_URL")
    onyx_api_key = _required_env("ONYX_API_KEY")
    page_base_url = os.environ.get("NOTEPM_PAGE_BASE_URL", "").strip() or derive_page_base_url(
        notepm_base_url
    )

    try:
        cc_pair_id = int(_required_env("ONYX_CC_PAIR_ID"))
    except ValueError as exc:
        raise SyncError("ONYX_CC_PAIR_ID_must_be_integer") from exc
    if cc_pair_id < 1:
        raise SyncError("ONYX_CC_PAIR_ID_must_be_positive")

    accepted = 0
    for source_page in iter_notepm_pages(
        api_base_url=notepm_base_url,
        token=notepm_token,
        include_archived=include_archived,
    ):
        payload = to_onyx_payload(
            source_page,
            cc_pair_id=cc_pair_id,
            page_base_url=page_base_url,
        )
        if not dry_run:
            ingest_onyx_document(
                api_base_url=onyx_api_base_url,
                api_key=onyx_api_key,
                payload=payload,
            )
        accepted += 1
        if max_documents is not None and accepted >= max_documents:
            break

    mode = "validated" if dry_run else "accepted_for_indexing"
    print(json.dumps({"status": mode, "documents": accepted}, separators=(",", ":")))
    return accepted


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Index NotePM pages into an Onyx connector")
    parser.add_argument("--dry-run", action="store_true", help="validate/transform without sending to Onyx")
    parser.add_argument(
        "--include-archived",
        action="store_true",
        help="include archived NotePM pages (off by default)",
    )
    parser.add_argument(
        "--max-documents",
        type=int,
        default=None,
        help="optional bounded PoC limit",
    )
    args = parser.parse_args(argv)
    if args.max_documents is not None and args.max_documents < 1:
        parser.error("--max-documents must be positive")
    return args


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    try:
        run_sync(
            dry_run=bool(args.dry_run),
            include_archived=bool(args.include_archived),
            max_documents=args.max_documents,
        )
    except SyncError as exc:
        print(json.dumps({"status": "failed", "error": str(exc)}, separators=(",", ":")), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
