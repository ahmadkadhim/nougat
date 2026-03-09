# Implementation Notes

This file logs open questions and the assumptions used so implementation can keep moving without blocking on confirmations.

## Current assumptions

### Resources vs notes/tasks/skills
- If a capture is mostly a standalone tool/app/repo/prompt/template recommendation, it is treated as a `resource` and does not also emit notes/tasks/skills by default.
- If a capture contains operational advice plus named tools/resources, it can emit both a `resource` and the usual notes/tasks/skills/viewpoints.

### Conflicting advice
- Contradictory advice is stored as parallel approved `sourceViewpoints`, not synthesized into one canonical answer.
- The Knowledge view surfaces these as `Competing plays`.

### Evaluator quality
- The evaluator is still heuristic-first, not LLM-backed yet.
- Review/approval remains the main quality control layer until a model-backed evaluator is introduced.

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
- Should conflicting viewpoints be linkable to one another explicitly instead of just grouped by topic?
- Should we add external metadata fetchers for GitHub repos, Figma files, npm packages, and websites?
