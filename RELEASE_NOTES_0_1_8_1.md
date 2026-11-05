# v0.1.8-1 — マウス選択・画像貼り付けの修正

0.1.8系の配布リビジョンです。

## 修正内容

- 通常画面のlocalモードでは、マウス追跡が残っていても普通のドラッグで文字を選択・コピーできます。リモートへのクリック／ドラッグ報告を発生させず、xtermの選択機能を使います。
- 通常画面でのidle motion抑止を、SGRに加えて旧形式／urxvt形式にも対応させました。代替画面TUI・applicationモード・Alt操作は維持します。
- ローカルのOpenCode等への画像貼り付けではCtrl+VをTUIへ渡し、文字列だけを読む処理で操作が消えないようにしました。テキスト・空クリップボード・Ctrl+Shift+V／Shift+Insert／Cmd+Vも回帰検証します。
- CRTは引き続き一時停止しています。

## 更新番号と旧版からの移行

`0.1.8 < 0.1.8-1 < 0.1.8-2 < 0.1.9`の順で、数値の`-n`を配布リビジョンとして比較します。このアプリではSemVer prereleaseの順序とは異なります。

0.1.8-1以降の`pupdate`／`portal-update`はRelease一覧からリビジョンを検出します。旧0.1.8はこの番号形式を解釈できないため、このReleaseの`update-once.ps1`／`update-once.sh`または通常インストーラで移行してください。旧0.1.8のチェックを壊さないよう、GitHubのlatest指定は旧版のままにしています。

Windows：Portal Consoleを閉じ、外部のPowerShellでダウンロードしたスクリプトを実行します。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\update-once.ps1
# インストールせず確認だけ
powershell -NoProfile -ExecutionPolicy Bypass -File .\update-once.ps1 -CheckOnly
```

Linux／Mac：

```sh
sh ./update-once.sh
# 必要なら実行ファイル／AppImage／.appを指定
sh ./update-once.sh "$HOME/Applications/portal-console.app" --check
```

既存の場所・方式を引き継ぎ、サイズ／SHA-256を検証します。画像ペーストの対応はローカルTUIのOSクリップボード操作であり、SSH先へ画像を自動転送する機能ではありません。

## 実機確認について

今回のマウス文字漏れの画像は、インストール済み0.1.6での報告と確認しています。新版のマウス操作は再現fixtureで、画像貼り付けはTUIへのキー配送を検証済みです。更新後の実際のSSH接続・OpenCode画像添付は実機で確認してください。MacのDeveloper ID／公証は引き続き未設定です。

## 配布・検証結果

- Windows／Linux／Mac Intel・ARM64、Ubuntu 24.04 GUI／TTY、更新・署名・画像貼り付け／選択のCIが全ジョブ成功：<https://github.com/drmsglados6/portal-console/actions/runs/42052805317>。
- タグ実行時のUbuntu起動確認タイムアウトに対して検証用データを分離し、起動待ちを調整して再検証しました。タグの履歴は変更せず、公開ジョブがタグと実行用ソースの一致を確認しています。
- 全18アセットの添付、prerelease=false、旧latestエンドポイントの互換性を確認しました。
- 公開後の一時更新スクリプトのcheck-onlyで、実際の0.1.6ランタイムから0.1.8-1への更新候補・NSIS方式・既存パスを検出できました。実機インストールや稼働中PTYの終了は行っていません。
