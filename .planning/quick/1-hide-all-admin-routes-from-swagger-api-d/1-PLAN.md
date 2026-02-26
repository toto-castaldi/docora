---
phase: quick
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - src/plugins/swagger.ts
autonomous: true
requirements:
  - QUICK-1

must_haves:
  truths:
    - "Admin routes (any URL starting with /admin) do not appear in Swagger UI or OpenAPI spec"
    - "Public routes still appear in Swagger docs with full schema transformation"
  artifacts:
    - path: "src/plugins/swagger.ts"
      provides: "Custom transform wrapping jsonSchemaTransform to hide admin routes"
      contains: "url.startsWith(\"/admin\")"
  key_links:
    - from: "src/plugins/swagger.ts"
      to: "@fastify/swagger transform option"
      via: "custom transform function"
      pattern: "hide: true"
---

<objective>
Hide all admin routes from the public Swagger API documentation.

Purpose: Admin routes (onboard, dashboard APIs, auth, etc.) are internal and should not be exposed in the public OpenAPI spec or Swagger UI. Only public-facing API routes should be documented.

Output: Modified swagger.ts with a custom transform that sets `hide: true` for any route whose URL starts with `/admin`.
</objective>

<execution_context>
@/home/toto/.claude/get-shit-done/workflows/execute-plan.md
@/home/toto/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/plugins/swagger.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Wrap jsonSchemaTransform to hide admin routes</name>
  <files>src/plugins/swagger.ts</files>
  <action>
    Replace the `transform: jsonSchemaTransform` option in the fastifySwagger registration with a custom transform function that:
    1. Checks if `url.startsWith("/admin")` -- if so, returns the schema with `hide: true` set, bypassing jsonSchemaTransform (admin routes need no schema transformation since they will be hidden)
    2. Otherwise, delegates to `jsonSchemaTransform` for normal public route processing

    The transform signature destructures `{ schema, url, ...rest }` and returns the appropriate result. This covers all current admin routes: onboard, dashboard APIs, auth, static, delete-app, bulk-actions, and any future routes added under `/admin`.
  </action>
  <verify>
    <automated>cd /home/toto/scm-projects/docora && pnpm typecheck</automated>
  </verify>
  <done>
    - `pnpm typecheck` passes
    - swagger.ts transform function checks for "/admin" prefix and hides matching routes
    - All non-admin routes still processed through jsonSchemaTransform
  </done>
</task>

</tasks>

<verification>
- `pnpm typecheck` passes with no errors
- Inspect swagger.ts: transform function wraps jsonSchemaTransform with admin route hiding logic
</verification>

<success_criteria>
- Admin routes are hidden from Swagger/OpenAPI output via `hide: true` in the transform
- Public routes continue to appear with full schema transformation
- TypeScript compilation succeeds
</success_criteria>

<output>
After completion, create `.planning/quick/1-hide-all-admin-routes-from-swagger-api-d/1-SUMMARY.md`
</output>
