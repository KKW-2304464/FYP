package com.fyp.core.dto;

import java.util.List;
import java.util.Map;

public record AdminMetricsResponse(
        long totalApplications,
        long pendingReview,
        long decided,
        long approved,
        long rejected,
        double averageProbability,
        Map<String, Long> byStatus,
        Map<String, Long> bySuggestion,
        List<ApplicationResponse> recentApplications
) { }
