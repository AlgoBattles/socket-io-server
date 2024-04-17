const express = require('express');

const router = express.Router();
const executionService = require('../services/executionService');

router.post('/', async (req, res) => {
  try {
    const result = await executionService.executeCode(req, res);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Error executing code' });
  }
});

module.exports = router;
