# 0.2.0 Rust／ネイティブ化：仕様・要件・移行準備

状態：**要件整理。0.1.xでRust関数をElectronから呼び出し、段階移行する方針をユーザーと共有。Rust実装・呼び出し方式・GUIツールキット選定・採用ライブラリの確定は未着手。**

## 1. 目的と境界

ユーザーは0.2.0付近でRust等によるネイティブアプリへの書き直しを検討している。現在のElectron版を動作仕様の基準とし、端末としての安定性・入力の正確さ・リソース使用量を優先する。0.1.8には移行準備文書を含め、Rust版の完成を意味させない。

必須の方向性：

- 端末・設定・セッション・更新の中核をRust側で所有し、Electron／Node.js常駐を不要にする。
- Windows x64、Linux x64、Mac Intel／ARM64を継続対応する。
- 日本語・IME・CJK／Unicode幅・クリップボード・TUI・SSHを実際の端末用途として扱う。
- CRTは初期要件から外し、無効のまま保存設定を受け入れる。再有効化には独立した性能測定とユーザー判断が必要。
- 既存の設定・プリセット・CLI・更新経路を失わず、いつでも既存データから復帰できる移行にする。

## 2. GUI方式の選定ゲート

フレームワークの名前だけで決めず、小さな同一要件の試作で比較する。候補は例としてegui／Slint／Iced等のRust UI、OSネイティブUI連携、メディア部分のみOS WebViewを併用する方式。いずれも採用決定ではない。

| 比較軸 | 試作で確認すること |
| --- | --- |
| ターミナル描画 | 6ペイン、CJK・絵文字・選択・カーソル、フォント変更、履歴と高速出力 |
| 入力 | Windows／Mac／LinuxのIME合成、キー修飾、Alt、Fnキー、フォーカス・マウス追跡 |
| OS連携 | ConPTY、Unix PTY、クリップボード、HiDPI、複数モニタ、ファイル選択、アクセシビリティ |
| 低負荷 | アイドル時の描画停止、CPU／メモリ／GPUの実測、GPUなしの起動・復旧可否 |
| メディア | PDF・画像・動画・Webの内蔵表示、配布可能なcodec・ライセンス、OS差 |
| 配布 | 署名・公証・パッケージ・更新、最小対応OS、バイナリサイズ |

Tauri等のRust＋WebViewを候補に入れる場合も、全ワークスペースをWeb表示へ置き換えるだけでユーザーの「ネイティブ化」意図を満たすと決めつけない。OS WebViewをメディアに限定する案と比較し、採用前に説明する。ウィンドウドッキングや独自CRT shaderの実験を先に必須化しない。

## 3. 互換性を守る機能要件

### 3.1 起動・配置・セッション

- `pconsole`／`portal-console`、`--mode`、`--preset`、`--preset-list`、`--config`、`--windowed`、`--headless`等、現行`src/config.js`で受理するCLIを棚卸しして互換テストにする。
- `original`：中央4:3、左メイン端末・右上補助端末・右下AA。ワイドの黒い余白。
- `modern`：比率指定、任意ペイン、動的プリセット、正／反転の列・行別窓数を再現する。
- 配置変更はセッションID・PTY・CWD・出力を保持する。窓を減らす場合は閉じる番号の選択と対象件数の検証を行う。
- 範囲／除外・regexの窓選択。Rustのregex実装はJavaScript RegExpと機能差があるため、現行構文を無言で狭めない。必要な対応範囲を決定し、非対応は明示する。
- F2／F3と代替ショートカット、F4一時最大化／復元、F11、独立アプリ窓、端末巡回・番号選択。
- F4の状態は永続レイアウトに書き込まず、選択・モード変更で復元する。

### 3.2 端末・プロセス・入力

- VT状態機械、通常／代替バッファ、スクロールバック、コピー選択、貼り付け・bracketed paste、TTYサイズ変更を独立したcoreで扱う。
- Windows ConPTYとUnix PTYを抽象化する。`portable-pty`等は候補であり、PowerShell／CMD／bash／zsh／SSH／TUIで試す。
- xterm.jsからの変更はVTの互換性変更を伴う。既存SGR・OSC・DECSET・マウス・色・カーソル・ワイド文字のfixtureを移行する。ANSIパーサーと描画器を混同しない。
- 通常画面のidleマウス移動をSGR／旧形式とも抑止し、履歴スクロールを最下部へ戻さない。localモードでは追跡要求が残っていても通常ドラッグで文字選択できること。代替画面／アプリケーションモード／Alt overrideではアプリへのクリック／ドラッグを保持する。
- 高精度トラックパッドの小さいdeltaを蓄積し、通常画面の履歴スクロールをSSH先へ転送しない。
- Ctrl+Shift+M／コマンドモードMの追跡リセットは、PTYや履歴を破棄しない。
- R／`prestart`はCWD保持、Shift+R／`--reset-cwd`は既定CWD。Windowsの一時シェル連携はユーザープロファイルを変更しない。
- 不意のPTY終了は可視化し、再起動ループを上限制御する。OpenCodeのCtrl+Cによる親シェル終了は既知の未解決事例として再現試験を設ける。
- PTY出力のバックプレッシャー、描画batch、pane generationの確認、閉じたペインへの遅延出力破棄が必要。現行の64KiB配送とhigh/low waterは測定用の基準値とし、Rust側の最適値は実測で決める。

### 3.3 内部コマンド・ヘルプ・TTY

- `phelp`／`portal-help`、`ppreset`／`portal-preset`、`prestart`／`portal-restart`、`pmedia`／`portal-media`、`pexit`／`portal-exit`、`pupdate`／`portal-update`を維持する。
- 更新番号の数値リビジョン契約：`0.1.8 < 0.1.8-1 < 0.1.8-2 < 0.1.9`。RustのSemVer crateのprerelease順序をそのまま採用しない。旧0.1.8互換のGitHub latestと、リビジョン対応クライアントのRelease一覧による検出を区別する。
- 入力の断片、バックスペース、キャンセル、端末応答を区別する。`echo pexit`、未知の接尾辞、パイプ等を内部コマンドとして誤認しない。
- 内部コマンドのグローバルなshell関数登録はしない。shell promptとTUIの判定に改善を加える場合は互換仕様として明文化する。
- GUI／TTYのヘルプを同じ構造化データから生成し、現行TTYのCtrl+B操作・ページ送り・番号選択を維持する。
- ローカルOpenCode等の画像ペースト用Ctrl+Vを、空テキストの貼り付けとして消費しない。テキストのbracketed pasteと画像対応TUIのクリップボード操作を区別する。ローカル画像をSSH先へ自動転送する機能とは分ける。
- DISPLAY／WAYLAND_DISPLAYなしのLinux自動フォールバック、端末復元、終了時のカーソル／raw mode解除、SSHでの使い方を継続する。

### 3.4 メディア・原作データ

- ローカル画像／PDF／動画／Webをアプリ内の追加ペインとして開き、既存PTYを終了しない。
- 自動判定・`--kind`／`--source`・引用符・手動fallbackを維持する。
- 相対パスは入力元端末のローカルCWDで解決する。SSH先のリモートファイルと誤認させない。手動再入力の基準を固定し、+MEDIAは最後に選んだ端末を基準にする。
- 画像の送り・ズーム・fit・実寸・並べ替え、PDFページ・RTL／LTR・次ファイル、動画再生・シーク・音量、Web URL／戻る／進む／再読込、F4・最大化・Close。
- GPUを使う動画decoder等の要否はCRTと別に測定する。コーデックやPDFライブラリは配布・ライセンスも含め比較する。
- OS既定ブラウザの既存プロファイル／拡張の再利用、IrfanView、外部窓のドッキングは将来実験であり、現時点の必須仕様へ混ぜない。
- Portal endingはlocal Steam/VPKから取得し、sceneの時刻・音量・seek・pause等の現行操作を仕様化する。原作データをRustバイナリやfixtureに埋め込まない。

## 4. データ・インストール互換

維持対象：設定ディレクトリ、`config.json`、保存済み`presets/*.json`、ユーザーのshell profile定義、appearance/media/ending設定、install recordのschema/appId/method/version履歴、ログ。

- 初回起動時は読み込み互換を先に実装する。形式を変える場合はバックアップ・schema version・明示的な移行処理を用意する。
- `appearance.crt`の旧値は受理・保持し、描画は無効のままにする。
- appIdは`science.aperture.portalconsole`を維持する。Macのbundle名や署名ID、Windowsのアンインストール登録を別製品へ不用意に変えない。
- Macのinstall recordは`.app`の外。署名済みbundleにログや更新記録を追加しない。
- `pconsole`の登録は既存の外部コマンドを上書きせず、アンインストールは自分が追加した登録だけを解除する。
- バイナリ・パッケージの置換とユーザーデータの削除を分離する。プロセスロック時は更新失敗を検知し、旧版を失わないようにする。

## 5. Electron→Rust更新の重要な移行障害

**0.1.8の更新補助は、配布されるElectronバイナリを`ELECTRON_RUN_AS_NODE=1`で実行できることを前提にする箇所がある。Rustバイナリはこの契約をそのまま満たさない。**

| 経路 | 移行時に必要な対応 |
| --- | --- |
| Windows NSIS | 新しいsetup.exeのインストール記録・CLI登録をネイティブ実装へ切替。旧NSIS登録・インストール先を引き継ぐ |
| Windows簡易ZIP | `install.ps1`内の新バイナリ経由JS実行を置換。外側ZIP／内側payloadの既存レイアウトは、旧workerが読む限り維持する |
| Linux deb | after-installのJS呼び出しをネイティブな記録・CLI登録へ切替。旧debからのapt更新を試験 |
| 補助AppImage／Mac | 0.1.8に同梱された旧`install-unix.sh`が新パッケージ内のNode／ASARを要求する。Rust payloadへ直接渡すと失敗するため、橋渡しが必要 |
| 単体AppImage／portable.exe | ファイル置換経路は比較的独立。ただし新ランチャー・起動引数・設定の互換を確認する |
| 一時更新スクリプト | 0.1.8限定。Rust版でNodeランタイムが消えた後は同じbootstrapを再利用できない |

0.2.0公開前に、少なくとも次から移行策を選びADRに記録する：橋渡し用0.1.xで更新protocolを先に対応させる／旧helperが解釈可能な互換ランチャーを移行用配布物に含める／明示的な一時移行インストーラを提供する。古いバージョンのユーザー全員が最新0.1.xを経由したとは仮定しない。

新しい更新coreは公開GitHub Release、安定版の数値比較、OS／arch／install methodの選択、サイズ／digest検証、独立worker、インストール成功・失敗のログを引き継ぐ。更新準備のエラーで稼働中PTYを停止せず、worker起動確認後にアプリを閉じる。

## 6. 非機能要件と測定

- アイドルで継続アニメーションや無意味な再描画をしない。大量出力はバッチ処理し、可視部分中心に描画する。
- 既存Electron版の同じマシン・同じペイン数・同じ出力fixtureで、起動時間、常駐メモリ、アイドルCPU／GPU、入力遅延、出力スループット、パッケージ容量を先に記録する。
- 合格値は未測定の数値で捏造しない。試作で基準値と測定法を確定し、Electron版より改善したかを示す。
- GPUなし／ソフトウェア描画、HiDPI切替、サスペンド復帰、サイズ変更・最大化連打、TTY終了復元、例外時のログを検証する。
- OS WebViewのサンドボックス、ローカルファイル読込権限、UIから実行コマンドへの境界を設計する。Webページから内部コマンドや任意installer実行を呼ばせない。
- Macはアドホック署名整合性とDeveloper ID／公証を別項目で追跡する。Windows署名・Linux依存・配布ライセンスもリリース要件にする。

## 7. 推奨構成（暫定案）

```text
core: config / layout / pane ids / internal commands / terminal model / update planning
platform: PTY / process / CWD / clipboard / filesystem / installer / signing integration
frontend-native: rendering / input / IME / focus / dialogs / accessibility
frontend-tty: ANSI display / raw input / prefix controls / terminal cleanup
media: image / PDF / video / OS WebView adapters
distribution: package hooks / native install-record CLI / update worker / migration tools
```

UIとPTYの所有を分け、非同期event・pane generation・shutdown順序を型と状態遷移で定義する。採用crateはこの責務を満たすかを評価してから決める。既存JS fixtureを言語中立なJSON／byte sequence fixtureに変換し、UI実装の細部を写したテストに偏らせない。

### 7.1 0.1.xからの段階的なRust導入

最新のユーザー提案は「0.2.0までのマイナーアップデートでRustで関数を書き、Electronから呼べばよい」というもの。一括置換より、Electron版を維持しつつ同じRust coreを育て、後でnative frontendへ接続する進め方を採る。0.1.8にはRustコードをまだ追加しない。

移行順の候補（将来版の番号・時期は未確定）：

1. **小さな純粋関数**：version比較、更新アセット選択、プリセット生成・窓選択を候補とし、JSON入力／出力とエラー仕様を固定する。regex方言差は先に検証する。
2. **共通coreの増強**：configの読込・検証、layoutの状態遷移、内部コマンドの判定。既存JSのfixtureを共通化し、両実装の差分を検出する。
3. **ネイティブな配布補助**：独立更新worker、install-record、CLI登録をRust化し、Electron依存の更新protocolを橋渡しする。これにより5節の移行障害を先に解く。
4. **PTY／プロセスcore**：ConPTY／Unix PTY、流量制御・CWD・pane generationを移す。プロセスと端末状態を二重所有せず、セッション単位で移行を切る。
5. **native frontend**：同じcoreを使う別フロントエンドを試作し、IME・メディア・性能と全互換項目が合格してから切り替える。

### 7.2 Electronからの呼び出し方式の比較

| 方式 | 長所 | 先に検証すること |
| --- | --- | --- |
| Rust sidecar＋JSON lines等のIPC | Node ABI非依存、独立プロセスの障害分離、将来のnative CLIと共通化しやすい | 起動／IPCコスト、request ID、並行要求、最大サイズ、キャンセル、EOF／異常終了、配布・署名・ASAR外配置 |
| Node-API addon（例：napi-rs） | 細かい関数呼び出しの低いオーバーヘッド、JSとの型変換 | 各OS／archのprebuild、Electronでのロード、非同期化、panic／メモリ安全性、アンロード・shutdown、配布サイズ |
| C ABI／FFI | Rust coreをNode以外からも利用できる | 所有権・寿命・文字列／buffer規約、エラー境界、対応するFFI依存、クラッシュ時の影響 |

最初の小さな試作で呼び出し方式を決める。Rust crate自体はNode型やDOMに依存させず、薄いadapterだけを交換できる構造にする。別プロセスIPCへ全PTY出力を1byteずつ渡すような設計は避け、必要な粒度とコストを測定する。

段階移行の合格条件：

- JSとRustで同じ正常／異常fixture、Unicode・空白・Windows path、境界値を検証する。
- Rustの失敗で稼働中PTYを落とさない。採用方式に応じ、JS fallback／feature gate／sidecar再起動のどれを使うかをADRへ記録する。
- renderer／WebViewから任意のnativeコマンド・ファイル操作を呼ばせず、Main側でrequestと権限を検証する。
- Windows x64、Linux x64、Mac x64／ARM64のCIで、Rust成果物を配布物へ含めて呼び出す。開発マシンだけの成功で既定切替しない。
- Rust化した関数と残っているJS関数を一覧化し、二重実装が永久に別仕様へ分岐しないようにする。
- 導入ごとに機能互換・性能・配布サイズを記録する。Rust化そのものを性能改善の証拠にはしない。

## 8. 実装開始後の段階と受け入れ

1. **基準採取・試作**：性能測定、ConPTY／Unix PTY、IME、ターミナルmodel・描画、配布物最小起動。ツールキットADRを作成。
2. **端末core**：単一PTY→複数PTY、通常／代替バッファ、CWD／再起動、マウス／スクロール、データ互換。
3. **配置・操作**：original／modern、全プリセット、窓削減選択、F4、ヘルプ、TTY、複数アプリ窓。
4. **メディア**：画像→PDF→動画→Web、相対CWD、入力・focus・最大化、原作sceneの既存操作。
5. **移行・配布**：旧版更新、installer method維持、ネイティブ記録CLI、署名、GitHub更新、障害復旧。
6. **0.2.0候補**：全必須項目と性能比較を提示し、実機評価後に公開する。未対応を隠して互換版と呼ばない。

最低受け入れ試験：

| 領域 | 必須ケース |
| --- | --- |
| OS | Windows x64、Ubuntu対応版＋24.04、Mac Intel／ARM64 |
| 端末 | PowerShell／CMD／Unix shell、SSH、vim等の代替画面TUI、日本語IME・CJK、コピー貼り付け、大量出力 |
| 入力 | 通常画面idle SGR35抑止、Alt／TUI保持、hover後の履歴維持、小delta、手動reset、PTY切断復旧 |
| 配置 | 減窓／増窓でPIDとCWD保持、F2/F3/F4復元、窓選択の範囲／regex、独立窓 |
| メディア | 各端末で異なるCWDから相対source、手動retry基準、画像／PDF／動画／Webとfocus復帰 |
| TTY | 自動fallback、Ctrl+B、paged help、restart、update確認／エラー時の同一PID維持、終了時TTY復元 |
| 更新 | 0.1.6／0.1.7／0.1.8と最新橋渡し版からの各installer経路、同版／旧版拒否、digest不一致、通信断、ロック／権限不足 |
| Mac | app／ZIP／DMG／更新後codesign、ダウンロード後Gatekeeper、bundle外記録、実機スクロール |
| 性能 | baseline比較、GPU無効、6ペイン・負荷出力・動画時のCPU／メモリ／GPUと操作応答 |

## 9. 現時点の未決事項

GUI toolkit、VT model crate、フォント／IME方式、PDF／動画ライブラリ、OS WebViewの範囲、最小対応OS、性能の数値目標、0.1.xからの橋渡し方式、Developer ID／公証資格情報、外部窓ドッキングの優先順位。これらは準備済みの要件と、これから決める技術判断を区別して扱う。
