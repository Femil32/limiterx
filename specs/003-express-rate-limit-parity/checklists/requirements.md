# Checklist: Requirements Quality — spec-003

**Feature**: `003-express-rate-limit-parity`

---

## Spec Completeness

- [x] All mandatory sections present (summary, user stories, functional requirements, success criteria)
- [x] No `TODO` or `NEEDS CLARIFICATION` markers remaining
- [x] Each user story has at least two acceptance scenarios
- [x] Edge cases identified for each major feature
- [x] Success criteria are measurable and tech-agnostic
- [x] All 12 gaps from research.md are covered in spec, data-model, or plan

## Requirements Quality

- [x] Requirements specify WHAT, not HOW (implementation details are in plan.md, not spec.md)
- [x] All `FR-P03-*` IDs are unique and non-overlapping with spec-001/002 IDs
- [x] Each FR is testable (can write a pass/fail assertion for it)
- [x] Non-functional requirements include measurable targets (bundle size bytes, coverage %)
- [x] No requirements depend on unresolved external decisions

## Backward Compatibility

- [x] All new fields are optional
- [x] Each field's default is documented
- [x] Breaking changes (ipv6Subnet default) are explicitly called out with migration notes
- [x] spec-001 functional requirements are not violated (FR-009: no X-RateLimit-* by default — preserved via `legacyHeaders: false` default)

## Scope

- [x] Phase A (P0/P1/P2) is independently shippable
- [x] Phase B (P3/P4) is independently shippable after Phase A
- [x] Each gap is labelled with its phase assignment
- [x] `rateLimitEdge` limitations are documented (skipSuccessfulRequests unsupported)

## Contracts

- [x] `contracts/config-fields.md` covers all Phase A fields with invariants
- [x] `contracts/headers.md` specifies exact header format and the epoch-vs-relative distinction
- [x] `contracts/skip-requests.md` specifies decrement lifecycle and edge cases

## Notes

- The `ipv6Subnet: 56` default intentionally changes IPv6 key generation. This is a security fix and is documented in plan.md, data-model.md, and contracts/config-fields.md.
- `legacyHeaders: false` default is a deliberate divergence from express-rate-limit's default of `true`, motivated by spec-001 FR-009.
