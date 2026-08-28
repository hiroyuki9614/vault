# Partner Vault Agent Rules

このrepositoryは軽量な個人Vaultである。高度なControl Planeや外部DBを前提にせず、GitHub + Markdownだけで通常の記録・参照・整理を成立させる。

## Bootstrap

1. `vault.config.yml` を読む。
2. 依頼に関係するトップレベルREADMEまたは既存正本だけを読む。
3. Skillが必要な場合だけ `.agents/SKILLS_INDEX.md` を読み、選択した `SKILL.md` だけを読む。
4. 既存正本を確認してから新規ファイルを作る。
5. write後は可能な範囲で同じ対象をread-backする。

全文走査を既定にしない。

## Privacy

- repositoryがprivateであることを確認できない状態では、実在する個人情報・金融情報・Secretを新規保存しない。
- token、password、API key、秘密鍵、証券口座認証情報をrepositoryへ保存しない。
- AIの推論を本人確認済みの事実へ変換しない。

## Canonical boundary

### 個人情報

本人だけに属する情報はこのrepositoryを正本とする。

例:
- 個人の投資方針
- 個人portfolio
- 個人watchlist
- 個人の判断メモ
- 個人Project / Area

### 共同情報

`vault.config.yml` が示す shared vault へ**明示的に共有された情報だけ**共同情報として扱う。

- 現在のshared vault: `hiroyuki9614/hr-vault`
- 自動同期しない。
- 「共有して」「共同Vaultへ」等の明示指示なしに個人情報を書き出さない。
- 共有writeが成功してread-backできた場合、その共有情報の共同正本は `hr-vault` とする。
- 個人側に必要な補足は、共同正本への参照と個人限定メモに分離する。
- shared vaultが利用不能なら、個人側の正本を勝手に移動・削除しない。

詳細契約は `docs/SHARED_VAULT_CONTRACT.md`。

## Information classes

最低限、次を区別する。

- 現在有効な事実・方針
- 決定事項
- 履歴
- TODO
- 未確認事項
- AIの意見・解釈
- 一時情報

`final`、`最新版`、`v2`のような重複正本を増やさない。

## External services

Supabase、通知、Calendar、外部API、定期Workerはoptional adapterであり、利用不能でもMarkdown Coreを停止させない。

通知・株価収集・alert engine等の汎用実装をこのrepositoryへ安易にコピーしない。複数Vaultで再利用する実装は共通toolkit候補として扱う。
