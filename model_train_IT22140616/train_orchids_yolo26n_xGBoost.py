import os
import numpy as np
from ultralytics import YOLO
import xgboost as xgb
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split
import joblib

YOLO_MODEL_PATH = r'D:\R26-SE-006\model_train_IT22140616\runs\classify\orchid_yolo26n-cls\weights\best.pt'
DATASET_PATH = os.path.abspath('./dataset')
CLASSES = ['dendrobium', 'phalaenopsis', 'oncidium']

def train_hybrid_model():
    print("Loading YOLOv26 for Feature Extraction...")
    yolo = YOLO(YOLO_MODEL_PATH)
    X_features = []
    y_labels = []

    print("Extracting deep features from YOLO layers...")
    for idx, label in enumerate(CLASSES):
        folder = os.path.join(DATASET_PATH, 'train', label)
        if not os.path.exists(folder): 
            print(f"Warning: Folder not found: {folder}")
            continue
        
        print(f"Processing species: {label}...")
        for img_name in os.listdir(folder):
            img_path = os.path.join(folder, img_name)
            
            results = yolo.predict(img_path, embed=[-1], verbose=False)
            
            embedding = results[0].cpu().numpy().flatten()
            
            X_features.append(embedding)
            y_labels.append(idx)

    X_features = np.array(X_features)
    y_labels = np.array(y_labels)

    print("Splitting data into Train and Validation sets...")
    X_train, X_val, y_train, y_val = train_test_split(X_features, y_labels, test_size=0.2, random_state=42)

    print(f"Training XGBoost on {X_features.shape[1]} deep features...")
    hybrid_xgb = xgb.XGBClassifier(
        n_estimators=150, 
        learning_rate=0.05, 
        tree_method='hist'
    )
    
    hybrid_xgb.fit(X_train, y_train)

    val_preds = hybrid_xgb.predict(X_val)
    accuracy = accuracy_score(y_val, val_preds)
    print(f"\n" + "="*30)
    print(f"Hybrid Validation Accuracy: {accuracy:.4f}")
    print("="*30)
    
    joblib.dump(hybrid_xgb, 'orchid_hybrid_yolo26_xgb.pkl')
    print("Hybrid model saved as orchid_hybrid_yolo26_xgb.pkl")
    

if __name__ == "__main__":
    train_hybrid_model()