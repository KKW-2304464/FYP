package com.fyp.core.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;

public record ApplicationRequest(
        String applicantId,
        @NotBlank String state,
        @NotBlank String bankState,
        @NotBlank String naicsSector,
        @Min(1) int termMonths,
        @Min(0) Integer noEmp,
        String newExist,
        @Min(0) Integer createJob,
        @Min(0) Integer retainedJob,
        String urbanRural,
        String revLineCr,
        String lowDoc,
        @Positive double grAppv,
        @PositiveOrZero double sbaAppv,
        @Min(0) int franchiseCode,
        @Valid @NotNull DataProvenanceRequest provenance
) {
    public ScoreRequest toScoreRequest() {
        if (sbaAppv > grAppv) {
            throw new IllegalArgumentException("SBA approved amount cannot exceed gross approved amount.");
        }
        return new ScoreRequest(
                state, bankState, naicsSector, termMonths, noEmp,
                newExist == null ? "Unknown" : newExist,
                createJob, retainedJob,
                urbanRural == null ? "Unknown" : urbanRural,
                revLineCr == null ? "Unknown" : revLineCr,
                lowDoc == null ? "Unknown" : lowDoc,
                grAppv, sbaAppv, franchiseCode
        );
    }
}
