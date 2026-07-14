package com.fyp.core.client;

import com.fyp.core.dto.ScoreRequest;
import com.fyp.core.dto.ScoreResponse;
import com.fyp.core.dto.ModelInfoResponse;
import com.fyp.core.dto.CounterfactualModelResponse;
import com.fyp.core.dto.ScoringCounterfactualRequest;
import com.fyp.core.exception.ScoringUnavailableException;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.time.Duration;

/**
 * Talks to the Python scoring service over HTTP/JSON.
 *
 * Communication is SYNCHRONOUS REST on purpose: a single scoring call is
 * millisecond-scale, and the only "async" in this system is the human review step,
 * which is modelled as persisted workflow state — not as inter-service events.
 * That is why there is no message broker (Kafka/RabbitMQ) here.
 *
 * .block() is used deliberately: the Core service is a servlet-stack (Web MVC)
 * application orchestrating one downstream call per request, so blocking on the
 * reactive client is the correct, simplest choice rather than going reactive
 * end-to-end.
 */
@Component
public class ScoringClient {

    private final WebClient scoringWebClient;

    public ScoringClient(WebClient scoringWebClient) {
        this.scoringWebClient = scoringWebClient;
    }

    public ScoreResponse score(ScoreRequest request) {
        try {
            return scoringWebClient.post()
                    .uri("/score")
                    .bodyValue(request)
                    .retrieve()
                    .bodyToMono(ScoreResponse.class)
                    .timeout(Duration.ofSeconds(10))
                    .block();
        } catch (WebClientResponseException e) {
            // scoring service reachable but returned 4xx/5xx
            throw new ScoringUnavailableException(
                    "Scoring service error: " + e.getStatusCode() + " " + e.getResponseBodyAsString(), e);
        } catch (Exception e) {
            // network/timeout/connection refused
            throw new ScoringUnavailableException(
                    "Scoring service unreachable: " + e.getMessage(), e);
        }
    }

    public ModelInfoResponse modelInfo() {
        try {
            return scoringWebClient.get()
                    .uri("/model-info")
                    .retrieve()
                    .bodyToMono(ModelInfoResponse.class)
                    .timeout(Duration.ofSeconds(5))
                    .block();
        } catch (WebClientResponseException e) {
            throw new ScoringUnavailableException(
                    "Scoring service error: " + e.getStatusCode() + " " + e.getResponseBodyAsString(), e);
        } catch (Exception e) {
            throw new ScoringUnavailableException(
                    "Scoring service unreachable: " + e.getMessage(), e);
        }
    }

    public CounterfactualModelResponse counterfactual(ScoringCounterfactualRequest request) {
        try {
            return scoringWebClient.post()
                    .uri("/counterfactual")
                    .bodyValue(request)
                    .retrieve()
                    .bodyToMono(CounterfactualModelResponse.class)
                    .timeout(Duration.ofSeconds(20))
                    .block();
        } catch (WebClientResponseException e) {
            throw new ScoringUnavailableException(
                    "Scoring service error: " + e.getStatusCode() + " " + e.getResponseBodyAsString(), e);
        } catch (Exception e) {
            throw new ScoringUnavailableException(
                    "Scoring service unreachable: " + e.getMessage(), e);
        }
    }
}
