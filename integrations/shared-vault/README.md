# Shared Vault Integration

Target repository: `hiroyuki9614/hr-vault`

これはGit submoduleや自動同期ではなく、**明示共有による論理接続**です。

## Contract

- read: 共同情報が必要な依頼、またはユーザーが明示した場合だけ。
- target rules: read/write前に `hr-vault/AGENTS.md` と `hr-vault/config/permissions.yml` を確認する。
- write: 「共有して」「共同Vaultへ」等の明示指示があり、かつtarget permissionでaction/path/conditionのallowを確認できる場合だけ。
- fail closed: permission policyを読めない、またはallowを確認できない場合はwriteしない。
- verified publish: write後に同じ対象をread-backできた場合のみ共有成立。
- failure: `hr-vault` が利用不能、write失敗、read-back失敗の場合は個人側の正本を維持する。
- canonical: 共有成立後、その共同情報は `hr-vault` が正本。
- no dual canonical: 同じ共同本文をこのVaultでも独立更新しない。

実行詳細とデータ分類は `../../docs/SHARED_VAULT_CONTRACT.md`。
