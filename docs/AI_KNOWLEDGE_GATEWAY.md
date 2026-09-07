# AI Knowledge Gateway

## Purpose

This document defines the optional AI search layer around Public Vault.

The intended deployment does **not** replace existing operational knowledge systems. Existing systems remain canonical for the data they own, while an AI chat/search product such as Onyx provides a unified retrieval surface.

```text
Operational sources
  ├─ knowledge/wiki service
  ├─ spreadsheet / quotation files
  ├─ source repositories
  └─ future approved sources
          |
          v
       Onyx
  search / RAG / chat
          |
          +-------------------+
          |                   |
          v                   v
source citations        Public Vault
                        curated canonical
                        organization knowledge
```

Public Vault remains the canonical store only for Documents intentionally promoted into a Vault. It is not a mirror of every upstream system.

## Boundary

### Source systems remain source-of-truth

Do not bulk migrate operational systems merely to make them searchable.

Examples:

```text
knowledge/wiki page       -> source system remains canonical
quotation spreadsheet     -> file repository remains canonical
approved organization rule -> Public Vault may become canonical
```

The retrieval index is disposable and rebuildable. Losing the search index must not imply losing the canonical source documents.

### Onyx owns retrieval, not canonical mutation

Onyx is treated as an effectful retrieval/indexing product.

It may own:

- chat UI
- connector synchronization
- text extraction
- keyword/vector indexing
- retrieval and reranking
- source citations

It must not silently become the authoritative store for upstream business documents.

### Public Vault owns curated canonical knowledge

Public Vault is appropriate when a piece of knowledge is intentionally promoted as a maintained organizational asset and requires the existing Vault guarantees:

- stable identity
- optimistic concurrency
- retry-safe mutation semantics
- same-ID read-back
- explicit authorization
- Personal / Organization privacy boundary
- lifecycle / offboarding handling

## Initial PoC

Start with a small, synthetic or explicitly approved dataset.

```text
1. deploy Onyx Standard in an isolated PoC environment
2. connect one approved file source
3. connect one approved knowledge source
4. verify source citations
5. verify that removed/restricted source content does not remain broadly retrievable
6. add Public Vault as a curated source only after the basic retrieval path works
```

Do not start by indexing every organization repository.

## Onyx deployment mode

For connector-backed RAG, use **Onyx Standard**, not Lite. According to the upstream resourcing guide, Standard currently requires at least 4 vCPU, 10 GB RAM, and 32 GB disk plus index growth; 8+ vCPU and 16+ GB RAM is preferred for a small serious deployment.

The host must pass a resource/readiness check before installation. Do not force Standard onto an undersized existing VPS merely because it is already available.

Upstream references:

- <https://docs.onyx.app/deployment/overview>
- <https://docs.onyx.app/deployment/getting_started/resourcing>
- <https://docs.onyx.app/deployment/local/docker>

## SharePoint / spreadsheet source

Onyx's SharePoint connector indexes attached files including Excel workbooks. If quotation spreadsheets already live in SharePoint, prefer the official connector instead of copying spreadsheet contents into Public Vault.

Permission synchronization has additional upstream requirements. Treat source ACL preservation as an acceptance criterion before indexing sensitive material.

Reference:

- <https://docs.onyx.app/admins/connectors/official/sharepoint/sharepoint>

## Unsupported knowledge source adapter

For a source without a built-in Onyx connector, use the Onyx Ingestion API or write a bounded connector. The reference adapter in `deploy/onyx/notepm_ingestion.py` demonstrates the minimal pattern for a NotePM-like API:

```text
source page API
   -> normalize stable source identity
   -> preserve source link / updated timestamp / tags
   -> Onyx Ingestion API
```

Secrets are runtime inputs only.

```text
NOTEPM_BASE_URL
NOTEPM_TOKEN
ONYX_API_BASE_URL
ONYX_API_KEY
ONYX_CC_PAIR_ID
```

Never commit their real values.

## Security rules

- Start with read-only source credentials where the provider supports them.
- Do not use a source-wide administrator token if a narrower token is sufficient.
- Do not use ingestion success as proof that authorization is correct.
- Preserve a source link/citation so a user can inspect the canonical source.
- Treat source ACL synchronization as a separate security acceptance item.
- Do not index secrets, credentials, private keys, or unapproved personal information.
- Do not copy confidential business data into this public Git repository.

## Acceptance for an organizational pilot

A pilot is ready only when all applicable checks pass:

```text
[ ] Onyx host satisfies Standard resource requirements
[ ] deployment is isolated from unrelated production workloads
[ ] authentication is enabled
[ ] source credentials are stored outside Git
[ ] one knowledge source indexes successfully
[ ] one spreadsheet/file source indexes successfully
[ ] source links/citations resolve correctly
[ ] update propagation is demonstrated
[ ] deletion/restriction behavior is demonstrated
[ ] unauthorized users cannot retrieve restricted material
[ ] index can be rebuilt from source systems
[ ] Public Vault remains optional and curated, not an automatic mirror
```

## Non-goals

This integration does not turn Public Vault into:

- a generic enterprise search engine
- a CRM
- a quotation system
- a replacement for the existing wiki/knowledge tool
- a replacement for SharePoint or file storage
- a second canonical copy of every organization document

The goal is a narrow split:

```text
existing tools = work + operational truth
Onyx          = retrieval + chat
Public Vault  = curated canonical knowledge when needed
```
