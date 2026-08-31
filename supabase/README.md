# Supabase

Supabase はこの Vault の必須 data platform です。

## Required services

- Supabase Auth
- PostgreSQL
- Row Level Security
- SQL RPC

Storage / Realtime / Edge Functions は必須ではありません。

## Apply migrations

Supabase CLI を使用する場合の例です。

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

project ref や access token は repository に保存しません。

Application runtime は環境変数等から次を受け取ります。

```text
SUPABASE_URL
SUPABASE_ANON_KEY
```

service-role key は通常 client / Agent に渡しません。

## First vault

認証済み user が `vaults` に owner row を作成します。その後 owner は `vault_members` へ editor/viewer を追加できます。

## Document API

通常の document 操作は RPC を使用します。

### Read

`public.get_document(vault_id, path)`

### Create

`public.put_document(vault_id, null, path, title, content, metadata, null)`

### Update

read で得た `id` と `version` を使い、

`public.put_document(vault_id, id, path, title, content, metadata, version)`

を呼びます。version が一致しなければ `version_conflict` で失敗します。

### Delete

`public.delete_document(vault_id, id, version)`

削除も stale version を拒否します。

## Read-back

mutation 成功後は返却された `id` / `path` を使って同じ identity を再取得し、意図した結果を確認します。
