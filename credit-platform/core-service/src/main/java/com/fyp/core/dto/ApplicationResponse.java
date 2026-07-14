package com.fyp.core.dto;

import com.fyp.core.domain.ApplicationStatus;
import com.fyp.core.domain.DecisionType;
import com.fyp.core.domain.InputSource;

import java.time.Instant;
import java.util.List;

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
        Instant decidedAt,
        InputSource inputSource,
        String sourceReference,
        Instant collectedAt,
        Instant consentConfirmedAt,
        boolean dataConfirmed
) { }
