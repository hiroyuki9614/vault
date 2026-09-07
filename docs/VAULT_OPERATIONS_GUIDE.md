# Vault Operations Guide

## 対象

この取扱説明書は Public Vault を会社等へ導入し、最初の運用として次の2層を使う場合を対象とする。

```text
Personal
   ↓
Organization
```

将来の Team / Department / Company 等はこの運用が安定した後に追加する。

## 前提

- 1つの Organization boundary は同一 environment 内で1つの Supabase project を使う。
- development / staging / production は別 project に分離する。
- Public Vault repository は runtime/schema/reference implementation であり、実業務データの保存場所ではない。
- 通常 runtime は Supabase service-role key を使用しない。
- 権限は既存の `owner / editor / viewer` を使う。
- hierarchy と membership/RBAC は別管理とする。

## 初期セットアップ

### 1. Supabase project を用意する

導入対象 Organization 用の Supabase project を environment ごとに用意する。

### 2. migration を適用する

`supabase/migrations/` を順番に適用する。

Hierarchy migration 適用後は次の level definition が存在する。

| key | 表示 | parent |
|---|---|---|
| `organization` | Organization | なし |
| `personal` | Personal | `organization` |

これは初期運用プロファイルであり、application code の closed enum ではない。

### 3. Organization Vault を作る

Organization Vault は root なので、

```text
level_key = organization
parent_vault_id = null
```

とする。

Public Vault は現時点で generic Vault Administration HTTP API を公開していないため、初期 Vault / membership 作成は承認された Supabase/database administration 経路で行う。

通常クライアントへ service-role credential を配布してはならない。

### 4. Organization member を設定する

既存の membership を使う。

```text
owner  = Vault / member / document administration
editor = document read/write
viewer = document read only
```

Personal Vault を Organization の子として作る利用者は、少なくとも親 Organization Vault を参照できる membership を持たせる。Hierarchy validation は親 Vault を明示的に確認し、Hierarchy 自体による権限継承は行わない。

### 5. Personal Vault を作る

Personal Vault は次の関係を明示する。

```text
level_key = personal
parent_vault_id = <Organization Vault ID>
owner_user_id = <Personal Vault owner>
```

Current profile では parent のない Personal Vault は拒否される。また Personal Vault を別の Personal Vault の子にすることも拒否される。

## 日常運用

### Personal Vault の役割

Personal Vault では次を優先する。

- 個人の試行錯誤
- 個人向け設定
- 未成熟な Rule / Skill / Template
- 個人的な作業改善
- 組織へ共有する価値がまだ確認できていない Knowledge

最初から全てを Organization Vault に置かない。

### Organization Vault の役割

Organization Vault では次を優先する。

- 複数人に再利用価値がある情報
- 個人依存を除去した Rule / Skill / Template
- 組織の標準として維持する Knowledge
- 共有運用に必要な文書

個人固有情報や private context を、単に「便利そう」という理由だけで Organization Vault にコピーしない。

## Personal -> Organization の昇格

### 1. Candidate を選ぶ

Personal Vault で実際に効果があったものを候補にする。

候補化の目安:

- 繰り返し役立った
- 他の人にも適用できそう
- 個人依存を分離できる
- 既存 Organization asset と重複しない、または統合価値がある
- private / secret / customer-specific 情報を含まない

### 2. 4種類の判断をする

```text
promote
extract
merge
reject
```

#### promote

ほぼそのまま共有できる。

Organization Vault に共有版を作成し、read-back 後は汎用版の canonical owner を Organization 側とする。

#### extract

一部だけ共有できる。

例:

```text
Personal
  求人評価Skill
  ├─ 求人票の構造化        -> Organizationへ
  ├─ 技術要件gap分析       -> Organizationへ
  ├─ 個人の希望年収        -> Personalに残す
  └─ 個人の勤務地条件      -> Personalに残す
```

Organization 側には generic core、Personal 側には personal overlay を残す。

#### merge

Organization 側に類似 asset がある。

新規 asset を増やさず、既存 asset へ有効部分を統合する。

#### reject

汎用性、効果、安全性、保守性が不足する。

Organization 側へ書かず Personal 側に残す。

### 3. Organization 側へ書く

Document を昇格する場合は、Organization Vault に対して `owner` または `editor` 権限を持つ caller が既存 Document API を利用する。

既存契約どおり、mutation 成功応答だけで完了扱いにせず same-document-ID read-back を確認する。

Hierarchy が write authority を与えることはない。

### 4. 二重正本を避ける

Full promotion 後に Personal と Organization の同一内容を両方で継続更新しない。

推奨:

```text
Full promotion
  Organization = generic canonical
  Personal = 削除 / historical source / personal overlay

Partial extraction
  Organization = generic core
  Personal = personal-only extension
```

## 権限例

```text
Organization Vault
  Manager A  owner
  Member B   editor
  Member C   viewer

Member B Personal Vault
  Member B   owner
  parent     Organization Vault
```

この場合、Manager A が Organization Vault owner であっても、それだけでは Member B の Personal Vault を自動閲覧できない。

Personal Vault を管理者が監査可能にする必要がある場合は、別途明示 membership / policy を設計する。Hierarchy を監査権限の代替にしない。

## よくある誤り

### `owner/editor/viewer` を階層として扱う

誤り。

```text
level = Personal / Organization
role  = owner / editor / viewer
```

別軸である。

### Personal の内容を全部 Organization へ同期する

行わない。

Public Vault は automatic upward mirror を提供しない。共有判断を通した asset だけを昇格する。

### Organization owner なら全 Personal Vault を読めると考える

現行仕様では誤り。

親子関係は permission inheritance を意味しない。

### Team 等を先に作る

現在は不要。

利用実績が出てから新しい versioned migration で level definition と parent relationship を追加する。

## 将来 Team を追加する場合

例えば次へ移行する場合:

```text
Personal
   ↓
Team
   ↓
Organization
```

新しい migration で、

1. `team` level definition を追加
2. Team Vault を作成
3. Personal Vault の新しい parent を割り当て
4. level parent definition を更新
5. DB acceptance で整合性を確認

の順に移行する。

既存 migration を書き換えない。

## 現在の非対応範囲

- automatic promotion
- AI 単独承認
- organization-wide automatic distribution
- hierarchy-based permission inheritance
- Team / Department / Company の既定実装
- cross-Supabase-project automatic synchronization
- promotion score / approval workflow engine

必要性が実運用から確認できた機能だけを追加する。

## 関連文書

- `docs/VAULT_HIERARCHY_CONCEPT.md`
- `docs/ARCHITECTURE.md`
- `docs/ENTERPRISE_READINESS.md`
- `README.md`
