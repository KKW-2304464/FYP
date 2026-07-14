package com.fyp.core.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Request body sent to the Python scoring service POST /score.
 * Field names are mapped to the snake_case wire contract defined by the
 * FastAPI ApplicationFeatures schema — this record IS the Java side of that contract.
 */
public record ScoreRequest(
        @JsonProperty("state") String state,
        @JsonProperty("bank_state") String bankState,
        @JsonProperty("naics_sector") String naicsSector,
        @JsonProperty("term_months") int termMonths,
        @JsonProperty("no_emp") Integer noEmp,
        @JsonProperty("new_exist") String newExist,
        @JsonProperty("create_job") Integer createJob,
        @JsonProperty("retained_job") Integer retainedJob,
        @JsonProperty("urban_rural") String urbanRural,
        @JsonProperty("rev_line_cr") String revLineCr,
        @JsonProperty("low_doc") String lowDoc,
        @JsonProperty("gr_appv") double grAppv,
        @JsonProperty("sba_appv") double sbaAppv,
        @JsonProperty("franchise_code") int franchiseCode
) { }
