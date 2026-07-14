package com.fyp.core.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fyp.core.client.ScoringClient;
import com.fyp.core.domain.ApplicationStatus;
import com.fyp.core.domain.DecisionType;
import com.fyp.core.domain.LoanApplication;
import com.fyp.core.dto.AdminMetricsResponse;
import com.fyp.core.dto.ApplicationRequest;
import com.fyp.core.dto.ApplicationResponse;
import com.fyp.core.dto.DecisionRequest;
import com.fyp.core.dto.ScoreResponse;
import com.fyp.core.dto.ShapItem;
import com.fyp.core.exception.ApplicationNotFoundException;
import com.fyp.core.exception.ForbiddenException;
import com.fyp.core.repository.LoanApplicationRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * The workflow owner. This is where the Java tier does real work — orchestration,
 * the state machine, the business threshold, and the audited human decision —
 * which is what justifies it being a separate (Spring/JVM) service rather than a
 * thin pass-through to Python.
 */
@Service
public class ApplicationService {

    private final LoanApplicationRepository repository;
    private final ScoringClient scoringClient;
    private final ObjectMapper objectMapper;

    /**
     * Business decision threshold on P(default): probability < threshold => suggest APPROVE.
     * The threshold lives in the BUSINESS tier, not the model, because it is a cost
     * decision (the cost-optimal threshold from the offline decision analysis / COST_RATIO).
     * Injected from config so it can be tuned without retraining or redeploying the model.
     */
    private final double threshold;

    public ApplicationService(LoanApplicationRepository repository,
                              ScoringClient scoringClient,
                              ObjectMapper objectMapper,
                              @Value("${decision.threshold}") double threshold) {
        this.repository = repository;
        this.scoringClient = scoringClient;
        this.objectMapper = objectMapper;
        this.threshold = threshold;
    }

    /**
     * Intake -> score -> ready for review, in one transaction.
     *
     * The whole flow is atomic: if scoring fails, nothing is half-committed
     * (no application stuck in a SCORED-but-no-score limbo). This single-aggregate
     * ACID guarantee is one of the concrete reasons the workflow is relational and
     * lives in one service.
     */
    @Transactional
    public ApplicationResponse submitAndScore(ApplicationRequest request) {
        return submitAndScore(request, null);
    }

    @Transactional
    public ApplicationResponse submitAndScore(ApplicationRequest request, String authenticatedUserId) {
        String applicantId = firstNonBlank(authenticatedUserId, request.applicantId());
        if (isBlank(applicantId)) {
            throw new IllegalArgumentException("Applicant identity is required.");
        }
        String featuresJson = writeJson(request);

        var provenance = request.provenance();
        LoanApplication app = LoanApplication.intake(
                applicantId,
                featuresJson,
                provenance.source(),
                provenance.sourceReference(),
                provenance.collectedAt(),
                provenance.consentConfirmedAt(),
                provenance.dataConfirmed());
        app = repository.save(app); // SUBMITTED

        // synchronous orchestration of the scoring service
        ScoreResponse score = scoringClient.score(request.toScoreRequest());

        app.transitionTo(ApplicationStatus.SCORED);
        String suggestion = score.probability() < threshold ? "APPROVE" : "REJECT";
        app.attachScore(
                score.probability(),
                score.modelVersion(),
                writeShap(score.shap()),
                suggestion,
                threshold);

        app.transitionTo(ApplicationStatus.PENDING_REVIEW);
        return toResponse(repository.save(app));
    }

    @Transactional(readOnly = true)
    public ApplicationResponse get(String id) {
        return toResponse(find(id));
    }

    @Transactional(readOnly = true)
    public ApplicationResponse getVisible(String id, String userId, String role) {
        return toResponse(findVisible(id, userId, role));
    }

    /** Admin review queue. */
    @Transactional(readOnly = true)
    public List<ApplicationResponse> pendingReview() {
        return repository.findByStatusOrderByCreatedAtAsc(ApplicationStatus.PENDING_REVIEW)
                .stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<ApplicationResponse> byStatus(String status) {
        ApplicationStatus parsed = parseStatus(status);
        return repository.findByStatusOrderByCreatedAtAsc(parsed)
                .stream().map(this::toResponse).toList();
    }

    /** SME's own applications (RBAC: scoped to the owner). */
    @Transactional(readOnly = true)
    public List<ApplicationResponse> forApplicant(String applicantId) {
        return repository.findByApplicantIdOrderByCreatedAtDesc(applicantId)
                .stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<ApplicationResponse> listVisible(String status, String applicantId, String userId, String role) {
        if (isGatewayMode(role)) {
            if (isAdmin(role)) {
                return isBlank(status) ? pendingReview() : byStatus(status);
            }
            return forApplicant(requireUserId(userId));
        }

        if (!isBlank(applicantId)) {
            return forApplicant(applicantId);
        }
        if (!isBlank(status)) {
            return byStatus(status);
        }
        return pendingReview();
    }

    /**
     * Admin approves/rejects. Enforces:
     *  - the application must be PENDING_REVIEW (state machine),
     *  - if the decision contradicts the model suggestion, a reason is MANDATORY
     *    (this is the override-with-reason captured for audit).
     * Envers records the resulting change automatically.
     */
    @Transactional
    public ApplicationResponse decide(String id, DecisionRequest request) {
        return decide(id, request, null, null);
    }

    @Transactional
    public ApplicationResponse decide(String id, DecisionRequest request, String actor, String role) {
        ensureAdminOrDirect(role);
        LoanApplication app = find(id);
        String decidedBy = firstNonBlank(actor, request.decidedBy());
        if (isBlank(decidedBy)) {
            throw new IllegalArgumentException("Decision actor is required.");
        }

        boolean suggestApprove = "APPROVE".equals(app.getSuggestion());
        boolean adminApprove = request.decision() == DecisionType.APPROVED;
        boolean isOverride = suggestApprove != adminApprove;

        if (isOverride && isBlank(request.reason())) {
            throw new IllegalArgumentException(
                    "Overriding the model suggestion (" + app.getSuggestion()
                    + ") requires a reason.");
        }

        app.transitionTo(ApplicationStatus.DECIDED); // rejects re-deciding a DECIDED app
        app.recordDecision(request.decision(), request.reason(), decidedBy);
        return toResponse(repository.save(app));
    }

    @Transactional(readOnly = true)
    public LoanApplication visibleEntity(String id, String userId, String role) {
        return findVisible(id, userId, role);
    }

    @Transactional(readOnly = true)
    public AdminMetricsResponse metrics(String role) {
        ensureAdminOrDirect(role);
        List<LoanApplication> all = repository.findAll();
        Map<String, Long> byStatus = new LinkedHashMap<>();
        for (ApplicationStatus status : ApplicationStatus.values()) {
            long count = all.stream().filter(a -> a.getStatus() == status).count();
            byStatus.put(status.name(), count);
        }

        Map<String, Long> bySuggestion = all.stream()
                .map(LoanApplication::getSuggestion)
                .filter(Objects::nonNull)
                .collect(Collectors.groupingBy(s -> s, LinkedHashMap::new, Collectors.counting()));

        double averageProbability = all.stream()
                .map(LoanApplication::getProbability)
                .filter(Objects::nonNull)
                .mapToDouble(Double::doubleValue)
                .average()
                .orElse(0.0);

        long approved = all.stream().filter(a -> a.getDecision() == DecisionType.APPROVED).count();
        long rejected = all.stream().filter(a -> a.getDecision() == DecisionType.REJECTED).count();

        return new AdminMetricsResponse(
                all.size(),
                byStatus.getOrDefault(ApplicationStatus.PENDING_REVIEW.name(), 0L),
                byStatus.getOrDefault(ApplicationStatus.DECIDED.name(), 0L),
                approved,
                rejected,
                averageProbability,
                byStatus,
                bySuggestion,
                repository.findTop10ByOrderByCreatedAtDesc().stream().map(this::toResponse).toList());
    }

    // ---- helpers ----

    private LoanApplication find(String id) {
        return repository.findById(id)
                .orElseThrow(() -> new ApplicationNotFoundException(id));
    }

    private LoanApplication findVisible(String id, String userId, String role) {
        LoanApplication app = find(id);
        if (isGatewayMode(role) && !isAdmin(role) && !app.getApplicantId().equals(requireUserId(userId))) {
            throw new ForbiddenException("You can only access your own applications.");
        }
        return app;
    }

    private ApplicationResponse toResponse(LoanApplication a) {
        return new ApplicationResponse(
                a.getId(), a.getApplicantId(), a.getStatus(),
                a.getProbability(), a.getSuggestion(), a.getThresholdUsed(),
                a.getModelVersion(), readShap(a.getShapJson()),
                a.getDecision(), a.getDecisionReason(), a.getDecidedBy(),
                a.getCreatedAt(), a.getDecidedAt(),
                a.getInputSource(), a.getSourceReference(), a.getCollectedAt(),
                a.getConsentConfirmedAt(), a.isDataConfirmed());
    }

    private String writeJson(Object o) {
        try {
            return objectMapper.writeValueAsString(o);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("Failed to serialize features", e);
        }
    }

    private String writeShap(List<ShapItem> shap) {
        try {
            return objectMapper.writeValueAsString(shap);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("Failed to serialize SHAP", e);
        }
    }

    private List<ShapItem> readShap(String json) {
        if (json == null) return Collections.emptyList();
        try {
            return objectMapper.readValue(
                    json, objectMapper.getTypeFactory()
                            .constructCollectionType(List.class, ShapItem.class));
        } catch (JsonProcessingException e) {
            return Collections.emptyList();
        }
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private static String firstNonBlank(String first, String second) {
        return !isBlank(first) ? first : second;
    }

    private static String requireUserId(String userId) {
        if (isBlank(userId)) {
            throw new ForbiddenException("Authenticated user identity is missing.");
        }
        return userId;
    }

    private static boolean isGatewayMode(String role) {
        return !isBlank(role);
    }

    private static boolean isAdmin(String role) {
        return "ADMIN".equals(role);
    }

    private static void ensureAdminOrDirect(String role) {
        if (isGatewayMode(role) && !isAdmin(role)) {
            throw new ForbiddenException("Admin role is required.");
        }
    }

    private static ApplicationStatus parseStatus(String status) {
        try {
            return ApplicationStatus.valueOf(status);
        } catch (Exception e) {
            throw new IllegalArgumentException("Unknown application status: " + status);
        }
    }
}
