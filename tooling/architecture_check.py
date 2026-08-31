from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config" / "architecture.json"


def load_config() -> dict:
    return json.loads(CONFIG.read_text(encoding="utf-8"))


def check(root: Path = ROOT) -> list[str]:
    errors: list[str] = []
    config = json.loads((root / "config" / "architecture.json").read_text(encoding="utf-8"))

    if config.get("canonical_data_backend") != "supabase":
        errors.append("canonical_data_backend must be supabase")
    if config.get("supabase_required") is not True:
        errors.append("supabase_required must be true")
    if config.get("github_data_canonical") is not False:
        errors.append("github_data_canonical must be false")

    for path in config.get("required_paths", []):
        if not (root / path).exists():
            errors.append(f"missing required path: {path}")

    for path in config.get("forbidden_top_level_paths", []):
        if (root / path).exists():
            errors.append(f"legacy/personal path must not exist: {path}")

    migration = root / "supabase" / "migrations" / "202608310001_supabase_first_vault.sql"
    if migration.exists():
        sql = migration.read_text(encoding="utf-8").lower()
        required_fragments = [
            "enable row level security",
            "auth.uid()",
            "security invoker",
            "version_conflict",
        ]
        for fragment in required_fragments:
            if fragment not in sql:
                errors.append(f"migration missing invariant: {fragment}")
        for rpc in config.get("required_rpc_names", []):
            if f"create or replace function public.{rpc}" not in sql:
                errors.append(f"migration missing semantic RPC: {rpc}")

    forbidden_text = [
        "kind: personal",
        "partner vault",
        "canonical_repository: hiroyuki9614/vault",
        "supabase_outage_write_fallback: allowed",
    ]
    for relative in ("README.md", "AGENTS.md", "vault.config.yml", "docs/ARCHITECTURE.md"):
        path = root / relative
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8").lower()
        for needle in forbidden_text:
            if needle.lower() in text:
                errors.append(f"legacy contract remains in {relative}: {needle}")

    return errors


def main() -> int:
    errors = check()
    if errors:
        for error in errors:
            print(f"FAIL: {error}")
        return 1
    print("PASS: public vault is Supabase-first and free of legacy personal-vault structure")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
