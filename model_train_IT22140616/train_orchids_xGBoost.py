import os
import cv2
import numpy as np
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report
import joblib

# Configuration
DATASET_PATH = os.path.abspath('./dataset')
CLASSES = ['dendrobium', 'phalaenopsis', 'oncidium']

def extract_features(image_path):
    img = cv2.imread(image_path)
    img = cv2.resize(img, (128, 128))
    
    channels = cv2.split(img)
    color_features = []
    for chan in channels:
        color_features.extend([np.mean(chan), np.std(chan)])
        
    edges = cv2.Canny(img, 100, 200)
    texture_val = np.mean(edges)
    
    return np.array(color_features + [texture_val])

def train_xgboost():
    X = []
    y = []

    print("Extracting manual features from images...")
    for idx, label in enumerate(CLASSES):
        folder = os.path.join(DATASET_PATH, 'train', label)
        if not os.path.exists(folder): continue
        
        for img_name in os.listdir(folder):
            features = extract_features(os.path.join(folder, img_name))
            X.append(features)
            y.append(idx)

    X = np.array(X)
    y = np.array(y)

    # Split for internal validation
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    print("Training XGBoost Classifier...")
    model = xgb.XGBClassifier(
        n_estimators=100,
        max_depth=6,
        learning_rate=0.1,
        objective='multi:softprob',
        tree_method='hist'
    )
    
    model.fit(X_train, y_train)

    # Evaluation
    preds = model.predict(X_test)
    print(f"\nPure XGBoost Accuracy: {accuracy_score(y_test, preds):.4f}")
    print(classification_report(y_test, preds, target_names=CLASSES))

    # Save the model
    joblib.dump(model, 'orchid_pure_xgboost.pkl')
    print("Model saved as orchid_pure_xgboost.pkl")

if __name__ == "__main__":
    train_xgboost()