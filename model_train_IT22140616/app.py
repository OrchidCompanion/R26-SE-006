from flask import Flask, request, jsonify, render_template
from ultralytics import YOLO
import io
from PIL import Image
import os
import cv2
import numpy as np
import joblib
import time

app = Flask(__name__)

# --- CONFIGURATION ---
CLASSES = ['dendrobium', 'phalaenopsis', 'oncidium']
MODEL_BASE_DIR = r'D:\R26-SE-006\model_train_IT22140616\runs\classify'

# Path definitions updated as per your requirements
YOLO11_PATH = os.path.join(MODEL_BASE_DIR, 'orchid_yolo11n-cls-3', 'weights', 'best.pt')
YOLO26_PATH = os.path.join(MODEL_BASE_DIR, 'orchid_yolo26n-cls-3', 'weights', 'best.pt')
PURE_XGB_PATH = 'orchid_pure_xgboost_v2.pkl'
HYBRID_YOLO26_XGB_PATH = 'orchid_hybrid_yolo26_xgb.pkl'
HYBRID_YOLO11_XGB_PATH = 'orchid_hybrid_yolo11_xgb.pkl'

# --- LOAD MODELS ---
models = {}
try:
    models['YOLO11n'] = YOLO(YOLO11_PATH)
    models['YOLO26n'] = YOLO(YOLO26_PATH)
    models['Pure XGBoost'] = joblib.load(PURE_XGB_PATH)
    models['Hybrid YOLO26+XGB'] = joblib.load(HYBRID_YOLO26_XGB_PATH)
    models['Hybrid YOLO11+XGB'] = joblib.load(HYBRID_YOLO11_XGB_PATH)
    print("All models loaded successfully.")
except Exception as e:
    print(f"Error loading models: {e}")

# --- FEATURE EXTRACTION HELPERS (MATCHING THE 14-FEATURE LOGIC) ---

def get_manual_features(pil_img):
    """
    Replicates extraction from the 'Improved' train_orchids_xGBoost.py
    Generates 14 features: Aspect Ratio (1) + Edge Density (1) + Sectional Color Stats (12)
    """
    # Convert PIL to CV2 format (RGB to BGR)
    img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
    
    # 1. Shape Feature: Aspect Ratio
    h, w, _ = img.shape
    aspect_ratio = w / float(h)
    
    img_resized = cv2.resize(img, (128, 128))
    
    # 2. Color Features: Detailed Sectional Histograms
    h_r, w_r, _ = img_resized.shape
    sections = [
        img_resized[0:h_r//2, 0:w_r//2], # Top Left half
        img_resized[h_r//2:h_r, w_r//2:w_r] # Bottom Right half
    ]
    
    color_stats = []
    for sec in sections:
        for i in range(3): # B, G, R channels
            color_stats.append(np.mean(sec[:,:,i]))
            color_stats.append(np.std(sec[:,:,i]))

    # 3. Texture: Canny Edge density
    gray = cv2.cvtColor(img_resized, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 50, 150)
    edge_density = np.sum(edges > 0) / (128 * 128)
    
    # Combine to match the 14 features expected by the model
    # [aspect_ratio, edge_density, meanB1, stdB1, meanG1, stdG1, meanR1, stdR1, meanB2, stdB2...]
    final_features = np.array([aspect_ratio, edge_density] + color_stats)
    return final_features.reshape(1, -1)

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/predict', methods=['POST'])
def predict():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'})
    
    file = request.files['file']
    img_bytes = file.read()
    pil_img = Image.open(io.BytesIO(img_bytes)).convert('RGB')
    
    results = {}

    # --- 1. YOLO11n ---
    start_11 = time.time()
    res11 = models['YOLO11n'].predict(source=pil_img, imgsz=224, embed=None, verbose=False)[0]
    if hasattr(res11, 'probs') and res11.probs is not None:
        results['YOLO11n'] = {
            'species': models['YOLO11n'].names[res11.probs.top1],
            'confidence': f"{float(res11.probs.top1conf):.2%}",
            'inference_time': f"{(time.time() - start_11)*1000:.2f}ms"
        }

    # --- 2. YOLO26n ---
    start_26 = time.time()
    res26 = models['YOLO26n'].predict(source=pil_img, imgsz=224, embed=None, verbose=False)[0]
    if hasattr(res26, 'probs') and res26.probs is not None:
        results['YOLO26n'] = {
            'species': models['YOLO26n'].names[res26.probs.top1],
            'confidence': f"{float(res26.probs.top1conf):.2%}",
            'inference_time': f"{(time.time() - start_26)*1000:.2f}ms"
        }

    # --- 3. Pure XGBoost (Manual Features - Now 14 features) ---
    start_pure = time.time()
    manual_feats = get_manual_features(pil_img)
    pure_probs = models['Pure XGBoost'].predict_proba(manual_feats)[0]
    results['Pure XGBoost'] = {
        'species': CLASSES[np.argmax(pure_probs)],
        'confidence': f"{np.max(pure_probs):.2%}",
        'inference_time': f"{(time.time() - start_pure)*1000:.2f}ms"
    }

    # --- 4. Hybrid YOLO26 + XGBoost ---
    start_h26 = time.time()
    emb26 = models['YOLO26n'].predict(pil_img, embed=[-1], verbose=False)[0]
    feats26 = emb26.cpu().numpy().reshape(1, -1) if not isinstance(emb26, np.ndarray) else emb26.reshape(1, -1)
    probs26 = models['Hybrid YOLO26+XGB'].predict_proba(feats26)[0]
    results['Hybrid YOLO26+XGB'] = {
        'species': CLASSES[np.argmax(probs26)],
        'confidence': f"{np.max(probs26):.2%}",
        'inference_time': f"{(time.time() - start_h26)*1000:.2f}ms"
    }

    # --- 5. Hybrid YOLO11 + XGBoost ---
    start_h11 = time.time()
    emb11 = models['YOLO11n'].predict(pil_img, embed=[-1], verbose=False)[0]
    feats11 = emb11.cpu().numpy().reshape(1, -1) if not isinstance(emb11, np.ndarray) else emb11.reshape(1, -1)
    probs11 = models['Hybrid YOLO11+XGB'].predict_proba(feats11)[0]
    results['Hybrid YOLO11+XGB'] = {
        'species': CLASSES[np.argmax(probs11)],
        'confidence': f"{np.max(probs11):.2%}",
        'inference_time': f"{(time.time() - start_h11)*1000:.2f}ms"
    }

    return jsonify(results)

if __name__ == '__main__':
    app.run(debug=True, port=5000)