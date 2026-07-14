package com.fyp.core.dto;

import com.fyp.core.domain.DecisionType;
import jakarta.validation.constraints.NotNull;

/**
 * Admin's decision on an application.
 *
 * `reason` is optional in general but BECOMES REQUIRED when the admin overrides
 * the model-derived suggestion — that override-with-reason is captured for audit.
 * The requirement is enforced in the service layer (it needs the suggestion to
 * decide whether this is an override).
 *
 * decidedBy is carried in the body for the demo; later from the JWT subject.
 */
public record DecisionRequest(
        @NotNull DecisionType decision,
        String reason,
        String decidedBy
) { }
