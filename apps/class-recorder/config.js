// 雲端設定：和美食收藏共用同一個 Supabase 專案（資料放在 recorder schema）。
// publishable key 本來就是公開用的，可以放在這裡；不要放 secret key。
// 留空的話 app 就只用「自己的 API key」模式，資料只存在這台裝置。
window.RECORDER_CONFIG = {
  supabaseUrl: 'https://ptocokzxpwwautnbbuup.supabase.co',
  supabaseKey: 'sb_publishable_p_eT8zA9iEEITNyUFslSpQ_BU62SO9n',
};
