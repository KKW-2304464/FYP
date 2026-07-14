package com.fyp.auth.config;

import com.fyp.auth.domain.AppUser;
import com.fyp.auth.domain.UserRole;
import com.fyp.auth.repository.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class AdminSeeder implements CommandLineRunner {

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final boolean enabled;
    private final String email;
    private final String password;
    private final String name;

    public AdminSeeder(UserRepository users,
                       PasswordEncoder passwordEncoder,
                       @Value("${auth.admin.enabled}") boolean enabled,
                       @Value("${auth.admin.email}") String email,
                       @Value("${auth.admin.password}") String password,
                       @Value("${auth.admin.name}") String name) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.enabled = enabled;
        this.email = email;
        this.password = password;
        this.name = name;
    }

    @Override
    public void run(String... args) {
        if (!enabled) {
            return;
        }
        String normalizedEmail = AppUser.normalizeEmail(email);
        if (!users.existsByEmail(normalizedEmail)) {
            users.save(AppUser.create(
                    normalizedEmail,
                    passwordEncoder.encode(password),
                    name,
                    "Credit Review Office",
                    null,
                    UserRole.ADMIN));
        }
    }
}
