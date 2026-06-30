package com.fyp.core.dto;

import com.fyp.core.domain.ApplicationStatus;
import com.fyp.core.domain.DecisionType;

import java.time.Instant;
import java.util.List;

/**
 * Application view returned to clients.
 *
 * For an SME this powers the explanation report (probability + SHAP factors +,
 * eventually, counterfactual "how to improve"). For an admin it powers the
 * review screen (suggestion + SHAP + decision controls).
 */
public record ApplicationResponse(
        String id,
        String applicantId,
        ApplicationStatus status,
        Double probability,
        String suggestion,
        Double thresholdUsed,
        String modelVersion,
        List<ShapItem> shap,
        DecisionType decision,
        String decisionReason,
        String decidedBy,
        Instant createdAt,
        Instant decidedAt
) { }
