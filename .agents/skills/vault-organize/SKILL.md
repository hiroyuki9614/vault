---
name: vault-organize
description: Partner Vaultで保存先・正本・個人/共同境界を判断し、重複正本を防ぐ。
---

# Vault Organize

## 目的

情報を、現在情報・履歴・TODO・未確認・AI解釈に分け、適切な既存正本へ統合する。

## 手順

1. `vault.config.yml` と関連READMEを確認する。
2. 同じ責務の既存正本を探す。
3. 個人情報か共同情報か判定する。
4. 既存正本へ統合できるなら新規ファイルを作らない。
5. 共有はユーザーの明示指示がある場合だけ `docs/SHARED_VAULT_CONTRACT.md` に従う。
6. `hr-vault` へread/writeする場合は、対象repositoryの `AGENTS.md` と `config/permissions.yml` を確認する。
7. shared writeはaction/path/conditionの明示allowを確認できる場合だけ行う。
8. write後は可能な範囲でread-backする。

## Fail closed

- target permission policyを読めない場合はshared writeしない。
- `default_effect: deny` の対象でallowを確認できない場合はshared writeしない。
- shared write/read-backが失敗した場合、個人側の正本を維持する。

## 禁止

- `final` / `最新版` / `v2` 等の重複正本
- AI推論を確認済み事実として保存
- 個人情報の自動共有
- shared vaultとpersonal vaultのdual canonical化
- target repositoryの権限ルールをsource側の判断で迂回
