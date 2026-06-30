package com.fyp.core.exception;

/** Raised when the scoring service cannot be reached or returns an error. */
public class ScoringUnavailableException extends RuntimeException {
    public ScoringUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
