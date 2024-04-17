const { apiKey } = require('../config');

const checkApiKey = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== apiKey) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  next();
};

module.exports = checkApiKey;