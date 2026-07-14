package com.fyp.core.dto;

import com.fyp.core.domain.InputSource;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;

public record DataProvenanceRequest(
        @NotNull InputSource source,
        @Size(max = 120) String sourceReference,
        @NotNull Instant collectedAt,
        @NotNull Instant consentConfirmedAt,
        @AssertTrue(message = "Applicant consent must be confirmed") boolean consentGiven,
        @AssertTrue(message = "Submitted data must be manually confirmed") boolean dataConfirmed
) { }
