# Personal Vault Privacy and Offboarding

## Purpose

Personal Vault は組織内の知識育成に使えるが、Personal という階層を理由に組織管理者へ全面公開してはならない。

同時に、社員の退職・アカウント削除を理由に業務上有用な知識まで消失させてはならない。

この文書は次を同時に満たすための durable contract を定義する。

```text
Personal privacy
  +
explicit organization access
  +
offboarding retention
```

## Core rules

### 1. Hierarchy is not permission

```text
Personal -> Organization
```

という親子関係だけでは Organization owner/editor/viewer に Personal Vault の閲覧権限を与えない。

### 2. Personal content fails closed

Personal Vault の Document は、明示的に組織閲覧可と分類されない限り Personal/private として扱う。

Document metadata の current contract:

```json
{
  "visibility_scope": "organization"
}
```

この exact value がある Document だけが Organization 閲覧候補になる。

- key が無い -> private
- value が違う -> private
- typo -> private
- AI が「業務っぽい」と推測しただけ -> private

Public Vault は PII detector を authorization boundary にしない。

`visibility_scope = organization` を付ける前に、氏名、個人連絡先、健康情報、私的メモ、個人評価等の不要な個人情報を含まないことを確認する。

### 3. Organization access is explicit

Personal Vault の組織向け限定閲覧には `organization_reader` を使う。

```text
owner               full Personal Vault ownership
editor              full document read/write
viewer              full document read
organization_reader organization-visible documents only, read-only
```

`organization_reader` は既存 `viewer` の別名ではない。

さらに以下を満たす。

- Personal Vault にだけ付与できる
- 対象者は parent Organization の member でなければならない
- parent Organization owner が明示 grant/revoke できる
- Personal Vault metadata/member identity の列挙権限は持たない
- Document write/delete はできない
- private Document は読めない

## Grant / revoke

Parent Organization owner は semantic RPC を使う。

```sql
select public.grant_personal_vault_organization_reader(
  '<personal-vault-id>',
  '<organization-member-user-id>'
);
```

解除:

```sql
select public.revoke_personal_vault_organization_reader(
  '<personal-vault-id>',
  '<organization-member-user-id>'
);
```

Hierarchy から reader を自動生成しない。

## Offboarding lifecycle

退職は deletion ではなく lifecycle transition として扱う。

```text
active Personal Vault
  ↓ offboarding
archive
  ↓
read-only retained Personal Vault
  ↓ optional Auth identity deletion
Vault/Documents remain
```

Archive RPC:

```sql
select public.archive_personal_vault('<personal-vault-id>');
```

Personal owner または parent Organization owner が archive できる。

`archived` Vault は通常の authenticated Document write/delete を拒否する。

## Auth user deletion

Auth identity の物理削除で Vault/Document を cascade delete しない。

Current behavior:

```text
Auth user delete
  -> vaults.owner_user_id = null
  -> documents.created_by = null
  -> documents.updated_by = null
  -> Vault remains
  -> Documents remain
```

したがって、

```text
退職社員削除
!=
知識削除
```

となる。

Organization 側で明示済みの `organization_reader` grant は、退職者本人の Auth identity が削除されても残り、organization-visible Document だけを引き続き参照できる。

## Recommended offboarding procedure

```text
1. Personal Vault の新規更新を止めるタイミングを決める
2. Organizationへ昇格済み / 未昇格 asset を確認
3. 必要なら promote / extract / merge を実施
4. 必要な organization_reader を明示 grant
5. Personal Vault を archive
6. archive read-back
7. 社内Identity/SSOを停止
8. 必要なら Supabase Auth user を削除
9. Vault/Documents survival を read-back
10. retention policy に従って保管
```

Auth user deletion を最初の操作にしない。

## Promotion and archive are separate

退職時に Personal Vault の全内容を Organization Vault へコピーしない。

```text
Personal asset
  ├─ reusable and safe -> promote / extract / merge
  └─ personal / low-value / sensitive -> archived Personal only
```

Organization Vault へ昇格するものは従来どおり汎用化・個人依存除去を行う。

Archive は「Organizationへ昇格しなかったものも即時消去しない」ための retention boundary である。

## No automatic PII classification claim

Public Vault は現時点で本文から個人情報を自動判定して access control を変更しない。

自動分類を将来追加する場合も、AI判定だけで `visibility_scope=organization` を付与する設計を既定にしない。誤判定時に個人情報が漏れるため、公開範囲を拡大するeffectには明示的なpolicy/approval boundaryが必要である。

## Retention and legal policy

Archive は無期限保存を意味しない。

実導入組織は次を別途決める。

- retention period
- legal hold
- deletion request handling
- access review cadence
-退職後に誰が organization_reader を持つか
- audit/log retention

Public Vault reference implementation は特定法令への適合を自動的に主張しない。
