from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def check(root: Path = ROOT) -> list[str]:
    errors: list[str] = []

    apache = root / "deploy" / "apache" / "vault.conf.example"
    if not apache.exists():
        return ["missing Apache reverse-proxy reference configuration"]

    apache_text = apache.read_text(encoding="utf-8")
    for fragment in (
        "a2enmod ssl proxy proxy_http headers setenvif unique_id",
        'RequestHeader set X-Request-ID "%{UNIQUE_ID}e"',
        'RequestHeader set Authorization "%{VAULT_AUTHORIZATION}e" env=VAULT_AUTHORIZATION',
        'RequestHeader set X-Forwarded-Proto "https"',
        "ProxyRequests Off",
        "http://127.0.0.1:3100/",
    ):
        if fragment not in apache_text:
            errors.append(f"Apache trusted-edge invariant missing: {fragment}")

    workflow = root / ".github" / "workflows" / "architecture.yml"
    if not workflow.exists():
        errors.append("missing architecture workflow for Apache trusted-edge verification")
    else:
        workflow_text = workflow.read_text(encoding="utf-8")
        for fragment in (
            "a2enmod ssl proxy proxy_http headers setenvif unique_id",
            "attacker-controlled-request-id",
            "Apache did not replace the untrusted X-Request-ID",
            "python tooling/apache_proxy_check.py",
            "tests/test_apache_proxy_check.py",
        ):
            if fragment not in workflow_text:
                errors.append(f"Apache trusted-edge CI invariant missing: {fragment}")

    docs = root / "docs" / "APACHE_DEPLOYMENT.md"
    if not docs.exists():
        errors.append("missing Apache deployment documentation")
    else:
        docs_text = docs.read_text(encoding="utf-8")
        for fragment in (
            "mod_unique_id",
            "X-Request-ID",
            "a2enmod ssl proxy proxy_http headers setenvif unique_id",
        ):
            if fragment not in docs_text:
                errors.append(f"Apache deployment documentation missing trusted request-id invariant: {fragment}")

    return errors


def main() -> int:
    errors = check()
    if errors:
        for error in errors:
            print(f"FAIL: {error}")
        return 1
    print("PASS: Apache trusted proxy identity boundary is source-enforced")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
