package com.fyp.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RegisterRequest(
        @Email @NotBlank String email,
        @NotBlank @Size(min = 8, max = 120) String password,
        @NotBlank @Size(max = 120) String fullName,
        @Size(max = 160) String businessName,
        @Size(max = 40) String phone
) { }
