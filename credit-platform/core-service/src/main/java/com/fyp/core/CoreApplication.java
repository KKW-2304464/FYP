package com.fyp.core;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Core Service entry point.
 *
 * This is the "thick" Java service that EARNS the JVM choice: it owns the
 * stateful loan workflow (a state machine), the admin decision + override-with-reason
 * audit, and the synchronous orchestration of the Python scoring service. It is not a
 * thin proxy — that distinction is what survives the "why not all Python?" question.
 */
@SpringBootApplication
public class CoreApplication {
    public static void main(String[] args) {
        SpringApplication.run(CoreApplication.class, args);
    }
}
