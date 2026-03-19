# TODO

## 1. Clarify bridge secret key requirement in README

The bridge writes directly to Supabase from a local server process. It needs a
**secret key** (not the publishable/anon key), especially once Row Level Security
(RLS) is enabled — otherwise writes will be rejected by RLS policies.

Changes needed:
- Rename `SUPABASE_ANON_KEY` → `SUPABASE_SERVICE_KEY` in `bridge/.env.example`
  and all references in `bridge/src/`.
- Update the README step 2 instructions to say:
  - Use the **secret key** from Supabase dashboard → Settings → API Keys →
    Secret keys.
  - Distinguish it clearly from the publishable key used in the UI.
- Add a note explaining *why*: the bridge is a trusted local process, not a
  browser, so it bypasses RLS — which is intentional and correct.

---

## 2. UI/UX overhaul — improve readability

The current UI is hard to read. A design pass is needed across all three
components (`StatusBar`, `AgentPanel`, `ActivityFeed`) and the root layout.

Areas to address:
- Typography: font size, line height, contrast — text is currently too dense /
  low contrast.
- Layout: padding, spacing, and visual hierarchy between panels.
- Colour scheme: move from raw inline styles to a coherent palette (dark or
  light theme with clear accent colours for status states).
- ActivityFeed: event rows need clearer separation, readable timestamps, and
  visual distinction between event types (tool call, assistant message,
  lifecycle).
- AgentPanel: agent/session list needs better affordance — active vs idle
  states, selection highlight.
- StatusBar: bridge status indicator should be prominent and colour-coded
  (green/amber/red).
- Replace all ad-hoc inline styles with a consistent styling approach (CSS
  modules, Tailwind, or a design system component library — decide which).
