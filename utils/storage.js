const fs   = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// ── Supabase ──────────────────────────────────────────────────────────────────
let _db = null;
function getDB() {
  if (_db) return _db;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL e SUPABASE_KEY são obrigatórios');
  _db = createClient(url, key);
  return _db;
}

// ── Mapeamento DB ↔ JS ────────────────────────────────────────────────────────
function rowToTemplate(r) {
  return {
    id: r.id, name: r.name || '', type: r.type || 'text',
    content: r.content || '', mediaUrl: r.media_url || '',
    active: r.active !== false,
  };
}
function rowToGroup(r) {
  return { id: r.id, jid: r.jid, name: r.name || r.jid, active: r.active !== false };
}

// ── Templates ─────────────────────────────────────────────────────────────────
async function getTemplates() {
  const { data, error } = await getDB().from('templates').select('*').order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(rowToTemplate);
}

async function saveTemplates(arr) {
  const db = getDB();
  await db.from('templates').delete().gte('id', '');
  if (arr.length) {
    const { error } = await db.from('templates').insert(arr.map(t => ({
      id: t.id, name: t.name || '', type: t.type || 'text',
      content: t.content || '', media_url: t.mediaUrl || '', active: t.active !== false,
    })));
    if (error) throw error;
  }
}

// ── Grupos ────────────────────────────────────────────────────────────────────
async function getGroups() {
  const { data, error } = await getDB().from('groups').select('*').order('added_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(rowToGroup);
}

async function saveGroups(arr) {
  const db = getDB();
  await db.from('groups').delete().gte('id', '');
  if (arr.length) {
    const { error } = await db.from('groups').insert(arr.map(g => ({
      id: g.id, jid: g.jid, name: g.name, active: g.active !== false,
    })));
    if (error) throw error;
  }
}

async function updateGroup(id, data) {
  const updates = {};
  if (data.active !== undefined) updates.active = data.active;
  if (data.name   !== undefined) updates.name   = data.name;
  const { error } = await getDB().from('groups').update(updates).eq('id', id);
  if (error) throw error;
}

// ── Config ────────────────────────────────────────────────────────────────────
async function getConfig() {
  const { data, error } = await getDB().from('config').select('data').eq('id', 1).single();
  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = row not found
  return data?.data || {
    ativo: false, intervaloHoras: 1, intervaloMinutos: 0,
    postagensPorDia: 12, horarioInicio: '08:00', horarioFim: '21:00',
    timezone: 'America/Sao_Paulo', delayMin: 30, delayMax: 60,
  };
}

async function saveConfig(cfg) {
  const { error } = await getDB().from('config')
    .upsert({ id: 1, data: cfg, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// ── Histórico ─────────────────────────────────────────────────────────────────
async function getHistory() {
  const { data, error } = await getDB().from('history').select('*').order('sent_at', { ascending: false }).limit(1000);
  if (error) throw error;
  return (data || []).map(r => ({
    id: r.id, templateId: r.template_id || '', templateType: r.template_type || 'text',
    groupJid: r.group_jid || '', groupName: r.group_name || '',
    status: r.status || 'success', sentAt: r.sent_at,
  }));
}

async function addHistory(entry) {
  const { error } = await getDB().from('history').insert([{
    id:            Date.now().toString() + Math.random().toString(36).slice(2),
    template_id:   entry.templateId   || '',
    template_type: entry.templateType || 'text',
    group_jid:     entry.groupJid     || '',
    group_name:    entry.groupName    || '',
    status:        entry.status       || 'success',
    sent_at:       new Date().toISOString(),
  }]);
  if (error) throw error;
}

async function clearHistory() {
  const { error } = await getDB().from('history').delete().gte('id', '');
  if (error) throw error;
}

// ── Estado do scheduler (continua em JSON — estado interno) ───────────────────
const DATA_DIR = path.join(__dirname, '..', 'data');
function _readJSON(file, def) {
  const p = path.join(DATA_DIR, file);
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return def; }
}
function _writeJSON(file, data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2), 'utf8');
}
function getScheduleState() {
  return _readJSON('schedule_state.json', { postagensFeitasHoje: 0, ultimaDataReset: '', ultimoDisparo: null });
}
function saveScheduleState(s) { _writeJSON('schedule_state.json', s); }

module.exports = {
  getTemplates, saveTemplates,
  getGroups, saveGroups, updateGroup,
  getConfig, saveConfig,
  getHistory, addHistory, clearHistory,
  getScheduleState, saveScheduleState,
};
