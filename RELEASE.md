# リリース手順

## バージョン上げ

1. `package.json` / `src-tauri/Cargo.toml` / `src-tauri/tauri.conf.json` の `version` を同じ番号にそろえる（例 `0.2.0`）
2. コミットして push
3. タグを打って push すると GitHub Actions が Windows インストーラと `latest.json` を Release に載せる

```bash
git tag v0.2.0
git push origin v0.2.0
```

## ローカルビルド

```bash
npm run tauri build
```

成果物: `src-tauri\target\release\bundle\nsis\`

## 自動更新

- 署名公開鍵は `tauri.conf.json` に埋め込み済み
- 秘密鍵は GitHub の `TAURI_SIGNING_PRIVATE_KEY`（リポジトリ Secrets）
- 起動時に GitHub Release の `latest.json` を参照

## 初回セットアップ（済）

- 署名鍵: `%USERPROFILE%\.tauri\swipe.key`（ローカル保管・コミットしない）
