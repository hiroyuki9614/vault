from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "deploy" / "onyx" / "notepm_ingestion.py"
SPEC = importlib.util.spec_from_file_location("notepm_ingestion", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class NotePmOnyxIngestionTests(unittest.TestCase):
    def test_build_page_search_url_is_bounded_and_deterministic(self) -> None:
        url = MODULE.build_page_search_url(
            "https://synthetic.notepm.example/api/v1/",
            page=2,
            per_page=100,
            include_archived=False,
        )
        self.assertEqual(
            url,
            "https://synthetic.notepm.example/api/v1/pages?include_archived=0&page=2&per_page=100",
        )

    def test_normalizes_page_to_stable_onyx_document(self) -> None:
        payload = MODULE.to_onyx_payload(
            {
                "page_code": "page-synthetic-001",
                "note_code": "note-synthetic-001",
                "title": "Synthetic deployment checklist",
                "body": "Validate the deployment using synthetic fixtures only.",
                "updated_at": "2026-09-07T10:20:30+09:00",
                "tags": [{"name": "deployment"}, {"name": "reference"}],
            },
            cc_pair_id=7,
            page_base_url="https://synthetic.notepm.example/",
        )

        document = payload["document"]
        self.assertEqual(payload["cc_pair_id"], 7)
        self.assertEqual(document["id"], "notepm:page-synthetic-001")
        self.assertEqual(document["semantic_identifier"], "Synthetic deployment checklist")
        self.assertEqual(document["source"], "file")
        self.assertEqual(
            document["sections"],
            [
                {
                    "text": "Validate the deployment using synthetic fixtures only.",
                    "link": "https://synthetic.notepm.example/page/page-synthetic-001",
                }
            ],
        )
        self.assertEqual(document["metadata"]["source_system"], "notepm")
        self.assertEqual(document["metadata"]["tags"], ["deployment", "reference"])
        self.assertEqual(document["doc_updated_at"], "2026-09-07T10:20:30+09:00")
        self.assertTrue(document["from_ingestion_api"])

    def test_empty_body_falls_back_to_title(self) -> None:
        payload = MODULE.to_onyx_payload(
            {
                "page_code": "page-synthetic-002",
                "note_code": "note-synthetic-001",
                "title": "Synthetic title",
                "body": "",
                "tags": [],
            },
            cc_pair_id=1,
            page_base_url="https://synthetic.notepm.example",
        )
        self.assertEqual(payload["document"]["sections"][0]["text"], "Synthetic title")

    def test_rejects_missing_stable_source_identity(self) -> None:
        with self.assertRaisesRegex(MODULE.SyncError, "invalid_source_page:page_code"):
            MODULE.to_onyx_payload(
                {
                    "note_code": "note-synthetic-001",
                    "title": "Synthetic title",
                    "body": "Synthetic body",
                },
                cc_pair_id=1,
                page_base_url="https://synthetic.notepm.example",
            )

    def test_requires_documented_notepm_api_base_shape(self) -> None:
        self.assertEqual(
            MODULE.derive_page_base_url("https://synthetic.notepm.example/api/v1"),
            "https://synthetic.notepm.example",
        )
        with self.assertRaisesRegex(MODULE.SyncError, "NOTEPM_BASE_URL"):
            MODULE.derive_page_base_url("https://synthetic.notepm.example/api")

    def test_rejects_out_of_range_pagination(self) -> None:
        with self.assertRaisesRegex(MODULE.SyncError, "per_page_out_of_range"):
            MODULE.build_page_search_url(
                "https://synthetic.notepm.example/api/v1",
                page=1,
                per_page=101,
            )


if __name__ == "__main__":
    unittest.main()
