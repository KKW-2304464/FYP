package com.fyp.core.controller;

import com.fyp.core.client.ScoringClient;
import com.fyp.core.dto.ModelInfoResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/model")
public class ModelController {

    private final ScoringClient scoringClient;

    public ModelController(ScoringClient scoringClient) {
        this.scoringClient = scoringClient;
    }

    @GetMapping("/info")
    public ModelInfoResponse info() {
        return scoringClient.modelInfo();
    }
}
