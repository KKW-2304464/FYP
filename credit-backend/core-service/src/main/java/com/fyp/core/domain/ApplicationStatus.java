package com.fyp.core.domain;

import java.util.Map;
import java.util.Set;

/**
 * The loan application's lifecycle states.
 *
 * Workflow: SUBMITTED -> SCORED -> PENDING_REVIEW -> DECIDED
 *
 * Design note (lit review): we deliberately do NOT use Spring State Machine.
 * Four linear states do not justify that dependency. Transitions are enforced
 * in the service layer via the ALLOWED map below; any illegal transition
 * (e.g. deciding an application that was never scored, or re-deciding a DECIDED
 * one) throws. This keeps the workflow explicit and unit-testable.
 */
public enum ApplicationStatus {
    SUBMITTED,        // intake complete, not yet scored
    SCORED,           // model probability + SHAP attached
    PENDING_REVIEW,   // waiting for a human (admin) decision
    DECIDED;          // admin has approved/rejected (terminal)

    private static final Map<ApplicationStatus, Set<ApplicationStatus>> ALLOWED = Map.of(
            SUBMITTED, Set.of(SCORED),
            SCORED, Set.of(PENDING_REVIEW),
            PENDING_REVIEW, Set.of(DECIDED),
            DECIDED, Set.of()
    );

    public boolean canTransitionTo(ApplicationStatus target) {
        return ALLOWED.getOrDefault(this, Set.of()).contains(target);
    }
}
