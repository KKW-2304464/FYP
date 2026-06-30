package com.fyp.core.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

/** One feature's SHAP contribution, as returned by the scoring service. */
public record ShapItem(
        @JsonProperty("feature") String feature,
        @JsonProperty("value") String value,
        @JsonProperty("shap_value") double shapValue
) { }
