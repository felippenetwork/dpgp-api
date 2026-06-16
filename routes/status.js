const express    = require('express');
const router     = express.Router();
const { getState, getSock, isConnected, initWA, disconnect } = require('../utils/whatsapp');
const { getScheduleState, getConfig }  = require('../utils/storage');

// GET /api/status — público, usado pelo site para mostrar conexão
router.get('/status', (req, res) => {
  const s   = getState();
  const cfg = getConfig();
  const sch = getScheduleState();

  res.json({
    success:   true,
    connected: s.connected,
    phone:     s.phone,
    qr:        s.qrBase64 || null,
    ativo:     cfg.ativo,
    postagensFeitasHoje: sch.postagensFeitasHoje || 0,
    ultimoDisparo:       sch.ultimoDisparo || null,
  });
});

// GET /api/qr — retorna só o QR base64 (público)
router.get('/qr', (req, res) => {
  const s = getState();
  if (s.connected) {
    return res.json({ success: true, qr: null, connected: true });
  }
  res.json({ success: true, qr: s.qrBase64, connected: false });
});

// POST /api/connect — inicia conexão (requer API Key)
router.post('/connect', (req, res) => {
  const s = getState();
  if (s.connected) {
    return res.json({ success: true, connected: true, phone: s.phone });
  }
  initWA();
  res.json({ success: true, message: 'Iniciando conexão. Aguarde o QR Code...' });
});

// POST /api/disconnect — desconecta (requer API Key)
router.post('/disconnect', async (req, res) => {
  try {
    await disconnect();
    res.json({ success: true, message: 'Desconectado com sucesso.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/whatsapp-groups — lista todos os grupos que o número participa (requer API Key)
router.get('/whatsapp-groups', async (req, res) => {
  const sock = getSock();
  if (!sock || !isConnected()) {
    return res.status(503).json({ success: false, error: 'WhatsApp não conectado' });
  }
  try {
    const raw  = await sock.groupFetchAllParticipating();
    const list = Object.values(raw)
      .map(g => ({
        jid:          g.id,
        name:         g.subject || g.id,
        participants: g.participants?.length || 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    res.json({ success: true, groups: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
