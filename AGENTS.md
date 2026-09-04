# Public Vault Agent Rules

この repository は Supabase-first Vault の公開 Reference Implementation です。個人 Vault ではありません。

## Bootstrap

1. `vault.config.yml` を読む。
2. schema / data boundary に触れる場合は `docs/ARCHITECTURE.md` と `supabase/README.md` を読む。
3. SQL を変更する場合は既存 migration と public RPC contract を確認する。
4. ownership / dependency / decision-effect / configuration boundary が material な場合だけ `.agents/SKILLS_INDEX.md` を読み、必要なSkillだけを読む。
5. 変更後は `python tooling/architecture_check.py` を実行する。

全文走査、全Skill preload、追加review、追加gateを既定にしません。

## Skill boundary

Public Skillは分析・分類の再利用contractです。

- `dependency-boundary`: semantic ownership / public-private / dependency direction
- `functional-decomposition`: meaningful decision / external effect separation
- `configuration-boundary`: domain / implementation / deployment / runtime / provider / secret / derived value classification

Skillの存在はmutation権限を付与しません。taskへmaterialなSkillだけを使い、unknownを推測で埋めず、完了後に追加workflowやreview stackを自動生成しません。

## Canonical boundary

- mutable Vault data の唯一の canonical storage は Supabase PostgreSQL。
- GitHub Markdown / JSON / template は code and contract であり、ユーザーデータの canonical storage にしない。
- Supabase unavailable 時に GitHub へ data write fallback しない。
- document identity は `documents.id`。`path` は locator であり identity ではない。

## Supabase boundary

- Supabase Auth と RLS を必須とする。
- 通常 client / Agent は semantic RPC (`get_document`, `put_document`, `delete_document`) を使用する。
- service-role key を client、Prompt、repository に置かない。
- project URL / publishable key は deployment environment から注入する。
- schema change は新しい migration で行う。適用済み migration を書き換えて履歴を改変しない。
- write は expected version を使う optimistic concurrency と same-identity read-back を基本とする。

## Public repository safety

禁止:

- 実在人物の個人情報・金融情報・顧客情報の保存
- token / password / API key / private key の保存
- Supabase service-role key の保存
- private/shared Vault からの自動同期
- synthetic example を実データのように見せること
- GitHub と Supabase の dual canonical

## Architecture rule

- repository は data plane runtime を抱え込まない。
- Auth / persistence / authorization は Supabase adapter が所有する。
- domain caller は semantic operation に依存し、physical table shape へ依存しない。
- 新しい Control Plane、Work Context、recovery stack、review stack を追加しない。
- 機械判定可能な invariant は既存 `architecture_check.py` に集約する。
