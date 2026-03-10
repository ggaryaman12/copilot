# Phase 1: Service Dependency and API Contract Map

Scope:

- `/Users/aryamangupta/YELO/yelo-server`
- `/Users/aryamangupta/YELO/yelo-dashboard-angular`
- `/Users/aryamangupta/YELO/yelo-marketplace-webapp`

Excluded:

- `payment-gateways`
- `yelo-socket`
- `jungle-sms-server`

## Status

- VERIFIED: This file is the Phase 1 artifact holder for endpoint-level mapping.
- VERIFIED: Citation and evidence requirements are enforced by agent system policy in `lib/prompting/policy.js`.
- UNKNOWN: Full endpoint ownership map for the 3 repos is not yet materialized into this document.

## Required Output Format (for each endpoint)

1. Endpoint:
2. Owning service/repo:
3. Route registration file + line:
4. Controller/handler function + line:
5. Service/data layer function + line:
6. Request source (dashboard/marketplace) + line:
7. Auth boundary and middleware:
8. DB touchpoints (table/query evidence):
9. Contract notes (params/body/response/errors):
10. Confidence:
    - VERIFIED
    - INFERRED
    - UNKNOWN

## Next Materialization Step

Generate and append endpoint records by running retrieval prompts such as:

- "List all route registration files in yelo-server with citations."
- "Trace dashboard API calls to yelo-server for merchant order operations with citations."
- "Trace marketplace API calls to yelo-server for customer order operations with citations."

Then manually review each record for false positives before sharing.
