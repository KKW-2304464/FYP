package com.fyp.core.controller;

import com.fyp.core.dto.ApplicationRequest;
import com.fyp.core.dto.ApplicationResponse;
import com.fyp.core.dto.DecisionRequest;
import com.fyp.core.service.ApplicationService;
import com.fyp.core.service.AuditService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Loan application API.
 *
 * RBAC note: in this spine, role checks are not yet wired (that comes with the
 * Auth/Gateway increment). The intended policy is:
 *   - SME  : POST /applications, GET /applications/{ownId}, GET /applications?applicantId=self
 *   - ADMIN: GET /applications?status=PENDING_REVIEW, POST /applications/{id}/decision,
 *            GET /applications/{id}/history
 * These will be enforced with @PreAuthorize on the methods below once JWT auth lands.
 */
@RestController
@RequestMapping("/api/applications")
public class ApplicationController {

    private final ApplicationService applicationService;
    private final AuditService auditService;

    public ApplicationController(ApplicationService applicationService, AuditService auditService) {
        this.applicationService = applicationService;
        this.auditService = auditService;
    }

    /** SME submits an application; it is scored synchronously and returned PENDING_REVIEW. */
    @PostMapping
    public ResponseEntity<ApplicationResponse> submit(@Valid @RequestBody ApplicationRequest request) {
        ApplicationResponse created = applicationService.submitAndScore(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @GetMapping("/{id}")
    public ApplicationResponse get(@PathVariable String id) {
        return applicationService.get(id);
    }

    /**
     * Admin review queue (status=PENDING_REVIEW) or an SME's own list (applicantId=...).
     * Exactly one of the two query params should be provided.
     */
    @GetMapping
    public List<ApplicationResponse> list(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String applicantId) {
        if (applicantId != null) {
            return applicationService.forApplicant(applicantId);
        }
        // default to the admin review queue
        return applicationService.pendingReview();
    }

    /** Admin records an approve/reject decision (override requires a reason). */
    @PostMapping("/{id}/decision")
    public ApplicationResponse decide(@PathVariable String id,
                                      @Valid @RequestBody DecisionRequest request) {
        return applicationService.decide(id, request);
    }

    /** Audit trail of an application (Envers revisions). */
    @GetMapping("/{id}/history")
    public List<AuditService.RevisionView> history(@PathVariable String id) {
        return auditService.history(id);
    }
}
