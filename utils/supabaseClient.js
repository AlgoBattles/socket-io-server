const { createClient } = require('@supabase/supabase-js');
const { supabaseUrl, supabaseKey } = require('../config/index');

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
