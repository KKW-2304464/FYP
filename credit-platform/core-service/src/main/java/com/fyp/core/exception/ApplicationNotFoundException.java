package com.fyp.core.exception;

/** Raised when an application id does not exist. */
public class ApplicationNotFoundException extends RuntimeException {
    public ApplicationNotFoundException(String id) {
        super("Application not found: " + id);
    }
}
