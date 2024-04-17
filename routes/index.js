const express = require('express');
const executeRouter = require('./execute');

const router = express.Router();

router.get('/', (req, res) => res.send('Hello World!'));
router.use('/execute', executeRouter);

module.exports = router;
