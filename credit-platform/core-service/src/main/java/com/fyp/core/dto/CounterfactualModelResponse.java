package com.fyp.core.dto;

import com.fasterxml.jackson.annotation.JsonAlias;

import java.util.List;

public record CounterfactualModelResponse(
        @JsonAlias("model_version") String modelVersion,
        @JsonAlias("original_probability") double originalProbability,
        @JsonAlias("target_probability") double targetProbability,
        @JsonAlias("allowed_fields") List<String> allowedFields,
        @JsonAlias("reference_source") String referenceSource,
        @JsonAlias("generated_candidates") int generatedCandidates,
        List<Scenario> results,
        String message
) {
    public record Scenario(
            int rank,
            double probability,
            @JsonAlias("probability_reduction") double probabilityReduction,
            @JsonAlias("target_met") boolean targetMet,
            List<Change> changes
    ) { }

    public record Change(
            String field,
            @JsonAlias("from_value") double fromValue,
            @JsonAlias("to_value") double toValue,
            @JsonAlias("percent_change") Double percentChange
    ) { }
}
