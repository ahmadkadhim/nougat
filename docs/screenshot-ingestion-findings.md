# Screenshot Ingestion: Findings And Recommendations

## Summary
Screenshots are a major missing intake source for Squirrel, but they should not be treated as just another URL capture lane.

Bookmarks, tabs, and shared links are mostly `keep unless duplicate`. Screenshots are mostly `triage before admit`. They carry higher privacy risk, weaker provenance, more mixed intent, and a larger percentage of low-value or temporary items.

The right product shape is:

`discover -> triage -> admit -> deconstruct -> review`

That differs from the current Squirrel flow, which is closer to:

`capture -> enrich -> derive -> review`

## Why This Matters
The current product is built around high-volume AI and tech discovery through browser tabs, iOS share targets, and X bookmarks. See [product-brief.md](./product-brief.md). Screenshots represent a parallel behavior: saving exactly what is on screen for later without depending on URLs, page stability, or app support.

That behavior solves a real capture job:
- preserve the exact source state at capture time
- save content that may not have a durable URL
- save visually organized information that is easier to scan later
- keep proof, receipts, UI references, and ephemeral context

If Squirrel ignores screenshots, it misses one of the largest existing personal inboxes in the workflow.

## Core Findings

### 1. Screenshots are both content and behavioral exhaust
A bookmark usually implies intentional saving of a resource. A screenshot can mean:
- save this text
- save this visual
- remember this task
- preserve proof
- hold this temporarily
- capture something private or sensitive
- capture something by accident

This means the first product job is classification and filtering, not extraction.

### 2. The main problem is triage, not OCR
OCR and image description are necessary, but they are not the hardest part. The harder product problem is deciding:
- what should be excluded completely
- what should be stored privately but never ingested
- what should become a normal Squirrel capture
- what should become a separate type of object, especially visual inspiration

### 3. Provenance is much weaker than with links
URL captures already preserve source URL, canonical URL, platform, and platform IDs. See [captures.ts](../convex/captures.ts). Historical screenshots often do not carry enough provenance to reconstruct:
- original URL
- app/page identity
- author/source identity
- whether the screenshot was taken for knowledge capture versus a temporary reminder

Forward capture can improve this by pairing screenshots with on-screen context at capture time. Backfill cannot recover that reliably.

### 4. Privacy and sensitivity are much higher
Compared with X bookmarks or tabs, screenshots are more likely to contain:
- OTP codes
- banking or payment details
- calendars
- chats
- personal photos
- internal work documents
- other sensitive fragments that should not enter the knowledge corpus

This makes a pre-ingest privacy gate mandatory.

### 5. “Visual inspiration” should be a first-class lane
Some screenshots are not best represented as notes, tasks, or resources. They are references for:
- UI layout
- typography
- color systems
- motion ideas
- brand direction
- interaction patterns

This deserves its own entity type, separate from `resource`. A resource answers “what should I use?” An inspiration item answers “what should I emulate or reference?”

This same lane could eventually accept qualifying X bookmarks and saved web captures, not just screenshots.

### 6. Backfill and forward capture are different products
There are two distinct jobs:

#### Backfill
Process the existing screenshot archive and recover useful items with acceptable privacy risk.

#### Forward capture
Make future screenshots more useful by collecting better metadata at creation time.

Backfill is mostly a classification and cleanup problem. Forward capture is a capture design problem.

### 7. The current Squirrel architecture is not a direct fit yet
Squirrel currently assumes accepted captures have a required `source_url` and flow through URL-driven enrichment and text-first derived evaluation:
- [captures.ts](../convex/captures.ts)
- [enrichment.ts](../convex/enrichment.ts)
- [derived.ts](../convex/lib/derived.ts)

That works well for links, X posts, and YouTube URLs. It is not the right entry point for raw screenshots.

The most natural fit is a staging model before promotion into the normal capture pipeline.

## Product Recommendation

### Treat screenshots as a separate intake family
Add screenshots as a first-class source family, but do not send them straight into `captures`.

Recommended model:
- `intakeCandidates` or `mediaCandidates` for newly discovered screenshots
- promotion into `captures` only after triage

This keeps low-signal and sensitive items out of the main corpus.

### Add a triage stage before enrichment
Recommended triage outcomes:
- `discard`
- `private_archive`
- `needs_review`
- `admit`
- `inspiration`

Recommended triage signals:
- duplicate / near-duplicate
- likely accidental screenshot
- likely sensitive / private
- likely temporary reminder
- likely knowledge item
- likely task reminder
- likely visual inspiration

### Keep deconstruction after admit
Once a screenshot is admitted, then run:
- OCR / text extraction
- image summary / layout description
- visible URL or app/entity extraction
- note/task/resource/skill derivation
- inspiration derivation when relevant

This preserves the current Squirrel philosophy of markdown-first, reviewable outputs without polluting the corpus up front.

### Add a dedicated inspiration entity
Introduce an entity such as `inspirationItems` with fields along these lines:
- `inspirationItemId`
- `primaryCaptureId`
- `sourceCaptureIds`
- `title`
- `summary`
- `visualTags`
- `domains` or `themes`
- `styleSignals`
- `reviewStatus`
- `confidence`

This would allow a future scrapbook or moodboard view across screenshots, X bookmarks, and web captures.

### Separate private retention from knowledge ingestion
Not every useful screenshot should become searchable knowledge. Some items may be worth retaining locally or in a private archive but should never:
- be exported to markdown
- be included in agent retrieval
- be used in derived task or skill generation

This distinction matters for trust.

## Technical Capability Notes

### What looks feasible on-device
Apple’s current platform surface appears good enough for an on-device screenshot collector:
- Shortcuts can receive “What’s On Screen,” which can improve forward provenance for future captures
- Shortcuts supports photo-finding and filtering actions
- Shortcuts exposes image details through `Get Details of Images`
- Shortcuts supports text extraction from images via Live Text-backed actions
- PhotoKit supports limited-library access patterns for native apps
- PhotoKit exposes a screenshots smart album subtype for native access

Implication: screenshot collection is feasible through Shortcuts and likely even better through a small native app or helper.

### What looks weak or missing
Historical screenshots will often lack durable provenance.

I did not identify a clean server-only path in this review that would let Convex directly ingest a user’s iCloud Photos screenshot archive without an on-device collector. This is an inference, not a hard platform claim, but it is the practical assumption to use for planning.

Implication: screenshot ingestion should be designed as an on-device acquisition flow that sends staged items into Squirrel.

## Recommended v1

### Scope
Do not start with the full 8,000+ screenshot backfill.

Start with:
- iPhone screenshots from the last 90 to 180 days
- Mac screenshots from Desktop or a designated folder
- manual “send this screenshot now” support

### Pipeline
1. Discover screenshots from the source device
2. Run local or staged triage
3. Exclude obvious sensitive / low-value items
4. Admit the remaining subset
5. Generate markdown plus structured metadata
6. Send admitted items into the existing review queue

### Output types for v1
Allow screenshots to produce:
- capture markdown
- knowledge items
- task candidates
- resources
- inspiration items

Do not allow automatic skill updates or autonomous actions from screenshots in v1 without review.

### Why this is the right cut
This creates leverage quickly without forcing the system to solve:
- full photo-library ingestion
- perfect privacy detection
- perfect OCR
- perfect provenance recovery
- automatic handling of all historical screenshots

It also preserves the product principle that Squirrel should admit durable, useful captures rather than indiscriminately importing every saved artifact.

## Product Decisions To Make Next
1. Should sensitive but non-ingested screenshots be retained anywhere in Squirrel, or only locally?
2. Should screenshot-derived markdown embed a structured “visual summary” section by default?
3. Should inspiration items export to markdown, or remain app-native like tasks and skills?
4. Should backfill and forward capture ship together, or should forward capture ship first to improve data quality?
5. Should visual inspiration be a generic entity for all sources, or screenshot-specific at first?

## Recommended Next Steps
1. Add screenshots to the product brief as a distinct intake family, not a minor extension of link capture.
2. Design a staging model for screenshot candidates before promotion into `captures`.
3. Define triage outcomes, especially privacy-related ones.
4. Define the `inspiration` entity and how it relates to screenshots, X bookmarks, and web captures.
5. Write a v1 spec for the screenshot collector:
   - iPhone backfill path
   - Mac screenshot path
   - forward capture path with on-screen context
6. Keep the first implementation intentionally narrow: recent screenshots, strong review, no bulk auto-admit.

## References
- Current product framing: [product-brief.md](./product-brief.md)
- Current capture contract: [captures.ts](../convex/captures.ts)
- Current enrichment flow: [enrichment.ts](../convex/enrichment.ts)
- Current derived evaluation: [derived.ts](../convex/lib/derived.ts)
- Apple Support: [Receive onscreen items from other apps](https://support.apple.com/guide/shortcuts/receive-onscreen-items-apd350ce757a/ios)
- Apple Support: [Intro to Find and Filter actions in Shortcuts on iPhone and iPad](https://support.apple.com/en-tm/guide/shortcuts/apd3c845e881/ios)
- Apple Support: [Add filter parameters to Find and Filter actions in Shortcuts on iPhone or iPad](https://support.apple.com/guide/shortcuts/add-filter-parameters-apdbdab3433f/ios)
- Apple Support: [Adjust variables in Shortcuts on iPhone or iPad](https://support.apple.com/en-by/guide/shortcuts/apda36b9018b/ios)
- Apple Support: [What’s new in Shortcuts in iOS 15.4 and macOS 12.3](https://support.apple.com/en-mide/106430)
- Apple Developer: [Delivering an Enhanced Privacy Experience in Your Photos App](https://developer.apple.com/documentation/PhotoKit/delivering-an-enhanced-privacy-experience-in-your-photos-app)
- Apple Developer: [PHAssetCollectionSubtype.smartAlbumScreenshots](https://developer.apple.com/documentation/photos/phassetcollectionsubtype/smartalbumscreenshots)
