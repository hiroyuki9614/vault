# Onyx Knowledge Gateway PoC

This directory contains optional reference material for using Onyx as the AI chat/search layer around Public Vault and existing knowledge sources.

Read [`../../docs/AI_KNOWLEDGE_GATEWAY.md`](../../docs/AI_KNOWLEDGE_GATEWAY.md) first.

## 1. Host gate

Connector-backed RAG requires Onyx Standard. Check the current upstream resourcing guide before installation.

Current minimum documented baseline:

```text
CPU  >= 4 vCPU
RAM  >= 10 GB
Disk >= 32 GB + index growth
```

Preferred starting point is 8+ vCPU / 16+ GB RAM for a serious small deployment.

Do not install Standard on an existing small VPS without checking available headroom.

Useful read-only checks on Linux:

```bash
nproc
free -h
df -h /
docker --version
docker compose version
```

Upstream:

- <https://docs.onyx.app/deployment/getting_started/resourcing>
- <https://docs.onyx.app/deployment/local/docker>

## 2. Install Onyx

For a PoC, follow the upstream Docker Compose deployment rather than copying Onyx source into this repository.

```bash
git clone --depth 1 https://github.com/onyx-dot-app/onyx.git
cd onyx/deployment/docker_compose
docker compose up -d
```

For a controlled organizational deployment, pin and review the upstream version/commit according to your change-management policy rather than continuously following `main`.

Do not commit copied secrets or provider credentials into this repository.

## 3. Configure authentication and LLM provider

Enable authentication before indexing organizational material. Configure the approved LLM provider through the Onyx administration/configuration path.

The LLM credential and Onyx service credentials are deployment secrets, not Public Vault data.

## 4. Spreadsheet source

If spreadsheet quotation files are stored in SharePoint, use Onyx's official SharePoint connector. The connector supports Excel files.

Before indexing sensitive files, separately prove the required access-control behavior. Permission sync has upstream authentication requirements and must not be assumed merely because indexing works.

## 5. NotePM source

Onyx does not need a custom fork for an unsupported source. Its Ingestion API accepts programmatically supplied documents.

Create an Onyx connector/credential pair in the Admin UI, then obtain its `cc_pair_id`. Supply runtime values only:

```bash
export NOTEPM_BASE_URL='https://<team>.notepm.jp/api/v1'
export NOTEPM_TOKEN='...'
export ONYX_API_BASE_URL='https://<onyx-host>/api'
export ONYX_API_KEY='...'
export ONYX_CC_PAIR_ID='...'
```

Optional:

```bash
export NOTEPM_PAGE_BASE_URL='https://<team>.notepm.jp'
```

Validate a small sample without sending content to Onyx:

```bash
python deploy/onyx/notepm_ingestion.py --dry-run --max-documents 5
```

Then ingest a bounded PoC sample:

```bash
python deploy/onyx/notepm_ingestion.py --max-documents 20
```

A successful command means Onyx accepted the documents for asynchronous indexing. It is **not** proof that indexing completed or that retrieval permissions are correct.

After acceptance, verify from the Onyx UI:

```text
[ ] documents become searchable
[ ] result title matches source page
[ ] citation opens the original NotePM page
[ ] updated source content is reflected after re-ingestion
[ ] unapproved users cannot retrieve restricted content
```

Only then remove the PoC document bound.

## 6. Public Vault

Do not mirror every NotePM page or quotation into Public Vault.

Use Public Vault only when knowledge is deliberately curated/promoted into a maintained canonical asset.

```text
NotePM / spreadsheets
        -> Onyx search
        -> useful pattern discovered
        -> human/approved curation
        -> Public Vault canonical Document (optional)
        -> Onyx may index that curated source too
```

## Secrets

Never commit real values for:

- `NOTEPM_TOKEN`
- `ONYX_API_KEY`
- LLM API keys
- SharePoint client secrets/certificates
- production identity configuration

The checked-in examples intentionally contain placeholders only.
