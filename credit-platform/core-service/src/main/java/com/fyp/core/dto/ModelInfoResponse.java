package com.fyp.core.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

public record ModelInfoResponse(
        @JsonProperty("model_version") String modelVersion,
        @JsonProperty("model_type") String modelType,
        @JsonProperty("n_features") int nFeatures,
        @JsonProperty("feature_cols") List<String> featureCols,
        @JsonProperty("categorical_cols") List<String> categoricalCols,
        @JsonProperty("trained_at") String trainedAt,
        @JsonProperty("dataset_name") String datasetName,
        @JsonProperty("training_rows") Integer trainingRows,
        @JsonProperty("validation_rows") Integer validationRows,
        @JsonProperty("test_rows") Integer testRows,
        @JsonProperty("split_strategy") String splitStrategy,
        @JsonProperty("offline_metrics") OfflineMetrics offlineMetrics,
        @JsonProperty("intended_use") String intendedUse,
        List<String> limitations
) {
    public record OfflineMetrics(
            @JsonProperty("roc_auc") Double rocAuc,
            @JsonProperty("pr_auc") Double prAuc,
            Double brier,
            @JsonProperty("validation_roc_auc") Double validationRocAuc
    ) { }
}
