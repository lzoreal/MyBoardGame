/* ============================================================
   房间网络层（Supabase）
   ---------------------------------------------------------
   一行 rooms = 一个房间，state 里放全部对局数据。
   写入用 version 做乐观锁：更新 0 行说明别人抢先写了，重读重算。
   ============================================================ */

window.Net = (function () {
  const CFG = window.SUPABASE_CONFIG || {};
  const URL = (CFG.url || '').trim();
  const KEY = (CFG.anonKey || '').trim();
  const CONFIG_OK = /^https:\/\/.+\.supabase\.co/.test(URL) && KEY.length > 20;

  let sb = null;
  let channel = null;
  let roomCode = null;
  let version = -1;
  let busy = false;
  let listener = null;
  let statusListener = null;
  let heartbeat = null;
  let identity = readIdentity();

  function readIdentity() {
    let id = localStorage.getItem('mbg:pid');
    if (!id) {
      id = 'p' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);
      localStorage.setItem('mbg:pid', id);
    }
    return { id: id, name: localStorage.getItem('mbg:nick') || '' };
  }

  if (CONFIG_OK && window.supabase && typeof window.supabase.createClient === 'function') {
    sb = window.supabase.createClient(URL, KEY, { auth: { persistSession: false } });
  }

  const clone = (v) => JSON.parse(JSON.stringify(v));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function genCode() {
    // 去掉容易看错的 0/O/1/I
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 5; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return s;
  }

  function setName(name) {
    identity.name = name;
    localStorage.setItem('mbg:nick', name);
  }

  async function fetchRoom(code) {
    const res = await sb.from('rooms').select('state,version').eq('code', code).single();
    if (res.error) {
      if (res.error.code === 'PGRST116') throw new Error('房间不存在，检查一下邀请码');
      throw new Error(res.error.message);
    }
    return res.data;
  }

  async function createRoom(stateSeed) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = genCode();
      const res = await sb.from('rooms').insert({ code: code, state: stateSeed, version: 0 });
      if (!res.error) {
        roomCode = code;
        version = 0;
        return code;
      }
      if (res.error.code !== '23505') throw new Error(res.error.message);
    }
    throw new Error('邀请码生成失败，请重试');
  }

  async function joinRoom(code) {
    const row = await fetchRoom(code);
    roomCode = code;
    version = row.version;
    return row;
  }

  /* 读 → 改 → 带版本号写回 */
  async function mutate(fn) {
    if (!roomCode) throw new Error('还没进入房间');
    if (busy) return null;
    busy = true;

    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        if (attempt) await sleep(90 * attempt);

        const row = await fetchRoom(roomCode);
        const next = fn(clone(row.state));
        if (!next) return null;

        const res = await sb.from('rooms')
          .update({
            state: next,
            version: row.version + 1,
            updated_at: new Date().toISOString()
          })
          .eq('code', roomCode)
          .eq('version', row.version)
          .select('version');

        if (res.error) throw new Error(res.error.message);
        if (res.data && res.data.length) {
          version = row.version + 1;
          if (listener) listener(next, version);
          return next;
        }
      }
      throw new Error('两条操作撞上了，请再点一次');
    } finally {
      busy = false;
    }
  }

  function subscribe(code, onState, onStatus) {
    listener = onState;
    statusListener = onStatus || null;

    if (channel) { sb.removeChannel(channel); channel = null; }
    stopHeartbeat();

    channel = sb.channel('room-' + code, {
      config: { presence: { key: identity.id } }
    })
      .on('postgres_changes',
          { event: '*', schema: 'public', table: 'rooms', filter: 'code=eq.' + code },
          (payload) => {
            const row = payload['new'];
            if (!row || !row.state) return;
            if (row.version <= version) return;
            version = row.version;
            if (listener) listener(row.state, row.version);
          })
      .on('presence', { event: 'sync' }, () => { /* 在线集合变化，读取方自己按需取 */ })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') startHeartbeat();
        if (statusListener) statusListener(status);
      });
  }

  /* ---------------- 在线状态（Realtime Presence） ---------------- */
  // 心跳写的是本地时间戳，不落库：只在内存里判断谁还在线
  const PRESENCE_STALE = 45000;

  function trackSelf() {
    if (!channel) return;
    try { channel.track({ pid: identity.id, at: Date.now() }); } catch (e) { /* 通道还没就绪，忽略 */ }
  }

  function startHeartbeat() {
    trackSelf();
    stopHeartbeat();
    heartbeat = setInterval(trackSelf, 15000);
  }

  function stopHeartbeat() {
    if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
  }

  function presenceMap() {
    if (!channel) return {};
    try { return channel.presenceState() || {}; } catch (e) { return {}; }
  }

  function onlinePids(staleMs) {
    const now = Date.now();
    const limit = staleMs || PRESENCE_STALE;
    const map = presenceMap();
    const out = [];
    Object.keys(map).forEach((k) => {
      (map[k] || []).forEach((m) => {
        if (!m || !m.pid) return;
        if (now - (m.at || 0) < limit && out.indexOf(m.pid) < 0) out.push(m.pid);
      });
    });
    return out;
  }

  function isOnline(pid) {
    return onlinePids().indexOf(pid) >= 0;
  }

  /* presence 还没建立起来时（比如刚进房间）不要凭"没人"去做判断 */
  function presenceActive() {
    return onlinePids().length > 0;
  }

  function leave() {
    stopHeartbeat();
    try { if (channel) channel.untrack(); } catch (e) { /* 忽略 */ }
    if (channel && sb) sb.removeChannel(channel);
    channel = null;
    roomCode = null;
    version = -1;
    listener = null;
    statusListener = null;
    busy = false;
  }

  return {
    CONFIG_OK: CONFIG_OK,
    hasClient: !!sb,
    sb: sb,
    identity: identity,
    setName: setName,
    genCode: genCode,
    createRoom: createRoom,
    joinRoom: joinRoom,
    fetchRoom: fetchRoom,
    mutate: mutate,
    subscribe: subscribe,
    leave: leave,
    isOnline: isOnline,
    onlinePids: onlinePids,
    presenceActive: presenceActive,
    getCode: () => roomCode
  };
})();
