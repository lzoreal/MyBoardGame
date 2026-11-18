/* ============================================================
   房间网络层（Supabase）
   ---------------------------------------------------------
   私有模式：
     rooms 只保存公开 state；每名玩家的 side / 隐藏叛徒信息
     存在 room_secrets，由 RLS 按 x-player-token 限制读取。
     建房/加入走 cabin_create_room / cabin_join_room RPC。
   公开模式：
     兼容旧的 rooms 整包读写；privateMode=false 时使用。
   ============================================================ */

window.Net = (function () {
  const CFG = window.SUPABASE_CONFIG || {};
  const URL = (CFG.url || '').trim();
  const KEY = (CFG.anonKey || '').trim();
  const CONFIG_OK = /^https:\/\/.+\.supabase\.co/.test(URL) && KEY.length > 20;
  const PRIVATE = CONFIG_OK && CFG.privateMode !== false;

  let sb = null;
  let channel = null;
  let roomCode = null;
  let version = -1;
  let busy = false;
  let listener = null;
  let statusListener = null;
  let heartbeat = null;
  let pollTimer = null;
  let identity = readIdentity();
  let token = '';
  let privateSecret = null;

  function readIdentity() {
    let id = localStorage.getItem('mbg:pid');
    if (!id) {
      id = 'p' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);
      localStorage.setItem('mbg:pid', id);
    }
    return { id: id, name: localStorage.getItem('mbg:nick') || '' };
  }

  function makeClient(tk) {
    if (!CONFIG_OK || !window.supabase || typeof window.supabase.createClient !== 'function') return null;
    return window.supabase.createClient(URL, KEY, {
      auth: { persistSession: false },
      global: tk ? { headers: { 'x-player-token': tk } } : {}
    });
  }

  sb = makeClient('');

  const clone = (v) => JSON.parse(JSON.stringify(v));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function genCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 5; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return s;
  }

  function randomToken() {
    if (window.crypto && window.crypto.getRandomValues) {
      const bytes = new Uint8Array(32);
      window.crypto.getRandomValues(bytes);
      return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function tokenKey(code) { return 'mbg:token:' + code; }

  function ensureToken(code) {
    let tk = localStorage.getItem(tokenKey(code));
    if (!tk) {
      tk = randomToken();
      localStorage.setItem(tokenKey(code), tk);
    }
    return tk;
  }

  function setRoom(code, tk) {
    roomCode = code;
    token = tk || '';
    sb = makeClient(token);
    privateSecret = null;
  }

  function setName(name) {
    identity.name = name;
    localStorage.setItem('mbg:nick', name);
  }

  function mergeSecret(state, secret) {
    if (!state || !secret || !secret.side) return state;
    const me = (state.players || []).find((p) => p.id === identity.id);
    if (me) me.side = secret.side;
    if (state.haunt && secret.traitor !== undefined && secret.traitor !== null) {
      state.haunt.traitor = Number(secret.traitor);
      if (secret.traitorGoal !== undefined) state.haunt.traitorGoal = secret.traitorGoal;
      if (secret.traitorGoalText !== undefined) state.haunt.traitorGoalText = secret.traitorGoalText;
    }
    return state;
  }

  async function fetchSecret(code) {
    if (!PRIVATE) return null;
    const r = await sb.rpc('cabin_get_secret', {
      p_code: code || roomCode,
      p_pid: identity.id,
      p_token: token
    });
    if (r.error) return null;
    privateSecret = r.data || {};
    return privateSecret;
  }

  async function fetchPublic(code) {
    const res = await sb.from('rooms').select('state,version').eq('code', code).single();
    if (res.error) {
      if (res.error.code === 'PGRST116') throw new Error('房间不存在，检查一下邀请码');
      throw new Error(res.error.message);
    }
    return res.data;
  }

  async function fetchRoom(code) {
    const row = await fetchPublic(code);
    if (!PRIVATE) return row;
    const secret = await fetchSecret(code);
    row.state = mergeSecret(row.state, secret);
    return row;
  }

  async function createRoomPrivate(stateSeed) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = genCode();
      const tk = ensureToken(code);
      const client = makeClient(tk);
      const res = await client.rpc('cabin_create_room', {
        p_code: code,
        p_pid: identity.id,
        p_token: tk,
        p_state: stateSeed
      });
      if (!res.error) {
        setRoom(code, tk);
        version = 0;
        return code;
      }
      const msg = res.error.message || '';
      if (/已存在|duplicate|23505/i.test(msg)) continue;
      throw new Error(msg || '建房失败');
    }
    throw new Error('邀请码生成失败，请重试');
  }

  async function createRoom(stateSeed) {
    if (PRIVATE) return createRoomPrivate(stateSeed);
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
    if (!PRIVATE) {
      const row = await fetchRoom(code);
      roomCode = code;
      version = row.version;
      return row;
    }

    const tk = ensureToken(code);
    const client = makeClient(tk);
    const res = await client.rpc('cabin_join_room', {
      p_code: code,
      p_pid: identity.id,
      p_token: tk,
      p_name: identity.name || ''
    });
    if (res.error) throw new Error(res.error.message || '加入失败');
    setRoom(code, tk);
    version = Number(res.data.version) || 0;
    const state = res.data.state;
    const secret = await fetchSecret(code);
    return { state: mergeSecret(state, secret), version };
  }

  /* 读 → 改 → 受控 RPC 写回
     私有模式下客户端不能直接 UPDATE rooms；服务端会校验成员令牌、
     版本号、当前行动者和不可变身份字段。 */
  async function mutate(fn, actionType) {
    if (!roomCode) throw new Error('还没进入房间');
    if (busy) return null;
    busy = true;

    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        if (attempt) await sleep(90 * attempt);

        const row = await fetchRoom(roomCode);
        const next = fn(clone(row.state));
        if (!next) return null;

        let res;
        if (PRIVATE) {
          res = await sb.rpc('cabin_push_state', {
            p_code: roomCode,
            p_pid: identity.id,
            p_token: token,
            p_version: row.version,
            p_state: next,
            p_action: actionType || ''
          });
        } else {
          res = await sb.from('rooms')
            .update({
              state: next,
              version: row.version + 1,
              updated_at: new Date().toISOString()
            })
            .eq('code', roomCode)
            .eq('version', row.version)
            .select('version');
        }

        if (res.error) throw new Error(res.error.message);
        if (PRIVATE) {
          if (!res.data || !res.data.ok) throw new Error((res.data && res.data.error) || '同步失败');
          version = Number(res.data.version) || (row.version + 1);
          const fresh = await fetchRoom(roomCode);
          if (listener) listener(fresh.state, fresh.version);
          return fresh.state;
        }
        if (res.data && res.data.length) {
          version = row.version + 1;
          const fresh = await fetchRoom(roomCode);
          if (listener) listener(fresh.state, fresh.version);
          return fresh.state;
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
    stopPolling();

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
            if (!PRIVATE) {
              if (listener) listener(row.state, row.version);
              return;
            }
            const open = async () => {
              let secret = privateSecret;
              if (!secret || !secret.side) secret = await fetchSecret(code);
              if (listener) listener(mergeSecret(row.state, secret), row.version);
            };
            open();
          })
      .on('presence', { event: 'sync' }, () => { /* 在线集合变化，读取方自己按需取 */ })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') startHeartbeat();
        if (statusListener) statusListener(status);
      });

    startPolling(code);
  }

  /* 私有模式下 Realtime 的 RLS 不认自定义请求头，必须带令牌轮询兜底 */
  function startPolling(code) {
    pollTimer = setInterval(async () => {
      if (busy) return;
      try {
        const row = await fetchRoom(code);
        if (row.version > version) {
          version = row.version;
          if (listener) listener(row.state, row.version);
        }
      } catch (e) { /* 轮询失败不弹错，下一轮继续 */ }
    }, 2500);
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  /* ---------------- 在线状态（Realtime Presence） ---------------- */
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

  function presenceActive() {
    return onlinePids().length > 0;
  }

  function leave() {
    stopHeartbeat();
    stopPolling();
    try { if (channel) channel.untrack(); } catch (e) { /* 忽略 */ }
    if (channel && sb) sb.removeChannel(channel);
    channel = null;
    roomCode = null;
    version = -1;
    listener = null;
    statusListener = null;
    busy = false;
    privateSecret = null;
  }

  return {
    CONFIG_OK: CONFIG_OK,
    PRIVATE: PRIVATE,
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
    getCode: () => roomCode,
    getToken: () => token
  };
})();
