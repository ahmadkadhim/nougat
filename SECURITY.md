# Security Policy

## Scope
Nougat includes:
- a web app
- Convex backend functions and HTTP endpoints
- browser and Safari extension clients
- optional third-party integrations such as X OAuth

Security issues may affect local development, self-hosted deployments, or future hosted deployments.

## Reporting a vulnerability
Please do not open a public GitHub issue for suspected security vulnerabilities.

For now, report security issues privately to the maintainer before disclosing them publicly. Include:
- a short description of the issue
- affected files, routes, or features
- reproduction steps
- impact assessment
- any suggested mitigation if you have one

If you are unsure whether something is security-sensitive, report it privately first.

## Response expectations
- Initial triage target: within 7 days
- Status update target after triage: within 14 days

These are best-effort targets, not a contractual SLA.

## Supported code
Security fixes are expected to target the current `main` branch unless stated otherwise.

## Deployment cautions
If you deploy Nougat yourself, review these areas carefully:
- operator/admin endpoints and their authorization behavior
- OAuth credentials and token storage
- device-token issuance and rotation
- any default behavior that becomes permissive when an environment variable is unset
- logs and error messages that may expose tokens or private content

Do not assume example configuration is production-safe without review.
