import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"

type ModeratorStoryRequest = {
  event_code: string
  moderator_pin: string
  action?: "open" | "update_settings" | "sync_sections" | "update_section" | "reorder_section" | "update_photo"
  settings?: {
    grouping?: "month" | "year"
    section_count?: number
    birth_date?: string | null
    cover_title?: string
    cover_subtitle?: string
  }
  section_id?: string
  section?: {
    label?: string
    title?: string
    subtitle?: string | null
    story_text?: string | null
    sort_order?: number
    visible?: boolean
  }
  direction?: -1 | 1
  photo_id?: string
  photo?: {
    is_visible?: boolean
    timeline_section_id?: string | null
    timeline_sort_order?: number
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const monthLabels = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

const defaultBirthDates: Record<string, string> = {
  VAAYU: "2025-04-29",
}

function addMonths(dateString: string, count: number) {
  const date = new Date(dateString)
  date.setMonth(date.getMonth() + count)
  return date
}

function addDays(date: Date, count: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + count)
  return next
}

function formatMonthYear(date: Date) {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" })
}

function formatMonthDay(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function buildDefaultSectionSeed(index: number, grouping: "month" | "year", birthDate: string | null) {
  const order = index + 1

  if (grouping === "year") {
    return {
      label: `Year ${String(order).padStart(2, "0")}`,
      title: `Chapter ${order}`,
      subtitle: "A keepsake chapter waiting for photos",
      story_text: "Add a short note to shape this chapter of Vaayu's storybook.",
      sort_order: order,
      visible: true,
    }
  }

  if (birthDate) {
    const start = addMonths(birthDate, index)
    const end = addDays(addMonths(birthDate, index + 1), -1)
    return {
      label: `Month ${String(order).padStart(2, "0")}`,
      title: formatMonthYear(start),
      subtitle: `${formatMonthDay(start)} - ${formatMonthDay(end)}`,
      story_text:
        order === 1
          ? "The first little chapter of Vaayu's storybook begins here."
          : `Memories, milestones, and tiny details from month ${String(order).padStart(2, "0")} of Vaayu's first year.`,
      sort_order: order,
      visible: true,
    }
  }

  return {
    label: `Month ${String(order).padStart(2, "0")}`,
    title: monthLabels[(order - 1) % 12],
    subtitle: "A little chapter from Vaayu's first year",
    story_text: "Write a short memory, milestone, or note to frame the photos in this chapter.",
    sort_order: order,
    visible: true,
  }
}

async function authenticateModerator(supabase: ReturnType<typeof createClient>, eventCode: string, moderatorPin: string) {
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, title, public_code, moderation_required, created_at, moderator_pin_hash")
    .eq("public_code", eventCode)
    .maybeSingle()

  if (eventError) {
    throw new Error("Failed to lookup event")
  }
  if (!event || !event.moderator_pin_hash) {
    throw new Error("Moderator PIN is not configured for this event yet")
  }

  const { data: pinCheck, error: pinError } = await supabase.rpc("verify_moderator_pin", {
    p_event_id: event.id,
    p_pin: moderatorPin,
  })

  if (pinError || pinCheck !== true) {
    throw new Error("Invalid moderator PIN")
  }

  return {
    id: event.id,
    title: event.title,
    public_code: event.public_code,
    moderation_required: event.moderation_required,
    created_at: event.created_at,
  }
}

async function ensureSettingsRecord(
  supabase: ReturnType<typeof createClient>,
  event: { id: string; title: string; public_code: string; created_at: string },
) {
  const { data: existing, error: existingError } = await supabase
    .from("event_story_settings")
    .select("event_id, grouping, section_count, birth_date, cover_title, cover_subtitle, updated_at")
    .eq("event_id", event.id)
    .maybeSingle()

  if (existingError) {
    throw new Error("Failed to load story settings")
  }

  if (existing) {
    return existing
  }

  const payload = {
    event_id: event.id,
    grouping: "month",
    section_count: 12,
    birth_date: defaultBirthDates[event.public_code] || null,
    cover_title: `${event.title} Timeline`,
    cover_subtitle: "A chapter-by-chapter scrapbook from Vaayu's first year.",
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from("event_story_settings")
    .upsert(payload, { onConflict: "event_id" })
    .select("event_id, grouping, section_count, birth_date, cover_title, cover_subtitle, updated_at")
    .single()

  if (error) {
    throw new Error("Failed to create story settings")
  }

  return data
}

async function ensureSectionScaffold(
  supabase: ReturnType<typeof createClient>,
  eventId: string,
  settings: {
    grouping: "month" | "year"
    section_count: number
    birth_date: string | null
  },
) {
  const { data: sections, error: sectionsError } = await supabase
    .from("event_story_sections")
    .select("id")
    .eq("event_id", eventId)
    .limit(1)

  if (sectionsError) {
    throw new Error("Failed to inspect story sections")
  }

  if ((sections || []).length > 0) {
    return
  }

  const inserts = Array.from({ length: settings.section_count }, (_value, index) => ({
    event_id: eventId,
    ...buildDefaultSectionSeed(index, settings.grouping, settings.birth_date),
  }))

  const { error } = await supabase.from("event_story_sections").insert(inserts)
  if (error) {
    throw new Error("Failed to create story sections")
  }
}

async function syncSectionCount(
  supabase: ReturnType<typeof createClient>,
  eventId: string,
  settings: {
    grouping: "month" | "year"
    section_count: number
    birth_date: string | null
  },
) {
  const { data: sections, error } = await supabase
    .from("event_story_sections")
    .select("id, sort_order")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true })

  if (error) {
    throw new Error("Failed to sync story sections")
  }

  const current = sections || []

  if (current.length < settings.section_count) {
    const inserts = Array.from({ length: settings.section_count - current.length }, (_value, offset) => ({
      event_id: eventId,
      ...buildDefaultSectionSeed(current.length + offset, settings.grouping, settings.birth_date),
    }))
    const { error: insertError } = await supabase.from("event_story_sections").insert(inserts)
    if (insertError) {
      throw new Error("Failed to add more story sections")
    }
  }

  if (current.length > settings.section_count) {
    const keepIds = current.slice(0, settings.section_count).map((section) => section.id)
    const hideIds = current.slice(settings.section_count).map((section) => section.id)

    if (hideIds.length > 0) {
      const { error: sectionHideError } = await supabase
        .from("event_story_sections")
        .update({ visible: false, updated_at: new Date().toISOString() })
        .in("id", hideIds)
      if (sectionHideError) {
        throw new Error("Failed to hide extra sections")
      }

      const { error: photoUnassignError } = await supabase
        .from("photos")
        .update({ timeline_section_id: null, timeline_sort_order: 0 })
        .eq("event_id", eventId)
        .in("timeline_section_id", hideIds)
      if (photoUnassignError) {
        throw new Error("Failed to unassign hidden section photos")
      }
    }

    const { error: visibleError } = await supabase
      .from("event_story_sections")
      .update({ visible: true, updated_at: new Date().toISOString() })
      .in("id", keepIds)
    if (visibleError) {
      throw new Error("Failed to restore kept sections")
    }
  }
}

async function loadWorkspace(
  supabase: ReturnType<typeof createClient>,
  event: { id: string; title: string; public_code: string; moderation_required: boolean; created_at: string },
) {
  const settings = await ensureSettingsRecord(supabase, event)
  await ensureSectionScaffold(supabase, event.id, settings)

  const [{ data: refreshedSettings, error: settingsError }, { data: sections, error: sectionsError }, { data: photos, error: photosError }] =
    await Promise.all([
      supabase
        .from("event_story_settings")
        .select("event_id, grouping, section_count, birth_date, cover_title, cover_subtitle, updated_at")
        .eq("event_id", event.id)
        .single(),
      supabase
        .from("event_story_sections")
        .select("id, label, title, subtitle, story_text, sort_order, visible")
        .eq("event_id", event.id)
        .order("sort_order", { ascending: true }),
      supabase
        .from("photos")
        .select("id, caption, storage_path, created_at, captured_at, is_visible, timeline_section_id, timeline_sort_order, status")
        .eq("event_id", event.id)
        .order("captured_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false }),
    ])

  if (settingsError || sectionsError || photosError) {
    throw new Error("Failed to load moderator workspace")
  }

  const urlMap = new Map<string, { thumbUrl: string | null; fullUrl: string | null }>()
  for (const photo of photos || []) {
    const [thumbResult, fullResult] = await Promise.all([
      supabase.storage.from("event-photos").createSignedUrl(photo.storage_path, 3600, {
        transform: {
          width: 640,
          height: 760,
          resize: "cover",
          quality: 72,
        },
      }),
      supabase.storage.from("event-photos").createSignedUrl(photo.storage_path, 3600),
    ])

    if (thumbResult.error || fullResult.error) {
      throw new Error("Failed to prepare image URLs")
    }

    urlMap.set(photo.storage_path, {
      thumbUrl: thumbResult.data?.signedUrl ?? null,
      fullUrl: fullResult.data?.signedUrl ?? null,
    })
  }

  const photoCards = (photos || []).map((photo) => ({
    id: photo.id,
    title: photo.caption || "Story photo",
    subtitle: photo.captured_at || photo.created_at,
    status: photo.status,
    image_url: urlMap.get(photo.storage_path)?.thumbUrl ?? null,
    full_image_url: urlMap.get(photo.storage_path)?.fullUrl ?? null,
    captured_at: photo.captured_at ?? photo.created_at,
    is_visible: photo.is_visible,
    timeline_section_id: photo.timeline_section_id,
    timeline_sort_order: photo.timeline_sort_order,
  }))

  return {
    event,
    settings: refreshedSettings,
    sections: (sections || []).map((section) => ({
      ...section,
      photos: photoCards.filter((photo) => photo.timeline_section_id === section.id),
    })),
    photos: photoCards,
  }
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

    const body = (await req.json()) as ModeratorStoryRequest
    const eventCode = body?.event_code?.trim().toUpperCase()
    const moderatorPin = body?.moderator_pin?.trim()
    const action = body?.action || "open"

    if (!eventCode || !moderatorPin) {
      return new Response(
        JSON.stringify({ error: "event_code and moderator_pin are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    const event = await authenticateModerator(supabase, eventCode, moderatorPin)

    if (action === "update_settings") {
      const currentSettings = await ensureSettingsRecord(supabase, event)
      const updates = body.settings || {}
      const payload = {
        event_id: event.id,
        grouping: updates.grouping ?? currentSettings.grouping,
        section_count: Math.min(24, Math.max(1, Number(updates.section_count ?? currentSettings.section_count))),
        birth_date: updates.birth_date === undefined ? currentSettings.birth_date : updates.birth_date,
        cover_title: updates.cover_title ?? currentSettings.cover_title,
        cover_subtitle: updates.cover_subtitle ?? currentSettings.cover_subtitle,
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabase.from("event_story_settings").upsert(payload, { onConflict: "event_id" })
      if (error) {
        throw new Error("Failed to update story settings")
      }
    }

    if (action === "sync_sections") {
      const currentSettings = await ensureSettingsRecord(supabase, event)
      await syncSectionCount(supabase, event.id, currentSettings)
    }

    if (action === "update_section") {
      if (!body.section_id || !body.section) {
        throw new Error("section_id and section updates are required")
      }
      const { error } = await supabase
        .from("event_story_sections")
        .update({ ...body.section, updated_at: new Date().toISOString() })
        .eq("id", body.section_id)
        .eq("event_id", event.id)
      if (error) {
        throw new Error("Failed to update story section")
      }
    }

    if (action === "reorder_section") {
      if (!body.section_id || !body.direction) {
        throw new Error("section_id and direction are required")
      }
      const { data: sections, error } = await supabase
        .from("event_story_sections")
        .select("id, sort_order")
        .eq("event_id", event.id)
        .order("sort_order", { ascending: true })
      if (error) {
        throw new Error("Failed to load sections for reordering")
      }
      const ordered = sections || []
      const index = ordered.findIndex((section) => section.id === body.section_id)
      const swapIndex = index + body.direction
      if (index >= 0 && swapIndex >= 0 && swapIndex < ordered.length) {
        const source = ordered[index]
        const target = ordered[swapIndex]
        const { error: firstError } = await supabase
          .from("event_story_sections")
          .update({ sort_order: target.sort_order, updated_at: new Date().toISOString() })
          .eq("id", source.id)
        if (firstError) throw new Error("Failed to reorder story section")
        const { error: secondError } = await supabase
          .from("event_story_sections")
          .update({ sort_order: source.sort_order, updated_at: new Date().toISOString() })
          .eq("id", target.id)
        if (secondError) throw new Error("Failed to reorder story section")
      }
    }

    if (action === "update_photo") {
      if (!body.photo_id || !body.photo) {
        throw new Error("photo_id and photo updates are required")
      }
      const updates = { ...body.photo }
      if (updates.timeline_section_id === "") {
        updates.timeline_section_id = null
      }
      const { error } = await supabase
        .from("photos")
        .update(updates)
        .eq("id", body.photo_id)
        .eq("event_id", event.id)
      if (error) {
        throw new Error("Failed to update story photo")
      }
    }

    const workspace = await loadWorkspace(supabase, event)
    return new Response(JSON.stringify(workspace), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }
})
