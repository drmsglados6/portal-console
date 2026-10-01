# Portal Console

窓別設定・表示メディア・ブラウザ・閉じる窓の指定記法についての将来設計は `WINDOW_MANAGER_PLAN.md` を参照してください。

初代 Portal のエンディング端末をオマージュした、クロスプラットフォーム対応のマルチスクリーンターミナルです。Debian/Ubuntu、macOS、Windows で動作し、GUI を利用できない Linux/SSH 環境では自動的に ANSI 版へフォールバックします。

`original` の画面表現は、初代Portalのエンディングで歌詞、スタッフロール、右側AAが表示されるコンソール部分を視覚的な基準にしています。著作権のある歌詞やスタッフロール本文は同梱していませんが、通常のシェル出力やユーザー自身のスクリプトを同じ画面構成で表示できます。

## Modes

### original

フルスクリーン中央に 4:3 の表示領域を取り、ワイド画面では左右を黒いブランクにします。

- 左半分: プライマリターミナル
- 右上: 補助ターミナル
- 右下: 指定画像から自動生成したAA（既定はAperture Scienceロゴ）
- Consolas 優先のオレンジ文字、CRT グロー、走査線を表示

### modern

画面全体を使い、JSON の CSS Grid 風設定で列、行、ペイン配置、比率を自由に指定できます。既定では3つのターミナルを表示し、端末ペインは自由に追加できます。`kind: "logo"` を指定すればmodern側にも画像AAを配置できます。例は `portal-console.example.json` にあります。

3列×2行に均等分割して6つのターミナルを表示する組み込みプリセットは `--preset 3x2` で選べます（設定ファイルのmodernレイアウトより優先されます）。

```sh
npm start -- --preset 3x2
```

配布版でも `portal-console.exe --preset 3x2` で起動できます。`F2` でoriginalに切り替えた後、`F3` でこのレイアウトに戻れます。旧名 `modern-3x2` も引き続き使用できます。

`--preset-list` で組み込み・保存済みプリセットの一覧を表示します。未登録の `n×m`（n列・m行）は `--preset 3x3` のように指定するとその場で生成され、設定ディレクトリの `presets/3x3.json` に保存されます。窓数と最大行数を指定する場合は `--preset 5-2`（5窓、最大2行）を使います。次回以降も同じ名前で使えます。最大36窓・12行です。

```sh
npm start -- --preset-list
npm start -- --preset 3x3
npm start -- --preset 5-2
```

`n×m` 形式は奇数・偶数とも全マスに1窓ずつ表示します。`窓数-最大行数` 形式では右側の列から行数を満たし、左端を最も少なくします（`5-2` は左1窓・右2窓ずつ、`7-3` は左1窓・右3窓ずつ）。保存済みファイルを編集すれば、同じ名前で独自の配置も利用できます。

同じ規則を縦方向に適用する `窓数+最大列数`（例: `5+2`）は上段が最少です。名前の先頭に `-` を付けると配置が反転し、`-5-2` は右端列、`-5+2` は下段が最少になります。これらも生成・保存され、`portal-preset` と `--preset` の両方で使えます。

列・行ごとの窓数を直接指定するには `c1-2-1`（左から各列に1・2・1窓）または `r1-2-1`（上から各行に1・2・1窓）を使います。それぞれ4窓となり、1窓しかない列や行は領域を縦または横いっぱいに使います。`--preset c1-2-1` でも `portal-preset r1-2-1` でも初回に生成・保存されます。列・行は最大12本、各列・行は最大12窓、全体は最大36窓、内部グリッドは最大60分割です。

起動中のGUI版ではターミナル内で `portal-preset 3x2` や `portal-preset 5-2` と入力すると、再起動せずにmodernレイアウトを切り替えられます。既存の窓は番号順にセッションと内容を引き継ぎ、窓が減るときは表示されたダイアログで閉じる窓の番号を指定します（例: `2,5`）。追加の窓だけ新しいシェルを起動します。

閉じる窓の選択欄は既定で `2-4`（範囲）、`!3`（3以外）、`!(2-4)`（範囲以外）も受け付けます。`"controls": { "closeSelectionSyntax": "regex" }` を設定すると、窓番号の10進表記に完全一致する正規表現で指定できます（例: `1|3|5`）。選択した窓数が必要数と異なる場合は確定されません。`portal-help` でアプリ内の操作一覧を表示できます。

保存したプリセットJSONの `panes` には、ターミナルごとの外観と初回コマンドも指定できます。引き継ぐPTYにはコマンドを再送しません。

```json
{ "id": "main", "title": "WORK", "kind": "terminal", "console": "system",
  "startupCommand": "echo ready", "appearance": { "fontSize": 18, "foreground": "#00ff00", "background": "#101010" } }
```

同じ `panes` 配列で `kind` を `image`、`pdf`、`web` にすると、窓の中にそれぞれ画像、PDF、Webページを表示できます。`source` は画像/PDFならファイルパス、Webなら `http(s)` URLです。例: `{ "id": "reference", "title": "REFERENCE", "kind": "pdf", "source": "C:\\docs\\manual.pdf" }`。`web` はElectron内の独立したビューで、戻る・進む・再読込・URL入力を利用できます。種類を切り替えて端末を閉じる場合は確認ダイアログが出ます。ヘッドレス版は画像/PDF/Webの内容を表示せず、種類と参照元を文字で表示します。

## Setup

Node.js 22 以降と npm が必要です。`node-pty` 1.1.0 の対象 OS/CPU 向け N-API プリビルドを利用します。プリビルドのない環境でソースビルドする場合は C/C++ ビルドツールが必要で、Windows では Visual Studio の Spectre 対応 MSVC ライブラリも必要です。

```sh
npm ci
npm start
```

モードと表示方法はコマンドラインでも指定できます。

```sh
npm start -- --mode original
npm start -- --mode modern --windowed
npm start -- --config ./portal-console.example.json
npm run headless
```

GUI 版の配布物は各対象 OS 上で作成します。

```sh
npm run dist
```

Mac版はMac本体にソースを転送し、Mac上で `npm ci` の後に `npm run dist -- --mac --x64 --config.directories.output=release-0929`（Apple Siliconは `--arm64`）を実行します。生成したアプリ本体は `release-0929/mac/portal-console.app` です（表示名の `Portal Console.app` ではありません）。Mac用 `node-pty` のネイティブモジュールと `spawn-helper` は `portal-console.app/Contents/Resources/app.asar.unpacked/node_modules/node-pty/prebuilds/` に明示的に同梱し、補助実行ファイルへ実行権限を付けます。Mac側のアプリ起動前に、対象アーキテクチャの `spawn-helper` が存在することを確認してください。

### Libraries and OS Dependencies

`npm ci` は `package-lock.json` に固定したライブラリをインストールします。

| ライブラリ | 用途 |
| --- | --- |
| Electron 43 | GUIとアプリ実行環境 |
| xterm.js 6 / addon-fit / headless | ターミナル表示・サイズ調整・ANSI版 |
| node-pty 1.1 | ネイティブPTYとシェル起動 |
| sharp 0.35 | 画像のAA変換（libvipsは対応環境のnpmパッケージに同梱） |
| vpk-tools | ローカルSteam Portalデータの読込 |
| esbuild / electron-builder | フロントエンドと各OSの配布物生成 |

- **Windows:** Windows 10/11とPowerShell。x64向けプリビルドを利用できます。ソースからネイティブモジュールをビルドする場合はPython 3、Visual Studio Build Toolsの「C++によるデスクトップ開発」、Windows SDK、Spectre対応MSVCライブラリが必要です。
- **macOS:** Electron 43が対応するmacOS 12以降。Intel Macはx64、Apple Siliconはarm64でビルドします。開発用には `xcode-select --install` でCommand Line Toolsを導入してください。
- **Debian/Ubuntu:** Linux版node-ptyはソースビルドが必要なためPython 3、make、GCC/G++が必要です。Ubuntu 22.04では次を導入します。

```sh
sudo apt update
sudo apt install -y build-essential python3 pkg-config dpkg fakeroot \
  libgtk-3-0 libnss3 libasound2 libgbm1 libxss1 libatk-bridge2.0-0 \
  libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 \
  libpangocairo-1.0-0 libcups2
```

Ubuntu 24.04以降では `libasound2` の代わりに `libasound2t64` を指定します。AppImageを直接起動する環境ではFUSE 2（22.04: `libfuse2`、24.04: `libfuse2t64`）も必要です。GUIはX11/Waylandのディスプレイ、ヘッドレス版は対話TTYを必要とします。OSを移すときは `node_modules` を共有せず、そのOS上で `npm ci` を実行してください。配布済みGUIアプリにはNode.jsを別途インストールする必要はありません。

### CI/CD

GitHub Actionsの **Build and release** はmainへのpush、pull request、手動実行、`v*`タグのpushで動作します。

| 対象 | ランナー | 成果物 |
| --- | --- | --- |
| Windows x64 | windows-2022 | NSISインストーラ、portable EXE、簡易インストーラZIP |
| Ubuntu x64 | ubuntu-22.04 | AppImage、deb |
| macOS Intel | macos-15-intel | dmg、zip |
| macOS Apple Silicon | macos-15 | dmg、zip |

各ジョブは `npm ci` →テスト→パッケージ生成→同梱Electronでnode-ptyとsharpの動作確認を行います。Actionsの実行詳細から成果物を14日間取得できます。CI成果物は開発用の未署名ビルドです。正式な署名・macOS公証は別途設定が必要です。

リリース時は `package.json` のバージョンに合わせた `v0.1.0` のようなタグをpushします。全OSのビルド成功後、そのタグのGitHub Releaseへ成果物を自動添付します。通常のpushや手動実行ではReleaseは作成しません。

### Simple Windows Installer

簡易インストーラ一式を生成します。

```sh
npm run installer:win
```

生成先は `release-current/installer/` です。`install.cmd` を実行すると、同梱ZIPを次の場所へ展開します。

- 本体: `%LOCALAPPDATA%\Programs\Portal Console`
- ログ: `%APPDATA%\portal-console\logs`
- ユーザーPATH: インストール先を追加
- `PORTAL_CONSOLE_HOME`: インストール先
- `PORTAL_CONSOLE_LOG_DIR`: ログディレクトリ

管理者権限は不要です。更新時はインストール済みPortal Consoleを先に終了してください。アンインストールはインストール先の `uninstall.ps1` を実行します。ログも削除する場合は `-RemoveLogs` を指定してください。

Linux では AppImage/deb、macOS では dmg/zip、Windows では NSIS/portable が対象です。macOS と Windows の署名設定は配布者側で別途必要です。

## Key Bindings

### Commands inside terminals

GUI版では、各ターミナル内で次のコマンドを入力してEnterを押すとアプリを操作できます。外部実行ファイルのインストールやシェル側のエイリアス設定は不要です。

| コマンド | 操作 |
| --- | --- |
| `portal-help` | 操作ヘルプを表示 |
| `portal-preset <name>` | 起動中にレイアウトを変更（例: `portal-preset 3x2`、`portal-preset c1-2-1`） |
| `portal-exit` | アプリ全体を終了 |

シェルのプロンプトで入力してください。ヘッドレス版でも `portal-exit` を利用できます。`portal-help` はコマンドモードに案内を表示し、ライブプリセット変更はGUI版のみ対応します。

ターミナル内で `portal-exit` と入力して Enter を押すと、Portal Console を終了できます。GUI版・ヘッドレス版のどちらでも利用できます。

GUI:

| Key | Action |
| --- | --- |
| `Ctrl+1` | プライマリを選択 |
| `Ctrl+2` | 補助を選択 |
| `Ctrl+Tab` | 次の端末を選択 |
| `Ctrl+Shift+Tab` | 前の端末を選択 |
| `Ctrl++` | テキストを拡大 |
| `Ctrl+-` | テキストを縮小 |
| `Ctrl+0` | 設定ファイルのサイズへ戻す |
| `Ctrl+C` | 選択範囲があればコピー、なければシェルへ送信 |
| `Ctrl+V` | 貼り付け |
| `Ctrl+Shift+C` / `Ctrl+Insert` | 選択範囲をコピー |
| `Ctrl+Shift+V` / `Shift+Insert` | 貼り付け |
| 右クリック | 選択範囲をコピー、選択がなければ貼り付け |
| `F2` | original に切り替え |
| `F3` | modern に切り替え |
| `Ctrl+Shift+2` / `Ctrl+Shift+3` | original／modern に切り替え（Touch Bar対応） |
| `Ctrl+Shift+N` / Macの `⌘N` | 独立した新しいアプリ窓を開く |
| `F11` | フルスクリーン切り替え |
| `Ctrl+Alt+Shift+Q` | Mainプロセス側から緊急終了 |
| `Ctrl+Shift+P` | コマンドモードへ入る／戻る |

画面右下の `ORIGINAL` / `MODERN` ボタンからも切り替えられます。`+ WINDOW` ボタンで独立した新しい窓を開けます。各窓は別プロセスでPTYや再生状態を持ちます。Touch Bar機ではFn（地球儀）キーでFキーを表示する方法もあります。

macOSでDockやFinderから起動中のアプリをもう一度開くと、既存の窓が選択されることがあります。複数窓を開くには `+ WINDOW` / `⌘N` を使うか、ターミナルから `open -n "release-0929/mac/portal-console.app"` で新しいインスタンスを起動してください。

コマンドモード:

| Key | Action |
| --- | --- |
| `e` | originalモードのエンディング再生を開始 |
| `r` | 選択中のターミナルを再起動し、Windows環境変数を再読込 |
| `h` / `k` | 前のターミナルを選択 |
| `j` / `l` | 次のターミナルを選択 |
| `1` / `2` | プライマリ／補助ターミナルを選択 |
| `Esc` / `i` | 通常のターミナル入力へ戻る |

エンディング再生中:

| Key | Action |
| --- | --- |
| `Space` | 一時停止／再開 |
| `Up` / `Down` | 音量を0.10単位で増減 |
| `Ctrl+Up` / `Ctrl+Down` | 音量を0.05単位で増減 |
| `Shift+Up` / `Shift+Down` | 音量を0.01単位で増減 |
| `h` / `Left` | 5秒戻る |
| `l` / `Right` | 5秒進む |
| `0` | 先頭へ戻る |
| `q` / `Esc` | 再生を終了してコマンドモードへ戻る |

ヘッドレス版は `Ctrl+B` をプレフィックスとして使います。

| Key | Action |
| --- | --- |
| `Ctrl+B`, `1` | 1 番目の端末を選択 |
| `Ctrl+B`, `2` | 2 番目の端末を選択 |
| `Ctrl+B`, `n` | 次の端末を選択 |
| `Ctrl+B`, `c` | コマンドモードへ入る |
| `Ctrl+B`, `Ctrl+B` | `Ctrl+B` を端末へ送る |
| `Ctrl+B`, `q` | 終了 |

ヘッドレス版のコマンドモードでも `r`、`h`、`j`、`k`、`l`、`Esc`、`i` を使用できます。

### Ending Playback

`original` のエンディング再生は、左の文字単位タイプ表示、右上の独立したスタッフロール、右下のAA切替を絶対時刻のイベント列として再生します。ライブPTYは背後で動作を続け、終了時に元のターミナルへ戻ります。

既定の `ending.source: "auto"` はSteamライブラリからPortalを検出します。インストール済みゲームの `portal_pak_dir.vpk` から次の資産をメモリへ直接読み、配布物やプロジェクトにはコピーしません。

- `scripts/credits.txt`: 原作の歌詞タイミング、スタッフロール、AA
- `sound/music/portal_still_alive.mp3`: 原曲
- `resource/portal_english.txt`: ローカライズ文字列

```json
{
  "ending": {
    "source": "auto",
    "portalPath": null,
    "playAudio": true,
    "volume": 0.1,
    "volumeCurve": "quadratic",
    "bassGainDb": -8,
    "compressor": false,
    "seekStepMs": 5000
  }
}
```

`source` の値:

| Value | Behavior |
| --- | --- |
| `auto` | Portalを自動検出し、見つからなければ同梱デモへフォールバック |
| `portal` | Portalのローカル資産を必須とし、見つからなければエラー |
| `demo` | 著作物を含まない同梱オマージュscene |
| `scene` | `ending.scene` で指定したJSON |

追加Steamライブラリは `libraryfolders.vdf` から検出します。特殊な配置では `portalPath` にPortalのインストールルートを指定できます。ヘッドレス版は同じ原作sceneを再生しますが、音声再生はGUI版のみです。

`volume` は `0.0` から `1.0` です。原MP3または出力段の歪みを避けるため、既定値は切り分け用に低い `0.1` にしています。`volumeCurve: "quadratic"` では実ゲインを `volume²` とするため、`VOL 0.10` は `GAIN 0.01` です。波形自体を非線形変換しないので、新しい高調波歪みは加えません。`linear` へ変更すると表示値をそのままゲインに使います。

原作Source Engineの `Portal.song_credits` は音量`0.50000`で再生しています。本アプリでは切り分けのため、それより大幅に低い値を既定にしています。複数窓は独立したプロセスとして動き、それぞれのエンディング再生も独立しています。

コンプレッサーは音の質感を変えるため既定で無効です。必要な場合だけ `compressor: true` で有効化できます。

原曲のサビ付近は200 Hz以下のRMSが全帯域の約91〜95%を占めます。低音強調された出力機器での歪みを避けるため、既定では200 Hzローシェルフを`bassGainDb: -8`にしています。原作どおりの周波数バランスに戻す場合は`0`を指定します。

独自sceneの形式は `assets/ending-scene.json` を例として利用できます。各イベントはミリ秒の絶対時刻を持ち、`left`、`credits`、`art`、`frames` を定義します。外部sceneは2 MiB、30分、10,000イベントまでに制限されます。

調査・設計時の主な参考資料:

- [Portal credits video](https://www.youtube.com/watch?v=nfRlrV8awo0&t=82s)
- [Combine OverWiki: Still Alive](https://combineoverwiki.net/wiki/Still_Alive)
- [portal-credits-rs](https://github.com/Gaming32/portal-credits-rs): ローカルゲーム資産と絶対時刻イベント方式
- [Portal_StillAlive_Python](https://github.com/errorer/Portal_StillAlive_Python): 80x24画面構成の参考。無ライセンスのためコードは未使用
- [asciinema player](https://github.com/asciinema/asciinema-player): タイムライン再生設計の参考

## Configuration

既定の設定ファイル:

- Linux: `$XDG_CONFIG_HOME/portal-console/config.json` または `~/.config/portal-console/config.json`
- macOS: `~/.config/portal-console/config.json`
- Windows: `%APPDATA%\portal-console\config.json`

`--config PATH` で任意のファイルを指定できます。

```json
{
  "mode": "modern",
  "fullscreen": true,
  "consoles": {
    "default": "powershell",
    "profiles": {
      "my-cygwin": {
        "command": "C:\\cygwin64\\bin\\bash.exe",
        "args": ["--login", "-i"],
        "cwd": "~"
      }
    }
  },
  "original": {
    "consoles": { "main": "my-cygwin", "aux": "cmd" }
  },
  "logo": {
    "source": null,
    "characters": " .:-=+*#%@",
    "invert": false
  },
  "modern": {
    "columns": ["2fr", "1fr"],
    "rows": ["1fr", "1fr"],
    "areas": ["main aux", "main monitor"],
    "panes": [
      { "id": "main", "title": "PRIMARY", "kind": "terminal", "console": "my-cygwin" },
      { "id": "aux", "title": "AUX", "kind": "terminal", "console": "cmd" },
      { "id": "monitor", "title": "TERTIARY", "kind": "terminal", "console": "powershell" }
    ]
  }
}
```

`columns` と `rows` は `fr` または `%` を使用できます。`areas` の各行・列数をトラック数と合わせ、各 `pane.id` を矩形になるよう配置してください。

### Console Profiles

`consoles.default` で既定コンソールを選びます。`original.consoles.main` と `original.consoles.aux`、またはmodernの各端末ペインにある `console` で上書きできます。

組み込みプロファイル:

| Name | Platforms | Command |
| --- | --- | --- |
| `system` | All | WindowsはWindows PowerShell、Unixは`$SHELL` |
| `cmd` | Windows | `cmd.exe` |
| `powershell` | Windows | Windows PowerShell |
| `pwsh` | All | PowerShell 7 |
| `cygwin` | Windows | `C:\cygwin64\bin\bash.exe` |
| `bash` | All | Bash |
| `zsh` | Linux/macOS | Zsh |
| `fish` | Linux/macOS | Fish |

インストール先が異なる場合や他のコンソールを使う場合は、`consoles.profiles` に `command`、`args`、`cwd` を登録します。組み込み名と同じ名前を定義すると組み込み設定を上書きします。実行ファイルが見つからない場合は、起動画面にエラーを表示します。

### Image To ASCII Art

`logo.source` に PNG、JPEG、WebP、GIF、AVIF、TIFF、SVG のパスを指定すると、ロゴペインの大きさに合わせて自動的にAAへ変換します。`null` は同梱のAperture Scienceロゴです。相対パスは起動時のカレントディレクトリを基準にするため、通常は絶対パスを推奨します。

`logo.characters` は暗い色から明るい色の順です。黒いロゴを白背景画像から変換する場合は `invert` を `true` にできます。GUIとヘッドレス版で同じ変換設定を使用します。

AA変換では文字セルの縦横比を補正します。使用フォントによって画像がまだ縦長・横長に見える場合は、`logo.characterAspectRatio` を調整してください。Consolas向けの既定値は `0.6` です。値を小さくするとAAは文字数として横長になります。

### Text Size

GUI版では `Ctrl++`、`Ctrl+-`、`Ctrl+0` でターミナルと画像AAの文字サイズを調整できます。テンキーの `+`、`-`、`0` にも対応します。

```json
{
  "appearance": {
    "fontSize": 15,
    "minimumFontSize": 8,
    "maximumFontSize": 32,
    "fontSizeStep": 1,
    "hardwareAcceleration": false,
    "mouseWheelMode": "local"
  }
}
```

ヘッドレス版のフォントサイズはホスト側ターミナルの設定で変更してください。

GUI版のホイールは既定で `appearance.mouseWheelMode: "local"` とし、SSH先がマウス追跡を有効にしても、端末の履歴をローカルでスクロールします。代替画面のアプリではホイールを送信しません。リモートのTUIへホイールを渡したいときは `Alt` を押しながら回すか、`"application"` に変更してください。

安定性を優先し、GPUハードウェアアクセラレーションは既定で無効です。必要な場合だけ `appearance.hardwareAcceleration` を `true` にしてください。異常終了の情報とPTYの流量制御履歴は、設定ディレクトリの `diagnostics.log` に記録されます。

Rendererが無応答になった場合は自動的にフルスクリーンを解除します。`Ctrl+Alt+Shift+Q` はRendererを経由せずMainプロセスで受け取る緊急終了キーです。ただし、WindowsのUACセキュアデスクトップが表示されている間は通常デスクトップのアプリへキーが届かないため、先にUAC画面を許可またはキャンセルしてください。

## Headless Limitations

ヘッドレス版では CRT のぼかしや走査線は表示せず、すべてのペインをオレンジの ANSI True Color で描画します。マウス転送と高度な拡張キーボードプロトコルには未対応ですが、通常のシェル操作、カーソルキー、端末内 TUI は xterm の VT パーサーを通して表示されます。

## Attribution

Portal、Aperture Science および関連名称は Valve Corporation の商標です。このプロジェクトは非公式のファンメイド・オマージュであり、Valve Corporation とは関係ありません。
