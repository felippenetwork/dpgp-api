const { getSock, isConnected } = require('./whatsapp');
const { addHistory }           = require('./storage');

// Insere 1–2 caracteres de largura zero em posições ALEATÓRIAS do texto
// tornando cada mensagem única em bytes sem alterar o visual — igual ao bot original
const ZW_CHARS = ['​', '‌', '‍'];

function variarTexto(texto) {
  if (!texto || texto.length < 5) return texto;
  const quantidade = 1 + Math.floor(Math.random() * 2); // 1 ou 2 chars
  const posicoes   = new Set();
  while (posicoes.size < quantidade) {
    posicoes.add(1 + Math.floor(Math.random() * (texto.length - 1)));
  }
  const chars = texto.split('');
  [...posicoes].sort((a, b) => b - a).forEach(pos => {
    chars.splice(pos, 0, ZW_CHARS[Math.floor(Math.random() * ZW_CHARS.length)]);
  });
  return chars.join('');
}

// Simula digitação humana antes do envio — igual ao bot
async function simularDigitacao(sock, jid, tipo, texto) {
  const presenca = tipo === 'audio' ? 'recording' : 'composing';
  try { await sock.sendPresenceUpdate(presenca, jid); } catch (_) {}
  const comprimento = texto ? texto.length : 0;
  const base = Math.min(Math.max(comprimento * 40, 1500), 4000);
  await new Promise(r => setTimeout(r, base + Math.floor(Math.random() * 1000)));
  try { await sock.sendPresenceUpdate('paused', jid); } catch (_) {}
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Envia um template para um único grupo
async function enviarTemplate(sock, template, grupo) {
  const jid = grupo.jid;

  let mentions = [];
  const temMencao = template.content && template.content.includes('{menção}');

  if (temMencao) {
    try {
      const metadata = await sock.groupMetadata(jid);
      mentions = metadata.participants.map(p => p.id);
    } catch (_) {}
  }

  const textoOriginal = (template.content || '').replace('{menção}', '');
  const texto = variarTexto(textoOriginal);

  await simularDigitacao(sock, jid, template.type, textoOriginal);

  switch (template.type) {
    case 'text':
      await sock.sendMessage(jid, {
        text: texto,
        ...(mentions.length && { mentions }),
      });
      break;

    case 'image':
      if (!template.mediaUrl) throw new Error('mediaUrl não definida para imagem');
      await sock.sendMessage(jid, {
        image:   { url: template.mediaUrl },
        caption: texto || undefined,
        ...(mentions.length && { mentions }),
      });
      break;

    case 'video':
      if (!template.mediaUrl) throw new Error('mediaUrl não definida para vídeo');
      await sock.sendMessage(jid, {
        video:   { url: template.mediaUrl },
        caption: texto || undefined,
        ...(mentions.length && { mentions }),
      });
      break;

    case 'audio':
      if (!template.mediaUrl) throw new Error('mediaUrl não definida para áudio');
      await sock.sendMessage(jid, {
        audio:    { url: template.mediaUrl },
        mimetype: 'audio/mp4',
        ptt:      false,
      });
      break;

    default:
      if (texto) {
        await sock.sendMessage(jid, {
          text: texto,
          ...(mentions.length && { mentions }),
        });
      }
  }
}

// Envia um template para todos os grupos com delay
// isCancelado: () => boolean — retorna true se deve interromper
async function enviarParaGrupos(template, grupos, config, isCancelado = () => false) {
  const sock = getSock();
  if (!sock || !isConnected()) throw new Error('WhatsApp não conectado');

  const delayMin = (config.delayMin || 30) * 1000;
  const delayMax = (config.delayMax || 60) * 1000;
  const forbiddenGrupos = [];

  for (let i = 0; i < grupos.length; i++) {
    if (isCancelado()) {
      console.log('[SENDER] 🛑 Envio interrompido durante o ciclo.');
      return { forbiddenGrupos };
    }

    try {
      await enviarTemplate(sock, template, grupos[i]);
    } catch (err) {
      const isForbidden = err.message === 'forbidden' || err.output?.statusCode === 403;
      if (isForbidden) {
        console.error(`[ERRO] ${grupos[i].name}: forbidden — bot removido do grupo.`);
        forbiddenGrupos.push(grupos[i]);
      } else if (err.message === 'Connection Closed' || err.message === 'write EPIPE') {
        // Erro de conexão — aborta e deixa o scheduler reagendar
        throw err;
      } else {
        console.error(`[ERRO] Envio para ${grupos[i].name}:`, err.message);
      }
    }

    addHistory({
      templateId:   template.id,
      templateType: template.type,
      groupJid:     grupos[i].jid,
      groupName:    grupos[i].name,
      status:       forbiddenGrupos.includes(grupos[i]) ? 'failed' : 'success',
    });

    // Delay entre grupos
    if (i < grupos.length - 1) {
      if (isCancelado()) return { forbiddenGrupos };
      const delay = delayMin + Math.random() * (delayMax - delayMin);
      await sleep(delay);
    }
  }

  return { forbiddenGrupos };
}

module.exports = { enviarParaGrupos };
