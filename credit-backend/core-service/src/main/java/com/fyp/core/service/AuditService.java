package com.fyp.core.service;

import com.fyp.core.domain.DecisionType;
import com.fyp.core.domain.LoanApplication;
import jakarta.persistence.EntityManager;
import org.hibernate.envers.AuditReader;
import org.hibernate.envers.AuditReaderFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Reads the Envers-managed audit history of an application.
 *
 * Every change to LoanApplication (intake, score attach, decision/override) is
 * versioned by Envers into loan_application_AUD. This service surfaces that history
 * so an admin/auditor can see who decided what, when, and (crucially) the reason
 * given for any override — the reproducibility + accountability requirement.
 */
@Service
public class AuditService {

    private final EntityManager entityManager;

    public AuditService(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    public record RevisionView(
            Number revision,
            String status,
            Double probability,
            String suggestion,
            DecisionType decision,
            String decisionReason,
            String decidedBy
    ) { }

    @Transactional(readOnly = true)
    public List<RevisionView> history(String applicationId) {
        AuditReader reader = AuditReaderFactory.get(entityManager);
        List<Number> revisions = reader.getRevisions(LoanApplication.class, applicationId);

        return revisions.stream().map(rev -> {
            LoanApplication v = reader.find(LoanApplication.class, applicationId, rev);
            return new RevisionView(
                    rev,
                    v.getStatus() == null ? null : v.getStatus().name(),
                    v.getProbability(),
                    v.getSuggestion(),
                    v.getDecision(),
                    v.getDecisionReason(),
                    v.getDecidedBy());
        }).toList();
    }
}
