import os
import numpy as np
from ultralytics import YOLO
import xgboost as xgb
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
import joblib

# Paths based on your training logs
YOLO_MODEL_PATH = r'D:\R26-SE-006\model_train_IT22140616\runs\classify\orchid_yolo26n-cls-3\weights\best.pt'
DATASET_PATH = os.path.abspath('./dataset')
CLASSES = ['dendrobium', 'phalaenopsis', 'oncidium']

def get_features_and_labels(yolo_model, folder_type):
    X_features = []
    y_labels = []
    
    print(f"--- Extracting deep features from: {folder_type} ---")
    for idx, label in enumerate(CLASSES):
        folder = os.path.join(DATASET_PATH, folder_type, label)
        if not os.path.exists(folder):
            continue
            
        img_list = os.listdir(folder)
        for img_name in img_list:
            img_path = os.path.join(folder, img_name)
            results = yolo_model.predict(img_path, embed=[-1], verbose=False)
            embedding = results[0].cpu().numpy().flatten()
            X_features.append(embedding)
            y_labels.append(idx)
            
    return np.array(X_features), np.array(y_labels)

def train_hybrid_model():
    print("Loading YOLOv26 for Deep Feature Extraction...")
    yolo = YOLO(YOLO_MODEL_PATH)

    X_train, y_train = get_features_and_labels(yolo, 'train')
    X_test, y_test = get_features_and_labels(yolo, 'test')

    print(f"\nTraining XGBoost on {X_train.shape[1]} deep features...")
    hybrid_xgb = xgb.XGBClassifier(
        n_estimators=150, 
        learning_rate=0.05, 
        max_depth=6,
        objective='multi:softprob',
        tree_method='hist',
        random_state=42
    )
    
    hybrid_xgb.fit(X_train, y_train)
    test_preds = hybrid_xgb.predict(X_test)

    # --- NEW RESULTS SECTION ---
    print(f"\n" + "="*45)
    print(f"      HYBRID MODEL RESEARCH RESULTS")
    print(f"="*45)
    
    # 1. Overall Accuracy
    overall_acc = accuracy_score(y_test, test_preds)
    print(f"OVERALL SYSTEM ACCURACY: {overall_acc:.4f} ({overall_acc*100:.2f}%)")
    print("-" * 45)

    # 2. Individual Species Accuracy (Recall)
    # This uses the confusion matrix to find exactly how many of each species were correct
    cm = confusion_matrix(y_test, test_preds)
    for i, label in enumerate(CLASSES):
        species_total = np.sum(cm[i, :])
        species_correct = cm[i, i]
        species_acc = species_correct / species_total
        print(f"Accuracy for {label.upper():<13}: {species_acc:.4f} ({species_acc*100:.2f}%)")

    print("-" * 45)
    print("Detailed Classification Report:")
    print(classification_report(y_test, test_preds, target_names=CLASSES))
    
    joblib.dump(hybrid_xgb, 'orchid_hybrid_yolo26_xgb.pkl')
    print("Hybrid model successfully saved.")

if __name__ == "__main__":
    train_hybrid_model()