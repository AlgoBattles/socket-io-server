const express = require('express');
const { Server } = require('socket.io');
const { createServer } = require('node:http');
const cors = require('cors');
const axios = require('axios');
const isEqual = require('lodash/isEqual');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://jdrrftsbeohpznqghpxr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkcnJmdHNiZW9ocHpucWdocHhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2OTM0OTQ5NzIsImV4cCI6MjAwOTA3MDk3Mn0.3ZXOev203HqvH3X7UWE_B9X7NGYu0Z6tlmFyAi0ii4k';
const supabase = createClient(supabaseUrl, supabaseKey);

const port = 10000;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const API_KEY = 'a3f1b7b6cde1234567890abcdef1234567890abcd';
// Middleware for API key check
// function checkApiKey(req, res, next) {
//   const authHeader = req?.headers?.authorization;

//   if (!authHeader || authHeader !== API_KEY) {
//     return res.status(401).json({ message: 'Unauthorized' });
//   }
//   next();
// }

// Add API key check middleware here
// app.use(checkApiKey);

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'https://algobattles.xyz',
    methods: ['GET', 'POST'],
    allowedHeaders: '*',
    credentials: true,
  },
});

io.use((socket, next) => {
  const authHeader = socket?.handshake?.query?.authorization;
  if (!authHeader || authHeader !== API_KEY) {
    return next(new Error('Unauthorized'));
  }
  next();
});

const socketToUserIdMap = new Map();

const userToSocketMap = new Map();

async function handleStartBattle(players, inviteId) {
  console.log('starting battle')

  // first determine algo and fetch template code
  const algoNum = Math.floor(Math.random() * 8)
  const { data: algoData, error: algoError } = await supabase
    .from('algos')
    .select('*')
    .eq('id', algoNum)

  if (algoError) {
    console.log('error fetching algorithm')
  } else if (algoData && algoData.length >= 1) {
    // then add battle to db
    const { data: battleData, error: battleError } = await supabase
      .from('battle_state')
      .insert(
        {
          algo_id: algoNum,
          algo_prompt: algoData[0].prompt,
          func_name: algoData[0].func_name,
          template_code_js: algoData[0].template_code_js,
          template_code_python: algoData[0].template_code_python,
          test_cases_json: algoData[0].test_cases_json,
          user1_id: players[0],
          user2_id: players[1],
          user1_code: null,
          user2_code: null,
          user1_progress: 0,
          user2_progress: 0,
          battle_active: true
        },
      )
      .select()
    if (battleData && battleData.length >= 1) {
      console.log('battle added to db')
      const battleInfo = {
        battle_id: battleData[0].id,
        algo_id: battleData[0].algo_id,
      };
        // delete invite
      const { data: inviteData } = await supabase
        .from('battle_invites')
        .delete()
        .eq('id', inviteId)
        .select();
        // console.log(inviteData)
      return battleInfo
    }
    else if (error) {
      // console.log('error creating battle')
      // console.log(error)
      return false
  }  
  }
}



io.on('connection', (socket) => {
  // join room
  socket.join(socket.handshake.query.roomId); 

  // map the sockets to user ids
  const userId = socket.handshake.query.userId;
  socketToUserIdMap.set(socket.id, userId);
  userToSocketMap.set(userId, socket.id);

  socket.on('message', async ({ message, room, action }) => {
    // console.log('message: ' + message);

    if (action === 'player joined lobby' || action === 'player left lobby') {
      // console.log('message: ' + message);
      socket.broadcast.to(room).emit('message', { message, action });
    } else if (action === 'player code') {
      socket.broadcast.to(room).emit('message', { message, action });

      const { data: battleData, error: battleError } = await supabase
        .from('battle_state')
        .select()
        .eq('id', room.slice(1))
      const userNumber = socketToUserIdMap.get(socket.id) === battleData[0].user1_id ? 'user1' : 'user2'
      const updateData = {
        [userNumber + '_code']: message,
      };
      const { data, error } = await supabase
        .from('battle_state')
        .update(updateData)
        .eq('id', room.slice(1))
        .select();
    } else if (action === 'player ready') {
      socket.broadcast.to(room).emit('message', { message, action });
      const { data: inviteData, error: inviteError } = await supabase
        .from('battle_invites')
        .select()
        .eq('id', room.slice(1))

      if (inviteData && inviteData.length >= 1 
        && socketToUserIdMap.get(socket.id) === inviteData[0].sender_id) {
        const { data, error } = await supabase
          .from('battle_invites')
          .update(
            {
              sender_ready: true,
            },
          )
          .eq('id', room.slice(1))
          .select();
        if (data && data.length >= 1) {
          if (data[0].sender_ready && data[0].recipient_ready) {
            const players = [data[0].sender_id, data[0].recipient_id];
            const battleInfo = await handleStartBattle(players, room.slice(1));
            if (battleInfo) {
              // console.log('battle info: ', battleInfo)
              io.to(room).emit('message', { message: battleInfo, action: 'start battle' });
            }
          }
        }
      } else if (inviteData && inviteData.length >= 1
        && socketToUserIdMap.get(socket.id) === inviteData[0].recipient_id) {
        const { data, error } = await supabase
          .from('battle_invites')
          .update(
            {
              recipient_ready: true,
            }
          )
          .eq('id', room.slice(1))
          .select()
        if (data && data.length >= 1) {
          if (data[0].sender_ready && data[0].recipient_ready) {
            const players = [data[0].sender_id, data[0].recipient_id]
            const battleInfo = await handleStartBattle(players, room.slice(1))
            if (battleInfo) {
              io.to(room).emit('message', {message: battleInfo, action: 'start battle'});
            }
          }
        }
      } else {
        console.log('invite data is', inviteData, inviteError)
      }
    }
  });

  socket.on('disconnect', () => {
  // console.log('user disconnected');
  });
});

app.get('/', (req, res) => {
  res.send('Hello World!')
});

app.post('/execute', async (req, res) => {
  // fetch to code execution engine
  axios.post('https://v2engineapi.fly.dev/api/v1/execute', {
    code: {
      content: req.body.code,
      name: req.body.funcName,
    },
    language: req.body.language,
    args: req.body.testCases,
  })
    .then(async (response) => {
      // if code doesn't work
      if (response.data.run.code === 1) {
        const colToUpdate = req.body.userNumber === 'p1' ? 'user1_progress' : 'user2_progress'
        const dataToUpdate = {
          [colToUpdate]: 0,
        };
        const { data, error } = await supabase
          .from('battle_state')
          .update(dataToUpdate)
          .eq('id', req.body.battleId)
          .select()
        // emit results to opponent
        const opponentId = req.body.userNumber === 'p1' ? data[0].user2_id : data[0].user1_id;
        const opponentSocket = io.sockets.sockets.get(userToSocketMap.get(opponentId))
        opponentSocket && opponentSocket.emit('message', { message: 0, action: 'opponent progress' });
        res.send(response.data)
      } else if (response.data.run.code === 0) {
        // calculate progress
        const executionResults = response.data.run.output.replace(/'/g, '"').replace(/undefined/g, 'null');
        const executionResultsArr = JSON.parse(executionResults)
        let passed = 0;
        executionResultsArr && executionResultsArr.forEach((result, index) => {
          // console.log('result: ', result)
          if (isEqual(result[0], result[1])) {
            passed += 1;
          }
        });
        const progress = Math.floor((passed / executionResultsArr.length) * 100)
        console.log('progress: ', progress);

        // check for winner
        if (progress < 100) {
          // save progress to db
          const colToUpdate = req.body.userNumber === 'p1' ? 'user1_progress' : 'user2_progress'
          const dataToUpdate = {
            [colToUpdate]: progress,
          }
          const { data, error } = await supabase
            .from('battle_state')
            .update(dataToUpdate)
            .eq('id', req.body.battleId)
            .select();
          // emit results to opponent
          const opponentId = req.body.userNumber === 'p1' ? data[0]?.user2_id : data[0]?.user1_id;
          const opponentSocket = io.sockets.sockets.get(userToSocketMap.get(opponentId));
          opponentSocket && opponentSocket.emit('message', { message: progress, action: 'opponent progress' });

          res.send({ ...response.data, progress });
        }
        else if (progress === 100) {
          // save progress to db
          const colToUpdate = req.body.userNumber === 'p1' ? 'user1_progress' : 'user2_progress'
          const dataToUpdate = {
            [colToUpdate]: progress,
            battle_active: false,
            battle_winner: req.body.userId
          }
          const { data, error } = await supabase
            .from('battle_state')
            .update(dataToUpdate)
            .eq('id', req.body.battleId)
            .select();
          if (error) {
            console.log(error);
          }
          else if (data && data.length >= 1) {
            // emit results to opponent
            const opponentId = req.body.userNumber === 'p1' ? data[0].user2_id : data[0].user1_id;
            const opponentSocket = io.sockets.sockets.get(userToSocketMap.get(opponentId));
            opponentSocket && opponentSocket.emit('message', { message: progress, action: 'opponent progress' });
            opponentSocket && opponentSocket.emit('message', { message: 'sad', action: 'game over' });

            res.send({ ...response.data, progress, gameOver: true });
          }
        }
      }
    });
  // io.emit('message', {message: res.locals.results, action: 'opponent progress'});
  // res.send(res.locals.results)
});

app.use((err, req, res, next) => {
  const defaultErr = {
    log: 'Express error handler caught unknown middleware error',
    status: 500,
    message: {
      err: 'An error occurred',
    },
  };
  const errorObj = { ...defaultErr, ...err };
  console.log(errorObj.log);
  return res.status(errorObj.status).json(errorObj.message);
});

server.listen(port, () => {
  console.log(`AlgoBattles socket server listening on port ${port}`);
});
