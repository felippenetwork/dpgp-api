const fs   = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

function readJSON(file, def = null) {
  const p = path.join(DATA_DIR, file);
  try {
    if (!fs.existsSync(p)) return def;
    const raw = fs.readFileSync(p, 'utf8').replace(/^﻿/, '');
    return JSON.parse(raw);
  } catch {
    return def;
  }
}

function writeJSON(file, data) {
  const p = path.join(DATA_DIR, file);
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
}

// ── Templates ──
const getTemplates  = () => readJSON('templates.json', []);
const saveTemplates = (t)  => writeJSON('templates.json', t);

// ── Grupos ──
const getGroups  = () => readJSON('groups.json', []);
const saveGroups = (g)  => writeJSON('groups.json', g);

// ── Config ──
function getConfig() {
  return readJSON('config.json', {
    ativo:            false,
    intervaloHoras:   1,
    intervaloMinutos: 0,
    postagensPorDia:  12,
    horarioInicio:    '08:00',
    horarioFim:       '21:00',
    timezone:         'America/Sao_Paulo',
    delayMin:         30,
    delayMax:         60,
  });
}

const saveConfig = (c) => writeJSON('config.json', c);

// ── Histórico ──
function getHistory() { return readJSON('history.json', []); }

function addHistory(entry) {
  const list = getHistory();
  list.unshift({
    id:           Date.now().toString(),
    templateId:   entry.templateId   || '',
    templateType: entry.templateType || 'text',
    groupJid:     entry.groupJid     || '',
    groupName:    entry.groupName    || '',
    status:       entry.status       || 'success',
    sentAt:       new Date().toISOString(),
  });
  if (list.length > 1000) list.length = 1000;
  writeJSON('history.json', list);
  return list[0];
}

function clearHistory() { writeJSON('history.json', []); }

// ── Estado do scheduler (disparos hoje) ──
function getScheduleState() {
  return readJSON('schedule_state.json', {
    postagensFeitasHoje: 0,
    ultimaDataReset:     '',
    ultimoDisparo:       null,
  });
}

function saveScheduleState(s) { writeJSON('schedule_state.json', s); }

module.exports = {
  getTemplates, saveTemplates,
  getGroups,    saveGroups,
  getConfig,    saveConfig,
  getHistory,   addHistory, clearHistory,
  getScheduleState, saveScheduleState,
};
