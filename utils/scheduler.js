const cron    = require('node-cron');
const storage = require('./storage');
const { enviarParaGrupos } = require('./sender');

let sockRef       = null;
let sockConectado = false;
let cronIniciado  = false;
let emExecucao    = false;
let filaIds              = []; // IDs dos templates na ordem embaralhada
let _cancelarEnvioAtual  = null;

function embaralhar(arr) {
  const copia = [...arr];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function salvarFila() {
  const estado = storage.getScheduleState();
  storage.saveScheduleState({ ...estado, filaIds });
}

function proximoTemplate(templates) {
  const idsAtivos = new Set(templates.map(t => t.id));

  // Remove da fila templates que foram deletados/desativados
  filaIds = filaIds.filter(id => idsAtivos.has(id));

  if (filaIds.length === 0) {
    filaIds = embaralhar([...idsAtivos]);
    console.log(`[SCHEDULER] 🔀 Novo ciclo — ${filaIds.length} templates embaralhados.`);
  }

  const id = filaIds.shift();
  salvarFila();
  return templates.find(t => t.id === id) || null;
}

function resetarFila() {
  filaIds = [];
  salvarFila();
  if (_cancelarEnvioAtual) _cancelarEnvioAtual();
  console.log('[SCHEDULER] 🔄 Fila resetada.');
}

// ── Pulso de presença — igual ao bot ─────────────────────────────────────────
async function pulsarPresenca() {
  if (!sockRef || !sockConectado) return;
  try {
    await sockRef.sendPresenceUpdate('available');
    const duracao = 5000 + Math.floor(Math.random() * 10000); // 5–15s
    await new Promise(r => setTimeout(r, duracao));
    await sockRef.sendPresenceUpdate('unavailable');
    console.log('[PRESENCE] Pulse enviado.');
  } catch (_) {}
}

function agendarPulsosPresenca() {
  const horarios = [9, 13, 17, 20];
  horarios.forEach(hora => {
    const min = Math.floor(Math.random() * 50);
    cron.schedule(`${min} ${hora} * * *`, pulsarPresenca, {
      timezone: 'America/Sao_Paulo',
    });
  });
  console.log(`[PRESENCE] Pulsos agendados às ${horarios.map(h => `~${h}h`).join(', ')}.`);
}

// ── Horário SP — igual ao bot (usa Intl) ─────────────────────────────────────
function agoraSP(timezone = 'America/Sao_Paulo') {
  const agora  = new Date();
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(agora);

  const get = (tipo) => parseInt(partes.find(p => p.type === tipo)?.value || '0');

  return {
    dataStr:   `${get('year')}-${String(get('month')).padStart(2,'0')}-${String(get('day')).padStart(2,'0')}`,
    minAtual:  get('hour') * 60 + get('minute'),
    timestamp: agora,
  };
}

// ── Ciclo principal de disparo ────────────────────────────────────────────────
async function verificarDisparo() {
  if (!sockRef || !sockConectado) return;
  if (emExecucao) {
    console.log('[SCHEDULER] Envio anterior em andamento, pulando tick.');
    return;
  }

  try {
    const config = await storage.getConfig();
    if (!config.ativo) return;

    const grupos    = (await storage.getGroups()).filter(g => g.active);
    const templates = (await storage.getTemplates()).filter(t => t.active);

    if (!grupos.length || !templates.length) return;

    const tz = config.timezone || 'America/Sao_Paulo';
    const { dataStr, minAtual, timestamp } = agoraSP(tz);

    // Reset diário
    const estado = storage.getScheduleState();
    let postagensFeitasHoje = estado.postagensFeitasHoje || 0;
    if (estado.ultimaDataReset !== dataStr) {
      postagensFeitasHoje = 0;
    }

    // Janela horária
    const [hIni, mIni] = (config.horarioInicio || '08:00').split(':').map(Number);
    const [hFim, mFim] = (config.horarioFim   || '21:00').split(':').map(Number);
    if (minAtual < (hIni * 60 + mIni) || minAtual > (hFim * 60 + mFim)) return;

    // Limite diário
    if (postagensFeitasHoje >= (config.postagensPorDia || 12)) return;

    // Intervalo desde o último disparo
    if (estado.ultimoDisparo) {
      const diffMs     = timestamp - new Date(estado.ultimoDisparo);
      const intervaloMs = ((config.intervaloHoras || 1) * 60 + (config.intervaloMinutos || 0)) * 60 * 1000;
      if (diffMs < intervaloMs) return;
    }

    // ── Pega próximo template ──
    const template = proximoTemplate(templates);
    if (!template) return;

    emExecucao = true;
    let cancelado = false;
    _cancelarEnvioAtual = () => { cancelado = true; };

    console.log(`\n📤 Disparando template #${template.id} (${template.type}) para ${grupos.length} grupo(s)...`);

    try {
      const { forbiddenGrupos } = await enviarParaGrupos(template, grupos, config, () => cancelado);

      // Remove grupos forbidden automaticamente
      if (forbiddenGrupos.length > 0) {
        await Promise.all(forbiddenGrupos.map(g => storage.updateGroup(g.id, { active: false }).catch(() => {})));
        console.log(`[SCHEDULER] ⚠️ ${forbiddenGrupos.length} grupo(s) desativado(s): ${forbiddenGrupos.map(g => g.name).join(', ')}`);
      }

      if (cancelado) {
        console.log(`[SCHEDULER] ⚠️ Envio interrompido (template deletado durante envio).`);
      } else {
        postagensFeitasHoje += 1;
        storage.saveScheduleState({
          postagensFeitasHoje,
          ultimaDataReset: dataStr,
          ultimoDisparo:   timestamp.toISOString(),
        });
        console.log(`[SCHEDULER] ✅ Template #${template.id} enviado. Hoje: ${postagensFeitasHoje}/${config.postagensPorDia} | Fila restante: ${filaIds.length}`);
      }

    } catch (err) {
      // Reinsere na fila se não foi cancelado
      if (!cancelado) {
        filaIds.unshift(template.id);
        salvarFila();
      }
      console.error('[SCHEDULER ERRO] Envio falhou, tentará no próximo ciclo:', err.message);
    } finally {
      _cancelarEnvioAtual = null;
      emExecucao = false;
    }

  } catch (err) {
    emExecucao = false;
    console.error('[SCHEDULER ERRO GERAL]', err.message);
  }
}

// ── Exports ───────────────────────────────────────────────────────────────────
function iniciarScheduler(sock) {
  sockRef       = sock;
  sockConectado = true;
  if (!cronIniciado) {
    // Restaura fila salva
    const estado = storage.getScheduleState();
    filaIds = Array.isArray(estado.filaIds) ? estado.filaIds : [];
    if (filaIds.length > 0) {
      console.log(`[SCHEDULER] 📋 Fila restaurada: ${filaIds.length} template(s) restantes no ciclo.`);
    }
    cron.schedule('*/2 * * * *', verificarDisparo);
    agendarPulsosPresenca();
    cronIniciado = true;
  }
  console.log('✅ Scheduler iniciado.');
}

function pausarScheduler() {
  sockConectado = false;
  console.log('[SCHEDULER] ⏸️ Pausado (WhatsApp desconectado).');
}

function startScheduler() {
  // Chamado no server.js antes da conexão — apenas registra o cron
  // O sock é passado depois via iniciarScheduler()
  if (!cronIniciado) {
    cron.schedule('*/2 * * * *', verificarDisparo);
    agendarPulsosPresenca();
    cronIniciado = true;
    console.log('⏰ Scheduler registrado (aguardando conexão WhatsApp).');
  }
}

async function dispararAgora() {
  if (emExecucao) throw new Error('Já há um disparo em andamento.');
  if (!sockConectado) throw new Error('WhatsApp não está conectado.');
  await verificarDisparo();
}

function estaEnviando() { return emExecucao; }

module.exports = {
  startScheduler, iniciarScheduler, pausarScheduler,
  resetarFila, dispararAgora, estaEnviando,
};
