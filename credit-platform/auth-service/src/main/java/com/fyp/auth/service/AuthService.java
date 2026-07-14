package com.fyp.auth.service;

import com.fyp.auth.domain.AppUser;
import com.fyp.auth.domain.UserRole;
import com.fyp.auth.dto.AuthResponse;
import com.fyp.auth.dto.LoginRequest;
import com.fyp.auth.dto.PasswordChangeRequest;
import com.fyp.auth.dto.ProfileResponse;
import com.fyp.auth.dto.RegisterRequest;
import com.fyp.auth.dto.UpdateProfileRequest;
import com.fyp.auth.repository.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public AuthService(UserRepository users, PasswordEncoder passwordEncoder, JwtService jwtService) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        String email = AppUser.normalizeEmail(request.email());
        if (users.existsByEmail(email)) {
            throw new IllegalArgumentException("Email is already registered.");
        }

        AppUser user = AppUser.create(
                email,
                passwordEncoder.encode(request.password()),
                request.fullName(),
                request.businessName(),
                request.phone(),
                UserRole.USER);
        users.save(user);
        return authResponse(user);
    }

    @Transactional(readOnly = true)
    public AuthResponse login(LoginRequest request) {
        AppUser user = users.findByEmail(AppUser.normalizeEmail(request.email()))
                .orElseThrow(() -> new IllegalArgumentException("Invalid email or password."));
        if (!user.isEnabled() || !passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new IllegalArgumentException("Invalid email or password.");
        }
        return authResponse(user);
    }

    @Transactional(readOnly = true)
    public ProfileResponse me(String authorizationHeader) {
        return profile(requireUser(authorizationHeader));
    }

    @Transactional
    public ProfileResponse updateProfile(String authorizationHeader, UpdateProfileRequest request) {
        AppUser user = requireUser(authorizationHeader);
        user.updateProfile(request.fullName(), request.businessName(), request.phone());
        return profile(users.save(user));
    }

    @Transactional
    public ProfileResponse changePassword(String authorizationHeader, PasswordChangeRequest request) {
        AppUser user = requireUser(authorizationHeader);
        if (!passwordEncoder.matches(request.currentPassword(), user.getPasswordHash())) {
            throw new IllegalArgumentException("Current password is incorrect.");
        }
        user.updatePassword(passwordEncoder.encode(request.newPassword()));
        return profile(users.save(user));
    }

    public ProfileResponse profile(AppUser user) {
        return new ProfileResponse(
                user.getId(),
                user.getEmail(),
                user.getFullName(),
                user.getBusinessName(),
                user.getPhone(),
                user.getRole(),
                user.getCreatedAt(),
                user.getUpdatedAt());
    }

    private AuthResponse authResponse(AppUser user) {
        JwtService.TokenView token = jwtService.issue(user);
        return new AuthResponse(token.token(), "Bearer", token.expiresInSeconds(), profile(user));
    }

    private AppUser requireUser(String authorizationHeader) {
        String userId = jwtService.subjectFromAuthorization(authorizationHeader);
        return users.findById(userId)
                .filter(AppUser::isEnabled)
                .orElseThrow(() -> new IllegalArgumentException("Authenticated user was not found."));
    }
}
