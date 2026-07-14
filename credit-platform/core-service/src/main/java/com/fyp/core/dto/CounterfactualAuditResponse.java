package com.fyp.core.dto;

import java.time.Instant;
import java.util.List;

public record CounterfactualAuditResponse(
        String auditId,
        String applicationId,
        String generatedBy,
        Instant createdAt,
        List<String> allowedFields,
        CounterfactualModelResponse result
) { }
