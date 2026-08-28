# Shared Vault Connection Contract

## 1. 目的

Partner Vault (`hiroyuki9614/vault`) と共同Vault (`hiroyuki9614/hr-vault`) を、個人情報の自動流出と二重正本を避けながら疎結合に接続する。

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

## 4. Publish protocol

```text
1. personal sourceを特定
2. ユーザーのexplicit share intentを確認
3. 共有する最小情報だけを抽出
4. hr-vaultの既存正本を確認
5. 新規または既存共同正本へwrite
6. same identityをread-back
7. verifiedなら共同情報のcanonicalをhr-vaultへ確定
8. personal側には必要なら共同正本への参照と個人限定補足を残す
```

共有先writeまたはread-backが失敗した場合、共有成立とみなさない。個人側の正本を維持する。

## 5. Read protocol

個人Vaultの通常依頼で `hr-vault` を毎回読まない。

次の場合だけ共同Vaultを読む。

- ユーザーが共同情報を明示的に求めた
- 対象文書が共同正本への参照を持つ
- 個人と共同の比較が依頼の主目的

共同Vaultから個人Vaultへ情報を自動逆流させない。

## 6. Investment boundary

```text
Individual thesis / portfolio / watchlist
  -> personal vault

Shared portfolio / shared watchlist / joint decision
  -> hr-vault

Market collector / crash rule / ntfy / Telegram implementation
  -> shared toolkit candidate
```

市場データ取得や通知実装は共同データそのものではないため、長期的には `hr-vault` にも個人Vaultにもコードを重複配置しない。

## 7. Supabase boundary

Supabaseは接続要件ではない。

導入する場合もMarkdown正本を無条件にDBへ移さない。候補は次の機械状態に限定する。

- alert state / fingerprint
- notification delivery state
- task state
- market snapshot / time series
- scheduler state
- 外部同期状態

共同データと個人データはscopeを明示し、将来権限要件が強くなればproject分離を再検討する。

## 8. Security

- 両personal vaultはprivate repositoryを前提とする。
- `hr-vault` もprivateを維持する。
- SecretはGitHub Markdownへ保存しない。
- shared vaultへのアクセス権がない利用者に、個人Vault側から共同本文をコピーして迂回提供しない。

## 9. Non-goals

初期段階では次を実装しない。

- 双方向自動同期
- Git submoduleによる強結合
- webhookによる自動共有
- Supabaseを必須Control Planeにすること
- 個人Vaultの全文を共同Vaultへindexすること

## 10. Revisit conditions

次が実測で必要になった場合だけ自動化を検討する。

- 明示共有の手作業が頻発する
- 共有漏れが実害になる
- 同じnotification / collectorコードを複数Vaultでコピーし始める
- 共同taskやmarket stateをMarkdownだけで扱うのが非効率になる
