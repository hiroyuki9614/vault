# Vault Hierarchy Concept

## 目的

Public Vault は特定企業の組織図をハードコードする製品ではなく、**導入先が任意の階層を定義できる汎用 Vault 基盤**として扱う。

最初の運用プロファイルは次の2層だけとする。

```text
Personal
   ↓
Organization
```

将来は必要になった時点で、例えば次のように拡張できる。

```text
Personal
   ↓
Team
   ↓
Organization
   ↓
Company
```

`team`、`department`、`company` 等を現在の TypeScript や権限ロジックへ先回りして実装しない。

## 物理境界

Production の基本境界は次とする。

```text
1 Organization boundary
  = 1 Supabase project per environment
```

Development / staging / production を分離する場合、それぞれ別 Supabase project を使用する。したがって「1 Organization = 1 Supabase project」は同一 environment 内のテナント・セキュリティ境界を意味する。

Public Vault repository は実データを持たず、汎用 runtime、schema、RLS、migration、設計 contract を提供する。組織固有の mutable data は対象 Supabase project に置く。

## 論理階層

階層は application code の enum 分岐ではなく、Supabase の設定データとして表現する。

```text
vault_levels
  key
  display_name
  sort_order
  parent_level_key

vaults
  id
  level_key
  parent_vault_id
  lifecycle_status
  ...existing fields
```

現在の初期データは次の通り。

```text
organization
  parent = null

personal
  parent = organization
```

`vault_levels.key` は closed enum ではない。将来の階層追加は新しい versioned migration で level definition を追加・変更し、必要な Vault relationship を明示的に移行する。

## Hierarchy と authorization は別軸

Vault の階層と Vault 内での権限は混同しない。

```text
Hierarchy axis
  Personal -> Organization

Authorization axis
  owner / editor / viewer

Narrow Personal-work read
  organization_reader
```

`organization_reader` は階層roleでも通常viewerの別名でもない。Personal Vaultに対して、明示的に組織閲覧可と分類されたDocumentだけを読むための限定roleである。

例:

```text
Organization Vault
  user A = owner
  user B = editor
  user C = viewer

Personal Vault of user B
  user B = owner
  parent = Organization Vault

optional explicit grant
  user A = organization_reader on user B Personal Vault
```

親 Vault であることだけを理由に、親の owner/editor/viewer が子 Vault の内容を自動的に閲覧できるようにはしない。逆方向も同様である。

Personal Vault の組織向け限定閲覧は、次の2条件を同時に満たす場合だけ成立する。

```text
explicit organization_reader grant
  +
Document metadata visibility_scope = organization
```

Document metadataに指定が無い、誤記されている、または別値の場合はprivateとして扱う。

この分離により、組織構造を表す hierarchy が permission escalation の経路になることを防ぐ。

## 個人から組織への知識成長

Personal Vault は実験・個人最適化・初期学習の場所として使う。

そこで効果が確認された Rule / Skill / Template / Document / Knowledge は、Organization Vault へ上げる候補になり得る。

ただし、使用実績があるだけで自動昇格しない。

```text
Personal asset
  ↓
Candidate evaluation
  ├─ promote
  ├─ extract
  ├─ merge
  └─ reject
```

### promote

個人依存がなく、組織でもほぼそのまま再利用できる場合。Organization 側へ共有版を作り、以後の汎用版の canonical owner を Organization 側へ移す。

### extract

個人固有部分と汎用部分が混在する場合。汎用部分だけを Organization 側へ抽出し、Personal 側には個人設定・個人拡張だけを残す。

### merge

Organization 側に既存の同等 asset がある場合。新しい asset を増やさず、既存 asset に有効な部分だけを吸収する。

### reject

組織利用の効果、汎用性、安全性、保守性が不足する場合。Organization 側へ持ち込まず Personal 側に残す。

Reject は失敗ではなく正常な lifecycle decision とする。

## Canonical ownership

Promotion はコピーを二重管理する仕組みにしない。

### Full promotion

```text
before
Personal = canonical

        ↓ promote

after
Organization = generic canonical
Personal = historical source or personal overlay only
```

### Partial extraction

```text
Organization
  = generic reusable core

Personal
  = personal configuration / extension
```

同じ意味の mutable asset を Personal と Organization の両方で独立更新する long-lived dual canonical は避ける。

## Offboarding lifecycle

退職やアカウント削除は知識削除と同義にしない。

```text
Personal active
  ↓
archive
  ↓
read-only retained Personal Vault
```

Auth identity を後から削除しても、Vault/Document 本体を cascade deleteしない。owner/author参照はnullになり、保持対象データは残る。

退職時にもPersonal Vault全体をOrganizationへコピーしない。再利用価値があるものだけ従来どおりpromote / extract / mergeし、その他はretention policyに従ってarchived Personal側に保持する。

## 現時点で自動化しないもの

最初の `Personal -> Organization` 運用では次を自動化しない。

- AI による無承認 promotion
- AI判定だけによる `visibility_scope=organization` 付与
- 親 Vault への自動同期
- 子 Vault への自動配布
- hierarchy による permission inheritance
- 汎用性スコアだけでの自動採否
- Team / Department / Company 等の未使用 level
- cross-project automatic replication
- universal promotion orchestrator

既存 Document API、RLS、same-ID read-back を利用し、まず人間の判断を含む明示的な昇格・閲覧運用で有効性を確認する。

## 将来拡張

実運用で必要になった順に level を追加する。

候補例:

```text
Personal -> Team -> Organization -> Company
```

または導入先によって、

```text
Personal -> Project -> Division -> Enterprise
```

でもよい。

Public Vault が保証するのは特定の組織名称ではなく、**level definition と parent relationship を使った階層表現、および hierarchy と authorization の分離**である。

Personal privacy / offboarding の詳細は `docs/PERSONAL_VAULT_PRIVACY_AND_OFFBOARDING.md` を正本とする。
