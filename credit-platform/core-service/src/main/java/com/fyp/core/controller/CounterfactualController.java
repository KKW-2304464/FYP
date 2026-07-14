package com.fyp.core.controller;

import com.fyp.core.dto.CounterfactualAuditResponse;
import com.fyp.core.dto.CounterfactualGenerateRequest;
import com.fyp.core.service.CounterfactualService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/applications/{applicationId}/counterfactuals")
public class CounterfactualController {

    private final CounterfactualService service;

    public CounterfactualController(CounterfactualService service) {
        this.service = service;
    }

    @PostMapping
    public CounterfactualAuditResponse generate(
            @PathVariable String applicationId,
            @Valid @RequestBody CounterfactualGenerateRequest request,
            @RequestHeader(value = "X-User-Id", required = false) String userId,
            @RequestHeader(value = "X-User-Role", required = false) String role) {
        return service.generate(applicationId, request, userId, role);
    }

    @GetMapping
    public List<CounterfactualAuditResponse> history(
            @PathVariable String applicationId,
            @RequestHeader(value = "X-User-Id", required = false) String userId,
            @RequestHeader(value = "X-User-Role", required = false) String role) {
        return service.history(applicationId, userId, role);
    }
}
