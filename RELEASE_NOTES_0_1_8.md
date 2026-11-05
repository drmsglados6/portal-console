# v0.1.8 — アプリ内更新・短縮コマンド・ネイティブ移行準備

**後続の修正リビジョン[v0.1.8-1](https://github.com/drmsglados6/portal-console/releases/tag/v0.1.8-1)を公開しました。** マウス選択・画像貼り付けの修正を含みます。旧クライアント互換のためGitHubのlatest指定は0.1.8を維持しています。0.1.8-1へ移行する場合は、リンク先Releaseの一時更新スクリプトか通常インストーラを使ってください。

## 追加・変更

- `pupdate`／`portal-update`で公開GitHub Releaseの最新安定版へ更新できます。`--check`は確認だけです。ログイン・gh・システムNode.jsは不要です。
- OS／CPU／インストール方式に一致する配布物を選び、サイズ・SHA-256検証後に独立workerへ引き継ぎます。設定・プリセット・インストール先を保持します。
- v0.1.7以前からの移行用に`update-once.ps1`／`update-once.sh`を配布します。これらが取得する`update-once.cjs`も検証します。
- F4で選択中の端末／メディアペインを一時最大化・復元できます。
- 起動名`pconsole`、内部コマンド`phelp`・`ppreset`・`prestart`・`pmedia`・`pexit`を追加しました。従来名も有効です。
- **CRT再現を一時停止しました。** 保存済みenabled=trueでも描画せず、実装・設定を保持します。
- `AGENTS.md`・`DEVELOPMENT_CONTEXT.md`・`NATIVE_REWRITE_0_2_0.md`を追加しました。今後の0.1.xでRust関数をElectronから呼び、共通coreを育ててnative frontendへ移す計画を整理しています。Rust実装自体はまだ始めていません。

## 旧版から更新する

Portal Consoleを閉じ、Releaseからダウンロードしたスクリプトを外部端末で実行してください。

Windows:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\update-once.ps1
```

Linux／Mac:

```sh
sh ./update-once.sh
# 自動検出できない場合
sh ./update-once.sh "$HOME/Applications/portal-console.app"
```

Windowsは`-CheckOnly`、Unixは`--check`で変更せず確認できます。v0.1.8以降は端末内で`pupdate`を使えます。

## 検証・配布物の改訂

- タグの全OSリリースCI：<https://github.com/drmsglados6/portal-console/actions/runs/41985892462>（Linux TTY終了待ちの一時失敗後、再実行で全ジョブ成功）。
- 公開後のWindows GUIランタイム待機とportable置換の修正、および実際の簡易ZIP更新workerの追加検証：[`8dbb27e`](https://github.com/drmsglados6/portal-console/commit/8dbb27e)、全OS CI：<https://github.com/drmsglados6/portal-console/actions/runs/41989686002>。
- **Windowsのsetup／portable／簡易ZIPと、一時更新補助ファイルは、後者の検証済みCI成果物に差し替え済みです。** 公開タグの履歴は書き換えていません。再現する際は配布物の改訂元として上記コミットを参照してください。
- 公開後、実際の旧版0.1.6のランタイムを使って一時更新スクリプトの取得・SHA-256検証・NSIS方式／既存インストール先の検出を`-CheckOnly`で確認しました。ユーザーの稼働窓・実機インストールは変更していません。
- Macはアドホック署名の整合性を検証済みですが、Developer ID／Apple公証は未設定です。ダウンロード後のGatekeeperと報告済みIntel Macのスクロール問題は実機確認が必要です。
