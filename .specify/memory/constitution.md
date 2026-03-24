<!--
Sync Impact Report
Version change: initial template → 1.0.0
Modified principles: N/A (first adoption; placeholders replaced)
Added sections: Core Principles I–IV, Technology Alignment, Development Workflow & Quality Gates, Governance
Removed sections: Template placeholder commentary (HTML examples) — superseded by concrete text
Templates requiring updates:
  - .specify/templates/plan-template.md ✅ updated (Constitution Check gates)
  - .specify/templates/spec-template.md ✅ updated (NFR subsection)
  - .specify/templates/tasks-template.md ✅ updated (testing/constitution alignment)
  - .specify/templates/commands/*.md — N/A (directory not present)
Follow-up TODOs: none
-->

# Limiterx Constitution

## Core Principles

### I. Code Quality & Maintainability

- All changes MUST pass automated linting and formatting gates defined in the repository (or add those gates before merge).
- TypeScript code MUST use project `strict` (or stricter) settings; use of `any` or unsafe casts MUST be justified in code review or in `plan.md` Complexity Tracking when unavoidable.
- Public API surface MUST remain coherent: new exports MUST be intentional, documented, and consistent with existing naming and module boundaries.
- Duplication MUST be eliminated via shared helpers when it affects correctness paths or adapter behavior; speculative abstractions are discouraged—justify non-obvious structure in the implementation plan.

**Rationale:** Limiterx is a library consumed across runtimes; maintainability and predictable structure reduce integration risk and security bugs.

### II. Testing Standards

- Behavior described in feature specs MUST map to automated tests: unit tests for algorithms and pure logic; contract tests for public API guarantees; integration tests for framework adapters and cross-runtime behavior where applicable.
- Regressions in rate-limiting correctness MUST NOT ship: failing tests MUST block merge unless the spec is explicitly revised and versioned.
- Test data MUST be deterministic; flaky tests MUST be fixed or quarantined with a tracked remediation—not ignored.

**Rationale:** Correctness of limits directly affects abuse protection, cost, and user trust; tests are the executable specification for a library.

### III. User Experience Consistency

- Configuration, defaults, and error reporting MUST remain consistent across adapters unless a platform constraint is documented (e.g., Edge vs Node)—then differences MUST be called out in docs and tests.
- Documentation, examples, and TypeScript types MUST reflect runtime behavior; drift between docs and code is treated as a defect.
- Breaking changes to the developer-facing API MUST follow semantic versioning and MUST include migration notes.

**Rationale:** The product promise is a unified mental model (“algorithm flexibility + developer ergonomics”) regardless of entry point.

### IV. Performance Requirements

- Changes touching hot paths (token counting, storage access, middleware execution) MUST state expected impact on latency and allocations; merges that regress documented benchmarks MUST either include optimization or an approved trade-off recorded in `plan.md`.
- Targets: interactive/API paths SHOULD stay within project-defined p95/p99 budgets where those exist; for new work, define budgets in the spec or plan before implementation.
- Memory and storage churn MUST be considered for edge and serverless deployments; unbounded growth MUST be prevented by design or configuration.

**Rationale:** Rate limiting runs on every request or client action; small regressions compound at scale.

## Technology Alignment

- Primary language: TypeScript (JavaScript emit as defined by the project). Runtimes: browser, Node.js, and edge as stated in project documentation.
- Adapters and public APIs MUST align with the package identity in the Limiterx PRD: unified configuration, first-class adapters for listed frameworks, and portable core logic.
- Dependencies MUST be minimal and justified; new runtime dependencies require review for bundle size, licensing, and security posture.

## Development Workflow & Quality Gates

- **`/speckit.plan` / Phase 0:** Constitution Check MUST pass before heavy research commitment; violations MUST use Complexity Tracking with justification.
- **Before merge:** CI MUST run lint, typecheck, and tests relevant to the change; reviewers MUST confirm alignment with Core Principles for scope touched.
- **Specs:** Feature specs SHOULD include measurable success criteria and constitution-aligned non-functional requirements (see spec template).
- **Releases:** Version bumps MUST follow semantic versioning; performance-sensitive releases SHOULD note benchmark or budget verification in changelog when applicable.

## Governance

- This constitution supersedes conflicting informal practices for Limiterx development and planning workflows that reference `.specify/`.
- **Amendments:** Proposed changes MUST be written to `.specify/memory/constitution.md`, with version bumped per semantic rules (MAJOR: incompatible governance or removed principles; MINOR: new principle or material new guidance; PATCH: clarifications and non-semantic edits). Dependent templates MUST be updated in the same change when gates or mandatory sections change.
- **Compliance:** Plan authors and reviewers MUST verify Constitution Check items; at least a lightweight review against Core Principles SHOULD occur before release tagging.
- **Runtime guidance:** Day-to-day coding conventions in repository docs (e.g. PRD, contributing guide when present) MUST not contradict this constitution; if they conflict, this document wins until amended.

**Version**: 1.0.0 | **Ratified**: 2026-03-23 | **Last Amended**: 2026-03-23
