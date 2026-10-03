/*
 * 網站設定。
 *
 * endpoint：中轉 Worker 的網址（部署 worker/ 之後取得），例如
 *   'https://ai-counselor.你的帳號.workers.dev'
 * 留空（''）就不使用 AI，網站會用 scripts.js 裡的腳本式引導對話。
 *
 * 這裡不要放任何 API Key，這個檔案會被公開。
 */
window.AI_CONFIG = {
  endpoint: 'https://ai-counselor.sibyl0628.workers.dev'
};
