package com.fyp.core.repository;

import com.fyp.core.domain.ApplicationStatus;
import com.fyp.core.domain.LoanApplication;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface LoanApplicationRepository extends JpaRepository<LoanApplication, String> {

    /** Admin review queue, and SME's own list, both by status. */
    List<LoanApplication> findByStatusOrderByCreatedAtAsc(ApplicationStatus status);

    /** SME can only see their own applications (RBAC at the data layer). */
    List<LoanApplication> findByApplicantIdOrderByCreatedAtDesc(String applicantId);

    List<LoanApplication> findTop10ByOrderByCreatedAtDesc();
}
