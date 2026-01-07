Third‑Party App Onboarding & Token Issuance
===========================================

# Summary

This milestone introduces the onboarding flow that allows third‑party applications to register with Docora and receive repository updates. It defines the onboarding API, required metadata, token issuance, and validation rules.

# Goals

- Provide a public onboarding endpoint for third‑party apps.
- Issue a unique token per app for all future API communications.
- Store app metadata used for update delivery (base URL + contact details).
- Define validation and error handling for onboarding inputs.

# User Story

As a third‑party app, I want to register with Docora so I can receive repository updates using a unique token tied to my app.

# Scope

## Included

- App registration endpoint.ù
- Token creation and return in response.
- Metadata capture: base_url, app_name, email, optional website and description.
- Validation rules and error responses.

## Not Included

- Token expiration/rotation (tokens do not expire in this milestone).
- Ownership or account linking (no user/org model).
- Base URL verification/handshake.

# API Contract

## Endpoint

POST /api/apps/onboard

```code
Request Body
{
  "base_url": "https://example-app.com/webhooks",
  "app_name": "Example App",
  "email": "team@example-app.com",
  "website": "https://example-app.com",
  "description": "Short description (optional)"
}
```

```code
Response (201 Created)
{
  "app_id": "app_123456",
  "token": "docora_token_abcdef",
  "created_at": "2025-01-01T12:00:00Z"
}
```

# Validation Rules

- base_url
    - Required
    - Must be HTTPS
    - Must be a valid absolute URL

- app_name
    - Required
    - Min/max length (e.g., 3–100 chars)

- email
    - Required
    - Valid email format

- website
    - Optional
    - Must be valid URL if provided

- description
    - Optional
    - Max length (e.g., 500 chars)

# Token Behavior

- Unique per app
- No expiration (for now)
- Used for all subsequent API calls
- Sent via Authorization: Bearer <token> header

# Duplicate & Ownership Policy

- Duplicate base_url allowed (for now)
- No ownership model (no user/org binding)

# Error Handling (Examples)

- 400 Bad Request — missing or invalid fields
- 422 Unprocessable Entity — invalid URL or email format
- 500 Internal Server Error — unexpected server issue

# Security Considerations

- Require HTTPS for base_url.
- Prevent SSRF by blocking private/internal IPs or redirects.
- Rate‑limit onboarding endpoint.

# Acceptance Criteria

- Onboarding endpoint registers apps and returns a unique token.
- Validation rules are enforced with clear error responses.
- App metadata is stored for future update delivery.
- No token expiration or ownership requirement is enforced.