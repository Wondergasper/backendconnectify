const { createClient } = require('@supabase/supabase-js');

let client = null;

function getSupabaseServiceClient() {
  if (client) {
    return client;
  }

  let supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.');
  }

  // Ensure URL is properly formatted, stripping trailing slashes or handling copy-paste errors
  supabaseUrl = supabaseUrl.trim().replace(/\/$/, '');
  
  if (!supabaseUrl.startsWith('http://') && !supabaseUrl.startsWith('https://')) {
      supabaseUrl = `https://${supabaseUrl}`;
  }

  client = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  return client;
}

module.exports = {
  getSupabaseClient: getSupabaseServiceClient,
  getSupabaseServiceClient
};
