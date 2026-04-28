import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"

type GuestGalleryRequest = {
  event_code: string
  pin: string
}

function getMediaType(storagePath: string) {
  const extension = storagePath.split(".").pop()?.toLowerCase() ?? ""
  return ["mp4", "mov", "m4v", "webm", "ogg", "ogv"].includes(extension) ? "video" : "image"
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
      .select("id, uploader_display_name, caption, storage_path, created_at, captured_at, is_visible")
      .eq("event_id", event.id)
      .eq("status", "approved")
      .eq("is_visible", true)
      .order("captured_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(96)

    if (photoError) {
      return new Response(
        JSON.stringify({ error: "Failed to load gallery" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const urlMap = new Map<string, { thumbUrl: string | null; fullUrl: string | null }>()
    for (const photo of photos || []) {
      const mediaType = getMediaType(photo.storage_path)
      const fullResult = await supabase.storage.from("event-photos").createSignedUrl(photo.storage_path, 3600)

      if (fullResult.error) {
        continue
      }

      const thumbResult =
        mediaType === "image"
          ? await supabase.storage.from("event-photos").createSignedUrl(photo.storage_path, 3600, {
              transform: {
                width: 720,
                height: 720,
                resize: "cover",
                quality: 72,
              },
            })
          : { data: { signedUrl: fullResult.data?.signedUrl ?? null } }

      urlMap.set(photo.storage_path, {
        thumbUrl: thumbResult.data?.signedUrl ?? fullResult.data?.signedUrl ?? null,
        fullUrl: fullResult.data?.signedUrl ?? null,
      })
    }

    return new Response(
      JSON.stringify({
        event,
        photos: (photos || [])
          .filter((photo) => urlMap.has(photo.storage_path))
          .map((photo) => ({
            id: photo.id,
            title: photo.caption || "Party photo",
            subtitle: `Captured ${new Date(photo.captured_at ?? photo.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })}`,
            status: "approved",
            image_url: urlMap.get(photo.storage_path)?.thumbUrl ?? null,
            full_image_url: urlMap.get(photo.storage_path)?.fullUrl ?? null,
            media_type: getMediaType(photo.storage_path),
            captured_at: photo.captured_at ?? photo.created_at,
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
