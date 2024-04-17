const express = require('express');
const { createServer } = require('node:http');
const cors = require('cors');
const { port, corsOptions } = require('./config');
const routes = require('./routes/index');
const { socketHandler } = require('./sockets/socketHandler');

const app = express();
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(routes);

const server = createServer(app);
socketHandler(server);

server.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});
