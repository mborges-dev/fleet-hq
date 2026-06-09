#!/usr/bin/env node
const http = require('http');
const fs   = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

const PORT       = process.env.PORT || 4242;
const FLEET_HOME = process.env.FLEET_HOME || path.join(process.env.HOME, '.fleet');
const FLEET_BIN  = process.env.FLEET_BIN  || path.join(__dirname, '..', 'fleet');
const SCHED_SESSION = 'fleet-scheduler';

const TMUX = [
  '/opt/homebrew/bin/tmux',
  '/usr/local/bin/tmux',
  '/usr/bin/tmux',
].find(p => { try { fs.accessSync(p); return true; } catch { return false; } }) || 'tmux';

const MAX_HISTORY = 14;
const history    = new Map();   // name -> Array<{ts,type,target,label}>
const lastSig    = new Map();   // name -> sig
const cycleCount = new Map();   // name -> total cycles fired by scheduler

// ── Token totals cache (tokens.sh reads jsonl transcripts — slow) ──────────
let tokenCache = { ts: 0, data: [] };
function refreshTokens() {
  const now = Date.now();
  if (now - tokenCache.ts < 30_000) return tokenCache.data;
  try {
    const out = execSync(`${FLEET_BIN} tokens --json 2>/dev/null`, {
      encoding: 'utf8', timeout: 8000, env: { ...process.env, FLEET_HOME },
    });
    tokenCache = { ts: now, data: JSON.parse(out || '[]') };
  } catch { tokenCache = { ts: now, data: [] }; }
  return tokenCache.data;
}

// ── Readers ────────────────────────────────────────────────────────────────

function getSessions() {
  try {
    const out = execSync(
      `${TMUX} ls -F "#{session_name}|#{session_created}" 2>/dev/null`,
      { encoding: 'utf8', timeout: 2000 }
    );
    return out.trim().split('\n').filter(Boolean).map(line => {
      const [name, created] = line.split('|');
      return { name, created: parseInt(created, 10) };
    }).filter(s => s.name !== SCHED_SESSION);
  } catch { return []; }
}

function getOutput(name) {
  try {
    return execSync(
      `${TMUX} capture-pane -t ${JSON.stringify(name)} -p -S -80 2>/dev/null`,
      { encoding: 'utf8', timeout: 2000 }
    );
  } catch { return ''; }
}

function getPending() {
  try {
    const raw = fs.readFileSync(path.join(FLEET_HOME, 'data', 'pending.log'), 'utf8');
    return raw.trim().split('\n').filter(Boolean).slice(-30).reverse();
  } catch { return []; }
}

function getChat(limit = 120) {
  try {
    const raw = fs.readFileSync(path.join(FLEET_HOME, 'data', 'chat.log'), 'utf8');
    return raw.trim().split('\n').filter(Boolean).slice(-limit).map(line => {
      const cols = line.split('\t');
      const [ts, from, to, kind] = cols;
      let world, text;
      if (cols.length >= 6) { world = cols[4]; text = cols.slice(5).join('\t'); }
      else                  { world = 'hq';    text = cols.slice(4).join('\t'); }
      return {
        ts:    parseInt(ts, 10) * 1000,
        from:  from || '?',
        to:    to   || '*',
        kind:  kind || 'say',
        world: world || 'hq',
        text:  text  || '',
      };
    });
  } catch { return []; }
}

function getVentures() {
  try {
    const raw = fs.readFileSync(path.join(FLEET_HOME, 'data', 'ventures.tsv'), 'utf8');
    return raw.trim().split('\n').filter(Boolean).map(line => {
      const [id, world, type, name, url, target, status, created] = line.split('\t');
      return {
        id, world, type: type || 'project', name: name || id,
        url: url || '',
        monthlyTarget: parseFloat(target) || 0,
        status: status || 'idea',
        created: parseInt(created, 10) * 1000 || 0,
      };
    });
  } catch { return []; }
}

function getProposals(limit = 60) {
  try {
    const raw = fs.readFileSync(path.join(FLEET_HOME, 'data', 'proposals.tsv'), 'utf8');
    return raw.trim().split('\n').filter(Boolean).slice(-limit).map(line => {
      const [id, ts, agent, world, status, decidedTs, action, ...rest] = line.split('\t');
      return {
        id,
        ts: parseInt(ts, 10) * 1000,
        agent, world,
        status: status || 'pending',
        decidedTs: decidedTs && decidedTs !== '0' ? parseInt(decidedTs, 10) * 1000 : null,
        action: action || '',
        note: rest.join('\t') || '',
      };
    });
  } catch { return []; }
}

function getGoal() {
  try {
    const raw = fs.readFileSync(path.join(FLEET_HOME, 'config', 'goal.tsv'), 'utf8');
    const month  = (raw.match(/month=(.+)/)  || [])[1]?.trim() || '';
    const target = parseFloat((raw.match(/target=(.+)/) || [])[1]) || 0;
    return { month, target };
  } catch { return { month: '', target: 0 }; }
}

function getTemplates() {
  try {
    const dir = path.join(__dirname, '..', 'agents', 'templates');
    return fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => {
      const key = f.replace(/\.md$/, '');
      const body = fs.readFileSync(path.join(dir, f), 'utf8');
      const title = (body.match(/^#\s*(.+)$/m) || [])[1] || key;
      return { key, title, body };
    });
  } catch { return []; }
}

function getAsks(limit = 100) {
  try {
    const raw = fs.readFileSync(path.join(FLEET_HOME, 'data', 'asks.tsv'), 'utf8');
    return raw.trim().split('\n').filter(Boolean).slice(-limit).map(line => {
      const [id, ts, agent, world, status, answeredTs, question, ...rest] = line.split('\t');
      return {
        id,
        ts:         parseInt(ts, 10) * 1000,
        agent:      agent || '?',
        world:      world || 'hq',
        status:     status || 'open',
        answeredTs: answeredTs && answeredTs !== '0' ? parseInt(answeredTs, 10) * 1000 : null,
        question:   question || '',
        answer:     rest.join('\t') || '',
      };
    });
  } catch { return []; }
}

function getRevenue(limit = 200) {
  try {
    const raw = fs.readFileSync(path.join(FLEET_HOME, 'data', 'revenue.tsv'), 'utf8');
    return raw.trim().split('\n').filter(Boolean).slice(-limit).map(line => {
      const [ts, agent, world, amount, ...rest] = line.split('\t');
      return {
        ts:    parseInt(ts, 10) * 1000,
        agent: agent || '?',
        world: world || 'hq',
        amount: parseFloat(amount) || 0,
        note:  rest.join('\t') || '',
      };
    });
  } catch { return []; }
}

function getEvents(limit = 40) {
  try {
    const raw = fs.readFileSync(path.join(FLEET_HOME, 'data', 'events.log'), 'utf8');
    return raw.trim().split('\n').filter(Boolean).slice(-limit).map(line => {
      const [ts, kind, world, ...rest] = line.split('\t');
      return {
        ts:   parseInt(ts, 10) * 1000,
        kind: kind || 'event',
        world: world || 'hq',
        text: rest.join('\t'),
      };
    });
  } catch { return []; }
}

function getSchedules() {
  try {
    const raw = fs.readFileSync(path.join(FLEET_HOME, 'data', 'schedules.tsv'), 'utf8');
    const now = Math.floor(Date.now() / 1000);
    return raw.trim().split('\n').filter(Boolean).map(line => {
      const [id, agent, interval, last, enabled, prompt] = line.split('\t');
      const intv  = parseInt(interval, 10) || 0;
      const lastT = parseInt(last, 10) || 0;
      const nextIn = lastT === 0 ? null : Math.max(0, (lastT + intv) - now);
      return { id, agent, interval: intv, last: lastT, nextIn, enabled: enabled === '1', prompt: prompt || '' };
    });
  } catch { return []; }
}

function getWorlds() {
  try {
    const raw = fs.readFileSync(path.join(FLEET_HOME, 'config', 'worlds.tsv'), 'utf8');
    return raw.trim().split('\n').filter(Boolean).map(line => {
      const cols = line.split('\t');
      // Schema v2: id name icon color theme kind description (7 cols)
      // Schema v1: id name icon color theme description       (6 cols) — fall back
      const [id, name, icon, color, theme] = cols;
      let kind, description;
      if (cols.length >= 7) { kind = cols[5]; description = cols.slice(6).join('\t'); }
      else                  { kind = id === 'hq' ? 'command' : 'revenue'; description = cols.slice(5).join('\t'); }
      return {
        id, name: name || id,
        icon: icon || 'globe',
        color: color || '#84C7AE',
        theme: theme || 'grid',
        kind: kind || 'revenue',
        description: description || '',
      };
    });
  } catch { return []; }
}

function getAgentWorlds() {
  const map = {};
  try {
    const raw = fs.readFileSync(path.join(FLEET_HOME, 'data', 'agent-worlds.tsv'), 'utf8');
    raw.trim().split('\n').filter(Boolean).forEach(line => {
      const [agent, world] = line.split('\t');
      if (agent) map[agent] = world || 'hq';
    });
  } catch {}
  return map;
}

function schedulerRunning() {
  try { execSync(`${TMUX} has-session -t ${SCHED_SESSION} 2>/dev/null`, { stdio: 'ignore' }); return true; }
  catch { return false; }
}

function getDND() {
  try {
    const raw = fs.readFileSync(path.join(FLEET_HOME, 'config', 'dnd.conf'), 'utf8');
    return raw.split('\n').find(l => l.trim() && !l.startsWith('#'))?.trim() || '';
  } catch { return ''; }
}

function isDNDActive(rule) {
  if (!rule) return false;
  if (rule.toUpperCase() === 'OFF') return true;
  const m = rule.match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
  if (!m) return false;
  const now   = new Date();
  const cur   = now.getHours() * 60 + now.getMinutes();
  const start = parseInt(m[1]) * 60 + parseInt(m[2]);
  const end   = parseInt(m[3]) * 60 + parseInt(m[4]);
  return start <= end ? (cur >= start && cur < end) : (cur >= start || cur < end);
}

function thisMonthEarned(revenue) {
  const d = new Date();
  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  let total = 0;
  for (const r of revenue) {
    const rd = new Date(r.ts);
    const rym = `${rd.getFullYear()}-${String(rd.getMonth() + 1).padStart(2, '0')}`;
    if (rym === ym) total += r.amount;
  }
  return total;
}

function humanUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── Activity detection ────────────────────────────────────────────────────
function detectAction(output) {
  if (!output) return { type: 'idle', target: '', label: 'Waiting...' };
  const lines = output.split('\n').filter(l => l.trim());
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 25); i--) {
    const l = lines[i].replace(/\x1b\[[0-9;]*m/g, '');
    let m;
    if ((m = l.match(/Read\s+(\S.*)/)))         return { type: 'read',   target: path.basename(m[1].trim()), label: `Reading ${path.basename(m[1].trim())}` };
    if ((m = l.match(/Write\s+(\S.*)/)))        return { type: 'write',  target: path.basename(m[1].trim()), label: `Writing ${path.basename(m[1].trim())}` };
    if ((m = l.match(/Edit\s+(\S.*)/)))         return { type: 'edit',   target: path.basename(m[1].trim()), label: `Editing ${path.basename(m[1].trim())}` };
    if ((m = l.match(/Bash\s*\((.+?)\)/)))      return { type: 'bash',   target: m[1].trim().slice(0, 40), label: `$ ${m[1].trim().slice(0, 40)}` };
    if ((m = l.match(/WebSearch\s*\((.+?)\)/))) return { type: 'search', target: m[1].trim().slice(0, 35), label: `Searching: ${m[1].trim().slice(0, 35)}` };
    if (/WebFetch/.test(l))                     return { type: 'fetch',  target: '', label: 'Fetching URL' };
    if (/TodoWrite/.test(l))                    return { type: 'todo',   target: '', label: 'Updating task list' };
    if (/Agent\s/.test(l))                      return { type: 'agent',  target: '', label: 'Spawning subagent' };
    if (/Thinking/.test(l))                     return { type: 'think',  target: '', label: 'Thinking...' };
  }
  const last = (lines[lines.length - 1] || '').replace(/\x1b\[[0-9;]*m/g, '').trim();
  return { type: 'idle', target: '', label: last.slice(0, 55) || 'Working...' };
}

function pushHistory(name, action) {
  const sig = `${action.type}::${action.target}`;
  if (lastSig.get(name) === sig) return;
  lastSig.set(name, sig);
  const arr = history.get(name) || [];
  arr.push({ ts: Date.now(), type: action.type, target: action.target, label: action.label });
  while (arr.length > MAX_HISTORY) arr.shift();
  history.set(name, arr);
}

// ── State assembly ────────────────────────────────────────────────────────

function buildState() {
  const sessions    = getSessions();
  const worlds      = getWorlds();
  const agentWorlds = getAgentWorlds();
  const tokens      = refreshTokens();
  const tokById     = Object.fromEntries(tokens.map(t => [t.agent, t]));

  const liveNames = new Set(sessions.map(s => s.name));
  for (const k of history.keys()) {
    if (!liveNames.has(k)) { history.delete(k); lastSig.delete(k); }
  }

  // Count cycles per agent from chat (scheduler→agent tells)
  const chat = getChat(150);
  const counts = new Map();
  for (const c of chat) {
    if (c.from === 'scheduler' && c.to && c.to !== '*' && !c.to.startsWith('@')) {
      counts.set(c.to, (counts.get(c.to) || 0) + 1);
    }
  }
  for (const [n, v] of counts) cycleCount.set(n, v);

  // Aggregate revenue per agent and per world
  const revenue = getRevenue(500);
  const earnByAgent = {};
  const earnByWorld = {};
  let earnTotal = 0;
  for (const r of revenue) {
    earnByAgent[r.agent] = (earnByAgent[r.agent] || 0) + r.amount;
    earnByWorld[r.world] = (earnByWorld[r.world] || 0) + r.amount;
    earnTotal += r.amount;
  }

  const sessionsOut = sessions.map(s => {
    const output = getOutput(s.name);
    const action = detectAction(output);
    pushHistory(s.name, action);
    const tok    = tokById[s.name];
    const world  = agentWorlds[s.name] || 'hq';
    const cost   = tok && tok.cost_usd != null ? parseFloat(tok.cost_usd) : 0;
    const outTok = tok && tok.output   != null ? parseInt(tok.output, 10) : 0;
    const earned = earnByAgent[s.name] || 0;
    return {
      name:     s.name,
      world,
      uptime:   humanUptime(Math.max(0, Math.floor(Date.now() / 1000) - s.created)),
      activity: action.label,
      action,
      history:  history.get(s.name) || [],
      tokens:   outTok,
      cost,
      earned,
      net:      earned - cost,
      cycles:   cycleCount.get(s.name) || 0,
    };
  });

  const totals = {
    cost:   sessionsOut.reduce((a, s) => a + (s.cost   || 0), 0),
    output: sessionsOut.reduce((a, s) => a + (s.tokens || 0), 0),
    cycles: sessionsOut.reduce((a, s) => a + (s.cycles || 0), 0),
    agents: sessionsOut.length,
    earned: earnTotal,
  };
  totals.net = totals.earned - totals.cost;

  return {
    worlds,
    sessions:  sessionsOut,
    pending:   getPending(),
    chat,
    events:    getEvents(40),
    revenue,
    earnByWorld,
    asks:      getAsks(100),
    proposals: getProposals(60),
    ventures:  getVentures(),
    goal:      getGoal(),
    templates: getTemplates(),
    month:     thisMonthEarned(revenue),
    schedules: getSchedules(),
    scheduler: { running: schedulerRunning() },
    dnd:       getDND(),
    dndActive: isDNDActive(getDND()),
    totals,
    ts: Date.now(),
  };
}

// ── HTTP helpers ──────────────────────────────────────────────────────────

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let total = 0; const chunks = [];
    req.on('data', c => {
      total += c.length;
      if (total > limit) { req.destroy(); reject(new Error('body too large')); return; }
      chunks.push(c);
    });
    req.on('end',  () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function fleetCall(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(FLEET_BIN, args, {
      env: { ...process.env, FLEET_HOME },
      timeout: 5000,
    });
    let out = '', err = '';
    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => err += d);
    child.on('close', code => {
      if (code === 0) resolve(out.trim());
      else reject(new Error(err.trim() || `fleet exited ${code}`));
    });
    child.on('error', reject);
  });
}

function jsonRes(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

// ── HTTP ──────────────────────────────────────────────────────────────────

const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(HTML);
    }

    if (req.method === 'GET' && req.url === '/events') {
      res.writeHead(200, {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      const send = () => { try { res.write(`data: ${JSON.stringify(buildState())}\n\n`); } catch {} };
      send();
      const iv = setInterval(send, 1500);
      req.on('close', () => clearInterval(iv));
      return;
    }

    if (req.method === 'GET' && req.url === '/api/state') {
      return jsonRes(res, 200, buildState());
    }

    if (req.method === 'POST' && req.url === '/api/send') {
      const body = await readBody(req);
      let p; try { p = JSON.parse(body); } catch { return jsonRes(res, 400, { error: 'invalid json' }); }
      const from  = (p.from || 'me').toString().slice(0, 32);
      const to    = (p.to   || '*').toString().slice(0, 64);
      const world = (p.world || '').toString().slice(0, 32);
      const text  = (p.text || '').toString().trim();
      if (!text) return jsonRes(res, 400, { error: 'text required' });
      let args;
      if (to.startsWith('@'))            args = ['say', from, '--world', to.slice(1), text];
      else if (to === '*' || to === '' || to === 'all') {
        args = world ? ['say', from, '--world', world, text] : ['say', from, text];
      }
      else                                args = ['say', from, '--to', to, text];
      try { await fleetCall(args); return jsonRes(res, 200, { ok: true }); }
      catch (e) { return jsonRes(res, 500, { error: e.message }); }
    }

    if (req.method === 'POST' && req.url === '/api/schedule') {
      const body = await readBody(req);
      let p; try { p = JSON.parse(body); } catch { return jsonRes(res, 400, { error: 'invalid json' }); }
      const { id, agent, every, prompt } = p;
      if (!id || !agent || !every || !prompt) return jsonRes(res, 400, { error: 'id, agent, every, prompt required' });
      try { await fleetCall(['schedule', String(id), String(agent), String(every), String(prompt)]); return jsonRes(res, 200, { ok: true }); }
      catch (e) { return jsonRes(res, 500, { error: e.message }); }
    }

    if (req.method === 'POST' && req.url === '/api/unschedule') {
      const body = await readBody(req);
      let p; try { p = JSON.parse(body); } catch { return jsonRes(res, 400, { error: 'invalid json' }); }
      if (!p.id) return jsonRes(res, 400, { error: 'id required' });
      try { await fleetCall(['unschedule', String(p.id)]); return jsonRes(res, 200, { ok: true }); }
      catch (e) { return jsonRes(res, 500, { error: e.message }); }
    }

    if (req.method === 'POST' && req.url === '/api/scheduler') {
      const body = await readBody(req);
      let p; try { p = JSON.parse(body); } catch { return jsonRes(res, 400, { error: 'invalid json' }); }
      const action = p.action === 'stop' ? 'stop' : 'start';
      try { await fleetCall(['scheduler', action]); return jsonRes(res, 200, { ok: true }); }
      catch (e) { return jsonRes(res, 500, { error: e.message }); }
    }

    // ─── Spawn a new agent (no-code wizard) ───────────────────────────────
    if (req.method === 'POST' && req.url === '/api/spawn') {
      const body = await readBody(req);
      let p; try { p = JSON.parse(body); } catch { return jsonRes(res, 400, { error: 'invalid json' }); }
      if (!p.name || !p.world) return jsonRes(res, 400, { error: 'name and world required' });
      const args = ['spawn', String(p.name), String(p.world)];
      if (p.template) args.push('--template', String(p.template));
      if (p.mission)  args.push('--mission',  String(p.mission));
      if (p.path)     args.push('--path',     String(p.path));
      try { await fleetCall(args); return jsonRes(res, 200, { ok: true }); }
      catch (e) { return jsonRes(res, 500, { error: e.message }); }
    }

    // ─── Read / save an agent's CLAUDE.md mission ─────────────────────────
    if (req.method === 'GET' && req.url.startsWith('/api/mission')) {
      const u = new URL(req.url, 'http://localhost');
      const agent = (u.searchParams.get('agent') || '').replace(/[^a-zA-Z0-9_-]/g, '');
      if (!agent) return jsonRes(res, 400, { error: 'agent required' });
      try {
        // Look up the agent's cwd from tmux
        const cwd = execSync(`${TMUX} display-message -p -t ${JSON.stringify(agent)} '#{pane_current_path}' 2>/dev/null`,
          { encoding: 'utf8', timeout: 2000 }).trim();
        if (!cwd) return jsonRes(res, 404, { error: 'session not found' });
        const filePath = path.join(cwd, 'CLAUDE.md');
        const body = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
        return jsonRes(res, 200, { agent, path: filePath, body });
      } catch (e) { return jsonRes(res, 500, { error: e.message }); }
    }

    if (req.method === 'POST' && req.url === '/api/mission') {
      const body = await readBody(req, 256 * 1024);
      let p; try { p = JSON.parse(body); } catch { return jsonRes(res, 400, { error: 'invalid json' }); }
      const agent = String(p.agent || '').replace(/[^a-zA-Z0-9_-]/g, '');
      if (!agent || typeof p.body !== 'string') return jsonRes(res, 400, { error: 'agent and body required' });
      try {
        const cwd = execSync(`${TMUX} display-message -p -t ${JSON.stringify(agent)} '#{pane_current_path}' 2>/dev/null`,
          { encoding: 'utf8', timeout: 2000 }).trim();
        if (!cwd) return jsonRes(res, 404, { error: 'session not found' });
        const filePath = path.join(cwd, 'CLAUDE.md');
        fs.writeFileSync(filePath, p.body, 'utf8');
        return jsonRes(res, 200, { ok: true, path: filePath });
      } catch (e) { return jsonRes(res, 500, { error: e.message }); }
    }

    // ─── Ventures ─────────────────────────────────────────────────────────
    if (req.method === 'POST' && req.url === '/api/venture') {
      const body = await readBody(req);
      let p; try { p = JSON.parse(body); } catch { return jsonRes(res, 400, { error: 'invalid json' }); }
      const action = p.action || 'add';
      try {
        if (action === 'add') {
          if (!p.world || !p.name) return jsonRes(res, 400, { error: 'world and name required' });
          await fleetCall(['venture', 'add', String(p.world), String(p.name), String(p.url || ''), String(p.monthly_target || 0)]);
        } else if (action === 'rm') {
          if (!p.id) return jsonRes(res, 400, { error: 'id required' });
          await fleetCall(['venture', 'rm', String(p.id)]);
        } else if (action === 'update') {
          if (!p.id || !p.field || p.value == null) return jsonRes(res, 400, { error: 'id, field, value required' });
          await fleetCall(['venture', 'update', String(p.id), String(p.field), String(p.value)]);
        }
        return jsonRes(res, 200, { ok: true });
      } catch (e) { return jsonRes(res, 500, { error: e.message }); }
    }

    // ─── Goal ─────────────────────────────────────────────────────────────
    if (req.method === 'POST' && req.url === '/api/goal') {
      const body = await readBody(req);
      let p; try { p = JSON.parse(body); } catch { return jsonRes(res, 400, { error: 'invalid json' }); }
      try {
        if (p.action === 'clear') await fleetCall(['goal', 'clear']);
        else await fleetCall(['goal', 'set', String(p.amount || 0)]);
        return jsonRes(res, 200, { ok: true });
      } catch (e) { return jsonRes(res, 500, { error: e.message }); }
    }

    // ─── Proposals ────────────────────────────────────────────────────────
    if (req.method === 'POST' && req.url === '/api/proposal/approve') {
      const body = await readBody(req);
      let p; try { p = JSON.parse(body); } catch { return jsonRes(res, 400, { error: 'invalid json' }); }
      if (!p.id) return jsonRes(res, 400, { error: 'id required' });
      try {
        const args = ['approve', String(p.id)];
        if (p.note) args.push(String(p.note));
        await fleetCall(args);
        return jsonRes(res, 200, { ok: true });
      } catch (e) { return jsonRes(res, 500, { error: e.message }); }
    }

    if (req.method === 'POST' && req.url === '/api/proposal/reject') {
      const body = await readBody(req);
      let p; try { p = JSON.parse(body); } catch { return jsonRes(res, 400, { error: 'invalid json' }); }
      if (!p.id) return jsonRes(res, 400, { error: 'id required' });
      try {
        const args = ['reject', String(p.id)];
        if (p.reason) args.push(String(p.reason));
        await fleetCall(args);
        return jsonRes(res, 200, { ok: true });
      } catch (e) { return jsonRes(res, 500, { error: e.message }); }
    }

    if (req.method === 'POST' && req.url === '/api/ask') {
      const body = await readBody(req);
      let p; try { p = JSON.parse(body); } catch { return jsonRes(res, 400, { error: 'invalid json' }); }
      if (!p.agent || !p.question) return jsonRes(res, 400, { error: 'agent and question required' });
      try { await fleetCall(['ask', String(p.agent), String(p.question)]); return jsonRes(res, 200, { ok: true }); }
      catch (e) { return jsonRes(res, 500, { error: e.message }); }
    }

    if (req.method === 'POST' && req.url === '/api/ask/answer') {
      const body = await readBody(req);
      let p; try { p = JSON.parse(body); } catch { return jsonRes(res, 400, { error: 'invalid json' }); }
      if (!p.id || !p.answer) return jsonRes(res, 400, { error: 'id and answer required' });
      try { await fleetCall(['answer', String(p.id), String(p.answer)]); return jsonRes(res, 200, { ok: true }); }
      catch (e) { return jsonRes(res, 500, { error: e.message }); }
    }

    if (req.method === 'POST' && req.url === '/api/ask/dismiss') {
      const body = await readBody(req);
      let p; try { p = JSON.parse(body); } catch { return jsonRes(res, 400, { error: 'invalid json' }); }
      if (!p.id) return jsonRes(res, 400, { error: 'id required' });
      try { await fleetCall(['dismiss', String(p.id)]); return jsonRes(res, 200, { ok: true }); }
      catch (e) { return jsonRes(res, 500, { error: e.message }); }
    }

    if (req.method === 'POST' && req.url === '/api/earn') {
      const body = await readBody(req);
      let p; try { p = JSON.parse(body); } catch { return jsonRes(res, 400, { error: 'invalid json' }); }
      if (!p.agent || p.amount == null) return jsonRes(res, 400, { error: 'agent and amount required' });
      const args = ['earn', String(p.agent), String(p.amount)];
      if (p.note) args.push(String(p.note));
      try { await fleetCall(args); return jsonRes(res, 200, { ok: true }); }
      catch (e) { return jsonRes(res, 500, { error: e.message }); }
    }

    if (req.method === 'POST' && req.url === '/api/assign') {
      const body = await readBody(req);
      let p; try { p = JSON.parse(body); } catch { return jsonRes(res, 400, { error: 'invalid json' }); }
      if (!p.agent || !p.world) return jsonRes(res, 400, { error: 'agent, world required' });
      try { await fleetCall(['assign', String(p.agent), String(p.world)]); return jsonRes(res, 200, { ok: true }); }
      catch (e) { return jsonRes(res, 500, { error: e.message }); }
    }

    if (req.method === 'POST' && req.url === '/api/world') {
      const body = await readBody(req);
      let p; try { p = JSON.parse(body); } catch { return jsonRes(res, 400, { error: 'invalid json' }); }
      if (!p.id) return jsonRes(res, 400, { error: 'id required' });
      try {
        if (p.action === 'rm') await fleetCall(['world', 'rm', String(p.id)]);
        else await fleetCall(['world', 'add', String(p.id), String(p.name || p.id), String(p.emoji || '🌐'), String(p.color || '#84C7AE'), String(p.theme || 'grid'), String(p.description || '')]);
        return jsonRes(res, 200, { ok: true });
      } catch (e) { return jsonRes(res, 500, { error: e.message }); }
    }

    // Serve any .js file (ES modules) sitting in the dashboard dir
    {
      const noQuery = req.url.replace(/\?.*$/, '');
      if (req.method === 'GET' && noQuery.endsWith('.js') && !noQuery.startsWith('/api/')) {
        const safe = noQuery.replace(/\.\./g, '');
        const filePath = path.join(__dirname, safe);
        if (filePath.startsWith(__dirname)) {
          try {
            const buf = fs.readFileSync(filePath);
            res.writeHead(200, {
              'Content-Type': 'application/javascript; charset=utf-8',
              'Cache-Control': 'no-cache',
            });
            return res.end(buf);
          } catch { /* fall through */ }
        }
      }
    }

    // Serve static assets (PNG / GLB renders from Tripo3D, etc.)
    if (req.method === 'GET' && req.url.startsWith('/assets/')) {
      const safe = req.url.replace(/\?.*$/, '').replace(/\.\./g, '');
      const filePath = path.join(__dirname, safe);
      if (filePath.startsWith(path.join(__dirname, 'assets'))) {
        try {
          const buf = fs.readFileSync(filePath);
          const ext = path.extname(filePath).toLowerCase();
          const type = ({ '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg',
                          '.webp':'image/webp', '.svg':'image/svg+xml',
                          '.glb':'model/gltf-binary', '.gltf':'model/gltf+json',
                          '.json':'application/json' })[ext] || 'application/octet-stream';
          res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=3600' });
          return res.end(buf);
        } catch { /* fall through to 404 */ }
      }
    }

    res.writeHead(404); res.end('Not found');
  } catch (e) {
    res.writeHead(500); res.end('Server error: ' + e.message);
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Fleet HQ → http://localhost:${PORT}\n`);
});
