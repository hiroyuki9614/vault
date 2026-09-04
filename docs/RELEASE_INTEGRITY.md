# Release Integrity and Provenance

## Purpose

The repository builds a deployable Node.js runtime, but a successful source build is not by itself a distribution integrity contract. This document defines the release-material boundary for the public Vault reference runtime.

The release process is designed to answer four questions:

1. Which source commit produced this runtime bundle?
2. Are the files inside the bundle the files declared by the release manifest?
3. Can a consumer verify the downloaded bundle and its dependency inventory?
4. Was the released bundle produced by this repository's GitHub Actions workflow?

## Release materials

A release build produces:

```text
vault-runtime-<version>-<commit12>.tar.gz
vault-runtime.sbom.cdx.json
SHA256SUMS
```

The tarball contains only deployable/reference runtime material:

```text
dist/
deploy/apache/vault.conf.example
deploy/systemd/vault.service.example
docs/APACHE_DEPLOYMENT.md
.env.example
package.json
RELEASE-MANIFEST.json
```

It does not include repository history, tests, development `node_modules`, secrets, private data, or a second mutable data store.

## Deterministic bundle

`tooling/build_release_bundle.py` normalizes archive metadata and ordering:

- file order is sorted;
- archive mtime is zero;
- uid/gid are zero;
- owner/group names are normalized;
- file and directory modes are fixed;
- gzip mtime and filename metadata are normalized.

The `release-integrity` workflow builds the same commit twice into separate directories and requires the two tarballs to be byte-for-byte identical before continuing.

`RELEASE-MANIFEST.json` records:

- package name/version;
- full source commit SHA;
- Node runtime contract and entrypoint;
- canonical mutable backend;
- Apache reverse-proxy reference;
- SHA-256 and byte size for every non-manifest file inside the bundle.

The builder verifies the manifest before producing the archive and verifies it again by reading the finished archive.

## SBOM

The workflow uses npm 11's native `npm sbom` command to generate a JSON CycloneDX runtime SBOM:

```bash
npm sbom --omit=dev --sbom-format=cyclonedx > release/vault-runtime.sbom.cdx.json
```

The current runtime intentionally has no third-party production npm dependency. Development/build dependencies remain pinned in `package-lock.json`, scanned separately by the OSV dependency vulnerability gate, and are not represented as runtime dependencies merely because they were used during compilation.

## Checksums

The workflow creates and verifies:

```text
SHA256SUMS
```

covering the runtime tarball and CycloneDX SBOM.

Consumers that receive these files through a trusted channel can verify them with:

```bash
sha256sum --check SHA256SUMS
```

A checksum file alone does not prove who built the artifact, so version-tag releases additionally use GitHub artifact attestations.

## GitHub artifact attestations

Attestations are created only for `v*` tag builds. Pull-request and normal `main` verification jobs keep read-only `contents` permission and do not receive OIDC/attestation write authority.

For a version tag, the workflow:

1. requires the tagged commit to be integrated into `main`;
2. requires the tag to equal `v<package.json version>`;
3. rebuilds the exact tagged commit;
4. recreates the deterministic runtime bundle, SBOM and checksums;
5. uploads the release directory as a GitHub Actions artifact;
6. creates GitHub build-provenance attestation for the runtime tarball;
7. creates an SBOM attestation binding the CycloneDX SBOM to the same tarball.

The main-ancestry gate uses `git merge-base --is-ancestor` against the fetched `origin/main`. A matching package version on an unmerged feature commit is therefore not sufficient to produce an attested release.

The GitHub Actions artifact is an operational distribution surface with bounded retention; it is not claimed to be permanent archival storage or a legal software license.

Consumers can verify a downloaded release tarball against this public repository with GitHub CLI:

```bash
gh attestation verify vault-runtime-<version>-<commit12>.tar.gz -R hiroyuki9614/vault
```

Artifact attestations establish provenance/integrity evidence. They do not claim that the code is vulnerability-free, compliant with a particular regulation, or appropriate for every production environment.

## Version-tag policy

The attestation job rejects a tag whose version does not exactly match `package.json`, and rejects a tagged commit that is not integrated into `main`.

Example:

```text
package.json version = 0.2.0
accepted tag         = v0.2.0
```

Creating a Git tag is therefore a release decision. The workflow does not automatically increment versions or create tags.

GitHub-side creation/update/deletion controls for `v*` are defined separately in `config/github-release-tag-ruleset-contract.json` and `docs/RELEASE_TAG_GOVERNANCE.md`. Those controls are administrator-managed state and must be read back before claiming tag immutability.

## Verification contract

Every pull request and `main` push runs the `bundle` job in `.github/workflows/release-integrity.yml`.

That job must prove:

- production TypeScript builds;
- the deterministic bundle builds twice identically;
- the completed archive passes its internal manifest verification;
- a CycloneDX runtime SBOM is valid JSON;
- SHA-256 checksums are generated and verify successfully.

`tooling/release_integrity_check.py` and its regressions additionally prevent weakening the workflow contract by silently removing deterministic comparison, checksum verification, main-ancestry enforcement, tag-only attestation, immutable action pins, or SBOM attestation.

## Deployment acceptance

Before deploying a tagged artifact to an enterprise environment:

1. verify `SHA256SUMS`;
2. run `gh attestation verify` against the runtime tarball;
3. inspect the source commit recorded in `RELEASE-MANIFEST.json`;
4. inspect the CycloneDX SBOM;
5. confirm the tagged source commit is integrated into `main` and passed repository required checks;
6. deploy the runtime under the documented Apache/systemd boundary;
7. perform target-environment Supabase/Auth/RLS acceptance separately.

## Non-claims

This release integrity baseline does not itself provide:

- permanent binary hosting;
- artifact escrow;
- code signing certificates outside GitHub/Sigstore attestation;
- vulnerability-free software;
- an SLA;
- regulatory certification;
- a software license for third-party reuse.
