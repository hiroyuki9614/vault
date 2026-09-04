from __future__ import annotations

import json
import shutil
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from tooling.build_release_bundle import build, extract_and_verify_bundle, sha256_file


class ReleaseBundleTest(unittest.TestCase):
    def synthetic_repo(self) -> Path:
        root = Path(tempfile.mkdtemp()) / "repo"
        root.mkdir()
        self.addCleanup(lambda: shutil.rmtree(root.parent, ignore_errors=True))

        files = {
            "dist/server/main.js": "console.log('runtime');\n",
            "dist/documents/public.js": "export {};\n",
            "deploy/apache/vault.conf.example": "ProxyRequests Off\n",
            "deploy/systemd/vault.service.example": "NoNewPrivileges=true\n",
            "docs/APACHE_DEPLOYMENT.md": "# Apache\n",
            ".env.example": "VAULT_HOST=127.0.0.1\n",
            "package.json": json.dumps({
                "name": "public-vault-reference-runtime",
                "version": "9.9.9",
            }) + "\n",
        }
        for relative, content in files.items():
            path = root / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
        return root

    def test_same_commit_produces_identical_bundle(self):
        root = self.synthetic_repo()
        commit = "a" * 40
        first = build(root, root / "release-a", commit)
        second = build(root, root / "release-b", commit)
        self.assertEqual(sha256_file(first), sha256_file(second))

    def test_bundle_manifest_verifies_file_hashes(self):
        root = self.synthetic_repo()
        bundle = build(root, root / "release", "b" * 40)
        extract_and_verify_bundle(bundle)

        with tarfile.open(bundle, "r:gz") as archive:
            manifest_member = next(member for member in archive.getmembers() if member.name.endswith("RELEASE-MANIFEST.json"))
            handle = archive.extractfile(manifest_member)
            self.assertIsNotNone(handle)
            manifest = json.loads(handle.read().decode("utf-8"))  # type: ignore[union-attr]
        self.assertEqual(manifest["source_commit"], "b" * 40)
        self.assertEqual(manifest["runtime"]["entrypoint"], "dist/server/main.js")
        self.assertTrue(any(entry["path"] == "dist/server/main.js" for entry in manifest["files"]))

    def test_invalid_commit_sha_is_rejected(self):
        root = self.synthetic_repo()
        with self.assertRaises(ValueError):
            build(root, root / "release", "not-a-commit")


if __name__ == "__main__":
    unittest.main()
