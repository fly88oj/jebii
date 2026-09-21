# Jebii

**Live2D キャラクターチャット —— Jev が感情を決め、SoulLink が演じます。**

Jebii はブラウザで動く Live2D キャラクターチャットアプリです。
**Jev**（TypeSafe AI の System One 意思決定モデル）が感情の判断を行い、
**SoulLink** パフォーマンスエンジンが各感情をフレームごとの Live2D
表情・モーションパラメータへ変換し、通常の OpenAI 互換 LLM が会話テキストを
生成します。UI は簡体字中国語・英語・日本語の三言語に対応しています。
デフォルトのキャラクターは**月見天音（Tsukimi Amane）**です。

## 特徴

- **プロンプトエンジニアリング不要の感情判断** —— 各やり取りの後、Jev が
  型付きの `Choice` 質問に回答し、較正済み確率と信頼度つきの感情を返します。
  チャットプロンプトは感情タグで汚れません。
- **フレームごとの Live2D パフォーマンス** —— SoulLink エンジン
  （`@soullink-emotion/*`）が VAD/FACS 感情合成・アイドルモーション・
  パラメータミキシングを毎フレームの Live2D パラメータ値へ調和させます。
- **任意の OpenAI 互換チャット API** —— `/v1` を含むベース URL・モデル名・
  API キーを指定するだけで、返信は SSE でストリーミングされます。
- **多言語 UI** —— 簡体字中国語・英語・日本語。初回訪問時にブラウザ言語を
  自動検出し、実行中にいつでも切り替えられます。
- **マルチプロバイダー音声（キャラ音色はリポジトリ内蔵）** —— 音色プリセット
  は `src/voices.js` に保存され、どのプロバイダーでも同じキャストを演じます。
  TTS と ASR のプロバイダーは設定で個別に選択可能（MiMo と MiniMax アダプター
  内蔵、ブラウザネイティブにフォールバック）。読み上げ中の口の動きは実際の
  再生音声レベルで駆動。マイクボタンは録音してクラウド ASR で文字起こしします。
- **アプリ内設定** —— チャンネル上書き（LLM/Jev のベース URL・トークン・
  モデル名）、自動読み上げとモデル思考の切り替え、チャットの書き出し/
  読み込み、通信ログの書き出し。最新の返信はワンクリックでやり直せます。
- **PWA** —— ホーム画面にインストール可能、オフラインアプリシェル付き。
  API 通信は決してキャッシュしません。
- **モバイル対応** —— 専用の狭画面モバイルレイアウト。
- **キーをアプリに入れない** —— 内蔵チャネル経由なら LLM/Jev 通信は
  リバースプロキシへ転送され、本物の API キーはプロキシ側にしか存在しません。
- **完全なオブザーバビリティ** —— 通信ログが LLM と Jev の全呼び出しの
  完全なリクエスト・レスポンス本文（認証ヘッダーを除く）を記録。チャンネル
  絞り込みと JSON ワンクリックコピーに対応。感情パネルには全感情の確率バー・
  現在の選択・その信頼度に加え、直近 20 回の判定を可視化する感情タイムライン
  を表示します。

### プレビュー

| 起動 | 会話 + Jev パネル |
|:---:|:---:|
| ![起動画面](screenshots/en-1-boot.png) | ![Jev パネル展開付きの会話](screenshots/en-4-panel.png) |

どちらも実際のチャネル経由でオンライン取得したものです。他のスクリーン
ショット（他の UI 言語、追加の会話ラウンド、展開した各パネル）は
[`docs/screenshots/`](screenshots/) にあります。

## アーキテクチャ

```
ユーザーメッセージ
   |
   |---> チャット LLM（任意の OpenAI 互換 API）---> ストリーミングテキスト（SSE）
   |
   |---> Jev（TypeSafe System One モデル）
   |       Choice：どの感情を、どの強度で？
   |       （較正確率 + 信頼度）
   |
   +---> SoulLink パフォーマンスエンジン
           VAD/FACS + アイドルモーション + パラメータミキシング
           ---> フレームごとの Live2D パラメータ
                    |
                    v
           Live2D レンダリング（PixiJS + Cubism Core）
```

| 関心事 | 担当 | 場所 |
|---|---|---|
| チャットテキスト | 任意の OpenAI 互換 LLM、SSE ストリーミング | `src/main.js` |
| 感情判断 | Jev —— `POST /v1/systemone`（`jev-latest`）、感情と強度に対する型付き `Choice` 質問 | `src/main.js` |
| パフォーマンス | `@soullink-emotion/*` エンジン（VAD/FACS、アイドル、パラメータミキシング）による毎フレームのパラメータループ | `src/live2d.ts` |
| UI 文言 | zh/en/ja 辞書による `t()`、自動検出 + 実行時切替 | `src/i18n.js` |
| ペルソナ | デフォルトキャラクター**月見天音（Tsukimi Amane）** | `src/main.js` のシステムプロンプト |

### 用語

- **Jev** —— TypeSafe AI の System One 意思決定モデル。テキストは生成せず、
  型付き質問（`Noul` / `Choice` / `Score`）に構造化され確率較正された結果を
  返します。コードはそのまま分岐に使えます。
- **SoulLink** —— `@soullink-emotion/*` パッケージ群。フレームワーク非依存
  の Live2D 表情・モーションエンジンで、連続 VAD 感情、FACS/AU 合成、
  レイヤードアニメーション、自動モデル適応を備えます。

## インストール

前提：npm 付きの Node.js と本リポジトリのコピー。

```bash
npm install
```

> **npm ≥ 12 の注意：** `esbuild` のインストールスクリプトは明示的な承認が
> 必要です：`npm install-scripts approve esbuild`。

次に、同梱モデルの SoulLink パフォーマンスプロファイルを生成します。これは
モデルの `cdi3` パラメータメタデータから導かれるオフライン決定論的
ヒューリスティクスで、LLM は関与しません：

```bash
npm run gen:profile   # soullink.profile.json を生成（デフォルトモデル：hiyori）
```

## 使い方

1. ブラウザでアプリを開きます。ローディングゲートが接続チェックを自動で
   行います —— 内蔵チャネルが設定されていればそのまま使えます。未設定の
   場合は `src/config.example.js` を `src/config.local.js` にコピーして
   記入してください：
   - **チャット LLM**（必須）：任意の OpenAI 互換 API のベース URL
     （`/v1` を含む）、モデル名、API キー。
   - **Jev 感情判断**（任意）：公式 `https://api.typesafe.ai` または中継
     `https://jev-ai.pro/api` —— キーはエンドポイントと一致させてください。
     空欄の場合は SoulLink のルールベース感情へフォールバックします。
2. チャットを始めます。返信の横の感情バッジは Jev の確率詳細の最上位項目
   （最も確率の高い感情）です。
3. トップバーの言語スイッチャーでいつでも UI 言語を切り替えられます
   （初回訪問時はブラウザ言語から自動検出）。

### Jev はいつ動く？ —— プロンプト不要

Jev の判断は各メッセージにつき返信完了後ちょうど 1 回だけ自動発火します。
送信直後の反応は SoulLink のルールベース分類器が即座に担当し、Jev は呼ばれ
ません。Jev へ送る状態は、最新のメッセージを強調した最近の会話です。典型的
な反応：褒め言葉 → happy/shy、愚痴や悩み → sad/concerned、挑発 → anger、
良い知らせ → excited。

### 内部の様子を見る

- **通信ログ**（ワイド画面では左パネル、モバイルでは「ログ」タブ）：
  LLM と Jev の全呼び出しの完全なリクエスト・レスポンス本文（認証
  ヘッダーを除く）。
- **Jev 感情パネル**：全感情の確率バー、現在選択されている感情、その信頼度。

## 設定

`src/config.example.js` を `src/config.local.js`（gitignore 済み）にコピー
し、エンドポイントを指定します。内蔵チャネル方式では LLM/Jev 通信を低価値
アクセストークンとともにリバースプロキシへ転送します —— 本物の API キーは
プロキシ側にしか存在せず、アプリには決して入りません。直接エンドポイント
（ベース URL + キー）も利用できます。

アプリ内設定ダイアログ（トップバーの歯車）は同じチャンネル上書きを
ブラウザの localStorage に保存します —— ビルド済みの成果物をセルフホストする
際に再ビルドは不要です。音声と動作の切り替え、チャット履歴の書き出し/
読み込みもここにあります。

## ビルド

| コマンド | 用途 |
|---|---|
| `npm run dev` | vite 開発サーバーを起動 |
| `npm run typecheck` | TypeScript ソースの型チェックと `src/main.js` の構文チェック |
| `npm run gen:profile` | モデルの `cdi3` から `soullink.profile.json` を再生成 |
| `npm run build` | Web アプリをビルド（vite + アセット同梱 + 事前圧縮） |
| `node scripts/web-smoke.mjs [url]` | ヘッドレススモークテスト（既定は `npx vite preview --port 4173`） |

`dist-web/` のビルド出力は自己完結した静的サイトです。`/app/` ベースパス
での配信を想定しています（`vite.config.mts` 参照）。他の場所へデプロイする
場合は `base` オプションを調整してください。

## プロジェクト構成

```
src/            Web アプリ：index.html、main.js（チャット + Jev + UI ロジック）、
                i18n.js（zh/en/ja 文言）、live2d.ts（Live2D ドライバー）、
                emotions.ts（三言語感情タクソノミ、エンジン語彙とコンパイル
                時に整合）、types.ts、model-performance.ts（Hiyori モーション/
                FACS プリセット）、スタイルシート、config.example.js テンプレート
resources/      Cubism Core、Hiyori モデル、soullink.profile.json
scripts/        プロファイル生成、Web アセット同梱、ビルド時圧縮
docs/           調査ノート、スクリーンショット、翻訳版 README
```

## モデルと Live2D ライセンス

- **コード** —— MIT（[LICENSE](../LICENSE) 参照）。
- `resources/core/live2dcubismcore.min.js` —— **Cubism Core**。Live2D Inc.
  の独自ライセンス。個人および年間売上 1000 万円以下の小規模事業者は公開が
  無料です（Expandable Applications を除く）。
  [Live2D SDK ライセンスページ](https://www.live2d.com/en/sdk/license/)参照。
- `resources/models/hiyori/` —— Live2D 公式サンプルモデル **Hiyori**。無料
  素材ライセンスに従います：そのまま配布し、キャラクターデザインを変更せず、
  公式音声を同梱しないこと。
  [resources/MODEL_LICENSE.md](../resources/MODEL_LICENSE.md) 参照。
- **任意のモデル読み込みには対応しない設計。** ユーザーが独自の Live2D
  モデルを読み込めるアプリは
  [Expandable Applications](https://www.live2d.com/en/sdk/license/expandable/)
  に該当し、公開者規模に関係なく Live2D の審査と特別な公開ライセンスが
  必要です。Jebii は意図的に単一の同梱モデルのみを配布します。

## 既知の制限

- クラウド音声は内蔵リレーチャンネル経由（キーはプロキシ側にのみ存在）。
  未設定時はブラウザネイティブの音声 API にフォールバックし、声質と言語
  カバー範囲はプラットフォーム次第です。
- 同梱モデルは Hiyori のみ（[モデルと Live2D ライセンス](#モデルと-live2d-ライセンス)参照）。

## 謝辞

- [TypeSafe AI](https://typesafe.ai/) —— Jev System One 意思決定モデル。
- [SoulLink_Live2D](https://github.com/nanlingyin/SoulLink_Live2D) と
  [soullink-emotion-sdk](https://github.com/nanlingyin/soullink-emotion-sdk)
  —— SoulLink パフォーマンスエンジンとその npm パッケージ。
- [Live2D Inc.](https://www.live2d.com/) —— Cubism Core と Hiyori サンプル
  モデル。
- [PixiJS](https://pixijs.com/)、pixi-live2d-display、Vite。
- 本プロジェクトの歴史的な技術調査は [docs/research.md](research.md) に
  保存しています。

## ライセンス

- コード：MIT —— [LICENSE](../LICENSE) 参照。
- `resources/core/live2dcubismcore.min.js`：Live2D Inc. の独自ライセンス
  （個人および年間売上 1000 万円以下の小規模事業者は公開無料）。
- `resources/models/hiyori/`：Live2D 公式サンプルデータ、無料素材ライセンス
  （そのまま配布、デザイン変更不可、公式音声なし）。
- 詳細：[resources/MODEL_LICENSE.md](../resources/MODEL_LICENSE.md) と
  [docs/research.md](research.md)。

---

[English](../README.md) | [简体中文](README.zh-CN.md) | **日本語**
