package com.fyp.core.repository;

import com.fyp.core.domain.CounterfactualRecord;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CounterfactualRecordRepository extends JpaRepository<CounterfactualRecord, String> {
    List<CounterfactualRecord> findByApplicationIdOrderByCreatedAtDesc(String applicationId);
}
