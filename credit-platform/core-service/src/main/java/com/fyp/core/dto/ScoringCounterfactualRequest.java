package com.fyp.core.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

public record ScoringCounterfactualRequest(
        @JsonProperty("features") ScoreRequest features,
        @JsonProperty("target_probability") double targetProbability,
        @JsonProperty("allowed_fields") List<String> allowedFields,
        @JsonProperty("max_results") int maxResults
) { }
