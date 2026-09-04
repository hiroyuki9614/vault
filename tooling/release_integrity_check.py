from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ATTEST_ACTION = "actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6"
UPLOAD_ACTION = "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02"


def check(root: Path = ROOT) -> list[str]:
    errors: list[str] = []

    builder = root / "tooling" / "build_release_bundle.py"
    if not builder.exists():
        errors.append("missing deterministic release bundle builder")
    else:
        text = builder.read_text(encoding="utf-8")
        for fragment in (
            'info.mtime = 0',
            'info.uid = 0',
            'info.gid = 0',
            'json.dumps(manifest, indent=2, sort_keys=True)',
            '"sha256": sha256_file(path)',
            'extract_and_verify_bundle(output)',
        ):
            if fragment not in text:
                errors.append(f"release builder missing deterministic/integrity invariant: {fragment}")

    workflow = root / ".github" / "workflows" / "release-integrity.yml"
    if not workflow.exists():
        errors.append("missing release-integrity workflow")
    else:
        text = workflow.read_text(encoding="utf-8")
        for fragment in (
            "pull_request:",
            "branches: [main]",
            "tags: ['v*']",
            "  bundle:",
            "permissions:\n      contents: read",
            "cmp \"$bundle\"",
            "npm sbom --omit=dev --sbom-format=cyclonedx",
            "sha256sum --check SHA256SUMS",
            "python tooling/build_release_bundle.py --verify-bundle",
            "if: startsWith(github.ref, 'refs/tags/v')",
            "id-token: write",
            "attestations: write",
            "fetch-depth: 0",
            "git fetch --no-tags origin main:refs/remotes/origin/main",
            'git merge-base --is-ancestor "$GITHUB_SHA" refs/remotes/origin/main',
            "test \"$GITHUB_REF_NAME\" = \"v${version}\"",
            UPLOAD_ACTION,
            ATTEST_ACTION,
            "sbom-path: release/vault-runtime.sbom.cdx.json",
        ):
            if fragment not in text:
                errors.append(f"release-integrity workflow missing invariant: {fragment}")
        if text.count(ATTEST_ACTION) < 2:
            errors.append("release tag workflow must create both provenance and SBOM attestations")

    tests = root / "tests" / "test_release_bundle.py"
    if not tests.exists():
        errors.append("missing deterministic release bundle regression tests")
    else:
        text = tests.read_text(encoding="utf-8")
        for fragment in (
            "test_same_commit_produces_identical_bundle",
            "test_bundle_manifest_verifies_file_hashes",
            "test_invalid_commit_sha_is_rejected",
        ):
            if fragment not in text:
                errors.append(f"release bundle regression coverage missing: {fragment}")

    docs = root / "docs" / "RELEASE_INTEGRITY.md"
    if not docs.exists():
        errors.append("missing release integrity documentation")
    else:
        text = docs.read_text(encoding="utf-8")
        for fragment in (
            "CycloneDX",
            "SHA256SUMS",
            "gh attestation verify",
            "GitHub Actions artifact",
            "RELEASE-MANIFEST.json",
            "integrated into `main`",
        ):
            if fragment not in text:
                errors.append(f"release integrity documentation missing invariant: {fragment}")

    return errors


def main() -> int:
    errors = check()
    if errors:
        for error in errors:
            print(f"FAIL: {error}")
        return 1
    print("PASS: release integrity, SBOM, checksum and attestation contracts are source-enforced")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
