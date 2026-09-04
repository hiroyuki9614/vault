from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
import shutil
import tarfile
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PREFIX = "vault-runtime"
REQUIRED_INPUTS = (
    "dist",
    "deploy/apache/vault.conf.example",
    "deploy/systemd/vault.service.example",
    "docs/APACHE_DEPLOYMENT.md",
    ".env.example",
    "package.json",
)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def copy_inputs(staging: Path, root: Path) -> None:
    for relative in REQUIRED_INPUTS:
        source = root / relative
        if not source.exists():
            raise FileNotFoundError(f"required release input missing: {relative}")
        target = staging / relative
        if source.is_dir():
            shutil.copytree(source, target)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)


def release_files(staging: Path) -> list[Path]:
    return sorted(
        path
        for path in staging.rglob("*")
        if path.is_file() and path.name != "RELEASE-MANIFEST.json"
    )


def build_manifest(staging: Path, commit_sha: str, package: dict) -> dict:
    files = [
        {
            "path": path.relative_to(staging).as_posix(),
            "sha256": sha256_file(path),
            "size_bytes": path.stat().st_size,
        }
        for path in release_files(staging)
    ]
    return {
        "schema_version": 1,
        "name": package["name"],
        "version": package["version"],
        "source_commit": commit_sha,
        "runtime": {
            "node": ">=24.0.0 <25",
            "entrypoint": "dist/server/main.js",
        },
        "canonical_mutable_backend": "supabase",
        "reverse_proxy_reference": "apache_http_server",
        "files": files,
    }


def normalized_tarinfo(path: Path, staging: Path, root_name: str) -> tarfile.TarInfo:
    relative = path.relative_to(staging).as_posix()
    name = f"{root_name}/{relative}"
    info = tarfile.TarInfo(name=name)
    info.mtime = 0
    info.uid = 0
    info.gid = 0
    info.uname = "root"
    info.gname = "root"
    if path.is_dir():
        info.type = tarfile.DIRTYPE
        info.mode = 0o755
        info.size = 0
    else:
        info.type = tarfile.REGTYPE
        info.mode = 0o644
        info.size = path.stat().st_size
    return info


def write_deterministic_archive(staging: Path, output: Path, root_name: str) -> None:
    paths = sorted(staging.rglob("*"), key=lambda path: path.relative_to(staging).as_posix())
    with output.open("wb") as raw:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0, compresslevel=9) as gz:
            with tarfile.open(fileobj=gz, mode="w", format=tarfile.PAX_FORMAT) as archive:
                for path in paths:
                    info = normalized_tarinfo(path, staging, root_name)
                    if path.is_dir():
                        archive.addfile(info)
                    else:
                        with path.open("rb") as handle:
                            archive.addfile(info, handle)


def verify_manifest_in_staging(staging: Path) -> None:
    manifest_path = staging / "RELEASE-MANIFEST.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    declared = {entry["path"]: entry for entry in manifest["files"]}
    actual = {path.relative_to(staging).as_posix(): path for path in release_files(staging)}
    if set(declared) != set(actual):
        raise ValueError("release manifest file set does not match staged release files")
    for relative, path in actual.items():
        entry = declared[relative]
        if entry["sha256"] != sha256_file(path):
            raise ValueError(f"release manifest digest mismatch: {relative}")
        if entry["size_bytes"] != path.stat().st_size:
            raise ValueError(f"release manifest size mismatch: {relative}")


def extract_and_verify_bundle(bundle: Path) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        destination = Path(tmp)
        with tarfile.open(bundle, mode="r:gz") as archive:
            members = archive.getmembers()
            for member in members:
                member_path = Path(member.name)
                if member_path.is_absolute() or ".." in member_path.parts:
                    raise ValueError(f"unsafe archive member: {member.name}")
            archive.extractall(destination, filter="data")
        roots = [path for path in destination.iterdir() if path.is_dir()]
        if len(roots) != 1:
            raise ValueError("release bundle must contain exactly one root directory")
        verify_manifest_in_staging(roots[0])


def build(root: Path, output_dir: Path, commit_sha: str) -> Path:
    if len(commit_sha) != 40 or any(char not in "0123456789abcdef" for char in commit_sha.lower()):
        raise ValueError("commit SHA must be a 40-hex Git commit")

    package = json.loads((root / "package.json").read_text(encoding="utf-8"))
    version = package["version"]
    root_name = f"{PREFIX}-{version}-{commit_sha[:12]}"
    output_dir.mkdir(parents=True, exist_ok=True)
    output = output_dir / f"{root_name}.tar.gz"

    with tempfile.TemporaryDirectory() as tmp:
        staging = Path(tmp) / root_name
        staging.mkdir()
        copy_inputs(staging, root)
        manifest = build_manifest(staging, commit_sha, package)
        (staging / "RELEASE-MANIFEST.json").write_text(
            json.dumps(manifest, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        verify_manifest_in_staging(staging)
        write_deterministic_archive(staging, output, root_name)

    extract_and_verify_bundle(output)
    return output


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build or verify the deterministic Vault runtime release bundle.")
    parser.add_argument("--commit-sha", help="40-hex source commit used in the release manifest")
    parser.add_argument("--output-dir", type=Path, default=Path("release"))
    parser.add_argument("--verify-bundle", type=Path)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.verify_bundle is not None:
        extract_and_verify_bundle(args.verify_bundle)
        print(f"PASS: verified release bundle {args.verify_bundle}")
        return 0
    if args.commit_sha is None:
        raise SystemExit("--commit-sha is required when building a release bundle")
    output = build(ROOT, args.output_dir, args.commit_sha.lower())
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
