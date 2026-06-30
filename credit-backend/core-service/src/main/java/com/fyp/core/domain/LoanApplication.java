package com.fyp.core.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.envers.Audited;
import org.hibernate.type.SqlTypes;

import java.time.Instant;

/**
 * A single MSME loan application and its decision.
 *
 * Bounded-context note (lit review): application intake and the decision are ONE
 * aggregate, kept in one service on purpose. Splitting them would force a
 * distributed transaction across the state machine, which contradicts the
 * project's explicit decision to avoid sagas / distributed transactions.
 *
 * Storage note: the raw submitted features and the SHAP explanation are
 * semi-structured, so they live in Postgres JSONB columns (@JdbcTypeCode JSON).
 * This keeps a relational core for the workflow while avoiding a second database
 * technology — there is no part of this model that a relational store cannot handle,
 * so NoSQL is deliberately not used.
 *
 * @Audited (Hibernate Envers) transparently versions every change to this entity
 * into a *_AUD table. That is what makes the admin override + reason auditable and
 * the decision reproducible, at near-zero code cost.
 */
@Entity
@Audited
@Table(name = "loan_application")
public class LoanApplication {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    /** Owner of the application (the SME). Later sourced from the JWT subject. */
    @Column(nullable = false, updatable = false)
    private String applicantId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ApplicationStatus status;

    /** Raw application fields exactly as submitted (audit trail of the input). */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private String featuresJson;

    // ---- model output ----
    private Double probability;          // P(default) from the scoring service

    @Column(length = 64)
    private String modelVersion;         // which model version produced the score

    /** Per-applicant SHAP attribution, as returned by the scoring service. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private String shapJson;

    /** Threshold-derived suggestion shown to the admin (APPROVE / REJECT). */
    @Column(length = 16)
    private String suggestion;

    @Column
    private Double thresholdUsed;        // the business threshold at scoring time

    // ---- human decision ----
    @Enumerated(EnumType.STRING)
    @Column(length = 16)
    private DecisionType decision;       // null until decided

    @Column(length = 1000)
    private String decisionReason;       // required when overriding the suggestion

    @Column(length = 64)
    private String decidedBy;            // admin id (later from JWT)

    @Column(updatable = false)
    private Instant createdAt;

    private Instant decidedAt;

    // ---- lifecycle hooks ----
    protected LoanApplication() { } // JPA

    public static LoanApplication intake(String applicantId, String featuresJson) {
        LoanApplication a = new LoanApplication();
        a.applicantId = applicantId;
        a.featuresJson = featuresJson;
        a.status = ApplicationStatus.SUBMITTED;
        a.createdAt = Instant.now();
        return a;
    }

    /** Single choke point for state changes; rejects illegal transitions. */
    public void transitionTo(ApplicationStatus target) {
        if (!this.status.canTransitionTo(target)) {
            throw new IllegalStateException(
                    "Illegal transition: " + this.status + " -> " + target);
        }
        this.status = target;
    }

    public void attachScore(double probability, String modelVersion, String shapJson,
                            String suggestion, double thresholdUsed) {
        this.probability = probability;
        this.modelVersion = modelVersion;
        this.shapJson = shapJson;
        this.suggestion = suggestion;
        this.thresholdUsed = thresholdUsed;
    }

    public void recordDecision(DecisionType decision, String reason, String decidedBy) {
        this.decision = decision;
        this.decisionReason = reason;
        this.decidedBy = decidedBy;
        this.decidedAt = Instant.now();
    }

    // ---- getters ----
    public String getId() { return id; }
    public String getApplicantId() { return applicantId; }
    public ApplicationStatus getStatus() { return status; }
    public String getFeaturesJson() { return featuresJson; }
    public Double getProbability() { return probability; }
    public String getModelVersion() { return modelVersion; }
    public String getShapJson() { return shapJson; }
    public String getSuggestion() { return suggestion; }
    public Double getThresholdUsed() { return thresholdUsed; }
    public DecisionType getDecision() { return decision; }
    public String getDecisionReason() { return decisionReason; }
    public String getDecidedBy() { return decidedBy; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getDecidedAt() { return decidedAt; }
}
