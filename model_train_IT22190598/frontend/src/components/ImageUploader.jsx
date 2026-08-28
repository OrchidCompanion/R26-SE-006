import React, { useRef } from 'react';
import { Upload, RefreshCw, Trash2, Image as ImageIcon, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function ImageUploader({ images, previews, errors, onImageChange, onRemoveImage }) {
  const fileInputRefs = [useRef(null), useRef(null), useRef(null)];

  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB

  const handleFileSelect = (index, e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate type
    if (!ALLOWED_TYPES.includes(file.type) && !file.name.match(/\.(jpg|jpeg|png|webp)$/i)) {
      onImageChange(index, null, null, "Invalid file format. Please upload JPG, JPEG, PNG, or WEBP images.");
      return;
    }

    // Validate size
    if (file.size > MAX_SIZE) {
      onImageChange(index, null, null, "File size exceeds 10 MB limit.");
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    onImageChange(index, file, previewUrl, null);
  };

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 0.3rem 0' }}>
          Upload Three Orchid Images
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Please upload 3 clear photos of the same Dendrobium orchid from different angles for multi-image stage analysis.
        </p>
      </div>

      <div className="grid-3">
        {[0, 1, 2].map((idx) => {
          const imgNumber = idx + 1;
          const preview = previews[idx];
          const file = images[idx];
          const error = errors[idx];

          return (
            <div key={idx} className="glass-card" style={{
              display: 'flex',
              flexDirection: 'column',
              justify: 'space-between',
              position: 'relative',
              borderColor: error ? 'rgba(239, 68, 68, 0.4)' : preview ? 'rgba(16, 185, 129, 0.3)' : 'var(--border-card)'
            }}>
              {/* Slot Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                  Image {imgNumber}
                </span>
                {preview ? (
                  <span style={{ fontSize: '0.75rem', color: '#34d399', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <CheckCircle2 size={13} /> Ready
                  </span>
                ) : (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                    Required
                  </span>
                )}
              </div>

              {/* Hidden Input */}
              <input
                type="file"
                ref={fileInputRefs[idx]}
                onChange={(e) => handleFileSelect(idx, e)}
                accept="image/jpeg,image/png,image/jpg,image/webp"
                style={{ display: 'none' }}
              />

              {/* Upload Dropzone / Preview Area */}
              <div style={{
                height: '200px',
                width: '100%',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(15, 23, 42, 0.6)',
                border: preview ? 'none' : '2px dashed rgba(255,255,255,0.15)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                position: 'relative',
                marginBottom: '1rem',
                cursor: preview ? 'default' : 'pointer'
              }}
              onClick={() => !preview && fileInputRefs[idx].current.click()}
              >
                {preview ? (
                  <img
                    src={preview}
                    alt={`Orchid preview ${imgNumber}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{ textAlign: 'center', padding: '1rem' }}>
                    <ImageIcon size={36} color="var(--text-dim)" style={{ marginBottom: '0.5rem' }} />
                    <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', margin: 0 }}>
                      Click to upload Image {imgNumber}
                    </p>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                      JPG, JPEG, PNG, WEBP (max 10MB)
                    </span>
                  </div>
                )}
              </div>

              {/* Error Message */}
              {error && (
                <div style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  color: '#f87171',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  marginBottom: '0.75rem'
                }}>
                  <AlertCircle size={14} style={{ flexShrink: 0 }} />
                  <span>{error}</span>
                </div>
              )}

              {/* Card Action Buttons */}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {preview ? (
                  <>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => fileInputRefs[idx].current.click()}
                      style={{ flex: 1, justifyContent: 'center', fontSize: '0.85rem' }}
                    >
                      <RefreshCw size={14} /> Replace
                    </button>
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={() => onRemoveImage(idx)}
                      style={{ padding: '0.5rem 0.75rem' }}
                      title="Remove Image"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => fileInputRefs[idx].current.click()}
                    style={{ width: '100%', justifyContent: 'center', fontSize: '0.85rem' }}
                  >
                    <Upload size={14} /> Select Image {imgNumber}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
