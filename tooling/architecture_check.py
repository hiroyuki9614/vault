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
    if config.get("runtime_language") != "typescript":
        errors.append("runtime_language must be typescript")
    if config.get("runtime_architecture") != "functional_core_effectful_adapter":
        errors.append("runtime_architecture must be functional_core_effectful_adapter")

    for path in config.get("required_paths", []):
        if not (root / path).exists():
            errors.append(f"missing required path: {path}")

    for path in config.get("forbidden_top_level_paths", []):
        if (root / path).exists():
            errors.append(f"legacy/personal path must not exist: {path}")

    core_root = root / "documents" / "machine" / "core"
    if core_root.exists():
        forbidden_core_fragments = [
            fragment.lower() for fragment in config.get("core_forbidden_fragments", [])
        ]
        for path in core_root.glob("*.ts"):
            text = path.read_text(encoding="utf-8").lower()
            for fragment in forbidden_core_fragments:
                if fragment in text:
                    errors.append(
                        f"functional core contains effect/provider fragment in {path.relative_to(root)}: {fragment}"
                    )

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

    adapter = root / "documents" / "machine" / "adapters" / "supabase-rpc-document-store.ts"
    if adapter.exists():
        adapter_text = adapter.read_text(encoding="utf-8")
        for rpc in config.get("required_rpc_names", []):
            if f"'{rpc}'" not in adapter_text and f'"{rpc}"' not in adapter_text:
                errors.append(f"Supabase adapter missing semantic RPC mapping: {rpc}")

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
    print("PASS: public vault has a TypeScript functional core with Supabase behind semantic adapters")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
