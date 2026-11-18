/* ============================================================
   在这里填写你的 Supabase 项目信息
   ------------------------------------------------------------
   获取路径（2026 年的控制台版本）：
     项目 → 左下角齿轮 Settings → API Keys

   url   ：Project URL，形如 https://abcdefghijklm.supabase.co
           取法一：项目首页 Project Overview 顶部，项目名下方的链接
           取法二：右上角绿色「Connect」按钮，弹窗里的 Project URL

   anonKey：客户端密钥，二选一，填哪个都能跑
           ① 新式（推荐）：API Keys 页 → Publishable and secret API keys 标签
                            → 复制 Publishable key，形如 sb_publishable_xxx
           ② 旧式：API Keys 页 → Legacy API Keys 标签
                  → 复制 anon / public 那一串 JWT

           ⚠ 绝对不要用 secret key 或 service_role —— 那是服务端密钥，
             会绕过 RLS，放进前端等于把数据库敞开。
   ------------------------------------------------------------
   注意：这个 key 本来就是公开的（会被打包进前端代码），
        安全边界靠的是 sql/rooms.sql 里的 RLS 策略。
   ============================================================ */

window.SUPABASE_CONFIG = {
  url: 'https://wvgxzuecgpaathnpybfi.supabase.co',
  anonKey: 'sb_publishable_tyjmG-Y3KsaLuhyIOLS-cQ_tUFzz3y2',
  // 已执行 sql/rooms-private.sql；关闭它会退回旧的整包 rooms.state 读写
  privateMode: true
};
