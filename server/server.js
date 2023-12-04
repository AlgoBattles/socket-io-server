const express = require('express');
const { Server } = require("socket.io");
const { createServer } = require('node:http');
const cron = require('node-cron');
const cors = require('cors');
const axios = require('axios');
const isEqual = require('lodash/isEqual');

const { createClient } = require('@supabase/supabase-js');
const { stringify } = require('node:querystring');
const supabaseUrl = 'https://jdrrftsbeohpznqghpxr.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkcnJmdHNiZW9ocHpucWdocHhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2OTM0OTQ5NzIsImV4cCI6MjAwOTA3MDk3Mn0.3ZXOev203HqvH3X7UWE_B9X7NGYu0Z6tlmFyAi0ii4k'
const supabase = createClient(supabaseUrl, supabaseKey)


const port = 8081;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }))

const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"],
        allowedHeaders: ["my-custom-header"],
        credentials: true
    }
});

const socketToUserIdMap = new Map();

const userToSocketMap = new Map();

io.on('connection', (socket) => {

    // join room
    socket.join(socket.handshake.query.roomId); 

    // map the sockets to user ids
    const userId = socket.handshake.query.userId;
    // console.log('userId is', userId)
    // console.log('socket id is', socket.id)
    socketToUserIdMap.set(socket.id, userId);
    userToSocketMap.set(userId, socket.id);

    socket.on('message', async ({message, room, action}) => {
        // console.log('message: ' + message);

        if (action === 'player joined lobby' || action === 'player left lobby') {
            console.log('message: ' + message);
            socket.broadcast.to(room).emit('message', {message: message, action: action});
        }

        else if (action === 'player code') {
            const { data: battleData, error: battleError } = await supabase
                .from('battle_state')
                .select()
                .eq('id', room.slice(1,3))
            
            const userNumber = socketToUserIdMap.get(socket.id) === battleData[0].user1_id ? 'user1' : 'user2'
            const updateData = {
                [userNumber + '_code']: message,
            }
            socket.broadcast.to(room).emit('message', {message: message, action: action});
            const { data, error } = await supabase
                .from('battle_state')
                .update(updateData)
                .eq('id', room.slice(1,3))
                .select()

            // console.log(data)
            
        }
        else if (action === 'player ready') {
            socket.broadcast.to(room).emit('message', {message: message, action: action});
            const { data: inviteData, error: inviteError } = await supabase
                .from('battle_invites')
                .select()
                .eq('id', room.slice(1,3))

            if (socketToUserIdMap.get(socket.id) === inviteData[0].sender_id){
                const { data, error } = await supabase
                    .from('battle_invites')
                    .update(
                        {
                            sender_ready: true,
                        }
                    )
                    .eq('id', room.slice(1,3))
                    .select()
                    if (data && data.length >= 1) {
                        if (data[0].sender_ready && data[0].recipient_ready) {
                            const players = [data[0].sender_id, data[0].recipient_id]
                            const battleInfo = await handleStartBattle(players, room.slice(1,3))
                            if (battleInfo) {
                                // console.log('battle info: ', battleInfo)
                                io.to(room).emit('message', {message: battleInfo, action: 'start battle'});
                            }
                        }
                    }
            }
            else if (socketToUserIdMap.get(socket.id) === inviteData[0].recipient_id){
                const { data, error } = await supabase
                    .from('battle_invites')
                    .update(
                        {
                            recipient_ready: true,
                        }
                    )
                    .eq('id', room.slice(1,3))
                    .select()
                    if (data && data.length >= 1) {
                        if (data[0].sender_ready && data[0].recipient_ready) {
                            const players = [data[0].sender_id, data[0].recipient_id]
                            const battleInfo = await handleStartBattle(players, room.slice(1,3))
                            if (battleInfo) {
                                io.to(room).emit('message', {message: battleInfo, action: 'start battle'});
                            }
                        }
                    }
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

app.post('/execute',  async (req, res) => {

    // fetch to code execution engine
    axios.post('http://localhost:8080/api/v1/execute', {
        code: {
            content: req.body.code,
            name: req.body.funcName
        },
        language: req.body.language,
        args: req.body.testCases
        // stdin: req.body.stdin,
        // versionIndex: req.body.versionIndex,
        // clientId: req.body.clientId,
        // clientSecret: req.body.clientSecret
    })
    .then(async (response) => {
        
        // if code doesn't work
        if (response.data.run.code === 1) {
            const colToUpdate = req.body.userNumber === 'p1' ? 'user1_progress' : 'user2_progress'
            const dataToUpdate = {
                [colToUpdate]: 0,
            }
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

        }
        else if (response.data.run.code === 0) {

            // calculate progress
            const executionResults = response.data.run.output.replace(/'/g, '"').replace(/undefined/g, 'null');
            const executionResultsArr = JSON.parse(executionResults)
            let passed = 0
            executionResultsArr && executionResultsArr.forEach((result, index) => {
                console.log('result: ', result)
                if (isEqual(result[0], result[1])) {
                    passed++
                }
            })
            const progress = Math.floor((passed / executionResultsArr.length) * 100)
            console.log('progress: ', progress)
    
            // save progress to db
            const colToUpdate = req.body.userNumber === 'p1' ? 'user1_progress' : 'user2_progress'
            const dataToUpdate = {
                [colToUpdate]: progress,
            }
            const { data, error } = await supabase
                .from('battle_state')
                .update(dataToUpdate)
                .eq('id', req.body.battleId)
                .select()
            
            // emit results to opponent
            const opponentId = req.body.userNumber === 'p1' ? data[0].user2_id : data[0].user1_id;
            const opponentSocket = io.sockets.sockets.get(userToSocketMap.get(opponentId))
            opponentSocket && opponentSocket.emit('message', { message: progress, action: 'opponent progress' });

            res.send({...response.data, progress: progress})
        }    



         
    })
    

    

    // io.emit('message', {message: res.locals.results, action: 'opponent progress'});
    // res.send(res.locals.results)
})

// cron.schedule('*/6 * * * * *', () => {
//     console.log('Running a job every 10 seconds');
//     // delete all pods that haven't run code in the last hour

// });


app.use((err, req, res, next) => {
    const defaultErr = {
        log: 'Express error handler caught unknown middleware error',
        status: 500,
        message: {
            err: 'An error occurred'
        }
    };
    const errorObj = Object.assign({}, defaultErr, err);
    console.log(errorObj.log);
    return res.status(errorObj.status).json(errorObj.message);
});

server.listen(port, () => {
    console.log(`AlgoBattles socket server listening on port ${port}`);
});



async function handleStartBattle(players, inviteId) {

    // first determine algo and fetch template code
    const algoNum = Math.floor(Math.random() * 8)
    const { data: algoData, error: algoError } = await supabase
            .from('algos')
            .select('*')
            .eq('id', algoNum)

    if (algoError) {
      console.log('error fetching algorithm')
    }

    else if (algoData && algoData.length >= 1) {
        // then add battle to db
        const { data: battleData, error: battleError } = await supabase
            .from('battle_state')
            .insert(
                {
                    algo_id: algoNum,
                    algo_prompt: algoData[0].prompt,
                    func_name: algoData[0].func_name,
                    template_code: algoData[0].template_code,
                    test_cases_json: algoData[0].test_cases_json,
                    user1_id: players[0],
                    user2_id: players[1],
                    user1_code: algoData[0].template_code,
                    user2_code: algoData[0].template_code,
                    user1_progress: 0,
                    user2_progress: 0,
                    battle_active: true
                }
            )
            .select()
        if (battleData && battleData.length >= 1) {
            console.log('battle added to db')
            const battleInfo = {
                battle_id: battleData[0].id,
                algo_id: battleData[0].algo_id,
            }
            // delete invite
            const { data: inviteData, error: inviteError } = await supabase
            .from ('battle_invites')
            .delete()
            .eq('id', inviteId)
            .select() 

        return battleInfo  
        }
        else if (error) {
          console.log('error creating battle')
          console.log(error)
          return false
      }  
  }
}