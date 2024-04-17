const { createClient } = require('@supabase/supabase-js');
const { supabaseUrl, supabaseKey } = require('../config');

const supabase = createClient(supabaseUrl, supabaseKey);

async function fetchAlgorithm(id) {
  const { data, error } = await supabase
    .from('algos')
    .select('*')
    .eq('id', id);
  return { data, error };
}

async function addNewBattle(details) {
  const { data, error } = await supabase
    .from('battle_state')
    .insert([details])
    .select();
  return { data, error };
}

async function getBattleState(room) {
  const { data, error } = await supabase
    .from('battle_state')
    .select()
    .eq('id', room.slice(1));
  return { data, error };
}

async function updateBattleState(id, updates) {
  const { data, error } = await supabase
    .from('battle_state')
    .update(updates)
    .eq('id', id)
    .select();
  return { data, error };
}

async function getBattleInvites(id) {
  const { data, error } = await supabase
    .from('battle_invites')
    .select()
    .eq('id', id);
  return { data, error };
}

async function updateBattleInvites(id, updates) {
  const { data, error } = await supabase
    .from('battle_invites')
    .update(updates)
    .eq('id', id)
    .select();
  return { data, error };
}

async function deleteBattleInvite(id) {
  const { data, error } = await supabase
    .from('battle_invites')
    .delete()
    .eq('id', id);

  return { data, error };
}

module.exports = { fetchAlgorithm, addNewBattle, getBattleState, updateBattleState, getBattleInvites, updateBattleInvites, deleteBattleInvite };
