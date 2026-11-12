---
name: Teacher review display contract
description: Backend contract and student-facing filtering rules for teacher feedback in session details.
---

The backend confirms student session responses include `reviewData` items with `inputType` and `checked`. The PWA detail modal consumes the embedded session data rather than fetching the OpenAPI review route separately. For checkbox items, only `checked === true` should be shown, with a selected checkbox mark and criterion name; hide groups/criteria left empty by filtering. Preserve existing non-checkbox text review rendering and require `reviewPublished`.

**Why:** The review checklist is a backend-authored data structure, while the student-facing display is owned by the PWA. The generated OpenAPI description does not fully document the checkbox fields.

**How to apply:** Keep display filtering in the shared PWA review component; do not change the API or database unless the backend contract changes.
