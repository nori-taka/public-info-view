// 空のままなら「試運転版」（?demo=1 のとき demo-data.json を読む。ログインなし）。
// 本番は Supabase の Project URL と anon public key（公開前提のキー）。ニュース/メモアプリと同じプロジェクト・同じログイン。
// service_role key は絶対に入れない。
window.PI_CONFIG = {
  supabaseUrl: "https://vslpbqmpvuiuqwdilkyj.supabase.co",
  supabaseAnonKey: "sb_publishable_slVgQR5BUXSAI9E03_IteQ_9BIk8Ps7",
};
