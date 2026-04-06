# Figma Package Rollout

## Source of Truth
- Use the local package in `public/Upload Page Design` as the canonical design and interaction reference.
- Primary package source files:
  - `src/app/pages/TimelinePage.tsx`
  - `src/app/pages/GalleryPage.tsx`
  - `src/app/pages/UploadPage.tsx`
  - `src/app/pages/AdminPage.tsx`
  - `src/app/components/Header.tsx`
  - `src/app/components/ParallaxBackground.tsx`
  - `src/app/components/StoryDecorations.tsx`
  - `src/app/context/StoryContext.tsx`
  - `src/styles/theme.css`
  - `src/styles/index.css`

## Current App Modules To Replace Or Adapt
- Main shell and page rendering:
  - `components/birthday-app.tsx`
- Global visual layer:
  - `app/globals.css`
- Route wrappers:
  - `app/page.tsx`
  - `app/timeline/page.tsx`
  - `app/gallery/page.tsx`
  - `app/upload/page.tsx`
  - `app/moderator/page.tsx`
- Story helpers and dummy/derived data:
  - `lib/storybook.ts`
  - `lib/types.ts`
- Story/moderator APIs:
  - `supabase/functions/guest-story/index.ts`
  - `supabase/functions/moderator-story/index.ts`
  - `supabase/functions/moderator-upload/index.ts`

## Route Mapping
- `/` and `/timeline`
  - must match package `TimelinePage`
  - includes:
    - cover section
    - side chapter nav
    - alternating editorial chapter sections
    - chapter-level decorative motifs
    - closing section
    - lightbox behavior
- `/gallery`
  - must match package `GalleryPage`
  - includes:
    - small hero
    - month filter chips
    - month dividers
    - masonry layout
    - hover/tap overlay
    - lightbox
- `/upload`
  - must match package `UploadPage`
  - includes:
    - centered camera hero
    - drag/drop uploader
    - processing state
    - preview grid
    - success state
    - info card
- `/moderator`
  - use package `AdminPage` as the visual and interaction base
  - adapt package tabs into moderator-PIN workflow
  - tabs required:
    - overview
    - photos
    - chapters
    - settings

## Design-Parity Rules
- Do not preserve the old shell where it conflicts with the package.
- Port the package layout, spacing rhythm, card padding, shadows, radius, and type hierarchy directly.
- Use the package's motion language:
  - entry fades and y-offset transitions
  - hover lift on cards
  - animated lightbox
  - chapter reveal transitions
  - decorative floating background motion
- Use the package color direction exactly where practical:
  - cream background base
  - blue accent actions
  - warm brown copy
  - gold decorative accents
  - pastel section backgrounds

## Shared Data Mapping
- Package `Chapter` maps to current story section concept.
- Package `Photo` maps to current photo records with adapters:
  - `capturedMonth` / `capturedYear` derived from `captured_at`
  - `chapterId` derived from `timeline_section_id`
  - `showInTimeline` derived from chapter assignment and visibility intent
  - `visible` derived from `is_visible`
  - `status` from current photo status
- Package `AppSettings` maps to current story settings:
  - `timelineType` -> `grouping`
  - `sectionCount` -> `section_count`
  - `babyName` -> event title or explicit derived label
  - `tagline` -> cover subtitle or derived display text
  - `birthDate` -> `birth_date`

## Dummy Story Data Rule
- Dummy story records are acceptable only as fallback content when real event story data is missing.
- Use package `StoryContext` defaults as the narrative baseline for fallback:
  - 12 chapters
  - month-specific titles
  - month-specific milestone text
  - seeded photo positions and chapter structure
- Real moderator saves must continue to use current Supabase-backed story/settings/photo APIs.

## Moderator Port Requirements
- Keep moderator PIN auth exactly as currently implemented.
- Replace the current custom moderator layout with a package-style dashboard.
- Moderator feature mapping:
  - package `OverviewTab`
    - event stats
    - visible chapter count
    - total photos
    - pending count
    - approved count
  - package `PhotosTab`
    - photo visibility
    - approve/unapprove if needed
    - chapter assignment
    - timeline toggle equivalent
    - deletion
  - package `ChaptersTab`
    - inline edit chapter title
    - subtitle
    - milestone
    - story text
    - reorder
    - show/hide
  - package `SettingsTab`
    - birth date
    - timeline type
    - section count
    - baby name/tagline equivalents
- Additional moderator feature beyond package:
  - upload photos directly into a selected chapter using moderator PIN

## Backend Alignment
- Keep existing contracts working:
  - guest story fetch
  - moderator story fetch/update
  - moderator chapter-photo upload
- Package-only local state must be adapted into current APIs, not replace them.
- Backend still needs to support:
  - story settings fetch/update
  - section fetch/update/reorder
  - photo assignment and order
  - visibility toggles
  - seeded fallback if no real data exists

## Implementation Phases

### Phase 1: Shared Port Foundation
- Port package header and decorative primitives into reusable app components.
- Move old storybook shell toward package composition.
- Introduce data adapters from current backend types to package-style chapter/photo/settings types.

### Phase 2: Timeline Port
- Rebuild `/` and `/timeline` from package `TimelinePage`.
- Port:
  - cover section
  - chapter side nav
  - alternating chapter layouts
  - editorial photo treatment
  - lightbox
- Bind to current guest story data with fallback dummy content.

### Phase 3: Gallery Port
- Rebuild `/gallery` from package `GalleryPage`.
- Port:
  - month chip bar
  - month labels
  - masonry feed
  - package card hover treatment
  - package lightbox
- Preserve current event + pin loading behavior.

### Phase 4: Upload Port
- Rebuild `/upload` from package `UploadPage`.
- Preserve:
  - event code and PIN requirements
  - multi-upload
  - EXIF capture fallback
- Match package layout and success experience.

### Phase 5: Moderator Port
- Rebuild `/moderator` from package `AdminPage`.
- Map tabs and actions to current moderator APIs.
- Keep photo and chapter editing live.
- Add chapter upload flow in the package visual language.

### Phase 6: Validation
- Run:
  - `npm run lint`
  - `npm run build`
- Verify:
  - guest PIN routes
  - moderator PIN route
  - timeline rendering
  - gallery month filtering
  - upload success flow
  - chapter editing and save reflection

## Non-Negotiables
- The package is the source of truth for page structure and styling.
- Old UI should not be preserved just because it already works.
- Guest functionality must remain intact while the UI is replaced.
- Moderator story editing must feel native to the package design, not like an admin tool bolted on later.
