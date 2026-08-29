"""
train_growth_model.py
----------------------
Trains a Random Forest classifier to predict Dendrobium orchid
growth stage from leaf measurements.

Run once after generate_dataset.py:
    python train_growth_model.py
"""

import os
import joblib
import pandas as pd
import numpy as np
from sklearn.ensemble        import RandomForestClassifier
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing   import LabelEncoder
from sklearn.metrics         import classification_report, confusion_matrix
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import seaborn as sns

# ── Paths ─────────────────────────────────────────────────────────────────────
DATASET_PATH = "3_dataset/synthetic_dataset.csv"
MODEL_DIR    = "4_growth_model"
MODEL_PATH   = os.path.join(MODEL_DIR, "growth_model.pkl")
ENCODER_PATH = os.path.join(MODEL_DIR, "label_encoder.pkl")
RESULTS_DIR  = "results"

FEATURE_COLS = ["leaf_area_cm2", "greenness_index", "leaf_count"]
TARGET_COL   = "growth_stage"

# Fixed stage order — never changes
STAGE_ORDER  = ["Seedling", "Vegetative", "Spike", "Flowering", "Post-bloom"]


# ── Helpers ───────────────────────────────────────────────────────────────────

def ensure_dataset() -> pd.DataFrame:
    if os.path.exists(DATASET_PATH):
        df = pd.read_csv(DATASET_PATH)
        print(f"✅ Dataset found   → {DATASET_PATH} ({len(df)} rows)")
        return df

    print("⚙️  Dataset missing — generating now...")
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "generate_dataset", "generate_dataset.py"
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.generate(output_path=DATASET_PATH)


def save_confusion_matrix(y_test, y_pred, classes):
    cm = confusion_matrix(y_test, y_pred)
    fig, ax = plt.subplots(figsize=(8, 6))
    sns.heatmap(
        cm,
        annot       = True,
        fmt         = "d",
        cmap        = "Greens",
        xticklabels = classes,
        yticklabels = classes,
        ax          = ax,
        linewidths  = 0.5,
        linecolor   = "white",
    )
    ax.set_title("Growth Stage Classifier — Confusion Matrix", fontsize=13)
    ax.set_xlabel("Predicted Stage", fontsize=11)
    ax.set_ylabel("Actual Stage",    fontsize=11)
    plt.xticks(rotation=30, ha="right")
    plt.yticks(rotation=0)
    plt.tight_layout()
    path = os.path.join(RESULTS_DIR, "growth_model_confusion_matrix.png")
    plt.savefig(path, dpi=150)
    plt.close()
    print(f"✅ Confusion matrix → {path}")


def save_feature_importance(clf):
    fig, ax = plt.subplots(figsize=(7, 4))
    colors = ["#1D9E75", "#534AB7", "#D85A30"]
    ax.barh(FEATURE_COLS, clf.feature_importances_,
            color=colors, edgecolor="white")
    ax.set_xlabel("Importance", fontsize=11)
    ax.set_title("Feature Importances — Growth Stage Model", fontsize=12)
    ax.set_xlim(0, 1)
    for i, v in enumerate(clf.feature_importances_):
        ax.text(v + 0.01, i, f"{v:.3f}", va="center", fontsize=10)
    plt.tight_layout()
    path = os.path.join(RESULTS_DIR, "growth_model_feature_importance.png")
    plt.savefig(path, dpi=150)
    plt.close()
    print(f"✅ Feature importance → {path}")


def save_cv_chart(cv_scores):
    fig, ax = plt.subplots(figsize=(7, 4))
    ax.bar(range(1, 6), cv_scores,
           color="#534AB7", edgecolor="white", alpha=0.85)
    ax.axhline(cv_scores.mean(), color="red", linestyle="--",
               label=f"Mean: {cv_scores.mean():.4f}")
    ax.set_xticks(range(1, 6))
    ax.set_xticklabels([f"Fold {i}" for i in range(1, 6)])
    ax.set_ylabel("Accuracy")
    ax.set_ylim(0, 1.1)
    ax.set_title("5-Fold Cross Validation Accuracy", fontsize=12)
    ax.legend()
    plt.tight_layout()
    path = os.path.join(RESULTS_DIR, "growth_model_cv_scores.png")
    plt.savefig(path, dpi=150)
    plt.close()
    print(f"✅ CV scores chart  → {path}")


# ── Train ─────────────────────────────────────────────────────────────────────

def train(dataset_path: str = DATASET_PATH) -> tuple:

    df = ensure_dataset()

    print(f"\n   Stage counts   :\n"
          f"{df[TARGET_COL].value_counts().to_string()}\n")

    X     = df[FEATURE_COLS].values
    y_raw = df[TARGET_COL].values

    # Fit encoder on fixed order so indices never shift
    le = LabelEncoder()
    le.fit(STAGE_ORDER)
    y  = le.transform(y_raw)

    print(f"   Classes        : {list(le.classes_)}")

    # Train / test split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y,
        test_size    = 0.20,
        random_state = 42,
        stratify     = y,
    )
    print(f"   Train size     : {len(X_train)}")
    print(f"   Test size      : {len(X_test)}")

    # Model
    clf = RandomForestClassifier(
        n_estimators      = 300,
        max_depth         = None,
        min_samples_split = 4,
        min_samples_leaf  = 2,
        random_state      = 42,
        n_jobs            = -1,
    )
    clf.fit(X_train, y_train)
    print("\n✅ Model trained")

    # Evaluation
    y_pred = clf.predict(X_test)

    print("\n── Classification Report ──────────────────────────────────────")
    print(classification_report(
        y_test, y_pred,
        target_names = le.classes_,
        digits       = 4,
    ))

    acc = (y_pred == y_test).mean()
    print(f"   Test accuracy      : {acc:.4f} ({acc*100:.2f}%)")

    cv = cross_val_score(clf, X, y, cv=5, scoring="accuracy")
    print(f"   5-fold CV accuracy : {cv.mean():.4f} ± {cv.std():.4f}")

    print("\n── Feature Importances ────────────────────────────────────────")
    for feat, imp in zip(FEATURE_COLS, clf.feature_importances_):
        bar = "█" * int(imp * 50)
        print(f"   {feat:<22} {imp:.4f}  {bar}")

    # Save charts
    os.makedirs(RESULTS_DIR, exist_ok=True)
    save_confusion_matrix(y_test, y_pred, le.classes_)
    save_feature_importance(clf)
    save_cv_chart(cv)

    # Save model
    os.makedirs(MODEL_DIR, exist_ok=True)
    joblib.dump(clf, MODEL_PATH)
    joblib.dump(le,  ENCODER_PATH)
    print(f"✅ Model saved      → {MODEL_PATH}")
    print(f"✅ Encoder saved    → {ENCODER_PATH}")

    return clf, le


# ── Predict ───────────────────────────────────────────────────────────────────

def predict(leaf_area_cm2:   float,
            greenness_index: float,
            leaf_count:      int,
            model_path:      str = MODEL_PATH,
            encoder_path:    str = ENCODER_PATH) -> dict:
    """
    Predict growth stage for a single observation.
    Returns stage name and probability for each class.
    """
    if not os.path.exists(model_path):
        raise FileNotFoundError(
            f"Model not found at '{model_path}'.\n"
            "Run: python train_growth_model.py"
        )

    clf = joblib.load(model_path)
    le  = joblib.load(encoder_path)

    X        = np.array([[leaf_area_cm2, greenness_index, leaf_count]])
    pred_enc = clf.predict(X)[0]
    proba    = clf.predict_proba(X)[0]
    stage    = le.inverse_transform([pred_enc])[0]

    proba_dict = {
        cls: round(float(p), 4)
        for cls, p in zip(le.classes_, proba)
    }

    return {
        "stage":         stage,
        "probabilities": proba_dict,
    }


# ── Sanity check ──────────────────────────────────────────────────────────────

def _test_predictions(le, clf):
    """Verify the model gives sensible predictions on known examples."""
    test_cases = [
        # area,  green, count, expected
        (3.0,  0.25,  2,  "Seedling"),
        (10.0, 0.60,  5,  "Vegetative"),
        (22.0, 0.70,  7,  "Spike"),
        (32.0, 0.45, 11,  "Flowering"),
        (15.0, 0.20,  6,  "Post-bloom"),
    ]

    print("\n── Sanity Check — Known Examples ──────────────────────────────")
    print(f"  {'Input':<42} {'Expected':<12} {'Predicted':<12} {'OK?'}")
    print(f"  {'-'*42} {'-'*12} {'-'*12} {'-'*4}")

    all_ok = True
    for area, green, count, expected in test_cases:
        X         = np.array([[area, green, count]])
        pred_enc  = clf.predict(X)[0]
        predicted = le.inverse_transform([pred_enc])[0]
        ok        = "✅" if predicted == expected else "❌"
        if predicted != expected:
            all_ok = False
        desc = f"area={area} green={green} count={count}"
        print(f"  {desc:<42} {expected:<12} {predicted:<12} {ok}")

    if all_ok:
        print("\n  ✅ All sanity checks passed")
    else:
        print("\n  ⚠️  Some checks failed — review dataset ranges")


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("  GROWTH STAGE MODEL — TRAINING")
    print("=" * 60)

    clf, le = train()
    _test_predictions(le, clf)

    print("\n" + "=" * 60)
    print("  TRAINING COMPLETE")
    print("=" * 60)
    print("\n  Run the pipeline:")
    print("    python main_pipeline.py --image your_leaf.jpg --leaf-count 5")