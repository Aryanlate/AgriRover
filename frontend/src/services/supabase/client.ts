/**
 * Supabase client for reading ESP32-CAM captures from the cloud.
 *
 * The publishable (anon) key is safe to ship in the browser bundle:
 * it is designed to be public and is constrained by Row Level Security.
 * NEVER place the service_role key here.
 *
 * Configure via frontend/.env:
 *   VITE_SUPABASE_URL=https://<project>.supabase.co
 *   VITE_SUPABASE_ANON_KEY=sb_publishable_...
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? 'https://dpdvijdxupwcqlyspzzi.supabase.co';

const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_h9y6UjJykFAkr3o8mDHLKQ_UlVeSUM_';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
