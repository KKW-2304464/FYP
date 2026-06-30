package com.fyp.core.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;

/**
 * Inbound application from the SME client (structured form -> JSON).
 *
 * Note: SMEs submit a *form*, not a CSV upload. CSV is reserved for admin bulk
 * testing. "Structured input" here means a validated JSON form payload.
 *
 * applicantId is carried in the body for this spine demo; once the Auth/Gateway
 * increment lands it will be derived from the JWT subject instead.
 */
public record ApplicationRequest(
        @NotBlank String applicantId,
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
        @PositiveOrZero double grAppv,
        @PositiveOrZero double sbaAppv,
        @Min(0) int franchiseCode
) {
    /** Map the inbound application to the scoring-service request contract. */
    public ScoreRequest toScoreRequest() {
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
