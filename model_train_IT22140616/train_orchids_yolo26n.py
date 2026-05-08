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
    
    print(f"\nTraining finished! Results saved in: runs/classify/orchid_{MODEL_NAME.replace('.pt', '')}")

if __name__ == "__main__":
    train_orchid_model()