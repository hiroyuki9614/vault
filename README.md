# Partner Vault

個人の情報・判断・投資メモを、Markdown-firstでAIと継続利用するための軽量Vaultです。

## 基本方針

- このrepositoryは**個人Vault**。本人だけの情報の正本を持つ。
- 二人で共有すると明示した情報は `hiroyuki9614/hr-vault` を共同正本とする。
- 個人情報・金融情報を保存する前にrepositoryがprivateであることを確認する。
- Supabase、通知、定期処理、外部APIはCoreの必須依存にしない。
- 通知・収集・判定などの汎用コードは、このVaultへ複製せず将来の共通toolkitへ切り出す。

## 入口

```text
AGENTS.md
  -> vault.config.yml
  -> 関連README / 正本
  -> 必要な場合だけ .agents/SKILLS_INDEX.md
```

## ディレクトリ

- `00_Inbox/`: 未整理の一時入口
- `10_Daily/`: 日付に紐づく記録
- `20_Projects/`: 完了条件のある活動
- `30_Areas/`: 継続的に管理する領域
- `40_Resources/`: 再利用可能な知識
- `50_Shared/`: 共同Vaultへの導線・共有境界
- `90_Archive/`: 現在の第一参照先ではない情報
- `.agents/`: AI Skill routing
- `templates/`: 新規Markdownの雛形
- `integrations/`: 外部サービスとの境界
- `docs/`: 恒久設計

投資用途は `30_Areas/Investing/` を入口にします。

## 共同Vault

共同Vault: `hiroyuki9614/hr-vault`

自動同期はしません。共有は必ず明示的に行い、共有後の共同情報は `hr-vault` を正本とします。詳細は `docs/SHARED_VAULT_CONTRACT.md` を参照してください。

## 設計書

- `docs/PARTNER_VAULT_LITE_DESIGN.md`
- `docs/SHARED_VAULT_CONTRACT.md`
