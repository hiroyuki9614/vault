# Vault

Supabase を正本にする、公開用 Vault Reference Implementation です。

この repository 自体には個人データ・業務データを保存しません。GitHub は設計、SQL migration、Agent contract、template、architecture check の配布面です。実データの canonical storage は Supabase PostgreSQL です。

## Architecture

```text
Client / AI Agent
      |
      v
 semantic operation
      |
      v
Supabase Auth + RLS
      |
      v
public.get_document / put_document / delete_document
      |
      v
public.documents  <- canonical data
```

原則:

- Supabase は必須依存です。利用不能時に GitHub Markdown を第二正本として書き始めません。
- GitHub repository に実ユーザーの document body、credential、token、個人情報を保存しません。
- document identity は UUID で固定し、path rename で identity を変えません。
- write は optimistic version check を行い、成功後に同じ document identity を read-back します。
- Agent / client の通常 read/write は semantic RPC を使用します。table schema を public contract にしません。
- migration / policy / architecture を増やす前に、既存境界で解決できるか確認します。

## Quick start

1. Supabase project を作成します。
2. Supabase CLI で project を link します。
3. `supabase/migrations/` を適用します。
4. client には `SUPABASE_URL` と publishable/anon key を設定します。
5. user を Supabase Auth で認証し、最初の `vaults` row を作成します。
6. document 操作は `get_document`, `put_document`, `delete_document` RPC を使用します。

詳細は `docs/ARCHITECTURE.md` と `supabase/README.md` を参照してください。

## Repository scope

含むもの:

- Supabase schema / RLS / RPC migrations
- public architecture contract
- AI Agent rules
- synthetic templates / examples
- architecture regression check

含まないもの:

- 個人 Vault の実データ
- shared/private Vault の mirror
- credential / secret
- VPS / scheduler / notification runtime
- generic Control Plane / Work Context / recovery machinery

## Validation

```bash
python -m unittest tests/test_architecture_check.py
python tooling/architecture_check.py
```
