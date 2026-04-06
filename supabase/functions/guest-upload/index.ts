// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"

type GuestUploadRequest = {
  event_code: string
  pin: string
  file_ext: string
  captured_at?: string
}

type GuestUploadResponse = {
  photo_id: string
  storage_path: string
  signed_url: string
  token: string
  status: "pending" | "approved"
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

    const body = (await req.json()) as GuestUploadRequest
    const eventCode = body?.event_code?.trim()
    const pin = body?.pin?.trim()
    const fileExt = body?.file_ext?.trim().toLowerCase()
    const capturedAt =
      typeof body?.captured_at === "string" && body.captured_at.trim().length > 0
        ? body.captured_at.trim()
        : null

    if (!eventCode || !pin || !fileExt) {
      return new Response(
        JSON.stringify({ error: "event_code, pin, and file_ext are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const allowedExts = new Set(["jpg", "jpeg", "png", "heic", "webp"])
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
      .select("id, moderation_required")
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

    const photoId = crypto.randomUUID()
    const storagePath = `events/${event.id}/${photoId}/original.${fileExt}`
    const status = event.moderation_required ? "pending" : "approved"

    const { error: insertError } = await supabase.from("photos").insert({
      id: photoId,
      event_id: event.id,
      storage_path: storagePath,
      status,
      captured_at: capturedAt,
      capture_source: capturedAt ? "exif" : "upload",
      is_visible: true,
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

    const response: GuestUploadResponse = {
      photo_id: photoId,
      storage_path: storagePath,
      signed_url: signed.signedUrl,
      token: signed.token,
      status,
    }

    return new Response(JSON.stringify(response), {
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
