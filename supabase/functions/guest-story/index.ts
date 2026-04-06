import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"

type GuestStoryRequest = {
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

    const body = (await req.json()) as GuestStoryRequest
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

    const [{ data: settings, error: settingsError }, { data: sections, error: sectionsError }] =
      await Promise.all([
        supabase
          .from("event_story_settings")
          .select("event_id, grouping, section_count, birth_date, cover_title, cover_subtitle, updated_at")
          .eq("event_id", event.id)
          .maybeSingle(),
        supabase
          .from("event_story_sections")
          .select("id, label, title, subtitle, story_text, sort_order, visible")
          .eq("event_id", event.id)
          .eq("visible", true)
          .order("sort_order", { ascending: true }),
      ])

    if (settingsError || sectionsError) {
      return new Response(
        JSON.stringify({ error: "Failed to load storybook" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const sectionIds = (sections || []).map((section) => section.id)

    const { data: photos, error: photosError } = await supabase
      .from("photos")
      .select("id, caption, storage_path, created_at, captured_at, timeline_section_id, timeline_sort_order, is_visible, status")
      .eq("event_id", event.id)
      .eq("status", "approved")
      .eq("is_visible", true)
      .in("timeline_section_id", sectionIds.length > 0 ? sectionIds : ["00000000-0000-0000-0000-000000000000"])
      .order("timeline_sort_order", { ascending: true })
      .order("captured_at", { ascending: true, nullsFirst: false })

    if (photosError) {
      return new Response(
        JSON.stringify({ error: "Failed to load story photos" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const urlMap = new Map<string, { thumbUrl: string | null; fullUrl: string | null }>()
    for (const photo of photos || []) {
      const [thumbResult, fullResult] = await Promise.all([
        supabase.storage.from("event-photos").createSignedUrl(photo.storage_path, 3600, {
          transform: {
            width: 960,
            height: 1200,
            resize: "cover",
            quality: 72,
          },
        }),
        supabase.storage.from("event-photos").createSignedUrl(photo.storage_path, 3600),
      ])

      if (thumbResult.error || fullResult.error) {
        return new Response(
          JSON.stringify({ error: "Failed to prepare story image URLs" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        )
      }

      urlMap.set(photo.storage_path, {
        thumbUrl: thumbResult.data?.signedUrl ?? null,
        fullUrl: fullResult.data?.signedUrl ?? null,
      })
    }

    const photoGroups = new Map<string, Array<Record<string, unknown>>>()
    for (const photo of photos || []) {
      const key = photo.timeline_section_id as string | null
      if (!key) continue
      if (!photoGroups.has(key)) {
        photoGroups.set(key, [])
      }
      photoGroups.get(key)?.push(photo as unknown as Record<string, unknown>)
    }

    return new Response(
      JSON.stringify({
        event,
        settings,
        sections: (sections || []).map((section) => ({
          ...section,
          photos: (photoGroups.get(section.id) || []).map((photo) => ({
            id: photo.id,
            title: photo.caption || section.title,
            subtitle: section.subtitle || "",
            status: "approved",
            image_url: urlMap.get(photo.storage_path as string)?.thumbUrl ?? null,
            full_image_url: urlMap.get(photo.storage_path as string)?.fullUrl ?? null,
            captured_at: (photo.captured_at as string | null) ?? (photo.created_at as string),
          })),
        })),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  } catch (_error) {
    return new Response(
      JSON.stringify({ error: "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }
})
