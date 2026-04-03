import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"

type ModeratorDeleteRequest = {
  event_code: string
  moderator_pin: string
  photo_id: string
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

    const body = (await req.json()) as ModeratorDeleteRequest
    const eventCode = body?.event_code?.trim().toUpperCase()
    const moderatorPin = body?.moderator_pin?.trim()
    const photoId = body?.photo_id?.trim()

    if (!eventCode || !moderatorPin || !photoId) {
      return new Response(
        JSON.stringify({ error: "event_code, moderator_pin, and photo_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, moderator_pin_hash")
      .eq("public_code", eventCode)
      .maybeSingle()

    if (eventError) {
      return new Response(
        JSON.stringify({ error: "Failed to lookup event" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    if (!event || !event.moderator_pin_hash) {
      return new Response(
        JSON.stringify({ error: "Moderator PIN is not configured for this event yet" }),
        { status: 412, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const { data: pinCheck, error: pinError } = await supabase.rpc("verify_moderator_pin", {
      p_event_id: event.id,
      p_pin: moderatorPin,
    })

    if (pinError || pinCheck !== true) {
      return new Response(
        JSON.stringify({ error: "Invalid moderator PIN" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const { data: photo, error: photoError } = await supabase
      .from("photos")
      .select("id, event_id, storage_path")
      .eq("id", photoId)
      .eq("event_id", event.id)
      .maybeSingle()

    if (photoError) {
      return new Response(
        JSON.stringify({ error: "Failed to load photo" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    if (!photo) {
      return new Response(
        JSON.stringify({ error: "Photo not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const { error: storageError } = await supabase.storage.from("event-photos").remove([photo.storage_path])
    if (storageError) {
      return new Response(
        JSON.stringify({ error: "Failed to delete image from storage" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const { error: deleteError } = await supabase.from("photos").delete().eq("id", photo.id)
    if (deleteError) {
      return new Response(
        JSON.stringify({ error: "Failed to delete photo record" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    return new Response(
      JSON.stringify({ photo_id: photo.id, deleted: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  } catch (_err) {
    return new Response(
      JSON.stringify({ error: "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }
})
