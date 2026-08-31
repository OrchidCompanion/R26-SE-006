import React, { useState } from 'react';
import { Compass, Sparkles, AlertCircle, CheckCircle2, ArrowRight, Calendar, Clock, Layers, RefreshCw } from 'lucide-react';
import ImageUploader from '../components/ImageUploader';
import SensorInputForm from '../components/SensorInputForm';
import StageBadge from '../components/StageBadge';
import TimelineVisualizer from '../components/TimelineVisualizer';
import { detectStage, predictBloom } from '../services/api';

const now = new Date();
const startOfYear = new Date(now.getFullYear(), 0, 0);
const currentDayOfYear = Math.floor((now - startOfYear) / (1000 * 60 * 60 * 24));

const DEFAULT_SENSOR_INPUTS = {
  avg_temp_c: 27.5, min_temp_c: 22.0, max_temp_c: 32.0, temp_std_c: 3.1,
  avg_humidity_rh: 70.0, min_humidity_rh: 55.0, max_humidity_rh: 85.0, humidity_std_rh: 7.5,
  avg_light_lux: 14000.0, min_light_lux: 3000.0, max_light_lux: 30000.0, light_std_lux: 7000.0,
  month: now.getMonth() + 1,
  day_of_year: currentDayOfYear
};

export default function PredictPage({ onSavePrediction }) {
  const [images, setImages] = useState([null, null, null]);
  const [previews, setPreviews] = useState([null, null, null]);
  const [imageErrors, setImageErrors] = useState([null, null, null]);

  const [sensorValues, setSensorValues] = useState(DEFAULT_SENSOR_INPUTS);
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState(null);

  const [model01Result, setModel01Result] = useState(null);
  const [bloomResult, setBloomResult] = useState(null);

  const handleImageChange = (index, file, previewUrl, errorMsg) => {
    const updatedImages = [...images];
    const updatedPreviews = [...previews];
    const updatedErrors = [...imageErrors];

    updatedImages[index] = file;
    updatedPreviews[index] = previewUrl;
    updatedErrors[index] = errorMsg;

    setImages(updatedImages);
    setPreviews(updatedPreviews);
    setImageErrors(updatedErrors);

    // Clear previous prediction output when images change
    setModel01Result(null);
    setBloomResult(null);
    setGlobalError(null);
  };

  const handleRemoveImage = (index) => {
    handleImageChange(index, null, null, null);
  };

  const handleSensorChange = (field, val) => {
    setSensorValues(prev => ({ ...prev, [field]: val }));
  };

  const handleApplyPreset = (presetValues) => {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((now - startOfYear) / (1000 * 60 * 60 * 24));
    setSensorValues(prev => ({ 
      ...prev, 
      ...presetValues, 
      month: now.getMonth() + 1, 
      day_of_year: dayOfYear 
    }));
  };

  const handlePredict = async () => {
    setGlobalError(null);

    // Validate 3 images uploaded
    if (images.some(img => !img)) {
      setGlobalError("Please upload all THREE images before starting the prediction.");
      return;
    }

    setLoading(true);
    try {
      // Execute complete prediction workflow via backend API
      const result = await predictBloom(images, sensorValues);
      setBloomResult(result);
      setModel01Result(result.model01_result);

      if (result.model01_result && result.model01_result.all_valid) {
        onSavePrediction(result);
      }
    } catch (err) {
      setGlobalError(err.message || "An error occurred during prediction.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Page Header */}
      <div>
        <h2 style={{ fontSize: '1.8rem', fontWeight: 800, margin: '0 0 0.4rem 0' }} className="hero-gradient-text">
          Dendrobium Bloom Prediction Pipeline
        </h2>
        <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)', margin: 0 }}>
          Upload 3 orchid photos to identify current stage (Model 01: YOLOv8) and configure IoT environmental parameters (Model 02: Gradient Boosting) to forecast flowering timeline.
        </p>
      </div>

      {globalError && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          color: '#f87171',
          padding: '1rem 1.25rem',
          borderRadius: 'var(--radius-md)',
          fontSize: '0.95rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem'
        }}>
          <AlertCircle size={20} style={{ flexShrink: 0 }} />
          <div>
            <strong style={{ display: 'block', marginBottom: '0.2rem' }}>Validation Error</strong>
            <span>{globalError}</span>
          </div>
        </div>
      )}

      {/* Section 1: Upload Three Orchid Images */}
      <ImageUploader
        images={images}
        previews={previews}
        errors={imageErrors}
        onImageChange={handleImageChange}
        onRemoveImage={handleRemoveImage}
      />

      {/* Section 2: Model 01 Analysis Result */}
      {model01Result && (
        <div className="glass-card" style={{
          border: model01Result.all_valid ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
          background: model01Result.all_valid ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)'
        }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sparkles size={18} color="var(--emerald-primary)" />
            Model 01 Identification Result (YOLOv8)
          </h3>

          <div className="grid-3" style={{ marginBottom: '1.25rem' }}>
            {model01Result.image_predictions.map((p, i) => (
              <div key={i} style={{
                background: 'rgba(15, 23, 42, 0.6)',
                padding: '0.85rem 1rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-card)'
              }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.4rem' }}>
                  Image {p.image_index}: {p.filename}
                </div>
                {p.is_valid ? (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <StageBadge stage={p.stage} size="small" />
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#34d399' }}>
                        {(p.confidence * 100).toFixed(1)}% Conf
                      </span>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                      Raw Class: {p.raw_class_name}
                    </span>
                  </div>
                ) : (
                  <div style={{ fontSize: '0.8rem', color: '#f87171' }}>
                    {p.error_message}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{
            background: 'rgba(16, 185, 129, 0.1)',
            padding: '1rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem'
          }}>
            <div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block' }}>
                FINAL DETERMINED BLOOMING STAGE
              </span>
              <div style={{ marginTop: '0.25rem' }}>
                <StageBadge stage={model01Result.final_stage} size="large" />
              </div>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', maxWidth: '500px' }}>
              {model01Result.summary_message}
            </div>
          </div>
        </div>
      )}

      {/* Section 3: Model 02 IoT / Environmental Inputs */}
      <SensorInputForm
        sensorValues={sensorValues}
        onChange={handleSensorChange}
        onApplyPreset={handleApplyPreset}
      />

      {/* Section 4: Prediction Button */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <button
          className="btn-orchid"
          onClick={handlePredict}
          disabled={loading || images.some(img => !img)}
          style={{ padding: '1rem 3rem', fontSize: '1.1rem' }}
        >
          {loading ? (
            <>
              <RefreshCw size={20} className="glow-active" /> Analyzing & Forecasting...
            </>
          ) : (
            <>
              <Compass size={20} /> Predict Bloom Progression
            </>
          )}
        </button>
      </div>

      {/* Section 5: Prediction Result Screen */}
      {bloomResult && bloomResult.model01_result.all_valid && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1rem' }}>
          {bloomResult.is_flowering ? (
            /* Terminal State: Flowering */
            <div className="glass-card" style={{
              background: 'linear-gradient(135deg, rgba(236,72,153,0.2) 0%, rgba(147,51,234,0.2) 100%)',
              border: '2px solid rgba(236,72,153,0.4)',
              textAlign: 'center',
              padding: '3rem 2rem'
            }}>
              <StageBadge stage="Flowering" size="large" />
              <h3 style={{ fontSize: '1.8rem', fontWeight: 800, margin: '1rem 0 0.5rem 0', color: '#ffffff' }}>
                Flowering Stage Reached!
              </h3>
              <p style={{ fontSize: '1.1rem', color: '#f472b6', maxWidth: '600px', margin: '0 auto' }}>
                {bloomResult.flowering_message}
              </p>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '1rem' }}>
                No further transition predictions are required. Enjoy your blooming Dendrobium orchid!
              </p>
            </div>
          ) : (
            /* Active Transition & Timeline Results */
            <>
              {/* Top Result Summary Cards */}
              <div className="grid-4">
                <div className="glass-card">
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>CURRENT BLOOMING STAGE</span>
                  <div style={{ margin: '0.6rem 0' }}>
                    <StageBadge stage={bloomResult.current_stage} size="large" />
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Identified by Model 01</span>
                </div>

                <div className="glass-card">
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>NEXT BLOOMING STAGE</span>
                  <div style={{ margin: '0.6rem 0' }}>
                    <StageBadge stage={bloomResult.timeline[0]?.to_stage || 'Unknown'} size="large" />
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Immediate transition target</span>
                </div>

                <div className="glass-card">
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>PREDICTED NEXT-STAGE DURATION</span>
                  <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fbbf24', margin: '0.2rem 0' }}>
                    {bloomResult.timeline[0]?.display_days} Days
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Model 02 transition forecast</span>
                </div>

                <div className="glass-card">
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>TARGET NEXT-STAGE WINDOW (±5 DAYS)</span>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#38bdf8', margin: '0.4rem 0' }}>
                    {bloomResult.timeline[0]?.date_range_display || bloomResult.timeline[0]?.estimated_stage_date}
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Calendar date range (±5 days)</span>
                </div>
              </div>

              {/* Blooming Timeline Visualizer */}
              <TimelineVisualizer
                currentStage={bloomResult.current_stage}
                timeline={bloomResult.timeline}
                totalDays={bloomResult.total_days_to_flowering}
                estimatedFloweringDate={bloomResult.estimated_flowering_date}
                floweringDateRangeDisplay={bloomResult.flowering_date_range_display}
              />

              {/* Prominent Estimated Flowering Date Banner */}
              <div className="glass-card" style={{
                background: 'linear-gradient(135deg, rgba(236,72,153,0.2) 0%, rgba(16,185,129,0.2) 100%)',
                border: '2px solid rgba(236,72,153,0.4)',
                padding: '2rem',
                textAlign: 'center'
              }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f472b6', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  TARGET FLOWERING WINDOW (±5 DAYS RANGE)
                </span>
                <h3 style={{ fontSize: '2.2rem', fontWeight: 800, color: '#38bdf8', margin: '0.4rem 0' }}>
                  {bloomResult.flowering_date_range_display || bloomResult.estimated_flowering_date}
                </h3>
                <p style={{ fontSize: '1rem', color: 'var(--text-muted)', margin: '0.5rem auto 0 auto', maxWidth: '650px' }}>
                  Estimated total flowering time: <strong>{bloomResult.display_total_days} Days</strong> ({bloomResult.total_days_to_flowering.toFixed(1)} days internal precision) starting from {bloomResult.current_date}.
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
