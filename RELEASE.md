# リリース手順

## バージョン上げ

1. `package.json` / `src-tauri/Cargo.toml` / `src-tauri/tauri.conf.json` の `version` を同じ番号にそろえる（例 `0.2.0`）
2. `src-tauri/Cargo.lock` 内の `name = "swipe"` の `version` も同じ番号にそろえる
3. コミットして push
4. タグを打って push すると GitHub Actions が Windows インストーラと `latest.json` を Release に載せる

```bash
git tag v0.2.0
git push origin main
git push origin v0.2.0
```

## CI が「えらい時間」の理由（正常）

タグ push 後の **Release** ワークフローは、だいたい次の内訳です。

| 処理 | 目安 |
|------|------|
| ランナー起動・npm ci | 1〜2 分 |
| **Rust リリースビルド**（`tauri build`） | **5〜7 分**（全体の大半） |
| NSIS 作成・GitHub へアップロード | 1 分前後 |
| Rust キャッシュの保存（初回やキャッシュミス時） | +30 秒程度 |

**合計 7〜9 分**はハングではなく、Windows 上で Tauri をゼロから（またはほぼ全量）コンパイルしているためです。

進捗の見方:

- ブラウザ: [Actions / Release](https://github.com/honi0907/image-swipe/actions/workflows/release.yml)
- ローカル: ダブルクリック **`リリース確認.bat`**（`gh run watch` で完了まで表示）

### 2 回目以降を短くする

ワークフローでは `swatinem/rust-cache` に **`shared-key` を固定**し、ジョブ ID をキャッシュキーに含めない設定にしています。  
v0.1.4 で一度キャッシュが作られたあとは、依存が変わらないリリースは **おおよそ 3〜5 分**まで短くなることが多いです。

## ローカルビルド（いちばん早い配布）

CI を待たずに配布用 exe が欲しいとき:

- **`ビルド.bat`** … ローカルで `npm run tauri build`（2 回目以降はキャッシュで速い）
- 成果物: `src-tauri\target\release\bundle\nsis\`

## 自動更新（`latest.json`）

- 署名公開鍵は `tauri.conf.json` に埋め込み済み
- GitHub Secrets:
  - `TAURI_SIGNING_PRIVATE_KEY` … `%USERPROFILE%\.tauri\swipe.key` の内容
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` … 鍵にパスワードを付けたときだけ（無しなら空で Secret 自体不要でも可）
- 起動時に `releases/latest/download/latest.json` を参照

リリース後に **アセットに `latest.json` があるか**必ず確認してください。  
ログに `Signature not found for the updater JSON. Skipping upload...` と出る場合:

1. Secrets の秘密鍵とパスワードの組み合わせが正しいか（パスワード付き鍵なのに Secret 未設定など）
2. ワークフローで `args: --bundles nsis` になっているか（MSI 用 `.sig` が混ざると action が混乱することがある）

## 初回セットアップ（済）

- 署名鍵: `%USERPROFILE%\.tauri\swipe.key`（ローカル保管・コミットしない）
