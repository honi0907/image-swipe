# 画像スワイプ

Tauri 2 + React の2画面画像スイッチャーです。

- **操作ウィンドウ (`control`)**: 10×5 パレット、プレビュー、スワイプ設定
- **出力ウィンドウ (`output`)**: 全画面表示（2台目モニタがあれば自動配置）

## 必要環境

- [Rust](https://www.rust-lang.org/learn/get-started)（Tauri のビルドに必須）
- Node.js 18+

## 起動

ダブルクリックで開発起動:

- **`起動.bat`** … 開発モード（ホットリロード付き）
- **`ビルド.bat`** … exe を作成
- **`起動-ビルド版.bat`** … ビルド済み exe を起動

コマンドから:

```bash
npm install
npm run tauri dev
```

## 操作

- エクスプローラから画像をコマへドロップ（複数枚は選択コマから空きを順に埋める）
- コマをクリック → その画像へ遷移して出力
- **Space** → 次の画像コマへ
- **Delete** → 選択コマを空に
- コマ間ドラッグで入れ替え
- フッタで出力先モニタを変更

設定は `localStorage` に自動保存されます。

## ダウンロード・更新

- 配布は [GitHub Releases](https://github.com/honi0907/image-swipe/releases) の Windows インストーラ（NSIS）
- 起動時に新バージョンがあれば更新を確認（要インターネット）

## 開発者向け

バージョン番号を上げて `git tag vX.Y.Z` → `git push origin vX.Y.Z` で CI がリリースを作成します。詳細は [RELEASE.md](RELEASE.md)。
