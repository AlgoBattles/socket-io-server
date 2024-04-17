const axios = require('axios');
const isEqual = require('lodash/isEqual');
const { engineUrl } = require('../config/index'); // Configuration for the execution engine URL
const { updateBattleState } = require('./database'); // Database service for updating the battle state
const { getSocketFromUserId } = require('../sockets/socketHandler'); // Socket handler for emitting updates to clients

function calculateProgress(outputArray) {
  let passed = 0;
  outputArray && outputArray.forEach((result) => {
    if (isEqual(result[0], result[1])) {
      passed += 1;
    }
  });
  return Math.floor((passed / outputArray.length) * 100);
}

async function executeCode(req, res) {
  try {
    console.log('body is', req.body);

    const requestBody = {
      code: {
        content: req.body.code,
        name: req.body.funcName,
      },
      language: req.body.language,
      args: req.body.testCases,
    };
    console.log(requestBody);
    const response = await axios.post(`${engineUrl}/api/v1/execute`, requestBody);

    // Check the execution result and update the battle state accordingly
    if (response.data.run && response.data.run.code === 0) {
      const progress = calculateProgress(response.data.run.output);
      const colToUpdate = req.body.userNumber === 'p1' ? 'user1_progress' : 'user2_progress';
      if (progress === 100) {
        const dataToUpdate = {
          [colToUpdate]: progress,
          battle_active: false,
          battle_winner: req.body.userId
        };
        const { data } = await updateBattleState(req.body.battleId, dataToUpdate);
        // Notify the opponent about the progress
        const opponentId = req.body.userNumber === 'p1' ? data[0]?.user2_id : data[0]?.user1_id;
        const opponentSocket = getSocketFromUserId(opponentId);
        if (opponentSocket) {
          opponentSocket.emit('message', { message: progress, action: 'opponent progress' });
        }
        res.send({ ...response.data, progress, gameOver: true });
      } else {
        const dataToUpdate = { [colToUpdate]: progress };
        // Update battle state in the database
        const { data } = await updateBattleState(req.body.battleId, dataToUpdate);
        // Notify the opponent about the progress
        const opponentId = req.body.userNumber === 'p1' ? data[0]?.user2_id : data[0]?.user1_id;
        const opponentSocket = getSocketFromUserId(opponentId);
        if (opponentSocket) {
          opponentSocket.emit('message', { message: progress, action: 'opponent progress' });
        }
        res.send({ ...response.data, progress });
      }
    } else if (response.data.run.code === 1) {
      const progress = 0;
      const colToUpdate = req.body.userNumber === 'p1' ? 'user1_progress' : 'user2_progress';
      const dataToUpdate = { [colToUpdate]: progress };

      // Update battle state in the database
      const { data } = await updateBattleState(req.body.battleId, dataToUpdate);

      // Notify the opponent about the progress
      const opponentId = req.body.userNumber === 'p1' ? data[0]?.user2_id : data[0]?.user1_id;
      const opponentSocket = getSocketFromUserId(opponentId);
      if (opponentSocket) {
        opponentSocket.emit('message', { message: progress, action: 'opponent progress' });
      }
      res.send({ ...response.data, progress });
    }
  } catch (error) {
    console.error('Error executing code:', error);
    res.status(500).send('Failed to execute code');
  }
}

module.exports = {
  executeCode,
};
