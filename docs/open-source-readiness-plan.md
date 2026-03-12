# Nougat Open-Source Readiness Plan

## Goal
Take Nougat from "public code" to "usable open-source project" by making it legally clear, safe to run, easier to configure, easier to understand, and easier to contribute to without requiring direct help from the maintainer.

This plan is about conventions, ergonomics, and trust, not just exposing the repo.

## Desired outcome
By the end of this plan, a new developer should be able to:

1. Understand what Nougat is and what is supported.
2. Clone the repo and get a minimal local setup running.
3. Know which integrations are optional versus required.
4. Understand the security model and production caveats.
5. Contribute changes using a documented workflow.

## Guiding principles
- Default to safe behavior.
- Keep the quickstart path narrow and boring.
- Separate core functionality from optional integrations.
- Prefer explicit documentation over tribal knowledge.
- Optimize for first-time contributors, not just current maintainers.

## Phase 0: Decide the project posture
Before polishing the repo, make explicit decisions about what kind of open-source project Nougat should be.

### Decisions to make
- Pick a license:
  - `MIT` if you want broad reuse with minimal friction.
  - `Apache-2.0` if you want explicit patent language.
  - `GPL` only if reciprocal copyleft is intentional.
- Decide whether the repo is:
  - a reference implementation,
  - a maintained product,
  - or a personal lab project that accepts limited outside contribution.
- Decide what should remain private:
  - internal roadmap docs,
  - references to prior internal systems,
  - personal setup details,
  - operational assumptions that are not meant to be public.

### Deliverables
- `LICENSE`
- short support statement in `README.md`
- decision on whether to keep, rewrite, move, or remove internal planning docs

## Phase 1: Remove "public but personal" artifacts
The repo should not expose maintainers' personal environment details unless intentional.

### Tasks
- Remove absolute local filesystem paths from docs.
- Remove or rewrite generated source headers that include personal names if anonymity matters.
- Rewrite git history if needed to remove:
  - personal email address,
  - Xcode `xcuserdata` artifacts,
  - historical local path leakage,
  - stale project names that are no longer relevant.
- Remove low-value machine-specific artifacts from docs and history.

### Repo-specific targets
- `clients/safari-extension/README.md`
- historical Xcode `xcuserdata` / `UserInterfaceState.xcuserstate`
- any docs that still mention older internal project naming or migration history unnecessarily

### Deliverables
- scrubbed docs
- clean `.gitignore`
- optional history rewrite plan if you decide to clean old commits

## Phase 2: Make the repo legally and socially complete
An open-source repo should answer the basic trust questions up front.

### Tasks
- Add `LICENSE`.
- Add `SECURITY.md` with:
  - how to report vulnerabilities,
  - supported response expectations,
  - whether public issues are acceptable for security reports.
- Add `CONTRIBUTING.md` with:
  - development prerequisites,
  - how to run tests,
  - code style expectations,
  - branch/PR expectations,
  - what kinds of contributions are welcome.
- Optionally add `CODE_OF_CONDUCT.md` if you want broader outside participation.

### Deliverables
- `LICENSE`
- `SECURITY.md`
- `CONTRIBUTING.md`
- optional `CODE_OF_CONDUCT.md`

## Phase 3: Tighten the README and project story
The README should serve strangers, not just future-you.

### Tasks
- Restructure `README.md` to answer, in order:
  1. What is Nougat?
  2. What works today?
  3. What does the minimal local setup require?
  4. Which integrations are optional?
  5. What are the main architectural pieces?
  6. What is the current project status?
- Add screenshots or a short GIF of the main workflow.
- Replace internal-product language with user-facing descriptions where possible.
- Move deep implementation details out of the README into `docs/`.
- Add a clear "non-goals" or "not yet supported" section.

### Suggested README structure
- Title and one-line description
- Why this exists
- Feature summary
- Quickstart
- Optional integrations
- Architecture overview
- Development
- Deployment notes
- Contributing
- Security
- License

### Deliverables
- rewritten `README.md`
- optional screenshots under `docs/` or `assets/`

## Phase 4: Improve setup and configuration ergonomics
This is the biggest gap between a personal project and an open-source-ready project.

### Tasks
- Ensure there is one clear minimal path to run the app locally.
- Audit environment variables and classify them as:
  - required for core local development,
  - required only for production,
  - optional integration-specific,
  - optional admin/operator.
- Expand `.env.example` so every relevant variable is documented with:
  - purpose,
  - when it is required,
  - example value format,
  - safe local default if one exists.
- Make startup failures explicit and friendly for missing config.
- Reduce hidden coupling between env vars where possible.
- Document a "minimal mode" that works without X integration.

### Repo-specific concerns
- Clarify the difference between:
  - `CONVEX_URL`
  - `CONVEX_SITE_URL`
  - `APP_ORIGIN`
  - `VITE_APP_ORIGIN`
  - `VITE_CONVEX_URL`
  - X OAuth variables
  - operator/admin variables
- Decide whether `OPERATOR_API_KEY` should be effectively mandatory outside local development.
- Document which routes are public, authenticated, device-authenticated, and operator-only.

### Stretch improvements
- Add a bootstrap script such as `npm run setup`.
- Add a local mock or degraded mode for optional services.
- Add seed data or demo fixtures for UI exploration.

### Deliverables
- improved `.env.example`
- startup/config docs in `README.md` or `docs/configuration.md`
- optional setup script

## Phase 5: Harden security defaults
Open-source projects need safer defaults because people will cargo-cult the setup into real deployments.

### Tasks
- Review auth and operator routes for insecure default behavior.
- Ensure privileged routes are denied by default in non-local contexts.
- Document the trust model:
  - device tokens,
  - Better Auth session auth,
  - operator key,
  - X OAuth credentials,
  - markdown export permissions.
- Add explicit production warnings where misconfiguration would expose sensitive operations.
- Review logs and error messages for accidental secret leakage.

### Repo-specific review items
- Operator route authorization behavior in `convex/http.ts`
- OAuth callback and token-storage flow
- markdown export endpoints and owner scoping
- any endpoint that is open when an env var is absent

### Deliverables
- security review notes
- code changes for safer defaults if needed
- `SECURITY.md` updated with deployment cautions

## Phase 6: Improve contributor and maintainer workflow
This is where the repo starts to feel genuinely open-source.

### Tasks
- Add CI for:
  - install
  - typecheck
  - tests
  - lint, if applicable
- Pin and document tool versions:
  - Node version
  - package manager
  - Convex expectations
- Add issue templates for:
  - bug reports
  - feature requests
  - setup problems
- Add a PR template with:
  - summary,
  - testing,
  - screenshots for UI changes,
  - follow-up notes.
- Decide how generated files should be handled in PRs.

### Deliverables
- GitHub Actions workflow(s)
- `.github/ISSUE_TEMPLATE/*`
- `.github/pull_request_template.md`
- version guidance in `README.md`

## Phase 7: Add release and adoption polish
This phase is optional, but it improves approachability and reuse.

### Tasks
- Add a changelog or start using GitHub Releases.
- Tag a first public release after the cleanup.
- Add example usage flows:
  - local-only mode
  - X-enabled mode
  - extension capture flow
- Add architecture diagrams if helpful.
- Add a simple FAQ for common setup failures.

### Deliverables
- `CHANGELOG.md` or release notes process
- first tagged release
- optional example/demo docs

## Recommended execution order
Do the work in this order so outward-facing basics land before polish:

1. Phase 0: decide license, support posture, and doc privacy.
2. Phase 1: scrub personal and machine-specific artifacts.
3. Phase 2: add legal and contribution files.
4. Phase 3: rewrite the README.
5. Phase 4: improve setup and config ergonomics.
6. Phase 5: harden security defaults and document them.
7. Phase 6: add CI and contributor workflow.
8. Phase 7: add release polish.

## Suggested issue breakdown
Use these as separate work items or thread prompts.

### Track A: Public repo cleanup
- scrub personal/local artifacts from docs
- decide whether to rewrite history
- remove or rewrite internal docs that should stay private

### Track B: Open-source foundation
- add license
- add `SECURITY.md`
- add `CONTRIBUTING.md`
- add optional `CODE_OF_CONDUCT.md`

### Track C: README and docs
- rewrite `README.md`
- create configuration docs
- create architecture overview
- add screenshots/demo assets

### Track D: Setup ergonomics
- improve `.env.example`
- reduce hidden config coupling
- add local minimal-mode instructions
- add optional setup script

### Track E: Security hardening
- review operator/admin auth defaults
- review privileged routes
- document production deployment caveats

### Track F: Contributor workflow
- add CI
- add issue templates
- add PR template
- document supported versions

## Definition of done
Consider the repo "open-source ready" when all of the following are true:

- a license is present
- security reporting guidance exists
- contribution guidance exists
- README has a credible quickstart
- config is documented and understandable
- optional integrations are clearly separated from core setup
- privileged behavior is safe by default
- CI validates the main development path
- personal/local artifacts are removed or intentionally retained

## Suggested kickoff prompt for another thread
Use this as the starting instruction for the implementation thread:

> Open `docs/open-source-readiness-plan.md` and execute Phase 0 through Phase 2 for this repo. Start by auditing the current files against the plan, then make the necessary changes, preserving existing product functionality.
