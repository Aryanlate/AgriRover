# Agri-Rover Two-Class Test Split Evaluation Report

> [!WARNING]
> **Notice**: The test set is **not** from ESP32-CAM photos. It evaluates performance on public leaf benchmark images. Domain shift may occur on physical rover hardware.

- **Timestamp**: 2026-10-28 14:24:16
- **Model Weights**: `ml\runs\agrirover_cls\weights\best.pt`
- **Test Dataset Path**: `C:\Users\ARYAN\OneDrive\Desktop\AgriRover yantravedha\ml\dataset\test`
- **Total Test Samples**: 982

## Overall Performance

| Metric | Value | Target | Status |
|---|---|---|---|
| **Top-1 Accuracy** | **93.38%** | >= 85.0% | PASS |
| **Minimum Class Recall** | **90.41%** (`leaf_healthy`) | >= 70.0% | PASS |

## Per-Class Metrics

| Class | Support | Precision | Recall | F1-Score | Status (Recall >= 0.70) |
|---|---|---|---|---|---|
| `leaf_healthy` | 271 | 0.863 | 0.904 | 0.883 | PASS |
| `leaf_diseased` | 711 | 0.963 | 0.945 | 0.954 | PASS |

## Confusion Matrix

Rows represent **Ground Truth**, columns represent **Predicted Class**:

| True / Pred | `leaf_healthy` | `leaf_diseased` |
|---| --- | --- |
| `leaf_healthy` | 245 | 26 |
| `leaf_diseased` | 39 | 672 |

## Performance Goals Verification

- **Goal 1 (Accuracy >= 85%)**: PASSED (93.38%)
- **Goal 2 (No recall < 0.70)**: PASSED (Lowest: 90.41% in `leaf_healthy`)
- **Mission Acceptance**: APPROVED
