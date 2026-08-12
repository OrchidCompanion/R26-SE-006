from ultralytics import YOLO

model = YOLO("disease-yolo26-best.pt")

model.export(format="onnx", dynamic=True)