# Implementation Notes

This file logs open questions and the assumptions used so implementation can keep moving without blocking on confirmations.

## Current assumptions

### Resources vs notes/tasks/skills
- If a capture is mostly a standalone tool/app/repo/prompt/template recommendation, it is treated as a `resource` and does not also emit notes/tasks/skills by default.
- If a capture contains operational advice plus named tools/resources, it can emit both a `resource` and the usual notes/tasks/skills.

### Conflicting advice
- Contradictory advice is stored as parallel approved `notes`, not synthesized into one canonical answer.
- Notes can disagree; skills cannot.

### Evaluator quality
- The evaluator is OpenAI-backed and emits structured proposals for tags, notes, tasks, resources, skills, and author ratings.
- Validators stay narrow and explicit; review/approval remains the final quality control layer.

### Resource metadata
- Resource metadata is inferred from the URL/domain/text for now.
- No external metadata fetch is performed yet for GitHub/Figma/npm/company pages; that is a later enhancement.

### Retrieval/export shape
- Approved notes export under `nougat/...`
- Approved resources export under `resources/...`
- Tasks and skills remain app-native for now and are not exported to Linear or agent files automatically.

## Open questions for later
- Should resources have a stricter typed taxonomy than the current `resourceType` string?
- Should approved skill candidates eventually apply to local files through a diff-based approval flow?
- Should we add external metadata fetchers for GitHub repos, Figma files, npm packages, and websites?
