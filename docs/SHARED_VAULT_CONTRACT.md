# Shared Vault Connection Contract

## 1. 目的

Partner Vault (`hiroyuki9614/vault`) と共同Vault (`hiroyuki9614/hr-vault`) を、個人情報の自動流出・権限迂回・二重正本を避けながら疎結合に接続する。

## 2. Repository roles

```text
hiroyuki9614/vault
  = パートナー個人情報の正本

hiroyuki9614/hr-vault
  = 二人で共有すると明示した情報の共同正本

future shared toolkit
  = 通知・collector・alert engine等の個人データを持たない共通コード
```

共同Vaultは個人Vaultのmirrorではない。

## 3. 共有対象

共有候補:

- 共同portfolio
- 共同watchlist
- 二人で合意した資産配分・投資方針
- 共同の投資判断
- 共同通知条件
- 家計・家庭Project等、双方が共同管理すると決めた情報

既定で共有しない:

- 個人portfolio
- 個人watchlist
- 個人の判断途中メモ
- 個人の感情・評価・未整理メモ
- Secret / credential
- 明示共有されていない個人情報

## 4. Target policy first

`hr-vault` への操作可否はPartner Vault側だけで決めない。

shared read/writeの前に最低限、次を確認する。

1. `hiroyuki9614/hr-vault/AGENTS.md`
2. `hiroyuki9614/hr-vault/config/permissions.yml`
3. 対象README / canonical document

`config/permissions.yml` は共同Vaultの論理権限正本として扱う。

- `default_effect: deny` を前提とする。
- writeはsubject / action / path / conditionの明示allowを確認できる場合だけ行う。
- permission policyを取得できない場合はshared writeしない。
- source側のexplicit share intentは必要条件だが、それだけでtarget write権限にはならない。
- target repositoryにより厳しいルールがある場合はtarget側に従う。

## 5. Publish protocol

```text
1. personal sourceを特定
2. ユーザーのexplicit share intentを確認
3. 共有する最小情報だけを抽出
4. hr-vault/AGENTS.mdを確認
5. hr-vault/config/permissions.ymlを確認
6. subject / action / path / conditionのallowを確認
7. hr-vaultの既存正本を確認
8. 新規または既存共同正本へ最小write
9. same identityをread-back
10. verifiedなら共同情報のcanonicalをhr-vaultへ確定
11. personal側には必要なら共同正本への参照と個人限定補足を残す
```

共有先writeまたはread-backが失敗した場合、共有成立とみなさない。個人側の正本を維持する。

## 6. Read protocol

個人Vaultの通常依頼で `hr-vault` を毎回読まない。

次の場合だけ共同Vaultを読む。

- ユーザーが共同情報を明示的に求めた
- 対象文書が共同正本への参照を持つ
- 個人と共同の比較が依頼の主目的

共同Vaultを読む場合もtarget `AGENTS.md` / `config/permissions.yml` に従う。

共同Vaultから個人Vaultへ情報を自動逆流させない。

## 7. Canonical transition

shared publishがverifiedになる前はpersonal sourceが正本である。

shared publishがverifiedになった後、その**共同情報**は `hr-vault` が正本となる。

personal側では次だけ保持できる。

- 共同正本への参照
- personal-onlyの補足
- 共有前後の履歴として必要な最小記録

同じ共同本文をpersonal/shared双方で独立更新しない。

## 8. Investment boundary

```text
Individual thesis / portfolio / watchlist
  -> personal vault

Shared portfolio / shared watchlist / joint decision
  -> hr-vault

Market collector / crash rule / ntfy / Telegram implementation
  -> shared toolkit candidate
```

市場データ取得や通知実装は共同データそのものではないため、長期的には `hr-vault` にも個人Vaultにもコードを重複配置しない。

## 9. Supabase boundary

Supabaseは接続要件ではない。

導入する場合もMarkdown正本を無条件にDBへ移さない。候補は次の機械状態に限定する。

- alert state / fingerprint
- notification delivery state
- task state
- market snapshot / time series
- scheduler state
- 外部同期状態

共同データと個人データはscopeを明示し、将来権限要件が強くなればproject分離を再検討する。

## 10. Security

- 実データを保存するpersonal vaultはprivate repositoryを前提とする。
- `hr-vault` もprivateを維持する。
- SecretはGitHub Markdownへ保存しない。
- shared vaultへのアクセス権がない利用者に、個人Vault側から共同本文をコピーして迂回提供しない。
- target permissionsで拒否されるwriteを、別path・別文書・personal側のcopyで迂回しない。

## 11. Non-goals

初期段階では次を実装しない。

- 双方向自動同期
- Git submoduleによる強結合
- webhookによる自動共有
- Supabaseを必須Control Planeにすること
- 個人Vaultの全文を共同Vaultへindexすること
- permission policyの自動緩和
- source agentによるtarget governanceの自己変更

## 12. Revisit conditions

次が実測で必要になった場合だけ自動化を検討する。

- 明示共有の手作業が頻発する
- 共有漏れが実害になる
- 同じnotification / collectorコードを複数Vaultでコピーし始める
- 共同taskやmarket stateをMarkdownだけで扱うのが非効率になる

自動化を追加する場合もtarget permission checkとread-back verificationは迂回しない。
