const express  = require('express');
const router   = express.Router();
const { dispararAgora } = require('../utils/scheduler');
const { getConfig, saveConfig, getScheduleState } = require('../utils/storage');

// POST /api/dispatch/trigger — disparo manual imediato
router.post('/trigger', async (req, res) => {
  try {
    await dispararAgora();
    res.json({ success: true, message: 'Disparo executado com sucesso.' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/dispatch/toggle — ativa/desativa automação
router.post('/toggle', (req, res) => {
  try {
    const cfg  = getConfig();
    const novo = !cfg.ativo;
    saveConfig({ ...cfg, ativo: novo });
    res.json({ success: true, ativo: novo });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/dispatch/state — estado atual do scheduler
router.get('/state', (req, res) => {
  try {
    const cfg   = getConfig();
    const state = getScheduleState();
    res.json({ success: true, config: cfg, state });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
