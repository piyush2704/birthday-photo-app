import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"

type CreateEventRequest = {
  title: string
  public_code: string
  pin: string
  moderation_required?: boolean
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

    const body = (await req.json()) as CreateEventRequest
    const title = body?.title?.trim()
    const publicCode = body?.public_code?.trim().toUpperCase()
    const pin = body?.pin?.trim()
    const moderationRequired = body?.moderation_required === true

    if (!title || !publicCode || !pin) {
      return new Response(
        JSON.stringify({ error: "title, public_code, and pin are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    if (!/^[A-Z0-9]{4,12}$/.test(publicCode)) {
      return new Response(
        JSON.stringify({ error: "public_code must be 4-12 uppercase letters or numbers" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    if (!/^\d{4,8}$/.test(pin)) {
      return new Response(
        JSON.stringify({ error: "PIN must be 4-8 digits" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const { data: hashData, error: hashError } = await supabase.rpc("hash_event_pin", {
      p_pin: pin,
    })

    if (hashError || !hashData) {
      return new Response(
        JSON.stringify({ error: "Failed to hash PIN" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const { data: event, error: eventError } = await supabase
      .from("events")
      .insert({
        title,
        public_code: publicCode,
        host_user_id: authData.user.id,
        moderation_required: moderationRequired,
        access_pin_hash: hashData,
        access_pin_set_at: new Date().toISOString(),
      })
      .select("id")
      .single()

    if (eventError || !event) {
      const message = eventError?.code === "23505" ? "That event code is already in use" : "Failed to create event"
      return new Response(
        JSON.stringify({ error: message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const { error: memberError } = await supabase.from("event_members").insert({
      event_id: event.id,
      user_id: authData.user.id,
      role: "owner",
    })

    if (memberError) {
      return new Response(
        JSON.stringify({ error: "Failed to create owner membership" }),
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
