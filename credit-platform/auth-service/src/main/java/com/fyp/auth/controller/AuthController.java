package com.fyp.auth.controller;

import com.fyp.auth.dto.AuthResponse;
import com.fyp.auth.dto.LoginRequest;
import com.fyp.auth.dto.PasswordChangeRequest;
import com.fyp.auth.dto.ProfileResponse;
import com.fyp.auth.dto.RegisterRequest;
import com.fyp.auth.dto.UpdateProfileRequest;
import com.fyp.auth.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/register")
    public AuthResponse register(@Valid @RequestBody RegisterRequest request) {
        return authService.register(request);
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest request) {
        return authService.login(request);
    }

    @GetMapping("/me")
    public ProfileResponse me(@RequestHeader("Authorization") String authorization) {
        return authService.me(authorization);
    }

    @PatchMapping("/profile")
    public ProfileResponse updateProfile(@RequestHeader("Authorization") String authorization,
                                         @Valid @RequestBody UpdateProfileRequest request) {
        return authService.updateProfile(authorization, request);
    }

    @PostMapping("/password")
    public ProfileResponse changePassword(@RequestHeader("Authorization") String authorization,
                                          @Valid @RequestBody PasswordChangeRequest request) {
        return authService.changePassword(authorization, request);
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "ok");
    }
}
