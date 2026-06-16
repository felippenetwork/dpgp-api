const express = require('express');
const router  = express.Router();
const { getHistory, addHistory, clearHistory } = require('../utils/storage');

// GET /api/history
router.get('/', (req, res) => {
  try {
    const limit  = parseInt(req.query.limit) || 200;
    const offset = parseInt(req.query.offset) || 0;
    const all    = getHistory();
    const slice  = all.slice(offset, offset + limit);

    res.json({
      success: true,
      total:   all.length,
      data:    slice,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/history — adiciona entrada manualmente (bot → API)
router.post('/', (req, res) => {
  try {
    const entry = addHistory(req.body);
    res.json({ success: true, data: entry });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/history — limpa histórico
router.delete('/', (req, res) => {
  try {
    clearHistory();
    res.json({ success: true, message: 'Histórico limpo.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
