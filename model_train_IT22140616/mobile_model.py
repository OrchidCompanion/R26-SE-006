from ultralytics import YOLO
import onnxmltools
from skl2onnx.common.data_types import FloatTensorType
import joblib

# 1. Export YOLOv26 to TFLite
# This will create 'best_float32.tflite'
model = YOLO(r'D:\R26-SE-006\model_train_IT22140616\runs\classify\orchid_yolo26n-cls\weights\best.pt')
model.export(format='tflite', imgsz=224) 

# 2. Export XGBoost to ONNX
# TFLite doesn't support XGBoost, so we use ONNX for this part.
xgb_model = joblib.load('orchid_hybrid_yolo26_xgb.pkl')
initial_type = [('float_input', FloatTensorType([None, 1024]))] # 1024 is the YOLO embedding size
onnx_model = onnxmltools.convert_xgboost(xgb_model, initial_types=initial_type)
onnxmltools.utils.save_model(onnx_model, 'orchid_classifier.onnx')