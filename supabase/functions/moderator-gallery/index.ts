import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"

type ModeratorGalleryRequest = {
  event_code: string
  moderator_pin: string
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

    const body = (await req.json()) as ModeratorGalleryRequest
    const eventCode = body?.event_code?.trim().toUpperCase()
    const moderatorPin = body?.moderator_pin?.trim()

    if (!eventCode || !moderatorPin) {
      return new Response(
        JSON.stringify({ error: "event_code and moderator_pin are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, title, public_code, moderation_required, created_at, moderator_pin_hash")
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

    if (!event.moderator_pin_hash) {
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

    const { data: photos, error: photoError } = await supabase
      .from("photos")
      .select("id, uploader_display_name, caption, storage_path, created_at, status")
      .eq("event_id", event.id)
      .order("created_at", { ascending: false })
      .limit(200)

    if (photoError) {
      return new Response(
        JSON.stringify({ error: "Failed to load uploaded photos" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const urlMap = new Map<string, { thumbUrl: string | null; fullUrl: string | null }>()
    for (const photo of photos || []) {
      const fullResult = await supabase.storage.from("event-photos").createSignedUrl(photo.storage_path, 3600)

      if (fullResult.error) {
        return new Response(
          JSON.stringify({ error: "Failed to prepare image URLs" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        )
      }

      const thumbResult = await supabase.storage.from("event-photos").createSignedUrl(photo.storage_path, 3600, {
        transform: {
          width: 480,
          height: 480,
          resize: "cover",
          quality: 72,
        },
      })

      urlMap.set(photo.storage_path, {
        thumbUrl: thumbResult.data?.signedUrl ?? fullResult.data?.signedUrl ?? null,
        fullUrl: fullResult.data?.signedUrl ?? null,
      })
    }

    return new Response(
      JSON.stringify({
        event: {
          id: event.id,
          title: event.title,
          public_code: event.public_code,
          moderation_required: event.moderation_required,
          created_at: event.created_at,
        },
        photos: (photos || []).map((photo) => ({
          id: photo.id,
          title: photo.caption || "Birthday upload",
          subtitle: `Shared by ${photo.uploader_display_name || "Guest"}`,
          status: photo.status,
          image_url: urlMap.get(photo.storage_path)?.thumbUrl ?? null,
          full_image_url: urlMap.get(photo.storage_path)?.fullUrl ?? null,
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
