import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"

type GuestGalleryRequest = {
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

    const body = (await req.json()) as GuestGalleryRequest
    const eventCode = body?.event_code?.trim()
    const pin = body?.pin?.trim()

    if (!eventCode || !pin) {
      return new Response(
        JSON.stringify({ error: "event_code and pin are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, title, public_code, moderation_required, created_at")
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

    const { data: photos, error: photoError } = await supabase
      .from("photos")
      .select("id, uploader_display_name, caption, storage_path, created_at")
      .eq("event_id", event.id)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(48)

    if (photoError) {
      return new Response(
        JSON.stringify({ error: "Failed to load gallery" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const paths = (photos || []).map((photo) => photo.storage_path)
    const signedUrls =
      paths.length > 0
        ? await supabase.storage.from("event-photos").createSignedUrls(paths, 3600)
        : { data: [], error: null }

    if (signedUrls.error) {
      return new Response(
        JSON.stringify({ error: "Failed to prepare gallery image URLs" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const urlMap = new Map((signedUrls.data || []).map((entry) => [entry.path, entry.signedUrl]))

    return new Response(
      JSON.stringify({
        event,
        photos: (photos || []).map((photo) => ({
          id: photo.id,
          title: photo.caption || "Party photo",
          subtitle: `Shared by ${photo.uploader_display_name || "Guest"}`,
          status: "approved",
          image_url: urlMap.get(photo.storage_path) ?? null,
        })),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  } catch (_err) {
    return new Response(
      JSON.stringify({ error: "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }
})
