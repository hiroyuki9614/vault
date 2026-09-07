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
- 通常の Vault 権限は `owner / editor / viewer` を使う。
- Personal Vault の組織向け限定閲覧には `organization_reader` を使う。
- hierarchy と membership/RBAC は別管理とする。
- hierarchy だけを理由に Personal Vault を組織管理者へ公開しない。

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

通常 membership:

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

## 推奨導入フロー

Public Vault の初期導入では、Organization Vault を先に「完成した共有知識」で満たそうとしない。

まず Organization boundary と必要最小限の権限だけを用意し、実際の知識育成は Personal Vault から始める。

```text
Organization Vault を用意
        ↓
少人数の Personal Vault を作成
        ↓
各自が実業務で Personal Vault を使う
        ↓
繰り返し効果があった asset を見つける
        ↓
promote / extract / merge / reject
        ↓
再利用価値があるものだけ Organization Vault へ
        ↓
組織で再利用し、必要なら対象者を徐々に増やす
```

最初から多数の利用者・大量の文書・複雑な階層を投入しない。まず少人数で `Personal -> Organization` の流れが自然に回ることを確認する。

### 日常の既定動作

新しい Rule / Skill / Template / Knowledge を作るとき、保存先に迷った場合は次を既定とする。

```text
まだ個人で試している
  -> Personal

繰り返し役立ったが汎用性は未確認
  -> Personal

他の人にも再利用でき、個人依存を除去できた
  -> OrganizationへのCandidate

組織標準・共有手順・共通規程として最初から組織正本である
  -> Organization
```

この既定により、Organization Vault を「とりあえず共有する場所」にしない。

### 組織へ上げるタイミング

案件や作業の記録そのものを丸ごとOrganizationへ移すのではなく、実運用で価値が確認できた後に汎用部分を抽出する。

```text
案件・作業の具体記録
        ↓ Personalで蓄積
何度か役立つ
        ↓
再利用可能部分を抽出
        ↓
個人情報 / secret / customer-specific context を除去
        ↓
Organizationへ promote / extract / merge
```

共有判断に迷う場合は Personal に残す。公開範囲を広げる判断は fail-open にしない。

### 導入拡大の目安

次へ広げるのは、現在の利用者で次が確認できてからとする。

- Personalでの記録・利用が継続している
- Organizationへの昇格候補が実際に発生している
- promote / extract / merge / reject の判断が無理なく行える
- Organizationに上げたassetが別の利用者にも役立った
- private情報とorganization-readable情報の区別が運用できている
- 退職・異動時のarchive / access reviewを説明できる

これらが確認できるまでは、Team / Department / Company 等の新しい階層を先に増やさない。

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

## Personal Vault の組織閲覧

### 基本

Organization owner であること自体は Personal Vault の閲覧権限にならない。

組織側から閲覧させたい業務情報は、Document metadata で明示する。

```json
{
  "visibility_scope": "organization"
}
```

この exact value が無い Document は private 扱いになる。AI が内容を推測して自動公開する契約ではない。

### organization_reader

Personal Vault の業務情報だけを閲覧するための限定role:

```text
organization_reader
  read: visibility_scope=organization の Document のみ
  write/delete: 不可
  private Document: 不可
  Vault/member identity enumeration: 不可
```

Parent Organization owner が、同じ Organization の member に対して明示 grant/revoke する。

```sql
select public.grant_personal_vault_organization_reader(
  '<personal-vault-id>',
  '<organization-member-user-id>'
);

select public.revoke_personal_vault_organization_reader(
  '<personal-vault-id>',
  '<organization-member-user-id>'
);
```

`organization_reader` は `viewer` の別名ではない。Personal Vault にだけ付与できる。

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

## 退職・Offboarding

### 原則

```text
退職
!=
Personal Vault削除
```

退職時は Personal Vault を archive して通常更新を止める。

```sql
select public.archive_personal_vault('<personal-vault-id>');
```

Personal owner または parent Organization owner が archive できる。

`archived` Vault は通常の authenticated write/delete を拒否するが、許可されたreadは継続する。

### 推奨順序

```text
1. 昇格済み / 未昇格 asset を確認
2. 必要なら promote / extract / merge
3. 必要な organization_reader を明示 grant
4. Personal Vault を archive
5. archive read-back
6. 社内Identity/SSOを停止
7. 必要なら Supabase Auth user を削除
8. Vault / Documents survival を read-back
9. retention policy に従って保管
```

Auth user を物理削除しても、その人がownerだったVaultや作成文書をcascade deleteしない。owner/authorのFKはnullになり、Vault/Document本体は保持する。

Archive は無期限保存を意味しない。保存期間・法務上の保全・最終削除は導入組織のretention policyで決める。

詳細は `docs/PERSONAL_VAULT_PRIVACY_AND_OFFBOARDING.md` を参照する。

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

この状態だけでは Manager A は Member B の Personal Vault を読めない。

必要な場合だけ、例えば Manager A または別の監査担当へ `organization_reader` を明示付与する。その場合でも読めるのは `visibility_scope=organization` のDocumentだけである。

## よくある誤り

### `owner/editor/viewer` を階層として扱う

誤り。

```text
level = Personal / Organization
role  = owner / editor / viewer / organization_reader
```

階層と権限は別軸である。

### Personal の内容を全部 Organization へ同期する

行わない。

Public Vault は automatic upward mirror を提供しない。共有判断を通した asset だけを昇格する。

### Organization owner なら全 Personal Vault を読めると考える

誤り。

親子関係は permission inheritance を意味しない。明示された `organization_reader` でも private Document は読めない。

### 個人情報をAI判定だけで organization-visible にする

行わない。

`visibility_scope=organization` は公開範囲を広げるeffectなので、導入組織のpolicyに従って明示分類する。

### 退職者Auth userを最初に削除する

避ける。

先に昇格判断・必要なreader grant・archive/read-backを行う。

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
- automatic PII detectionをauthorization decisionにすること
- organization-wide automatic distribution
- hierarchy-based permission inheritance
- Team / Department / Company の既定実装
- cross-Supabase-project automatic synchronization
- promotion score / approval workflow engine

必要性が実運用から確認できた機能だけを追加する。

## 関連文書

- `docs/VAULT_HIERARCHY_CONCEPT.md`
- `docs/PERSONAL_VAULT_PRIVACY_AND_OFFBOARDING.md`
- `docs/ARCHITECTURE.md`
- `docs/ENTERPRISE_READINESS.md`
- `README.md`
