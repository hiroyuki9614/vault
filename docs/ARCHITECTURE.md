# Architecture

## Purpose

この repository は private/personal Vault の実体ではなく、Supabase-first Vault を構築するための公開 Reference Implementation です。

```text
GitHub public repository
  design / migrations / contract / templates
                 |
                 | deploy
                 v
             Supabase
      Auth + PostgreSQL + RLS
                 |
                 v
          canonical Vault data
```

## Canonical ownership

```text
Mutable human/user data
  -> Supabase PostgreSQL only

Schema / RLS / RPC definition
  -> Git migration history

Architecture / Agent contract
  -> Git Markdown / config

Credentials
  -> deployment secret store only
```

GitHub と Supabase に同じ mutable document を独立更新可能な状態で持たせません。

## Data model

最小 model は次です。

```text
auth.users
    |
    +---- vaults(owner_user_id)
    |         |
    |         +---- vault_members
    |         |
    |         +---- documents
    |
    +---- authenticated identity
```

### `vaults`

Vault の namespace と owner を保持します。

### `vault_members`

owner 以外の `viewer` / `editor` membership を保持します。authorization は RLS が強制します。

### `documents`

Vault document の canonical record です。

- `id`: stable UUID identity
- `path`: human/agent locator。rename可能
- `content`: Markdown/text body
- `metadata`: extensible JSONB
- `version`: optimistic concurrency token

`path` を変更しても `id` は変えません。

## Public operation contract

通常 caller は table ではなく RPC を使用します。

```text
get_document(vault_id, path)
put_document(vault_id, document_id, path, title, content, metadata, expected_version)
delete_document(vault_id, document_id, expected_version)
```

`put_document` は:

- create: `document_id = null`, `expected_version = null`
- update: `document_id != null`, `expected_version` 必須

update の version が stale なら mutation しません。

## Security

Supabase Auth + RLS を必須にします。

- owner: vault / member / document の管理可
- editor: document read/write可
- viewer: document readのみ
- unauthenticated: data access不可

service-role key は migration/administration専用で、通常 client/Agent contract から除外します。

## Failure boundary

Supabase は optional adapter ではありません。この Reference Implementation では必須 data platform です。

```text
Supabase unavailable
  -> data operation unavailable
  -> GitHubへfallback writeしない
  -> second canonicalを作らない
```

外部 notification / scheduler / VPS が停止しても schema/data ownership は変えません。

## Growth stopper

この repository に次を追加しません。

- generic Work Context
- moving-main reconciliation
- privileged VPS gateway
- scheduler runtime
- notification runtime
- recovery broker
- review-of-review stack

実行 runtime が必要になった場合は consumer/application repository が所有します。
