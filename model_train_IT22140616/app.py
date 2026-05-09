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
# These classes must match the order used during XGBoost training
CLASSES = ['dendrobium', 'phalaenopsis', 'oncidium']
MODEL_BASE_DIR = r'D:\R26-SE-006\model_train_IT22140616\runs\classify'

# Path definitions based on your project structure
YOLO11_PATH = os.path.join(MODEL_BASE_DIR, 'orchid_yolo11n-cls', 'weights', 'best.pt')
YOLO26_PATH = os.path.join(MODEL_BASE_DIR, 'orchid_yolo26n-cls', 'weights', 'best.pt')
PURE_XGB_PATH = 'orchid_pure_xgboost.pkl'
HYBRID_XGB_PATH = 'orchid_hybrid_yolo26_xgb.pkl'

# --- LOAD MODELS ---
models = {}
try:
    models['YOLO11n'] = YOLO(YOLO11_PATH)
    models['YOLO26n'] = YOLO(YOLO26_PATH)
    models['Pure XGBoost'] = joblib.load(PURE_XGB_PATH)
    models['Hybrid YOLO26+XGB'] = joblib.load(HYBRID_XGB_PATH)
    print("All models loaded successfully.")
except Exception as e:
    print(f"Error loading models: {e}")

# --- FEATURE EXTRACTION HELPERS ---

def get_manual_features(pil_img):
    """Replicates extraction from train_orchids_xGBoost.py"""
    # Convert PIL to CV2 format (RGB to BGR)
    img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
    img = cv2.resize(img, (128, 128))
    
    # Extract color features (mean and std for each channel)
    channels = cv2.split(img)
    color_features = []
    for chan in channels:
        color_features.extend([np.mean(chan), np.std(chan)])
        
    # Extract texture features using Canny edge detection
    edges = cv2.Canny(img, 100, 200)
    texture_val = np.mean(edges)
    
    return np.array([color_features + [texture_val]])

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/predict', methods=['POST'])
def predict():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'})
    
    file = request.files['file']
    img_bytes = file.read()
    # Ensure RGB mode for consistent inference across all models
    pil_img = Image.open(io.BytesIO(img_bytes)).convert('RGB')
    
    results = {}

    # --- 1. YOLO11n (Standard Classification) ---
    start_11 = time.time()
    # FIX: Use embed=None to prevent the model from returning a raw Tensor
    res11 = models['YOLO11n'].predict(source=pil_img, imgsz=224, embed=None, verbose=False)[0]
    
    if hasattr(res11, 'probs') and res11.probs is not None:
        results['YOLO11n'] = {
            'species': models['YOLO11n'].names[res11.probs.top1],
            'confidence': f"{float(res11.probs.top1conf):.2%}",
            'inference_time': f"{(time.time() - start_11)*1000:.2f}ms"
        }
    else:
        results['YOLO11n'] = {'species': 'Error', 'confidence': '0%', 'inference_time': '0ms'}

    # --- 2. YOLO26n (Standard Classification) ---
    start_26 = time.time()
    # FIX: Use embed=None to ensure a Results object is returned instead of a Tensor
    res26 = models['YOLO26n'].predict(source=pil_img, imgsz=224, embed=None, verbose=False)[0]
    
    if hasattr(res26, 'probs') and res26.probs is not None:
        results['YOLO26n'] = {
            'species': models['YOLO26n'].names[res26.probs.top1],
            'confidence': f"{float(res26.probs.top1conf):.2%}",
            'inference_time': f"{(time.time() - start_26)*1000:.2f}ms"
        }
    else:
        results['YOLO26n'] = {'species': 'Internal State Error', 'confidence': 'N/A', 'inference_time': '0ms'}

    # --- 3. Pure XGBoost (Manual Features) ---
    start_pure = time.time()
    manual_feats = get_manual_features(pil_img)
    pure_probs = models['Pure XGBoost'].predict_proba(manual_feats)[0]
    
    results['Pure XGBoost'] = {
        'species': CLASSES[np.argmax(pure_probs)],
        'confidence': f"{np.max(pure_probs):.2%}",
        'inference_time': f"{(time.time() - start_pure)*1000:.2f}ms"
    }

    # --- 4. Hybrid YOLO26 + XGBoost (Deep Embeddings) ---
    start_hybrid = time.time()
    # This call intentionally uses embed=[-1] to get the deep feature Tensor
    embed_res = models['YOLO26n'].predict(pil_img, embed=[-1], verbose=False)[0]
    
    # Handle the result whether it comes back as a NumPy array or PyTorch Tensor
    if isinstance(embed_res, np.ndarray):
        deep_feats = embed_res.reshape(1, -1)
    else:
        deep_feats = embed_res.cpu().numpy().reshape(1, -1)
    
    hybrid_probs = models['Hybrid YOLO26+XGB'].predict_proba(deep_feats)[0]
    
    results['Hybrid YOLO26+XGB'] = {
        'species': CLASSES[np.argmax(hybrid_probs)],
        'confidence': f"{np.max(hybrid_probs):.2%}",
        'inference_time': f"{(time.time() - start_hybrid)*1000:.2f}ms"
    }

    return jsonify(results)

if __name__ == '__main__':
    app.run(debug=True, port=5000)