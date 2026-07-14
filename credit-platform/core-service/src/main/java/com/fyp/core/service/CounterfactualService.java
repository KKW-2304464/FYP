package com.fyp.core.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fyp.core.client.ScoringClient;
import com.fyp.core.domain.CounterfactualRecord;
import com.fyp.core.domain.LoanApplication;
import com.fyp.core.dto.ApplicationRequest;
import com.fyp.core.dto.CounterfactualAuditResponse;
import com.fyp.core.dto.CounterfactualGenerateRequest;
import com.fyp.core.dto.CounterfactualModelResponse;
import com.fyp.core.dto.ScoringCounterfactualRequest;
import com.fyp.core.repository.CounterfactualRecordRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Service
public class CounterfactualService {

    private static final Set<String> MUTABLE_FIELDS = Set.of("term_months", "gr_appv", "sba_appv");

    private final ApplicationService applicationService;
    private final ScoringClient scoringClient;
    private final CounterfactualRecordRepository repository;
    private final ObjectMapper objectMapper;

    public CounterfactualService(ApplicationService applicationService,
                                 ScoringClient scoringClient,
                                 CounterfactualRecordRepository repository,
                                 ObjectMapper objectMapper) {
        this.applicationService = applicationService;
        this.scoringClient = scoringClient;
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public CounterfactualAuditResponse generate(String applicationId,
                                                CounterfactualGenerateRequest request,
                                                String userId,
                                                String role) {
        LoanApplication application = applicationService.visibleEntity(applicationId, userId, role);
        List<String> allowed = validateAllowedFields(request.allowedFields());
        ApplicationRequest original = read(application.getFeaturesJson(), ApplicationRequest.class);
        double target = application.getThresholdUsed();
        int maxResults = request.maxResults() == null ? 3 : request.maxResults();

        ScoringCounterfactualRequest scoringRequest = new ScoringCounterfactualRequest(
                original.toScoreRequest(), target, allowed, maxResults);
        CounterfactualModelResponse result = scoringClient.counterfactual(scoringRequest);
        String actor = userId == null || userId.isBlank() ? "direct-service" : userId;

        CounterfactualRecord saved = repository.save(CounterfactualRecord.create(
                applicationId,
                result.modelVersion(),
                actor,
                write(scoringRequest),
                write(result)));
        return toResponse(saved, allowed, result);
    }

    @Transactional(readOnly = true)
    public List<CounterfactualAuditResponse> history(String applicationId, String userId, String role) {
        applicationService.visibleEntity(applicationId, userId, role);
        return repository.findByApplicationIdOrderByCreatedAtDesc(applicationId).stream()
                .map(record -> {
                    ScoringCounterfactualRequest request = read(record.getRequestJson(), ScoringCounterfactualRequest.class);
                    CounterfactualModelResponse result = read(record.getResultJson(), CounterfactualModelResponse.class);
                    return toResponse(record, request.allowedFields(), result);
                })
                .toList();
    }

    private List<String> validateAllowedFields(List<String> fields) {
        LinkedHashSet<String> unique = new LinkedHashSet<>(fields);
        if (unique.isEmpty() || !MUTABLE_FIELDS.containsAll(unique)) {
            throw new IllegalArgumentException("Allowed fields must be selected from term_months, gr_appv, sba_appv.");
        }
        return List.copyOf(unique);
    }

    private CounterfactualAuditResponse toResponse(CounterfactualRecord record,
                                                   List<String> allowed,
                                                   CounterfactualModelResponse result) {
        return new CounterfactualAuditResponse(
                record.getId(), record.getApplicationId(), record.getGeneratedBy(),
                record.getCreatedAt(), allowed, result);
    }

    private String write(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("Unable to serialize counterfactual audit record.", e);
        }
    }

    private <T> T read(String json, Class<T> type) {
        try {
            return objectMapper.readValue(json, type);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("Unable to read stored counterfactual data.", e);
        }
    }
}
