from ultralytics import YOLO
import os

MODEL_NAME = 'yolo11n-cls.pt' 

def train_orchid_model():
    # Load the model
    model = YOLO(MODEL_NAME)
    
    # Define dataset path
    dataset_path = os.path.abspath('./dataset')
    
    print(f"Starting training with: {MODEL_NAME}")
    
    # Training configuration
    model.train(
        data=dataset_path,
        epochs=50,
        imgsz=224,
        batch=32,
        name=f'orchid_{MODEL_NAME.replace(".pt", "")}',
        device='cpu',
        plots=True,
        save=True,
        workers=4
    )
    
    print(f"\nTraining finished! Running validation for final report...")
    
    # Run validation to get metrics
    # This evaluates the best model saved during training on the validation set
    metrics = model.val()
    
    # Extract values for the report
    overall_acc = metrics.top1  # Top-1 accuracy (Overall System Accuracy)
    results_dict = metrics.results_dict
    names = model.names
    cm = metrics.confusion_matrix.matrix # Confusion matrix for per-class accuracy
    
    # --- START CUSTOM PRINT STATEMENTS ---
    print("\n" + "="*45)
    print(f"OVERALL SYSTEM ACCURACY: {overall_acc:.4f} ({overall_acc*100:.2f}%)")
    print("-" * 45)
    
    # Calculate and print Per-Class Accuracy
    # Formula: Correct Predictions (Diagonal) / Total Actual Samples for that class (Row Sum)
    for i, name in names.items():
        row_sum = cm[i].sum()
        class_acc = cm[i][i] / row_sum if row_sum > 0 else 0
        print(f"Accuracy for {name.upper():<13} : {class_acc:.4f} ({class_acc*100:.2f}%)")
    
    print("-" * 45)
    print("-" * 45)
    print("Detailed Classification Report:")
    print(f"{'class':<15} {'precision':>10} {'recall':>10} {'f1-score':>10}")
    
    # Note: Ultralytics metrics for classification provide top1/top5. 
    # For a full precision/recall/f1 per class, we use the values from the internal results
    # or the confusion matrix logic.
    for i, name in names.items():
        # Calculating Precision/Recall from Confusion Matrix
        # Precision = TP / (TP + FP) -> Diagonal / Column Sum
        # Recall = TP / (TP + FN) -> Diagonal / Row Sum
        tp = cm[i][i]
        fp = cm[:, i].sum() - tp
        fn = cm[i].sum() - tp
        
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0
        f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0
        support = int(cm[i].sum())
        
        print(f"{name:<15} {precision:>10.2f} {recall:>10.2f} {f1:>10.2f} {support:>10}")

    print(f"\naccuracy {' ':>31} {overall_acc:>10.2f}")

    
    print(f"\nResults saved in: runs/classify/orchid_{MODEL_NAME.replace('.pt', '')}")

if __name__ == "__main__":
    train_orchid_model()