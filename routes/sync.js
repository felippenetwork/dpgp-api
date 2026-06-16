const express = require('express');
const router  = express.Router();
const {
  getTemplates, saveTemplates,
  getGroups,    saveGroups,
  getConfig,    saveConfig,
} = require('../utils/storage');

// POST /api/sync — site envia toda a configuração para o servidor
// Body: { templates: [...], groups: [...], config: {...} }
router.post('/', async (req, res) => {
  try {
    const { templates, groups, config } = req.body;
    const result = { synced: {} };

    if (Array.isArray(templates)) {
      await saveTemplates(templates);
      result.synced.templates = templates.length;
    }
    if (Array.isArray(groups)) {
      await saveGroups(groups);
      result.synced.groups = groups.length;
    }
    if (config && typeof config === 'object') {
      const existing = await getConfig();
      await saveConfig({ ...existing, ...config });
      result.synced.config = true;
    }

    console.log(`📥 Sync recebido: ${JSON.stringify(result.synced)}`);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Erro no sync:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/sync — site puxa o estado atual do servidor
router.get('/', async (req, res) => {
  try {
    const [templates, groups, config] = await Promise.all([getTemplates(), getGroups(), getConfig()]);
    res.json({ success: true, templates, groups, config });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
