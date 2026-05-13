import os
import cv2
import numpy as np
import xgboost as xgb
from sklearn.metrics import accuracy_score, classification_report
import joblib

# Configuration
DATASET_PATH = os.path.abspath('./dataset')
CLASSES = ['dendrobium', 'phalaenopsis', 'oncidium']

def extract_advanced_features(image_path):
    img = cv2.imread(image_path)
    if img is None: return None
    
    # 1. Shape Feature: Aspect Ratio
    # Orchid leaves have very different length-to-width ratios.
    h, w, _ = img.shape
    aspect_ratio = w / float(h)
    
    img_resized = cv2.resize(img, (128, 128))
    
    # 2. Color Features: Detailed Histograms (Better than just Mean)
    # We take the mean of each 1/4th of the image to see color distribution
    h_r, w_r, _ = img_resized.shape
    sections = [
        img_resized[0:h_r//2, 0:w_r//2], # Top Left
        img_resized[h_r//2:h_r, w_r//2:w_r] # Bottom Right
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
    
    # Combine all features into one array
    return np.array([aspect_ratio, edge_density] + color_stats)

def load_data(folder_type):
    X, y = [], []
    print(f"Processing {folder_type} images...")
    for idx, label in enumerate(CLASSES):
        folder = os.path.join(DATASET_PATH, folder_type, label)
        if not os.path.exists(folder): continue
        
        for img_name in os.listdir(folder):
            features = extract_advanced_features(os.path.join(folder, img_name))
            if features is not None:
                X.append(features)
                y.append(idx)
    return np.array(X), np.array(y)

def train_improved_xgboost():
    # Load 2400 training images
    X_train, y_train = load_data('train')
    # Load 1500 testing images
    X_test, y_test = load_data('test')

    print(f"Training on {len(X_train)} samples with Advanced Features...")
    
    # We use a lower learning rate and more estimators to prevent the "Majority Class" trap
    model = xgb.XGBClassifier(
        n_estimators=200,
        max_depth=5,
        learning_rate=0.01, # Slower learning helps find subtle differences
        objective='multi:softprob',
        tree_method='hist',
        seed=42
    )
    
    model.fit(X_train, y_train)

    # Evaluation
    preds = model.predict(X_test)
    acc = accuracy_score(y_test, preds)
    
    print(f"\n--- Improved XGBoost Results ---")
    print(f"Final Test Accuracy: {acc:.4f}")
    print(classification_report(y_test, preds, target_names=CLASSES))

    joblib.dump(model, 'orchid_pure_xgboost_v2.pkl')

if __name__ == "__main__":
    train_improved_xgboost()