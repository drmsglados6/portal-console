# TODO

- [x] インストール方式の記録と旧版更新を検証する（Windows release-0929簡易版の構成、NSIS、実際のUbuntu 0.1.0.deb、macOS旧app/dmg/zip、AppImage）。v0.1.3として配布済み。
- [x] cool-retro-termを参考にしたCRT効果の初期実装（グロー、静的走査線、周辺減光、ガラスハイライト、設定UI）をWindows・UbuntuのGUIと各OSのビルドで検証する。
- [ ] CRTの画面歪み・残光・動的ノイズを検討し、描画負荷と入力座標への影響を確認する。
- [ ] OpenCode等の代替画面でホイール入力が消える問題の修正をビルド・実機で確認する。
- [x] Linux配布版の自動ヘッドレス切替とUbuntu 24.04のGTKエラー対策をCIで検証し、v0.1.1をリリースする。
- [ ] WindowsのPowerShell上でOpenCodeをCtrl+C終了すると、親のターミナルPTYまで終了することがある問題を修正する。
- [ ] 別セッションで進めた可能性がある macOS 等の成果を確認し、重複や差分を整理して統合する。
- [ ] GitHub公開前にこのマシン固有のパス・環境情報、ユーザー情報、パスワード・トークン等の機密情報が含まれていないか点検する（配布物・ログも対象）。
- [x] Git登録対象に標準サンプル以外の保存済みプリセットや個人設定が含まれていないことを確認する。
- [x] 実行・開発・各OS向けビルドに必要なライブラリ／システム依存パッケージをREADMEに明記する。
- [x] `github.com/drmsglados6` に Private の `portal-console` リポジトリを作成し、Git管理したプロジェクトを登録する。
- [x] GitHub Actions で Windows x64・macOS x64/arm64・Ubuntu x64 向けビルドを実行し、同梱ネイティブ依存関係の動作と成果物アップロードを確認する。
- [x] `v0.1.0`タグのpushでGitHub Release自動添付処理を実行し、全OSの成果物が添付されたことを確認する。
