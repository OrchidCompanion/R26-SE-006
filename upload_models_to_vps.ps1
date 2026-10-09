# =============================================================================
# Helper Script: Upload ML Model Weights directly to Contabo VPS via SCP
# =============================================================================
# Run this from PowerShell on your Windows laptop:
#   .\upload_models_to_vps.ps1
# =============================================================================

$VPS_IP = "169.58.119.186"
$VPS_USER = "root"
$REMOTE_BASE = "/opt/orchid-backend/services"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " OrchidCompanion: Uploading ML Models to Contabo VPS" -ForegroundColor Cyan
Write-Host " Target: $VPS_USER@$VPS_IP:$REMOTE_BASE" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Ensure remote model directories exist on VPS
Write-Host "`n[1/5] Ensuring remote model folders exist..." -ForegroundColor Yellow
ssh "$VPS_USER@$VPS_IP" "mkdir -p $REMOTE_BASE/species-service/models $REMOTE_BASE/disease-service/models $REMOTE_BASE/flowering-service/models $REMOTE_BASE/fertilizer-service/models"

# 1. Species Service Model
Write-Host "`n[2/5] Uploading Species Model..." -ForegroundColor Green
scp "services/species-service/models/species-identification.pt" "$VPS_USER@$VPS_IP`:$REMOTE_BASE/species-service/models/"

# 2. Disease Service Models
Write-Host "`n[3/5] Uploading Disease Models (YOLO + MobileNetV2 + CNN)..." -ForegroundColor Green
scp "services/disease-service/models/disease_yolo.pt" "$VPS_USER@$VPS_IP`:$REMOTE_BASE/disease-service/models/"
scp "services/disease-service/models/disease_mobilenetv2.keras" "$VPS_USER@$VPS_IP`:$REMOTE_BASE/disease-service/models/"
scp "services/disease-service/models/disease_custom_cnn.keras" "$VPS_USER@$VPS_IP`:$REMOTE_BASE/disease-service/models/"

# 3. Flowering Service Models
Write-Host "`n[4/5] Uploading Flowering Models (RF-DETR Stage + Regressor)..." -ForegroundColor Green
scp "services/flowering-service/models/checkpoint_best_total.pth" "$VPS_USER@$VPS_IP`:$REMOTE_BASE/flowering-service/models/"
scp "services/flowering-service/models/gradient_boosting_experiment.joblib" "$VPS_USER@$VPS_IP`:$REMOTE_BASE/flowering-service/models/"

# 4. Fertilizer Service Models
Write-Host "`n[5/5] Uploading Fertilizer Models (Segmentation + Stage Classifier)..." -ForegroundColor Green
scp "services/fertilizer-service/models/leaf_segmentation_best.pt" "$VPS_USER@$VPS_IP`:$REMOTE_BASE/fertilizer-service/models/"
scp "services/fertilizer-service/models/growth_stage_model.pkl" "$VPS_USER@$VPS_IP`:$REMOTE_BASE/fertilizer-service/models/"
scp "services/fertilizer-service/models/label_encoder.pkl" "$VPS_USER@$VPS_IP`:$REMOTE_BASE/fertilizer-service/models/"

Write-Host "`nAll model weights uploaded successfully to $VPS_IP!" -ForegroundColor Cyan
