# 群馬 公共情報ビューア（個人用）

`projects/public-info/`（巡回ツール）が集めた新着・入札・議会資料を、**一覧で見て、資料の中身を検索する**ためのサイト。PC・スマホ共通。
ロビーAIをモチーフにしているが、機能を揃えるのが目的ではなく、**見やすく、情報収集を効率化する**ことが目的。

- 一覧: 新着情報／入札（新規案件）／議会資料。新しい順。団体・期間・「注目のみ」で絞り込み
- 検索: 資料の本文まで全文検索（部分一致。一致した前後を表示して強調）
- 詳細: 本文・原文へのリンク・注目キーワード。入札は電子入札システムを開くリンク
- 要約は、このサイトではやらない。ゾフィーに頼む（`public-summary` スキル）

## 仕組み
```
巡回（GitHub Actions, 毎日3回） → publish_view.py → Supabase（pi_items 表）← このサイト（ログインして読む）
```
- 公開リポジトリ（このリポジトリ）には**コードだけ**。データは Supabase にあり、**ログインした本人だけ**が読める（RLS）
- ニュースアプリ・メモアプリと同じ Supabase プロジェクト・同じログイン（メールのリンク方式）
- 公開URL: https://nori-taka.github.io/public-info-view/ （`main` への push で自動公開）

## 最初の設定（ノリさんが1回だけ）
1. **表を作る**: Supabase の SQL Editor に `supabase/schema.sql` を貼って Run
2. **ログイン後の戻り先を登録**: Supabase → Authentication → URL Configuration → Redirect URLs に
   `https://nori-taka.github.io/public-info-view/**` を追加
3. **巡回側の Secrets を3つ登録**（https://github.com/nori-taka/public-info/settings/secrets/actions。値はチャットに貼らない）
   | Name | 値 |
   |---|---|
   | `SUPABASE_URL` | Supabase の Project URL（`config.js` の supabaseUrl と同じ） |
   | `SUPABASE_SERVICE_KEY` | Supabase の書き込み用の鍵（Project Settings → API Keys の **Secret key**。旧画面では service_role）。**サイト側・チャット・ファイルには入れない** |
   | `OWNER_USER_ID` | 本人の User UID（Authentication → Users の自分の行） |
4. 巡回を1回実行（Actions → patrol → Run workflow）→ 数分後にサイトにデータが入る

## 「今すぐ巡回」ボタン（2026-10-24 追加）
ボタン → Supabase の Edge Function `run-patrol`（`supabase/functions/run-patrol/index.ts`）→ GitHub Actions の patrol を起動。約4〜5分で終わり、画面が自動で読み直される。
- 本人（`OWNER_USER_ID`）以外は断る。すでに巡回中なら二重に起動しない
- GitHub の鍵は Supabase の Secrets（`PATROL_GH_TOKEN`、`public-info` の Actions だけ操作できる権限）にだけ置く。サイトとこのリポジトリには入れない
- Secrets は `PATROL_GH_TOKEN` と `OWNER_USER_ID`（`SUPABASE_URL` などは Supabase が自動で渡す）
- 「更新」ボタンは従来どおり、読み直すだけ

## 試運転版（ログインなし）
`web/demo-data.json`（巡回データから書き出す。リポジトリには入れない）を置き、`web/` を静的サーバーで開いて `?demo=1` を付ける。
- 書き出し: `projects/public-info` で `python publish_view.py --demo-out ../public-info-view/web/demo-data.json`
- 起動: `python -m http.server 8780 --directory web` → http://127.0.0.1:8780/index.html?demo=1

## 秘密情報
- `web/config.js` に入れてよいのは anon key（公開前提のキー）だけ。**service_role key は入れない**
- 巡回データそのものはリポジトリに置かない（`demo-data.json` は .gitignore）
