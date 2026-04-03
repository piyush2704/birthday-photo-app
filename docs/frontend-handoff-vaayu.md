# Vaayu Frontend Handoff

## Guest IA
- Default guest opening flow: `Loading -> Gallery`
- Primary guest tabs: `Gallery`, `Upload`
- Do not surface admin, host, or profile concepts in the guest shell

## Critical Guest Routing Rule
- The guest gallery must work when opened directly with `event` and `pin` in the URL.
- Required behavior:
  - `/gallery?event=VAAYU&pin=2905` should load the approved gallery on first render.
  - guest navigation between `Gallery` and `Upload` must preserve `event` and `pin`.
  - the loading/opening screen must redirect into the gallery while preserving those params.

## Design Source
- Use the local reference bundle in `public/Upload Page Design`
- Prioritize:
  - lightweight fixed guest header
  - image-first gallery
  - soft parallax/decorative background
  - warm cream/coral palette
  - simple guest upload flow with previews

## Gallery
- Gallery is the primary guest destination.
- It should feel like Vaayu's birthday album, not a dashboard.
- Use a masonry-style feed with rounded photos and a simple lightbox.

## Upload
- Upload is the second tab.
- Keep it focused:
  - event code
  - PIN
  - optional name
  - multi-image picker
  - image previews
  - single clear CTA

