# Morgan · Action Items

A Telegram Mini App that surfaces what currently needs John's attention
across Morgan's Mission Control board.

Hosted at: https://johnkotowski.github.io/morgan-actions/
Launched from: `@buyerson_morgan_bot` menu button.

## Stack

- **Frontend:** Vanilla HTML + JS + CSS. No build step. Hosted on GitHub Pages.
- **Backend:** Supabase Edge Function `mc_actions_mini_app` in project
  `jeqmvhxbjyzbozcipzlf` (john@buyerson.co's project). Reads `mc_tasks`
  filtered to `assignee = 'morgan'` and slices into 3 sections.
- **Auth:** Telegram WebApp `initData` validation (HMAC-SHA256 against the
  DM bot token), plus a user_id allowlist locked to John (`8547873019`).

## Sections (v1)

1. 🔴 **Needs your decision** — `status = human_in_loop`
2. 🟠 **Morgan is working on** — `status = in_progress`
3. 🔵 **Ready for your review** — `status = review`

## Roadmap

- v2: Action-tagged email threads from the daily brief (needs a Mac-side
  daemon writing thread state to a `daily_brief_action_threads` table that
  the edge function reads from).
- v3: Inline actions — mark handled / convert to MC task / send draft.
  Requires the Mac-as-worker daemon polling a `mini_app_action_queue` table.

## Env required (Supabase function secrets)

- `TELEGRAM_DM_BOT_TOKEN` — token for `@buyerson_morgan_bot`
- `JOHN_TELEGRAM_USER_ID` — defaults to `8547873019` if unset

Set via: `supabase --project-ref jeqmvhxbjyzbozcipzlf secrets set …`
