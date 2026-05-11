from flask import Flask, request, jsonify
from ultralytics import YOLO
import xgboost as xgb
import joblib
import numpy as np
import cv2
import os

app = Flask(__name__)

# Load your trained models
YOLO_MODEL = YOLO(r'D:\R26-SE-006\model_train_IT22140616\runs\classify\orchid_yolo11n-cls\weights\best.pt')
HYBRID_XGB = joblib.load('orchid_hybrid_yolo11_xgb.pkl')
CLASSES = ['dendrobium', 'phalaenopsis', 'oncidium']

@app.route('/predict', methods=['POST'])
def predict():
    if 'image' not in request.files:
        return jsonify({'error': 'No image provided'}), 400
    
    # Read the image sent from React Native
    file = request.files['image']
    file_bytes = np.frombuffer(file.read(), np.uint8)
    img = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)
    
    # 1. Extract Deep Features using YOLO
    # Save temporarily because YOLO.predict usually expects a path or ndarray
    results = YOLO_MODEL.predict(img, embed=[-1], verbose=False)
    embedding = results[0].cpu().numpy().flatten().reshape(1, -1)
    
    # 2. Predict Species using XGBoost
    prediction_idx = HYBRID_XGB.predict(embedding)[0]
    species = CLASSES[prediction_idx]
    
    return jsonify({
        'species': species,
        'confidence': float(np.max(HYBRID_XGB.predict_proba(embedding)))
    })

if __name__ == '__main__':
    # Use 0.0.0.0 to allow connections from your phone/emulator
    app.run(host='0.0.0.0', port=5000)