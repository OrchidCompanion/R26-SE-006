from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import io
import base64
import tempfile
import numpy as np
import pandas as pd
import cv2
from ultralytics import YOLO

app = Flask(__name__)
CORS(app)

# Paths - adjust if you move files
MODELS_DIR = os.path.join(os.path.dirname(__file__), 'models')
NPK_CSV = os.path.join(os.path.dirname(__file__), 'April_npk_readings.csv')

# Load models once at startup
print('Loading YOLO models...')
model_1 = YOLO(os.path.join(MODELS_DIR, 'YOLO26_best.pt'))
model_2 = YOLO(os.path.join(MODELS_DIR, 'YOLOv8_best.pt'))
print('Models loaded')

# Thresholds and mappings
NPK_THRESHOLDS = {
    'N': {'low': 25, 'high': 65},
    'P': {'low': 15, 'high': 35},
    'K': {'low': 50, 'high': 130},
}

RECOMMENDATIONS = {
    'black_rot': {
        'disease_info': '🔴 Black Rot detected! Fungal infection.',
        'treatment': [
            'Remove infected leaves immediately',
            'Apply copper-based fungicide',
            'Reduce watering frequency',
            'Improve air circulation',
        ],
    },
    'bacterial_brown_pot': {
        'disease_info': '🟠 Bacterial Brown Spot detected!',
        'treatment': [
            'Remove and destroy infected parts',
            'Apply bactericide',
            'Avoid overhead watering',
            'Sterilize cutting tools',
        ],
    },
    'healthy': {
        'disease_info': '🟢 Plant is Healthy!',
        'treatment': ['Continue current care routine'],
    },
}

CLASS_NAMES = ['bacterial_brown_pot', 'black_rot', 'healthy']
COLORS = {
    'bacterial_brown_pot': (255, 0, 0),
    'black_rot': (0, 0, 255),
    'healthy': (0, 255, 0),
}


def simple_nms(boxes, scores, iou_threshold=0.5):
    if len(boxes) == 0:
        return []
    x1 = np.array([b[0] for b in boxes])
    y1 = np.array([b[1] for b in boxes])
    x2 = np.array([b[2] for b in boxes])
    y2 = np.array([b[3] for b in boxes])
    areas = (x2 - x1) * (y2 - y1)
    order = np.array(scores).argsort()[::-1]
    keep = []
    while order.size > 0:
        i = order[0]
        keep.append(i)
        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])
        w = np.maximum(0, xx2 - xx1)
        h = np.maximum(0, yy2 - yy1)
        inter = w * h
        iou = inter / (areas[i] + areas[order[1:]] - inter + 1e-6)
        inds = np.where(iou <= iou_threshold)[0]
        order = order[inds + 1]
    return keep


def ensemble_predict(image_path, conf_threshold=0.25, iou_threshold=0.5):
    img = cv2.imread(image_path)
    boxes_all, scores_all, classes_all = [], [], []
    for model in (model_1, model_2):
        results = model(image_path, conf=conf_threshold, verbose=False)
        for r in results:
            if r.boxes is not None:
                for box in r.boxes:
                    boxes_all.append(box.xyxy[0].cpu().numpy().tolist())
                    scores_all.append(float(box.conf[0]))
                    classes_all.append(int(box.cls[0]))

    if len(boxes_all) == 0:
        return img, [], [], []

    keep = simple_nms(boxes_all, scores_all, iou_threshold)
    for i in keep:
        x1, y1, x2, y2 = map(int, boxes_all[i])
        label = CLASS_NAMES[classes_all[i]]
        color = COLORS[label]
        cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)
        cv2.putText(img, f"{label} {scores_all[i]:.2f}", (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

    return img, keep, [classes_all[i] for i in keep], [scores_all[i] for i in keep]


def get_latest_npk():
    if not os.path.exists(NPK_CSV):
        return {'N': None, 'P': None, 'K': None, 'time': None}
    df = pd.read_csv(NPK_CSV)
    if 'timestamp' in df.columns:
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        latest = df.sort_values('timestamp').iloc[-1]
        return {
            'N': float(latest.get('nitrogen_mgkg', np.nan)),
            'P': float(latest.get('phosphorus_mgkg', np.nan)),
            'K': float(latest.get('potassium_mgkg', np.nan)),
            'time': str(latest['timestamp'])
        }
    # fallback: pick last row
    latest = df.iloc[-1]
    return {
        'N': float(latest.get('nitrogen_mgkg', np.nan)),
        'P': float(latest.get('phosphorus_mgkg', np.nan)),
        'K': float(latest.get('potassium_mgkg', np.nan)),
        'time': None,
    }


def analyze_npk(npk):
    status = {}
    advice = []
    for nutrient in ('N', 'P', 'K'):
        val = npk.get(nutrient)
        if val is None or np.isnan(val):
            status[nutrient] = 'unknown'
            continue
        low = NPK_THRESHOLDS[nutrient]['low']
        high = NPK_THRESHOLDS[nutrient]['high']
        if val < low:
            status[nutrient] = 'low'
            advice.append(f'{nutrient}_low')
        elif val > high:
            status[nutrient] = 'high'
            advice.append(f'{nutrient}_high')
        else:
            status[nutrient] = 'ok'
            advice.append(f'{nutrient}_ok')
    # map to readable advice
    readable = []
    for a in advice:
        readable.append({
            'N_low': 'Apply nitrogen-rich fertilizer',
            'N_high': 'Reduce nitrogen application',
            'P_low': 'Apply phosphorus fertilizer',
            'P_high': 'Reduce phosphorus application',
            'K_low': 'Apply potassium fertilizer',
            'K_high': 'Leach soil with water',
            'N_ok': 'Nitrogen OK',
            'P_ok': 'Phosphorus OK',
            'K_ok': 'Potassium OK',
        }.get(a, a))
    return status, readable


@app.route('/predict', methods=['POST'])
def predict():
    if 'image' not in request.files:
        return jsonify({'error': 'no image provided'}), 400
    f = request.files['image']
    # Save to temp file
    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(f.filename)[1] or '.jpg') as tmp:
        tmp.write(f.read())
        tmp_path = tmp.name

    try:
        img, keep, det_classes, det_scores = ensemble_predict(tmp_path)

        if len(keep) == 0:
            top_class = 'healthy'
            top_score = 0.0
        else:
            best_idx = int(np.argmax(det_scores))
            top_class = CLASS_NAMES[det_classes[best_idx]]
            top_score = float(det_scores[best_idx])

        # build result image base64
        _, buffer = cv2.imencode('.jpg', img)
        jpg_bytes = buffer.tobytes()
        b64 = base64.b64encode(jpg_bytes).decode('utf-8')

        # NPK data
        npk = get_latest_npk()
        npk_status, npk_advice = analyze_npk(npk)

        rec = RECOMMENDATIONS.get(top_class, RECOMMENDATIONS['healthy'])

        result = {
            'verdict': 'HEALTHY' if top_class == 'healthy' else 'DISEASE',
            'verdict_msg': rec['disease_info'],
            'disease_info': rec['disease_info'],
            'confidence': round(top_score * 100, 2),
            'treatment': rec['treatment'],
            'npk': npk,
            'npk_status': npk_status,
            'npk_advice': npk_advice,
            'result_image': b64,
        }
        return jsonify(result)

    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        try:
            os.remove(tmp_path)
        except Exception:
            pass


@app.route('/', methods=['GET'])
def index():
        # Simple HTML page to upload an image and call /predict
        return '''
        <!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Orchid Disease Detection</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #e8f5e9, #f1f8e9);
            min-height: 100vh;
            padding: 20px;
        }

        .container { max-width: 960px; margin: 0 auto; }

        .header {
            background: linear-gradient(135deg, #1b5e20, #2e7d32);
            color: white;
            padding: 36px 30px;
            border-radius: 20px;
            text-align: center;
            margin-bottom: 24px;
            box-shadow: 0 6px 24px rgba(27,94,32,0.3);
        }

        .header h1 { font-size: 2.2rem; margin-bottom: 6px; }
        .header p  { font-size: 1rem; opacity: 0.85; }

        .card {
            background: white;
            border-radius: 16px;
            padding: 24px;
            margin-bottom: 20px;
            box-shadow: 0 2px 16px rgba(0,0,0,0.07);
        }

        .card h2 {
            font-size: 1.15rem;
            color: #1b5e20;
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        /* ── Upload Section ── */
        .drop-zone {
            border: 2px dashed #a5d6a7;
            border-radius: 12px;
            padding: 44px 20px;
            text-align: center;
            cursor: pointer;
            transition: all 0.3s;
            background: #f9fbe7;
        }

        .drop-zone:hover, .drop-zone.drag-over {
            border-color: #2e7d32;
            background: #e8f5e9;
        }

        .drop-zone .icon { font-size: 3rem; margin-bottom: 10px; }
        .drop-zone p { color: #666; }
        .drop-zone span { color: #2e7d32; font-weight: 600; }
        #fileInput { display: none; }

        #previewContainer { display:none; margin-top:16px; text-align:center; }
        #previewImg {
            max-width: 100%;
            max-height: 280px;
            border-radius: 12px;
            border: 2px solid #a5d6a7;
            object-fit: contain;
        }

        .btn-analyze {
            display: block;
            width: 100%;
            padding: 16px;
            background: linear-gradient(135deg, #e65100, #f57c00);
            color: white;
            border: none;
            border-radius: 12px;
            font-size: 1.1rem;
            font-weight: 700;
            cursor: pointer;
            margin-top: 16px;
            letter-spacing: 0.5px;
            transition: opacity 0.2s, transform 0.1s;
        }

        .btn-analyze:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
        .btn-analyze:disabled { opacity: 0.45; cursor: not-allowed; }

        /* ── Loading ── */
        .loading { display:none; text-align:center; padding:30px; }
        .spinner {
            width: 52px; height: 52px;
            border: 5px solid #e8f5e9;
            border-top: 5px solid #2e7d32;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            margin: 0 auto 14px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* ── Verdict ── */
        .verdict {
            padding: 22px;
            border-radius: 14px;
            text-align: center;
            font-size: 1.25rem;
            font-weight: 700;
            color: white;
            margin-bottom: 20px;
            letter-spacing: 0.3px;
        }

        .verdict.HEALTHY  { background: linear-gradient(135deg, #2e7d32, #43a047); }
        .verdict.DISEASE  { background: linear-gradient(135deg, #c62828, #e53935); }
        .verdict.NUTRIENT { background: linear-gradient(135deg, #f57f17, #ffa000); }

        /* ── Info Grid ── */
        .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 20px;
        }

        @media (max-width: 620px) { .info-grid { grid-template-columns: 1fr; } }

        /* ── Confidence Bar ── */
        .conf-label { font-size: 0.85rem; color: #777; margin-bottom: 4px; }
        .conf-value { font-size: 2rem; font-weight: 800; color: #1b5e20; }

        .conf-bar {
            height: 10px;
            background: #e0e0e0;
            border-radius: 5px;
            margin-top: 8px;
            overflow: hidden;
        }

        .conf-fill {
            height: 100%;
            background: linear-gradient(90deg, #2e7d32, #66bb6a);
            border-radius: 5px;
            transition: width 1s ease;
            width: 0%;
        }

        /* ── NPK ── */
        .npk-time { font-size: 0.8rem; color: #999; margin-bottom: 12px; }

        .npk-row { display:flex; gap:12px; margin-bottom:14px; }

        .npk-box {
            flex: 1;
            text-align: center;
            padding: 14px 8px;
            border-radius: 12px;
            border: 2px solid;
        }

        .npk-box.ok   { border-color:#2e7d32; background:#e8f5e9; color:#2e7d32; }
        .npk-box.low  { border-color:#f57f17; background:#fff8e1; color:#f57f17; }
        .npk-box.high { border-color:#c62828; background:#ffebee; color:#c62828; }

        .npk-n  { font-size:1.1rem; font-weight:700; }
        .npk-v  { font-size:1.6rem; font-weight:800; }
        .npk-u  { font-size:0.72rem; color:#888; }

        .advice-list { list-style:none; }
        .advice-list li {
            padding: 5px 0;
            font-size: 0.88rem;
            color: #444;
            border-bottom: 1px solid #f5f5f5;
        }
        .advice-list li:last-child { border-bottom: none; }

        /* ── Treatment ── */
        .treatment-list { list-style:none; }
        .treatment-list li {
            padding: 9px 0;
            border-bottom: 1px solid #f5f5f5;
            font-size: 0.95rem;
            color: #333;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .treatment-list li:last-child { border-bottom: none; }
        .treatment-list li::before { content: '✅'; font-size:1rem; }

        /* ── Result Image ── */
        #resultImgContainer { display:none; }
        #resultImg { width:100%; border-radius:12px; border:2px solid #a5d6a7; }

        #resultsSection { display:none; }

        /* ── Model Comparison Table ── */
        .comp-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 8px;
            font-size: 0.92rem;
        }
        .comp-table th {
            background: #1b5e20;
            color: white;
            padding: 12px 10px;
            text-align: left;
        }
        .comp-table th:first-child { border-radius: 8px 0 0 0; }
        .comp-table th:last-child  { border-radius: 0 8px 0 0; }
        .comp-table td { padding: 11px 10px; border-bottom: 1px solid #f0f0f0; }
        .comp-table tr:last-child td { border-bottom: none; }
        .comp-table tr:hover td { background: #f9fbe7; }

        .badge {
            display: inline-block;
            padding: 3px 10px;
            border-radius: 20px;
            font-size: 0.78rem;
            font-weight: 600;
        }

        .badge.disease { background:#ffebee; color:#c62828; }
        .badge.healthy { background:#e8f5e9; color:#2e7d32; }

        /* ── Compare Button ── */
        .btn-compare {
            display: inline-block;
            padding: 10px 22px;
            background: linear-gradient(135deg, #1565c0, #1976d2);
            color: white;
            border: none;
            border-radius: 10px;
            font-size: 0.95rem;
            font-weight: 600;
            cursor: pointer;
            margin-top: 10px;
            transition: opacity 0.2s;
        }
        .btn-compare:hover { opacity: 0.9; }
    </style>
</head>
<body>
<div class="container">

    <!-- Header -->
    <div class="header">
        <h1> Orchid Disease Detection</h1>
        <p>AI-powered plant health analysis with NPK sensor integration</p>
    </div>

    <!-- Upload Card -->
    <div class="card">
        <h2>📷 Upload Leaf Image</h2>
        <div class="drop-zone" id="dropZone">
            <div class="icon">🍃</div>
            <p>Drag & drop a leaf image here or <span>click to browse</span></p>
        </div>
        <input type="file" id="fileInput" accept="image/*">

        <div id="previewContainer">
            <img id="previewImg" src="" alt="Preview">
        </div>

        <button class="btn-analyze" id="analyzeBtn" disabled onclick="analyze()">
            🔍 Analyze with Ensemble AI
        </button>
    </div>

    <!-- Loading -->
    <div class="loading" id="loading">
        <div class="spinner"></div>
        <p style="color:#555;font-size:1rem;">Analyzing leaf + NPK data...</p>
    </div>

    <!-- Results -->
    <div id="resultsSection">

        <!-- Verdict Banner -->
        <div class="verdict" id="verdictBox"></div>

        <div class="info-grid">

            <!-- Detection -->
            <div class="card">
                <h2>🦠 Detection Result</h2>
                <p id="diseaseInfo" style="font-size:0.97rem;margin-bottom:14px;color:#333;"></p>
                <p class="conf-label">Confidence Score</p>
                <p class="conf-value" id="confidenceText"></p>
                <div class="conf-bar">
                    <div class="conf-fill" id="confidenceFill"></div>
                </div>
            </div>

            <!-- NPK -->
            <div class="card">
                <h2>🧪 NPK Sensor Data</h2>
                <p class="npk-time" id="npkTime"></p>
                <div class="npk-row" id="npkRow"></div>
                <ul class="advice-list" id="adviceList"></ul>
            </div>

        </div>

        <!-- Treatment -->
        <div class="card">
            <h2>💊 Treatment Recommendations</h2>
            <ul class="treatment-list" id="treatmentList"></ul>
        </div>

        <!-- Result Image -->
        <div class="card" id="resultImgContainer">
            <h2>🔍 AI Detection Image</h2>
            <img id="resultImg" src="" alt="Detection Result">
        </div>

        <!-- Model Comparison -->
        <div class="card">
            <h2> Model Comparison</h2>
            <p style="font-size:0.88rem;color:#777;margin-bottom:10px;">
                Compare individual model predictions on this image
            </p>
            <form id="compareForm" enctype="multipart/form-data" method="POST" action="/">
                <input type="file" id="compareFile" name="image" style="display:none">
                <button type="button" class="btn-compare" onclick="runComparison()">
                    Run Model Comparison
                </button>
            </form>
            <div id="comparisonTable" style="display:none; margin-top:16px;">
                <table class="comp-table">
                    <thead>
                        <tr>
                            <th>Model</th>
                            <th>Prediction</th>
                            <th>Confidence</th>
                            <th>Latency</th>
                        </tr>
                    </thead>
                    <tbody id="compTableBody"></tbody>
                </table>
            </div>
        </div>

    </div>
</div>

<script>
    const dropZone   = document.getElementById('dropZone');
    const fileInput  = document.getElementById('fileInput');
    const previewImg = document.getElementById('previewImg');
    const analyzeBtn = document.getElementById('analyzeBtn');
    let selectedFile = null;

    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', e => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    });

    fileInput.addEventListener('change', e => {
        if (e.target.files[0]) handleFile(e.target.files[0]);
    });

    function handleFile(file) {
        selectedFile = file;
        const reader = new FileReader();
        reader.onload = e => {
            previewImg.src = e.target.result;
            document.getElementById('previewContainer').style.display = 'block';
        };
        reader.readAsDataURL(file);
        analyzeBtn.disabled = false;
        document.getElementById('resultsSection').style.display = 'none';
    }

    async function analyze() {
        if (!selectedFile) return;
        analyzeBtn.disabled = true;
        document.getElementById('loading').style.display = 'block';
        document.getElementById('resultsSection').style.display = 'none';

        const formData = new FormData();
        formData.append('image', selectedFile);

        try {
            const res  = await fetch('/predict', { method:'POST', body:formData });
            const data = await res.json();
            if (data.error) { alert('Error: ' + data.error); return; }
            showResults(data);
        } catch(err) {
            alert('Connection error: ' + err.message);
        } finally {
            document.getElementById('loading').style.display = 'none';
            analyzeBtn.disabled = false;
        }
    }

    function showResults(data) {
        // Verdict
        const vb = document.getElementById('verdictBox');
        vb.textContent = data.verdict_msg;
        vb.className   = 'verdict ' + data.verdict;

        // Detection
        document.getElementById('diseaseInfo').textContent    = data.disease_info;
        document.getElementById('confidenceText').textContent = data.confidence + '%';
        document.getElementById('confidenceFill').style.width = data.confidence + '%';

        // NPK
        document.getElementById('npkTime').textContent =
            'Latest sensor reading: ' + (data.npk.time || 'N/A');

        const npkRow = document.getElementById('npkRow');
        npkRow.innerHTML = '';
        ['N','P','K'].forEach(n => {
            const st  = (data.npk_status && data.npk_status[n]) || 'ok';
            const val = data.npk && data.npk[n] !== null ? data.npk[n] : 'N/A';
            const col = st==='ok' ? '#2e7d32' : st==='low' ? '#f57f17' : '#c62828';
            const div = document.createElement('div');
            div.className = 'npk-box ' + st;
            div.innerHTML = `
                <div class="npk-n">${n}</div>
                <div class="npk-v" style="color:${col}">${val}</div>
                <div class="npk-u">mg/kg</div>`;
            npkRow.appendChild(div);
        });

        const adviceList = document.getElementById('adviceList');
        adviceList.innerHTML = '';
        (data.npk_advice || []).forEach(a => {
            const li = document.createElement('li');
            li.textContent = a;
            adviceList.appendChild(li);
        });

        // Treatment
        const tl = document.getElementById('treatmentList');
        tl.innerHTML = '';
        (data.treatment || []).forEach(t => {
            const li = document.createElement('li');
            li.textContent = t;
            tl.appendChild(li);
        });

        // Result Image
        if (data.result_image) {
            document.getElementById('resultImg').src =
                'data:image/jpeg;base64,' + data.result_image;
            document.getElementById('resultImgContainer').style.display = 'block';
        }

        document.getElementById('resultsSection').style.display = 'block';
        document.getElementById('resultsSection').scrollIntoView({ behavior:'smooth' });
    }

    async function runComparison() {
        if (!selectedFile) { alert('Please select an image first!'); return; }

        const formData = new FormData();
        formData.append('image', selectedFile);

        try {
            const res  = await fetch('/', { method:'POST', body:formData });
            const text = await res.text();
            const parser = new DOMParser();
            const doc  = parser.parseFromString(text, 'text/html');
            const rows = doc.querySelectorAll('table tr');
            const tbody = document.getElementById('compTableBody');
            tbody.innerHTML = '';
            rows.forEach((row, idx) => {
                if (idx === 0) return;
                const cells = row.querySelectorAll('td');
                if (cells.length < 4) return;
                const pred = cells[1].textContent.trim();
                const isDisease = pred !== 'healthy' && pred !== 'No Detection';
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${cells[0].textContent}</strong></td>
                    <td><span class="badge ${isDisease?'disease':'healthy'}">${pred}</span></td>
                    <td>${cells[2].textContent}</td>
                    <td>${cells[3].textContent}</td>`;
                tbody.appendChild(tr);
            });
            document.getElementById('comparisonTable').style.display = 'block';
        } catch(err) {
            alert('Comparison error: ' + err.message);
        }
    }
</script>
</body>
</html>
        '''


#if __name__ == '__main__':
    # Default host=0.0.0.0 to allow device connections. Set FLASK_PORT env to change port.
 #   port = int(os.environ.get('FLASK_PORT', 5000))
 #   app.run(host='0.0.0.0', port=port, debug=True)

@app.route('/health', methods=['GET'])
def health():
   return jsonify({'status': 'ok'})

if __name__ == "__main__":
   app.run(debug=True, host='0.0.0.0', port=5000)
