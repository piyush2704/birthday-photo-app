import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"

type JoinEventRequest = {
  event_code: string
  pin: string
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const authHeader = req.headers.get("Authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization bearer token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const token = authHeader.replace("Bearer ", "")

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData?.user) {
      return new Response(
        JSON.stringify({ error: "Invalid auth token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const body = (await req.json()) as JoinEventRequest
    const eventCode = body?.event_code?.trim()
    const pin = body?.pin?.trim()
    if (!eventCode || !pin) {
      return new Response(
        JSON.stringify({ error: "event_code and pin are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id")
      .eq("public_code", eventCode)
      .maybeSingle()

    if (eventError) {
      return new Response(
        JSON.stringify({ error: "Failed to lookup event" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    if (!event) {
      return new Response(
        JSON.stringify({ error: "Invalid event code" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const { data: pinCheck, error: pinError } = await supabase.rpc("verify_event_pin", {
      p_event_id: event.id,
      p_pin: pin,
    })

    if (pinError || pinCheck !== true) {
      return new Response(
        JSON.stringify({ error: "Invalid PIN" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const { error: insertError } = await supabase
      .from("event_members")
      .upsert(
        { event_id: event.id, user_id: authData.user.id, role: "guest" },
        { onConflict: "event_id,user_id" },
      )

    if (insertError) {
      return new Response(
        JSON.stringify({ error: "Failed to join event" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    return new Response(JSON.stringify({ event_id: event.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (_err) {
    return new Response(
      JSON.stringify({ error: "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }
})
