package com.fyp.core.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

/** Response from the scoring service: probability + SHAP attribution. */
public record ScoreResponse(
        @JsonProperty("model_version") String modelVersion,
        @JsonProperty("probability") double probability,
        @JsonProperty("base_value") double baseValue,
        @JsonProperty("shap") List<ShapItem> shap
) { }
