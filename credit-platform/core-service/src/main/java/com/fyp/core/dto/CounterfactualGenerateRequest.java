package com.fyp.core.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;

import java.util.List;

public record CounterfactualGenerateRequest(
        @NotEmpty List<String> allowedFields,
        @Min(1) @Max(5) Integer maxResults
) { }
