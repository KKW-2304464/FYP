package com.fyp.auth.dto;

public record AuthResponse(
        String token,
        String tokenType,
        long expiresInSeconds,
        ProfileResponse user
) { }
