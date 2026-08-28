# Integrations

外部サービス固有の接続境界を置きます。Vault Coreはここに依存しなくても利用可能でなければなりません。

初期方針:

- Supabase: optional。task state、通知state、時系列・集計等の機械状態に限定。
- Notifications: optional。ntfy / Telegram等は共通toolkit候補。
- Scripts: 複数Vaultで使うコードはこのVaultへコピーせず共通toolkit候補。
- Shared Vault: `shared-vault/README.md` を参照。

Secret値はrepositoryへ保存しません。
