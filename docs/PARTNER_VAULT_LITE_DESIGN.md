# Partner Vault Lite 技術設計書

## 1. 目的

本設計書は、個人がAIと継続的に情報・判断・タスク・知識を扱うための、**小さく始められる個人Vault**の恒久的な設計境界を定義する。

Partner Vaultは既存の高度なPersonal Vaultを複製しない。GitHub + MarkdownをCoreとし、必要な機能だけ後付けする。

初期の主要用途は投資情報の整理とし、必要に応じて共同Vault `hiroyuki9614/hr-vault` へ**明示的に共有した情報だけ**を共同正本へ昇格できる。

本設計書は実装手順書ではない。現在のSHA、PR、進捗、Secret、実環境IDは正本対象にしない。

---

## 2. 対象範囲

### 2.1 対象

- Markdown Vaultの基本ディレクトリ構造
- AI Agentの最小ルーティング
- 正本・履歴・TODO・未確認事項・AI解釈の区分
- 投資Areaの初期構造
- Skill / Templateの配置方針
- Supabase、通知、外部API等のoptional adapter境界
- 個人情報とSecretの境界
- 共同Vaultへの明示共有による疎結合
- 将来のShared Core / shared toolkitへの汎用資産昇格
- 障害時の縮退・rollback方針

### 2.2 対象外

初期段階では次を実装しない。

- 双方向自動同期
- 個人Vaultのmirror化
- 個人Vault全文の共同Vaultへのindex
- 明示指示なしの個人情報共有
- 他方の個人Vaultへの既定アクセス
- Git submoduleによるVault間の強結合
- webhookによる自動共有
- 高度なControl Plane
- Vector Database / Embedding検索の必須化
- 自律Agentの常時実行
- 複雑なジョブキューや分散ロック
- Supabaseの必須化
- Personal Vault固有運用の全面移植

これらは実利用で必要性が確認された場合だけ再検討する。

---

## 3. 設計原則

### 3.1 Markdown-first

```text
GitHub / Markdown
  = 人間とAIが読む恒久情報の正本

Supabase等
  = 必要な場合だけ使う構造化・機械状態
```

外部サービスが停止しても主要情報をMarkdownから参照できる状態を維持する。

### 3.2 Coreは外部サービスを要求しない

通常操作は次だけで成立させる。

- Markdownを読む
- Markdownを更新する
- Gitで履歴を残す
- README / Indexから正本へ到達する
- 必要なSkillだけ読む

Supabase、通知、Calendar、collector等が利用不能でも通常の記録・参照・整理を停止しない。

### 3.3 正本を乱立させない

同じ責務について `final`、`最新版`、`v2` のような複製を増やさない。

更新日時が新しいだけで正本と判断しない。

### 3.4 個人Vaultは独立させる

`hiroyuki9614/vault` はPartner個人情報の正本であり、他人の個人Vaultを既定で読まない。

共同利用が必要な情報だけ、専用の共同Vaultへ明示共有する。

### 3.5 共同情報は専用正本へ移す

共有writeとread-backが成功した情報は `hiroyuki9614/hr-vault` を共同正本とする。

個人Vault側には同じ共同本文を第二正本として保持せず、必要なら共同正本への参照と個人限定補足だけを残す。

### 3.6 Progressive Enhancement

```text
Phase 1: GitHub + Markdown
Phase 2: 最小Skill / Template
Phase 3: 明示共有によるShared Vault接続
Phase 4: 必要な構造化状態のみSupabase
Phase 5: 通知・collector等のAdapter
Phase 6: 実測で有効性が確認された高度機能
```

Phaseを進めること自体を目的にしない。

---

## 4. Repository roles

```text
hiroyuki9614/vault
  = Partner個人情報の正本

hiroyuki9614/hr-vault
  = 二人で共有すると明示した情報の共同正本

future shared toolkit / Shared Core
  = 個人データを含まない汎用Skill・Rule・Template・通知・collector等
```

共同Vaultは個人Vaultのmirrorではない。

---

## 5. 初期ディレクトリ構成

```text
vault/
├─ AGENTS.md
├─ README.md
├─ vault.config.yml
│
├─ 00_Inbox/
├─ 10_Daily/
├─ 20_Projects/
├─ 30_Areas/
│  └─ Investing/
├─ 40_Resources/
├─ 50_Shared/
├─ 90_Archive/
│
├─ .agents/
│  ├─ SKILLS_INDEX.md
│  └─ skills/
│     ├─ vault-organize/
│     └─ investment-research/
│
├─ templates/
│  ├─ decision.md
│  └─ investment-thesis.md
│
├─ integrations/
│  ├─ README.md
│  └─ shared-vault/
│     └─ README.md
│
└─ docs/
   ├─ PARTNER_VAULT_LITE_DESIGN.md
   └─ SHARED_VAULT_CONTRACT.md
```

空ディレクトリ維持のためだけのファイルは原則作らない。

---

## 6. 各ディレクトリの責務

### `00_Inbox`

未整理情報の一時入口。長期正本にしない。

### `10_Daily`

日付に紐づく出来事、短期状態、作業ログを保存する。恒久方針の第一参照先にしない。

### `20_Projects`

完了条件のある活動を管理する。

### `30_Areas`

終了期限を持たず継続管理する領域。初期の主要Areaは `Investing/`。

### `40_Resources`

Project / Area固有ではない再利用可能な知識・調査を保存する。

### `50_Shared`

共同Vaultへの導線と個人限定補足を置く。共同本文の第二正本にしない。

### `90_Archive`

現在の第一参照先ではない完了済み・旧情報を保存する。Git履歴で十分な旧版コピーは作らない。

### `.agents`

Skill routingを置く。全Skillを毎回読まず、`SKILLS_INDEX.md` から必要なSkillだけ選ぶ。

### `templates`

新規Markdownの初期形だけを提供する。Template自体を正本にしない。

### `integrations`

外部サービス固有の接続境界を置く。Coreの意味情報をここへ逆流させない。

---

## 7. 正本と情報分類

### 7.1 第一参照先

1. 明示的にcanonicalと定義された文書
2. README / Indexから第一参照先として案内される文書
3. 責務が一致する既存文書
4. 新規文書

### 7.2 情報分類

| 情報 | 保存先の原則 |
|---|---|
| 現在有効な事実・方針 | 対象テーマの正本 |
| 決定事項 | 正本またはDecision文書 |
| 日々の出来事 | Daily |
| 進行中Project | Projects |
| 継続責務 | Areas |
| 再利用知識 | Resources |
| 未整理 | Inbox |
| 完了・旧情報 | ArchiveまたはGit履歴 |
| TODO | 関連Project / Area。機械処理が必要なら外部state併用可 |
| 未確認情報 | 正本内で明示、またはInbox |
| AI解釈 | Factsと区別して記録 |

### 7.3 個人 / 共同境界

- 個人portfolio / watchlist / thesis / 判断途中メモはPartner Vaultを正本とする。
- 共同portfolio / watchlist / 投資方針 / 共同判断等は明示共有後に `hr-vault` を正本とする。
- 共有済み共同本文をPartner Vaultでも独立更新しない。
- 共有成立前または共有失敗時は個人側の正本を維持する。

---

## 8. AI Agentの最小ルーティング

通常ルート:

```text
User Request
  -> root AGENTS.md
  -> vault.config.yml
  -> 関連README / 既存正本
  -> 必要な場合だけ SKILLS_INDEX.md
  -> 選択されたSKILL.mdだけ
  -> Read / Update
```

最小ルール:

- 依頼と無関係な全文走査をしない
- 既存正本を確認してから新規ファイルを作る
- AI推論を本人確認済み事実へ変換しない
- write後は可能な範囲で同じ対象をread-backする

### Shared Vault操作時の追加ルート

`hr-vault` を読む・書く場合はPartner Vault側の想定だけで操作しない。

```text
explicit shared context
  -> hr-vault/AGENTS.md
  -> hr-vault/config/permissions.yml
  -> 対象README / canonical
  -> permission確認
  -> 最小write
  -> same target read-back
```

対象repositoryのルール・権限正本を確認できない場合、shared writeはfail-closedとする。

---

## 9. Skill設計

初期Skillは必要最小限とする。

### `vault-organize`

- 保存先判断
- 正本統合
- Inbox整理
- 個人 / 共同境界判断
- 重複正本防止

### `investment-research`

- 投資調査
- Facts / Interpretation / Risks / Unknownsの分離
- 本人判断とAI評価の分離
- 個人thesis / watchlist / portfolioの保存先判断

新規Skillは同じ判断・手順が繰り返され、通常ルールだけでは抜け漏れが出る場合に候補とする。

---

## 10. Shared Vault接続境界

詳細契約は `docs/SHARED_VAULT_CONTRACT.md` を正本とする。

### Read

共同情報が依頼に必要な場合だけ `hr-vault` を読む。通常依頼で毎回読む構成にしない。

### Write

新規共有writeは最低限、次を満たす。

1. ユーザーの明示共有意図がある
2. 共有する最小情報だけを抽出している
3. `hr-vault/AGENTS.md` を確認している
4. `hr-vault/config/permissions.yml` でsubject / action / path / conditionが許可されている
5. 既存共同正本を確認している
6. Secretを含まない
7. write後に同じ対象をread-backできる

`hr-vault` の権限方針は `default_effect: deny` を前提とし、許可を確認できないwriteは行わない。

### Failure

共有先writeまたはread-backが失敗した場合、共有成立とみなさない。個人側の正本を勝手に削除・移動しない。

---

## 11. Supabase / 外部Adapter境界

Supabase、通知、Calendar、外部API、schedulerはoptional adapterとする。

Supabase候補:

- task state
- alert / notification state
- scheduler state
- market snapshot / time series
- event log / lightweight telemetry
- 外部同期状態

Markdown正本候補:

- 投資方針
- Projectの目的・背景
- 判断理由
- ナレッジ本文
- 設計書
- 長文メモ

同じ情報をMarkdownとDBで独立更新するdual canonicalは禁止する。

通知・market collector・alert engine等の汎用実装を各Vaultへコピーしない。複数Vaultで再利用する場合はshared toolkit候補とする。

---

## 12. Shared Core / toolkit昇格

共同データと汎用コードを混同しない。

昇格候補:

- 個人情報を含まないSkill
- 汎用Rule
- Template
- lint / validation
- 通知・collector等の一般化された実装

昇格しないもの:

- 個人portfolio / watchlist / thesis
- 個人履歴
- Secret
- 個人固有API ID
- 一般化されていない個人判断

---

## 13. Security / Privacy

### Repository visibility

**実在する個人情報・金融情報を保存する個人Vaultはprivate repositoryを前提とする。**

public repositoryでは設計書・汎用Skill・Template等、個人情報を含まない資産だけを扱う。

repositoryがprivateであることを確認できない状態では、Agentは実在する個人情報・金融情報を新規保存しない。

### Secret

次はGit管理しない。

- API token
- password
- private key
- OAuth credential
- webhook secret
- brokerage authentication
- Supabase service role key

### Cross-vault privacy

- 個人Vault全文を共同Vaultへ送らない
- 共有に不要な感情・評価・未整理文脈を付加しない
- 他方の個人Vaultを既定参照しない
- shared vaultへのアクセス権を個人Vault本文のコピーで迂回しない

---

## 14. 障害・縮退・Rollback

- GitHub利用可 / Adapter利用不能: Markdown Coreを継続する
- GitHub利用不能: Markdown正本を推測更新しない
- Shared Vault利用不能: 共有を未成立として個人正本を維持する
- permission policyを読めない: shared writeを拒否する
- Skillが壊れた: 通常のMarkdown読み書きへfallbackする
- Markdown / Rule / Skill: Git履歴を基本rollback手段とする
- Supabase導入後のschema: migrationで管理する

---

## 15. 主要設計判断

### 判断A: GitHub + MarkdownをCoreとする

依存・運用・復旧の複雑性を抑え、人間とAIの双方が読めるため。

### 判断B: Supabaseはoptionalとする

構造化状態には有効だが、意味情報までDB正本にすると初期運用が過剰になるため。

### 判断C: 個人Vaultと共同Vaultを分離する

個人情報の既定分離を維持し、共同情報だけを専用正本で管理するため。

### 判断D: Shared Vault接続は明示共有のみとする

共同利用の需要は満たしつつ、自動同期・mirror・暗黙共有による漏えいとdual canonicalを避けるため。

### 判断E: target policyをshared writeの必須ゲートとする

共有先repository自身の権限正本を無視してsource側だけでwrite可否を決めると、権限境界を迂回できるため。

### 判断F: 高度なPersonal Vault Control Planeは移植しない

初期Partner Vaultへ持ち込むと依存・保守・理解コストが過大になるため。

---

## 16. 初期導入の完了条件

実データを扱うPhase 1運用は次を満たした時点でreadyとする。

- repositoryがprivateである
- root `README.md` から目的と主要ディレクトリを理解できる
- root `AGENTS.md` からAIの最小ルーティングを理解できる
- `vault.config.yml` に個人 / 共同境界が定義されている
- Inbox / Daily / Projects / Areas / Resources / Shared / Archiveの責務が定義されている
- 投資Areaの個人正本境界が定義されている
- Skillが必要最小限でIndexから到達できる
- Shared Vaultの明示共有契約が定義されている
- Shared Vault writeがtarget `AGENTS.md` / `config/permissions.yml` に従う
- Supabaseが存在しなくても通常操作が成立する
- Secretがrepositoryへ保存されない
- 外部Integrationを削除してもCoreが成立する

共同Vault接続が存在しても、自動同期や個人情報の暗黙共有はready条件に含めない。

---

## 17. 将来拡張候補

必要性が実測されたものだけ検討する。

- Supabase Task Store
- Reminder / Notification Adapter
- Calendar Adapter
- Telegram / LINE Adapter
- market collector / crash alert
- Web clipping / Research ingestion
- 定期Daily / Weekly maintenance
- Failure learning
- Skill usage telemetry
- Shared Core / shared toolkit repository
- Vault schema validation
- Read-only family/shared view
- Personal data export / backup

---

## 18. 関連文書

- `README.md` — 利用者向け入口
- `AGENTS.md` — AI向け最小ルーティング
- `vault.config.yml` — repository / integration境界
- `.agents/SKILLS_INDEX.md` — Skill routing
- `docs/SHARED_VAULT_CONTRACT.md` — 共同Vault接続の詳細契約
- `integrations/README.md` — Adapter境界
- `integrations/shared-vault/README.md` — Shared Vault integration入口

本設計書自体に実装進捗や運用ログを追記しない。
