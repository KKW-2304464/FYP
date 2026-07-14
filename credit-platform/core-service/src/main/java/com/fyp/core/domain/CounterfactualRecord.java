package com.fyp.core.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;

/** Immutable audit record for every generated counterfactual request and result. */
@Entity
@Table(name = "counterfactual_record")
public class CounterfactualRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(nullable = false, updatable = false)
    private String applicationId;

    @Column(nullable = false, length = 64, updatable = false)
    private String modelVersion;

    @Column(nullable = false, length = 120, updatable = false)
    private String generatedBy;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb", updatable = false)
    private String requestJson;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb", updatable = false)
    private String resultJson;

    protected CounterfactualRecord() { }

    public static CounterfactualRecord create(String applicationId, String modelVersion,
                                              String generatedBy, String requestJson,
                                              String resultJson) {
        CounterfactualRecord record = new CounterfactualRecord();
        record.applicationId = applicationId;
        record.modelVersion = modelVersion;
        record.generatedBy = generatedBy;
        record.requestJson = requestJson;
        record.resultJson = resultJson;
        record.createdAt = Instant.now();
        return record;
    }

    public String getId() { return id; }
    public String getApplicationId() { return applicationId; }
    public String getModelVersion() { return modelVersion; }
    public String getGeneratedBy() { return generatedBy; }
    public Instant getCreatedAt() { return createdAt; }
    public String getRequestJson() { return requestJson; }
    public String getResultJson() { return resultJson; }
}
