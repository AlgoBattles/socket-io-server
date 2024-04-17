const dbService = require('../services/database'); // Import your database service

async function handleStartBattle(players, inviteId) {
  // console.log('starting battle');

  // first determine algo and fetch template code
  const algoNum = Math.floor(Math.random() * 8);
  const { data: algoData, error: algoError } = await dbService.fetchAlgorithm(algoNum);

  if (algoError) {
    console.log('error fetching algorithm:', algoError);
    return false;
  }

  if (algoData && algoData.length >= 1) {
    // then add battle to db
    const battleDetails = {
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
      battle_active: true,
    };

    const { data: battleData, error: battleError } = await dbService.addNewBattle(battleDetails);


    if (battleError) {
      console.log('error creating battle:', battleError);
      return false;
    }

    if (battleData && battleData.length >= 1) {
      console.log('battle added to db');
      const battleInfo = {
        battle_id: battleData[0].id,
        algo_id: battleData[0].algo_id,
      };

      // delete invite
      await dbService.updateBattleInvites(inviteId, { deleted: true }); // Assuming a soft delete
      return battleInfo;
    } else {
      console.log('No data returned when adding battle');
      return false;
    }
  } else {
    console.log('No algorithm data found');
    return false;
  }
}

module.exports = handleStartBattle
