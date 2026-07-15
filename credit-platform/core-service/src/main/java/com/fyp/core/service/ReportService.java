package com.fyp.core.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fyp.core.domain.LoanApplication;
import com.fyp.core.dto.ShapItem;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.text.DecimalFormat;
import java.util.Collections;
import java.util.List;

@Service
public class ReportService {

    private static final DecimalFormat PERCENT = new DecimalFormat("0.0%");
    private static final DecimalFormat NUMBER = new DecimalFormat("0.0000");

    private final ApplicationService applicationService;
    private final ObjectMapper objectMapper;

    public ReportService(ApplicationService applicationService, ObjectMapper objectMapper) {
        this.applicationService = applicationService;
        this.objectMapper = objectMapper;
    }

    public byte[] applicationReport(String applicationId, String userId, String role) {
        LoanApplication app = applicationService.visibleEntity(applicationId, userId, role);
        List<ShapItem> shap = readShap(app.getShapJson());

        try (PDDocument document = new PDDocument();
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            PDPage page = new PDPage(PDRectangle.A4);
            document.addPage(page);

            PDType1Font regular = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
            PDType1Font bold = new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD);

            try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                float y = 790;
                y = text(content, bold, 18, 54, y, "Credit Assessment Report") - 18;
                y = text(content, regular, 10, 54, y, "Application ID: " + app.getId()) - 14;
                y = text(content, regular, 10, 54, y, "Applicant ID: " + app.getApplicantId()) - 14;
                y = text(content, regular, 10, 54, y, "Created At: " + app.getCreatedAt()) - 24;

                y = text(content, bold, 13, 54, y, "Decision Summary") - 16;
                y = row(content, regular, bold, y, "Status", safe(app.getStatus()));
                y = row(content, regular, bold, y, "Credit Score", app.getProbability() == null ? "N/A" : String.valueOf(creditScore(app.getProbability())));
                y = row(content, regular, bold, y, "Default Probability", app.getProbability() == null ? "N/A" : PERCENT.format(app.getProbability()));
                y = row(content, regular, bold, y, "Business Threshold", app.getThresholdUsed() == null ? "N/A" : PERCENT.format(app.getThresholdUsed()));
                y = row(content, regular, bold, y, "Model Suggestion", safe(app.getSuggestion()));
                y = row(content, regular, bold, y, "Admin Decision", safe(app.getDecision()));
                y = row(content, regular, bold, y, "Decision Reason", safe(app.getDecisionReason()));
                y = row(content, regular, bold, y, "Decided By", safe(app.getDecidedBy()));
                y = row(content, regular, bold, y, "Model Version", safe(app.getModelVersion())) - 10;

                y = text(content, bold, 13, 54, y, "Top Explanation Factors") - 16;
                int limit = Math.min(10, shap.size());
                if (limit == 0) {
                    text(content, regular, 10, 54, y, "No SHAP explanation was stored for this application.");
                } else {
                    for (int i = 0; i < limit; i++) {
                        ShapItem item = shap.get(i);
                        String line = (i + 1) + ". " + item.feature()
                                + " | value=" + item.value()
                                + " | shap=" + NUMBER.format(item.shapValue());
                        y = text(content, regular, 10, 54, y, line) - 13;
                    }
                }

                y -= 24;
                y = text(content, bold, 13, 54, y, "Model Limitations") - 15;
                String[] limitations = {
                        "1. Reject-inference bias: the model was trained only on loans that were previously",
                        "   approved and disbursed. Outcomes of rejected applications were never observed, so",
                        "   scores for profiles unlike historically approved loans are extrapolations.",
                        "2. This is a loan-structure and business-context risk model (term, guarantee ratio,",
                        "   industry, region). It is not a credit-bureau scorecard and uses no personal",
                        "   financial history such as income, debts, or repayment records.",
                        "3. The historically approved amount is used as a proxy for the requested amount.",
                };
                for (String line : limitations) {
                    y = text(content, regular, 9, 54, y, line) - 12;
                }

                y -= 10;
                text(content, regular, 9, 54, y,
                        "Note: The score is a decision-support signal. Final approval remains a human-reviewed business decision.");
            }

            document.save(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException("Failed to generate PDF report.", e);
        }
    }

    private float row(PDPageContentStream content, PDType1Font regular, PDType1Font bold,
                      float y, String label, String value) throws IOException {
        text(content, bold, 10, 54, y, label + ":");
        return text(content, regular, 10, 190, y, value) - 14;
    }

    private float text(PDPageContentStream content, PDType1Font font, int size,
                       float x, float y, String value) throws IOException {
        content.beginText();
        content.setFont(font, size);
        content.newLineAtOffset(x, y);
        content.showText(plain(value));
        content.endText();
        return y;
    }

    private List<ShapItem> readShap(String json) {
        if (json == null) {
            return Collections.emptyList();
        }
        try {
            return objectMapper.readValue(
                    json,
                    objectMapper.getTypeFactory().constructCollectionType(List.class, ShapItem.class));
        } catch (JsonProcessingException e) {
            return Collections.emptyList();
        }
    }

    private static String safe(Object value) {
        return value == null ? "N/A" : String.valueOf(value);
    }

    private static String plain(String value) {
        return safe(value).replaceAll("[\\r\\n\\t]+", " ");
    }

    private static int creditScore(double probability) {
        return (int) Math.round(300 + (1 - probability) * 550);
    }
}