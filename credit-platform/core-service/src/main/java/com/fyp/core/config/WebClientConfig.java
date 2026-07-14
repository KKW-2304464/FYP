package com.fyp.core.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.reactive.function.client.WebClient;

/**
 * WebClient pointed at the Python scoring service.
 *
 * The base URL comes from the SCORING_BASE_URL env var so the same build runs
 * locally (http://localhost:8000) and under docker-compose
 * (http://scoring-service:8000, resolved by compose's built-in DNS — which is
 * exactly why no service-discovery component like Eureka is needed for a small
 * static topology).
 */
@Configuration
public class WebClientConfig {

    @Bean
    public WebClient scoringWebClient(
            @Value("${scoring.base-url}") String baseUrl,
            WebClient.Builder builder) {
        return builder.baseUrl(baseUrl).build();
    }
}
