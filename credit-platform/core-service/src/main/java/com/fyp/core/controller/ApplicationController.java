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
import org.springframework.web.bind.annotation.RequestHeader;
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
    public ResponseEntity<ApplicationResponse> submit(
            @Valid @RequestBody ApplicationRequest request,
            @RequestHeader(value = "X-User-Id", required = false) String userId) {
        ApplicationResponse created = applicationService.submitAndScore(request, userId);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @GetMapping("/{id}")
    public ApplicationResponse get(
            @PathVariable String id,
            @RequestHeader(value = "X-User-Id", required = false) String userId,
            @RequestHeader(value = "X-User-Role", required = false) String role) {
        return applicationService.getVisible(id, userId, role);
    }

    /**
     * Admin review queue (status=PENDING_REVIEW) or an SME's own list (applicantId=...).
     * Exactly one of the two query params should be provided.
     */
    @GetMapping
    public List<ApplicationResponse> list(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String applicantId,
            @RequestHeader(value = "X-User-Id", required = false) String userId,
            @RequestHeader(value = "X-User-Role", required = false) String role) {
        return applicationService.listVisible(status, applicantId, userId, role);
    }

    /** Admin records an approve/reject decision (override requires a reason). */
    @PostMapping("/{id}/decision")
    public ApplicationResponse decide(@PathVariable String id,
                                      @Valid @RequestBody DecisionRequest request,
                                      @RequestHeader(value = "X-User-Email", required = false) String email,
                                      @RequestHeader(value = "X-User-Id", required = false) String userId,
                                      @RequestHeader(value = "X-User-Role", required = false) String role) {
        String actor = email == null || email.isBlank() ? userId : email;
        return applicationService.decide(id, request, actor, role);
    }

    /** Audit trail of an application (Envers revisions). */
    @GetMapping("/{id}/history")
    public List<AuditService.RevisionView> history(
            @PathVariable String id,
            @RequestHeader(value = "X-User-Id", required = false) String userId,
            @RequestHeader(value = "X-User-Role", required = false) String role) {
        applicationService.getVisible(id, userId, role);
        return auditService.history(id);
    }
}
