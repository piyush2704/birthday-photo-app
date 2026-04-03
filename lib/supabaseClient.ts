import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const hasSupabaseClientEnv = Boolean(supabaseUrl && supabasePublishableKey);

if (!hasSupabaseClientEnv) {
  // eslint-disable-next-line no-console
  console.warn(
    "Missing NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  );
}

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient() {
  if (!hasSupabaseClientEnv || !supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
  }

  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }

  return supabaseClient;
}

export const functionsBaseUrl = supabaseUrl
  ? `${supabaseUrl.replace(/\/$/, "")}/functions/v1`
  : "";
