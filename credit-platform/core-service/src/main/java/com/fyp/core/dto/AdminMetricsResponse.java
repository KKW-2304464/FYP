package com.fyp.core.dto;

import java.util.List;
import java.util.Map;

/**
 * Serving-time operational metrics for the admin dashboard.
 *
 * Deliberately scoped to what is HONESTLY observable in production without
 * ground-truth default outcomes: volume, approval rate, override rate, and
 * the predicted-probability distribution. Model discrimination (AUC) is NOT
 * reported here because outcomes are unobservable at serving time.
 */
public record AdminMetricsResponse(
        long totalApplications,
        long pendingReview,
        long decided,
        long approved,
        long rejected,
        double averageProbability,
        double approvalRate,
        long overrides,
        double overrideRate,
        double threshold,
        Map<String, Long> probabilityHistogram,
        Map<String, Long> byStatus,
        Map<String, Long> bySuggestion,
        List<ApplicationResponse> recentApplications
) { }