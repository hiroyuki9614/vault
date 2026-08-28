# Shared

共同Vault `hiroyuki9614/hr-vault` への導線です。

このdirectoryは共同情報の第二正本ではありません。共有済み情報の本文を複製せず、必要なら共同正本への参照と個人限定補足だけを保持します。

共有フロー:

```text
explicitly shareable information
  -> explicit share instruction
  -> hr-vault/AGENTS.mdを確認
  -> hr-vault/config/permissions.ymlを確認
  -> action/path/conditionのallowを確認
  -> hr-vaultへ最小write
  -> same targetをread-back
  -> verifiedならhr-vaultが共同正本
  -> personal vaultには参照 + 個人限定補足だけ
```

permission policyを読めない、allowを確認できない、write/read-backに失敗した場合は共有未成立として個人側の正本を維持します。

詳細: `../docs/SHARED_VAULT_CONTRACT.md`
