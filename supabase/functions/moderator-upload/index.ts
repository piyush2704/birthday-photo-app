import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"

type ModeratorUploadRequest = {
  event_code: string
  moderator_pin: string
  file_ext: string
  captured_at?: string
  timeline_section_id?: string | null
  timeline_sort_order?: number
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

    const body = (await req.json()) as ModeratorUploadRequest
    const eventCode = body?.event_code?.trim().toUpperCase()
    const moderatorPin = body?.moderator_pin?.trim()
    const fileExt = body?.file_ext?.trim().toLowerCase()
    const capturedAt =
      typeof body?.captured_at === "string" && body.captured_at.trim().length > 0
        ? body.captured_at.trim()
        : null
    const timelineSectionId = body?.timeline_section_id?.trim() || null
    const timelineSortOrder = Number(body?.timeline_sort_order || 0)

    if (!eventCode || !moderatorPin || !fileExt) {
      return new Response(
        JSON.stringify({ error: "event_code, moderator_pin, and file_ext are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const allowedExts = new Set(["jpg", "jpeg", "png", "heic", "webp", "mp4", "mov", "m4v", "webm", "ogg", "ogv"])
    if (!allowedExts.has(fileExt)) {
      return new Response(
        JSON.stringify({ error: "Unsupported file_ext" }),
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

    if (timelineSectionId) {
      const { data: section, error: sectionError } = await supabase
        .from("event_story_sections")
        .select("id")
        .eq("id", timelineSectionId)
        .eq("event_id", event.id)
        .maybeSingle()
      if (sectionError || !section) {
        return new Response(
          JSON.stringify({ error: "Timeline section not found for this event" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        )
      }
    }

    const photoId = crypto.randomUUID()
    const storagePath = `events/${event.id}/${photoId}/original.${fileExt}`

    const { error: insertError } = await supabase.from("photos").insert({
      id: photoId,
      event_id: event.id,
      storage_path: storagePath,
      status: "approved",
      captured_at: capturedAt,
      capture_source: capturedAt ? "exif" : "upload",
      is_visible: true,
      timeline_section_id: timelineSectionId,
      timeline_sort_order: timelineSortOrder,
    })

    if (insertError) {
      return new Response(
        JSON.stringify({ error: "Failed to create photo record" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const { data: signed, error: signedError } = await supabase.storage
      .from("event-photos")
      .createSignedUploadUrl(storagePath)

    if (signedError || !signed) {
      return new Response(
        JSON.stringify({ error: "Failed to create signed upload URL" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    return new Response(
      JSON.stringify({
        photo_id: photoId,
        storage_path: storagePath,
        signed_url: signed.signedUrl,
        token: signed.token,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    )
  } catch (_err) {
    return new Response(
      JSON.stringify({ error: "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }
})
