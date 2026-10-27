# Server-saved private drafts: run log

## Acceptance claim (RECONSTRUCTED 2026-10-27, after the evidence below was collected)

This claim was not frozen before testing. It restates the approved plan
(`~/.claude/plans/we-need-to-set-rippling-lighthouse.md`, approved 2026-10-27) as checkable terms.

Candidate `f6570fb64` on `feature/server-drafts`, base `7cc40e10c` (`feat/reply-all`, same as `origin/feat/reply-all`).

Requester's words (Ethan, 2026-10-27): "We need to set up a way to save drafts in Chatwoot." Decision the same
day: drafts are private per agent.

Terms:

- **T1.** An agent's reply draft (body, To, CC, BCC, replied-to message) reaches the server about 2 s after
  typing stops, and the same agent opening the conversation in another browser sees the body and CC restored.
- **T2.** Drafts are private. Another agent's `GET .../draft_messages` returns no text, only `other_drafters`
  names; `GET /drafts` and the Drafts tab list only the caller's own drafts.
- **T3.** An email inbox's Drafts tab lists the conversations where the current agent has a non-empty reply
  draft, and those cards show a red "Draft" label.
- **T4.** Sending the reply deletes the server draft; the card label and the teammate notice go away.
- **T5.** A draft stored as a plain string in localStorage before this change still loads into the editor.
- **T6.** Private notes keep their own draft (`reply_type: note`), separate from the reply draft.
- **T7.** The change works on the live app (chatwoot.extendedhorizons.com).

## Evidence

Proof shape: **replica**. The candidate ran locally (Rails + Vite from the worktree) against
`chatwoot_drafts_dev`, a `createdb -T chatwoot_dev` copy, on Redis db 7, with two agents created by
`seed_agents.rb` in this folder. Agent A used two separate browser profiles (separate localStorage) as two
devices; agent B used a third profile and the API. No mocks between the browser and Postgres.

| Term | Result |
|---|---|
| T1 | PASS. Profile "Person 2" (A) typed a body and CC `boss@drafts.test`; the Rails log shows `PATCH .../conversations/4/draft_messages` with both, and `drafts` gained the row. Profile "Person 3" (A, empty localStorage) opened conversation 4: editor text and the CC input value both restored. |
| T2 | PASS. As B via API: `{"has_draft":false,"other_drafters":["Agent A"]}`; `GET /drafts` → `[]`; `conversations?folder=drafts` → `[]` while the unfiltered list returned `[4, 2, 5, 3]`. In the UI, B's editor was empty and showed "Agent A also has a draft reply here". Spec: `draft_messages_controller_spec.rb` "does not show a teammate draft text". |
| T3 | PASS after one fix. First run: the tab listed the conversation but no label, because the drafts list was fetched only when the reply box mounted. Moved to `ChatList` mount; rerun showed "Draft Carol Cruz" (`drafts-tab-marker.png`). |
| T4 | PASS. A clicked Send: message 30 created with the draft text, `select count(*) from drafts` → 0, A's label gone, B's notice gone after reload. |
| T5 | PASS on the second attempt. The first attempt planted the string while a dashboard page was open, and that page's store wrote the whole `draftMessages` object back over it (a test artifact). Planted from `/api` (no app running), conversation 5 loaded "Legacy string draft from before the upgrade" and synced it to the server. |
| T6 | PASS at spec level only (`keeps reply and private note drafts apart`). Not exercised in the browser. |
| T7 | **UNMET.** Production runs `chatwoot-candidate:v417-cw8-413e20eaa7` (Kevin's `scubashack808/chatwoot` track, read 2026-10-27 from `/opt/chatwoot/docker-compose.yaml` on mre-comms). None of `feat/reply-all`, including the Drafts tab this change fills, is deployed. This branch cannot reach the live app without either replacing that image (which would remove the live mailbox work) or porting the change onto that track. |

### Deterministic checks on `f6570fb64`

- `bundle exec rspec spec/controllers/api/v1/accounts/conversations/draft_messages_controller_spec.rb spec/controllers/api/v1/accounts/drafts_controller_spec.rb spec/finders/conversation_finder_spec.rb spec/models/conversation_spec.rb spec/models/user_spec.rb` → pass (run against `POSTGRES_DATABASE=chatwoot_drafts_test`).
- `bundle exec rubocop` on the 13 touched Ruby files → no offenses.
- `pnpm exec eslint` on the touched JS/Vue → 0 errors.
- `pnpm exec vitest run app/javascript/dashboard/store app/javascript/dashboard/composables app/javascript/dashboard/components/widgets/conversation app/javascript/dashboard/components/specs` under Node 24.13.0 → 1403 passed, 3 failed. The 3 failures are in `store/modules/conversations/helpers/specs/filterHelpers.spec.js` (created_at date comparisons); that spec and its helper are unchanged by this branch and import nothing from it. Not run at base, so this is unverified attribution, not a proven pre-existing failure.
- Under the shell's default Node 26, `draftMessages/mutations.spec.js` fails on unchanged base code too (`window.localStorage` undefined); Chatwoot pins Node 24 in `.nvmrc`.

## Independent adversarial review (fresh-context agent, 2026-10-27, against `f6570fb64`)

The reviewer found authorization and privacy sound and found two data-loss bugs the evidence above had not
exercised. Dispositions:

| # | Finding | Disposition |
|---|---|---|
| 1 | High. Leaving a conversation before its server draft loaded synced the empty local copy as a DELETE, wiping the draft everywhere. Same on a failed or slow GET. | **Fixed.** `sync` never writes while the server state is unknown, and only sends what this device edited (`dirty`). |
| 2 | High. A stale local copy re-created a draft that had been sent from another device; client and server clocks were mixed. | **Fixed.** Local records carry `serverUpdatedAt` (server time only) and `dirty`. When the server has no draft and this device has nothing new, the local copy is dropped. |
| 3 | Medium. Drafts stored without recipients (legacy strings, saves made while leaving) blanked To/CC/BCC. | **Fixed.** Only recipient fields the draft actually stored are restored. |
| 4 | Medium. A slow fetch could overwrite typed text in the local record. | **Fixed.** A dirty local draft with text is never replaced by the server copy. |
| 5 | Low. Two tabs creating the same draft at once raised `RecordNotUnique` (500). | **Fixed.** `update` retries once and finds the row. |
| 6 | Low. The teammate notice named agents who had left the account. | **Fixed.** `other_drafters` is limited to current account users. Spec added. |
| 7 | Low. A pre-existing watcher ordering bug can save a reply under the NOTE key when the conversation flips to note mode. | **Accepted.** Present at base, stays within the agent's own drafts; not changed here. |

### Re-verification on the fix commit (replica, same setup)

- Finding 1: CDP Fetch interception paused every `draft_messages` request in profile "Person 2" (no local copy of
  conversation 3, server draft present). The agent opened conversation 3 and left before the GET returned. Only
  two GETs were attempted, no DELETE; after release, the server draft landed in the local copy as
  `dirty:false`. `drafts` still held "Server draft from device D".
- Finding 2: profile "Person 3" sent that draft (server row count 0). Profile "Person 2", still holding the old
  local copy, reopened conversation 3: editor empty, local copy dropped, no label, server row count still 0.
- Finding 3: a legacy string draft planted for conversation 2 loaded with the last email's CC
  (`alice@example.com`) intact, synced to the server with that CC, and a further edit synced within 4 s.
- Specs: draft controller (including the new left-the-account case), drafts controller and finder specs pass;
  37 vitest files pass, including new cases for each finding; rubocop and eslint clean.

### Known gaps

- The server copy is not flushed on tab close or reload, so the last ~2 s of typing reach the server only on that device's next visit.
- A save already in flight when the agent hits Send can land after the delete and bring the draft back.
- Attachments are not saved in drafts (out of scope for this round).
