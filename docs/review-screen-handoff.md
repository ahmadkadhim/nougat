# Review Screen Handoff

## Purpose

This document is a handoff for continuing work on the Nougat review screen in another thread.

It focuses on:

- the current review UX state
- the design intent behind recent changes
- the important files
- what was verified
- what still feels unresolved
- the best next improvements to try

## Product Context

Current Nougat lexicon:

- `Nougat`: product/brand name
- `Inbox`: where saved source items go
- `Bits`: generic term for `Notes`, `Tasks`, `Resources`, and `Skills`
- `Notes`: replacement for `Knowledge` / `Knowledge Notes`
- there is no separate `Viewpoint` object anymore

Implications for the review screen:

- review lanes are `Tags`, `Notes`, `Tasks`, `Resources`, `Skills`, and `Author Rating`
- notes can disagree with each other
- skills must remain internally coherent

## User Goal That Drove This Work

The user wanted a review experience that:

- feels much more condensed
- minimizes page scrolling
- keeps one capture and its review items visible in roughly one window height when possible
- feels more focused and “Linear-like”
- separates the mental models of:
  - editing a bit
  - leaving reviewer feedback
  - approving or rejecting

The strongest user feedback points were:

- the old review screen was too spread out
- feedback save behavior was ambiguous
- fields were too editable-by-default
- section headers like `Tags` and `Notes` were too visually weak

## Current State

### Review layout

The review page is now a two-pane workspace:

- left rail:
  - compact capture queue
  - pending counts by lane
  - active capture selection
  - author tier summary
- right pane:
  - one active capture at a time
  - source context on the left side of the pane
  - review lanes on the right

This replaced the older stacked page of full capture cards.

### Bit cards

Each reviewable bit now defaults to a compact read-first state:

- short headline
- small metadata badges
- one preview row by default
- `Details` expands read-only detail
- `Edit` expands editable fields
- `Add note` opens a separate note composer
- `History` expands saved feedback history

The intent is:

- read first
- expand only if something is borderline
- edit only when the bit is fundamentally right but needs correction

### Action semantics

The current action model is:

- `Save edits`
  - saves field changes only
  - keeps a note draft intact instead of silently clearing it
- `Add note`
  - saves a comment-only feedback entry
  - does not change review status
- `Approve`
  - approves as-is
- `Approve corrected`
  - approves while applying unsaved edits
- `Approve + note`
  - approves while attaching the note draft
- `Approve corrected + note`
  - approves while applying edits and attaching the note
- reject mirrors the same model, using `Reject`, `Reject after edits`, and `Reject after edits + note`

This is implemented to make the previous ambiguity much clearer:

- edits are not the same thing as a reviewer note
- save is not the same thing as a decision
- a decision can include unsaved edits

### Headers and density

The lane headers are larger than before.

Other density changes:

- smaller card padding
- shorter preview clamps
- compact flow banner instead of a separate instructional card
- local scrolling inside queue/context/lane panels instead of one long page scroll
- lane sections behave more like fixed panels

## Important Files

- `src/components/review-queue-shell.tsx`
  - queue rail + active capture selection
- `src/components/review-output-card.tsx`
  - active review workspace
  - section layout
  - compact/expanded card states
  - review action semantics
- `src/styles.css`
  - `review-*` classes for the entire review surface
- `convex/derived.ts`
  - `getReviewQueue`
  - `getDerivedSummary`
  - `reviewEntity`

Supporting files worth knowing:

- `src/components/capture-card.tsx`
  - source capture rendering inside the review context column
- `src/components/app-shell.tsx`
  - review nav indicator

## Current Design Intent

### What the screen is trying to be

The review screen is intentionally no longer a “long moderation feed.”

It is trying to be:

- a focused one-capture workspace
- context on the left
- decisions on the right
- compact enough that the reviewer keeps orientation

### What the cards are trying to be

Cards are no longer mini-forms by default.

They are trying to be:

- summary rows first
- details only on demand
- edits as a deliberate mode
- feedback history as an audit trail, not the default reading state

## What Was Verified

Verified:

- `npm test`
- `npx tsc --noEmit`
- `npm run build:web`

Visual verification:

- there was a local browser preview pass using representative fixture data
- the temporary preview harness was removed afterward
- there was not a signed-in browser pass against the live review queue data

That means:

- the structure is technically sound
- the overall density direction was visually checked
- real capture variability still needs in-app validation

## What Still Feels Unresolved

These are the main things still worth improving.

### 1. True one-screen fit is not guaranteed

The new layout is much tighter, but media-heavy source captures or multiple bits in one lane can still push the experience past a single viewport.

Likely next moves:

- optional source collapse modes
- more aggressive lane-level compaction
- alternate lane layouts when only one capture is active

### 2. The source column can still dominate

When an X post has media, quote previews, and a link preview, the source context can still feel visually heavy.

Good directions:

- compact source mode for review
- collapsible media rail
- source-summary toggle

### 3. Multi-item lanes need more live testing

The design is strong when each lane has `0-1` items. It still needs real testing with:

- many notes
- many tasks
- multiple resources
- a capture with several saved feedback entries

Potential next step:

- add stronger per-lane internal prioritization or sorting

### 4. Approve/reject could become even more “Linear-like”

Current action labels are much clearer, but the controls are still more explicit than elegant.

Future improvements to try:

- tighter action grouping
- stronger visual hierarchy between read, edit, note, and decision
- more refined success states
- keyboard shortcuts for approve/reject/details/edit

### 5. Sidebar information hierarchy may still be noisy

The author tier block and lane count pills are useful, but they may be competing with the main job of choosing the next capture.

Possible experiment:

- make the rail even more queue-focused
- move author tiers elsewhere or collapse them

## Good Next Experiments

If continuing the review screen work, I would try these in order.

### Experiment 1: Compact source mode

Add a toggle for:

- `Full source`
- `Compact source`

Compact source should:

- keep author/title/link visible
- clamp or collapse secondary preview elements
- preserve access to full source on demand

### Experiment 2: Lane tabs for crowded cases

When many lanes exist, the current grid can still get busy.

Try:

- summary chips across the top
- one active lane at a time on narrower widths
- optional “focus a lane” mode

### Experiment 3: Stronger decision strip

Rework the bottom of each bit card so the decision state feels more like one intentional action cluster and less like a generic card footer.

Try:

- smaller note/history controls
- more prominent approve/reject
- clearer “this will apply your edits” treatment

### Experiment 4: Keyboard review flow

Add shortcuts such as:

- next/previous capture
- next/previous bit
- expand details
- edit
- approve
- reject

This would directly address the user’s focus concern.

### Experiment 5: Save-state polish

The semantics are clearer now, but the visual feedback can still get better.

Ideas:

- stronger saved-state animation
- more obvious “note saved” vs “edits saved”
- explicit “approved after correction” history treatment

## Technical Notes

### Bandwidth context matters during review-screen iteration

While iterating on the review screen, cloud Convex bandwidth became a real issue.

Relevant docs added in this repo:

- `docs/database-bandwidth-optimization-next-steps.md`
- `docs/database-bandwidth-lessons.md`

Important takeaway:

- prefer `npx convex dev --local` during heavy UI iteration
- use cloud dev only when a hosted URL is required

### Current query shape is improved, not solved

Some bandwidth reductions already landed:

- cheaper app-wide review indicator
- smaller review queue scan
- smaller dashboard scans

But the review screen still depends on read-time assembly of queue items from derived tables, so more optimization is still possible.

## Suggested Pickup Prompt For The Next Thread

If starting a new thread, a good prompt would be:

“Continue improving the Nougat review screen from `docs/review-screen-handoff.md`. Keep the one-capture workspace, summary-first cards, and explicit edit/note/decision semantics. Focus on making the screen fit more comfortably within one viewport, especially for media-heavy source captures and multi-item lanes. Use Linear as inspiration. Validate against the current files before changing direction.”

## Short Status Summary

The review screen is materially better than the old version.

Big wins already achieved:

- no more long stacked moderation feed
- much clearer save/edit/note/approve/reject semantics
- compact read-first cards
- larger lane headers
- less page-scroll fatigue

Best next step:

make the source column and crowded lanes even more compressible without losing context.
