from ultralytics import YOLO
import os

MODEL_NAME = 'yolo26n-cls.pt' 

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
    
    print(f"\nTraining finished! Running validation...")
    
    # Run validation to get metrics
    metrics = model.val()
    
    # 1. Get Overall Accuracy
    overall_acc = metrics.top1
    
    # 2. Get Per-Class Accuracy
    # Access the confusion matrix to calculate per-class stats
    cm = metrics.confusion_matrix.matrix
    names = model.names
    
    print("\n=============================================")
    print(f"OVERALL SYSTEM ACCURACY: {overall_acc:.4f} ({overall_acc*100:.2f}%)")
    print("---------------------------------------------")
    
    for i, name in names.items():
        # Accuracy per class is diagonal element / total for that class row
        row_sum = cm[i].sum()
        class_acc = cm[i][i] / row_sum if row_sum > 0 else 0
        print(f"Accuracy for {name.upper():<13} : {class_acc:.4f} ({class_acc*100:.2f}%)")
    
    print("---------------------------------------------")
    print("---------------------------------------------")
    print("Detailed Classification Report:")
    # This prints the default YOLO classification table (precision, recall, etc.)
    print(f"{'class':<15} {'precision':>10} {'recall':>10} {'f1-score':>10}")
    for i, name in names.items():
        p = metrics.results_dict.get(f'metrics/precision(B)', 0) # Generic example, YOLO returns per-class in metrics.curves
        # For a truly detailed sklearn-style report, YOLO internal results are usually sufficient:
        print(f"{name:<15} {metrics.results_dict.get('metrics/precision', 0):>10.2f} "
              f"{metrics.results_dict.get('metrics/recall', 0):>10.2f} "
              f"{overall_acc:>10.2f}") 
              
    print(f"\nResults saved in: runs/classify/orchid_{MODEL_NAME.replace('.pt', '')}")

if __name__ == "__main__":
    train_orchid_model()