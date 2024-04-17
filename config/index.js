require('dotenv').config();

console.log('url is', process.env.SUPABASE_URL);

module.exports = {
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_KEY,
  engineUrl: process.env.ENGINE_URL || 'http://localhost:8080',
  apiKey: process.env.API_KEY || 'default_api_key',
  port: process.env.PORT || 10000,
  corsOptions: {
    origin: ['https://www.algobattles.xyz', 'http://localhost:3000'],
    methods: ['GET', 'POST'],
    allowedHeaders: '*',
    credentials: true,
  },
};
