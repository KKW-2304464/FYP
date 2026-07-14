package com.fyp.core.controller;

import com.fyp.core.dto.AdminMetricsResponse;
import com.fyp.core.service.ApplicationService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final ApplicationService applicationService;

    public AdminController(ApplicationService applicationService) {
        this.applicationService = applicationService;
    }

    @GetMapping("/metrics")
    public AdminMetricsResponse metrics(@RequestHeader(value = "X-User-Role", required = false) String role) {
        return applicationService.metrics(role);
    }
}
