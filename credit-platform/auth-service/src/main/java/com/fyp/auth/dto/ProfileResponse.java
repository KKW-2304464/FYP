package com.fyp.auth.dto;

import com.fyp.auth.domain.UserRole;

import java.time.Instant;

public record ProfileResponse(
        String id,
        String email,
        String fullName,
        String businessName,
        String phone,
        UserRole role,
        Instant createdAt,
        Instant updatedAt
) { }
