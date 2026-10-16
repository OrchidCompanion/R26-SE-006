import React, { useState, useEffect } from 'react';
import { Sliders, Sun, Thermometer, Droplets, Calendar, Upload, RefreshCw, Database, Check, AlertCircle, Sprout, Cpu, Search } from 'lucide-react';
import { parseSensorFile, parseSupabaseReadings, fetchSupabaseReadings, fetchSupabasePlants, fetchSupabaseModules } from '../services/api';

const PRESETS = {
  indoor: {
    label: "Standard Indoor",
    desc: "24°C, 65% RH, 12,000 Lux",
    values: {
      avg_temp_c: 24.5, min_temp_c: 20.0, max_temp_c: 28.0, temp_std_c: 2.2,
      avg_humidity_rh: 65.0, min_humidity_rh: 50.0, max_humidity_rh: 75.0, humidity_std_rh: 6.5,
      avg_light_lux: 12000.0, min_light_lux: 2500.0, max_light_lux: 22000.0, light_std_lux: 5500.0
    }
  },
  greenhouse: {
    label: "Warm Greenhouse",
    desc: "28.5°C, 75% RH, 18,000 Lux",
    values: {
      avg_temp_c: 28.5, min_temp_c: 22.0, max_temp_c: 33.0, temp_std_c: 3.5,
      avg_humidity_rh: 75.0, min_humidity_rh: 60.0, max_humidity_rh: 88.0, humidity_std_rh: 8.0,
      avg_light_lux: 18000.0, min_light_lux: 4000.0, max_light_lux: 32000.0, light_std_lux: 8000.0
    }
  },
  shadehouse: {
    label: "Cool Shadehouse",
    desc: "22°C, 80% RH, 10,000 Lux",
    values: {
      avg_temp_c: 22.0, min_temp_c: 17.0, max_temp_c: 26.0, temp_std_c: 2.5,
      avg_humidity_rh: 80.0, min_humidity_rh: 65.0, max_humidity_rh: 92.0, humidity_std_rh: 7.0,
      avg_light_lux: 10000.0, min_light_lux: 1500.0, max_light_lux: 18000.0, light_std_lux: 4500.0
    }
  },
  tropical: {
    label: "Tropical Outdoor",
    desc: "30°C, 70% RH, 25,000 Lux",
    values: {
      avg_temp_c: 30.0, min_temp_c: 24.0, max_temp_c: 35.0, temp_std_c: 3.2,
      avg_humidity_rh: 70.0, min_humidity_rh: 55.0, max_humidity_rh: 85.0, humidity_std_rh: 8.5,
      avg_light_lux: 25000.0, min_light_lux: 5000.0, max_light_lux: 45000.0, light_std_lux: 11000.0
    }
  }
};

export default function SensorInputForm({ sensorValues, onChange, onApplyPreset }) {
  const [parsing, setParsing] = useState(false);
  const [parseMsg, setParseMsg] = useState(null);

  // Supabase Drawer State
  const [showSupabasePanel, setShowSupabasePanel] = useState(false);
  const [supabaseMode, setSupabaseMode] = useState('live'); // 'live' or 'paste'
  const [rawJsonInput, setRawJsonInput] = useState('');
  const [supabaseUrl, setSupabaseUrl] = useState('https://kelrhjmhusezqztlgtil.supabase.co');
  const [supabaseKey, setSupabaseKey] = useState('sb_publishable_kIoXiQwU6phX7JD3z9Y0Dw_rtSrt1by');
  const [userId, setUserId] = useState('47d388cc-703e-46b3-8cb9-4fd6cb616613');
  const [plantId, setPlantId] = useState('029282a6-ecbe-441f-84c0-ce107f6470d9'); // Bamboo Orchid
  const [moduleId, setModuleId] = useState('8f4c51d4-81df-491c-8c14-744fd4ae7f14'); // ESP32 S3
  const [searchQuery, setSearchQuery] = useState('');
  const [sbLoading, setSbLoading] = useState(false);
  const [fetchedPlants, setFetchedPlants] = useState([]);
  const [fetchedModules, setFetchedModules] = useState([]);

  // Auto-calculate current Month & Day of Year from system clock
  const syncWithCurrentDate = () => {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const startOfYear = new Date(now.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((now - startOfYear) / (1000 * 60 * 60 * 24));

    onChange('month', currentMonth);
    onChange('day_of_year', dayOfYear);
  };

  const handleLoadMetadata = async () => {
    if (!supabaseUrl || !supabaseKey) return;
    try {
      const plantsRes = await fetchSupabasePlants(supabaseUrl, supabaseKey, userId);
      if (plantsRes.plants) setFetchedPlants(plantsRes.plants);

      const modulesRes = await fetchSupabaseModules(supabaseUrl, supabaseKey, userId);
      if (modulesRes.modules) setFetchedModules(modulesRes.modules);
    } catch (err) {
      console.warn("Failed to load user plants/modules metadata:", err);
    }
  };

  useEffect(() => {
    syncWithCurrentDate();
    handleLoadMetadata();

    // AUTOMATICALLY load latest 7 days hourly Supabase IoT data on component mount
    const autoLoadSupabase = async () => {
      try {
        const res = await fetchSupabaseReadings(
          'https://kelrhjmhusezqztlgtil.supabase.co',
          'sb_publishable_kIoXiQwU6phX7JD3z9Y0Dw_rtSrt1by',
          plantId,
          moduleId,
          7
        );
        if (res.sensor_summary) {
          Object.entries(res.sensor_summary).forEach(([k, v]) => {
            onChange(k, v);
          });
          setParseMsg(`⚡ Automatically loaded ${res.sensor_summary.readings_count} hourly IoT readings (latest 7 days) from Supabase!`);
        }
      } catch (err) {
        console.log("Supabase auto-load notice:", err.message);
      }
    };

    autoLoadSupabase();
  }, []);

  const handleChange = (field, value) => {
    onChange(field, parseFloat(value) || 0);
  };

  const handleParseRawSupabaseJson = async () => {
    if (!rawJsonInput.trim()) {
      setParseMsg("Please paste Supabase JSON readings into the text box.");
      return;
    }

    setSbLoading(true);
    setParseMsg(null);
    try {
      const parsedReadings = JSON.parse(rawJsonInput);
      const readingsArray = Array.isArray(parsedReadings) ? parsedReadings : [parsedReadings];
      
      const res = await parseSupabaseReadings(readingsArray);
      if (res.sensor_summary) {
        Object.entries(res.sensor_summary).forEach(([k, v]) => {
          onChange(k, v);
        });
        setParseMsg(`⚡ Successfully imported ${res.sensor_summary.readings_count} Supabase IoT readings!`);
        setShowSupabasePanel(false);
      }
    } catch (err) {
      setParseMsg(`Supabase Parse Error: ${err.message}`);
    } finally {
      setSbLoading(false);
    }
  };

  const handleFetchLiveSupabase = async () => {
    if (!supabaseUrl || !supabaseKey) {
      setParseMsg("Please enter your Supabase Project URL and API Key.");
      return;
    }

    setSbLoading(true);
    setParseMsg(null);
    try {
      const res = await fetchSupabaseReadings(supabaseUrl, supabaseKey, plantId, moduleId, 7);
      if (res.sensor_summary) {
        Object.entries(res.sensor_summary).forEach(([k, v]) => {
          onChange(k, v);
        });
        setParseMsg(`⚡ Successfully calculated Model 02 features from ${res.sensor_summary.readings_count} hourly IoT readings (latest 7 days)!`);
        setShowSupabasePanel(false);
      }
    } catch (err) {
      setParseMsg(`Supabase Fetch Error: ${err.message}`);
    } finally {
      setSbLoading(false);
    }
  };

  // Filter plants and modules based on search query
  const filteredPlants = fetchedPlants.filter(p => 
    !searchQuery || 
    (p.plant_name && p.plant_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (p.plant_species && p.plant_species.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (p.plant_id && p.plant_id.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const filteredModules = fetchedModules.filter(m => 
    !searchQuery || 
    (m.module_name && m.module_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (m.module_id && m.module_id.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="glass-card" style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
        <div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 0.25rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sliders size={20} color="var(--emerald-primary)" />
            Model 02 IoT & Environmental Inputs
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
            Enter manual IoT sensor measurements, select an orchid preset, or fetch 7-day hourly data from Supabase IoT database.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {/* Supabase Button */}
          <button
            type="button"
            onClick={() => {
              setShowSupabasePanel(!showSupabasePanel);
              if (!showSupabasePanel) handleLoadMetadata();
            }}
            className="btn-orchid"
            style={{ padding: '0.5rem 0.9rem', fontSize: '0.85rem' }}
          >
            <Database size={15} /> Supabase IoT Data
          </button>
        </div>
      </div>

      {parseMsg && (
        <div style={{
          background: parseMsg.includes("Error") ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
          color: parseMsg.includes("Error") ? '#f87171' : '#34d399',
          padding: '0.6rem 0.85rem',
          borderRadius: 'var(--radius-sm)',
          fontSize: '0.85rem',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          {parseMsg.includes("Error") ? <AlertCircle size={16} /> : <Check size={16} />}
          {parseMsg}
        </div>
      )}

      {/* Supabase Panel Drawer */}
      {showSupabasePanel && (
        <div style={{
          background: 'rgba(15, 23, 42, 0.85)',
          border: '1px solid var(--orchid-primary)',
          borderRadius: 'var(--radius-md)',
          padding: '1.25rem',
          marginBottom: '1.5rem',
          boxShadow: '0 0 20px var(--orchid-glow)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#f472b6', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
              <Database size={18} /> Fetch 7-Day Hourly IoT Data from Supabase
            </h4>

            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button
                type="button"
                onClick={() => setSupabaseMode('live')}
                className={supabaseMode === 'live' ? 'btn-orchid' : 'btn-secondary'}
                style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem' }}
              >
                Live REST API
              </button>
              <button
                type="button"
                onClick={() => setSupabaseMode('paste')}
                className={supabaseMode === 'paste' ? 'btn-orchid' : 'btn-secondary'}
                style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem' }}
              >
                Paste Raw JSON
              </button>
            </div>
          </div>

          {supabaseMode === 'live' ? (
            <div>
              {/* Unified Search Bar for Plants & Modules */}
              <div style={{ marginBottom: '1rem', position: 'relative' }}>
                <label className="label-text" style={{ color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.35rem' }}>
                  <Search size={14} /> Search Plants or IoT Modules
                </label>
                <input
                  type="text"
                  placeholder="Type to search by Plant Name, Species, or Module ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input-control"
                  style={{ borderColor: 'rgba(56,189,248,0.4)', paddingLeft: '2.2rem' }}
                />
                <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '2.1rem', color: 'var(--text-muted)' }} />
              </div>

              {/* User Plants & Modules Selection Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem', marginBottom: '1rem' }}>
                <div>
                  <label className="label-text" style={{ color: '#34d399', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Sprout size={14} /> Select Plant ID
                  </label>
                  <select
                    value={plantId}
                    onChange={(e) => setPlantId(e.target.value)}
                    className="input-control"
                    style={{ borderColor: 'var(--emerald-primary)' }}
                  >
                    {filteredPlants.length > 0 ? (
                      filteredPlants.map(p => (
                        <option key={p.plant_id} value={p.plant_id}>
                          {p.plant_name || 'Orchid Plant'} - {p.plant_id}
                        </option>
                      ))
                    ) : (
                      <option value={plantId}>{plantId}</option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="label-text" style={{ color: '#f472b6', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Cpu size={14} /> Select IoT Module ID
                  </label>
                  <select
                    value={moduleId}
                    onChange={(e) => setModuleId(e.target.value)}
                    className="input-control"
                    style={{ borderColor: 'var(--orchid-primary)' }}
                  >
                    {filteredModules.length > 0 ? (
                      filteredModules.map(m => (
                        <option key={m.module_id} value={m.module_id}>
                          {m.module_name || 'ESP32 S3 Sensor'} - {m.module_id}
                        </option>
                      ))
                    ) : (
                      <option value={moduleId}>{moduleId}</option>
                    )}
                  </select>
                </div>
              </div>

              <button
                type="button"
                onClick={handleFetchLiveSupabase}
                disabled={sbLoading}
                className="btn-orchid"
                style={{ fontSize: '0.85rem', width: '100%', justifyContent: 'center' }}
              >
                {sbLoading ? "Fetching..." : "⚡ Fetch Latest 7 Days Hourly Data from Supabase API"}
              </button>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                Paste raw JSON array from your Supabase <code style={{ color: '#34d399' }}>readings</code> table:
              </p>
              <textarea
                rows={5}
                value={rawJsonInput}
                onChange={(e) => setRawJsonInput(e.target.value)}
                placeholder='[{"temperature": 28.5, "humidity": 67.6, "plant_id": "059282a6-ecbe-441f-84c0-ce107f6470d9", "created_at": "2026-08-11T15:22:05.672Z"}, ...]'
                className="input-control"
                style={{ fontFamily: 'monospace', fontSize: '0.8rem', marginBottom: '0.75rem' }}
              />
              <button
                type="button"
                onClick={handleParseRawSupabaseJson}
                disabled={sbLoading}
                className="btn-orchid"
                style={{ fontSize: '0.85rem' }}
              >
                {sbLoading ? "Importing..." : "⚡ Parse & Apply Supabase Readings"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Presets Row */}
      <div style={{ marginBottom: '1.5rem' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: '0.05em', display: 'block', marginBottom: '0.5rem' }}>
          Quick Environment Presets
        </span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
          {Object.entries(PRESETS).map(([key, p]) => (
            <button
              key={key}
              type="button"
              onClick={() => onApplyPreset(p.values)}
              style={{
                background: 'rgba(15, 23, 42, 0.5)',
                border: '1px solid var(--border-card)',
                borderRadius: 'var(--radius-md)',
                padding: '0.65rem 0.85rem',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--emerald-primary)'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-card)'}
            >
              <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-main)' }}>{p.label}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 3 Parameter Columns: Temperature, Humidity, Light & Calendar */}
      <div className="grid-3">
        {/* Temperature Box */}
        <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f87171', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
            <Thermometer size={16} /> Temperature (°C)
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label className="label-text">Avg Temp (°C)</label>
              <input type="number" step="0.1" value={sensorValues.avg_temp_c} onChange={(e) => handleChange('avg_temp_c', e.target.value)} className="input-control" />
            </div>
            <div>
              <label className="label-text">Min Temp (°C)</label>
              <input type="number" step="0.1" value={sensorValues.min_temp_c} onChange={(e) => handleChange('min_temp_c', e.target.value)} className="input-control" />
            </div>
            <div>
              <label className="label-text">Max Temp (°C)</label>
              <input type="number" step="0.1" value={sensorValues.max_temp_c} onChange={(e) => handleChange('max_temp_c', e.target.value)} className="input-control" />
            </div>
            <div>
              <label className="label-text">Temp Std Dev (°C)</label>
              <input type="number" step="0.1" value={sensorValues.temp_std_c} onChange={(e) => handleChange('temp_std_c', e.target.value)} className="input-control" />
            </div>
          </div>
        </div>

        {/* Humidity Box */}
        <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
            <Droplets size={16} /> Relative Humidity (RH%)
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label className="label-text">Avg Humidity (%)</label>
              <input type="number" step="0.1" value={sensorValues.avg_humidity_rh} onChange={(e) => handleChange('avg_humidity_rh', e.target.value)} className="input-control" />
            </div>
            <div>
              <label className="label-text">Min Humidity (%)</label>
              <input type="number" step="0.1" value={sensorValues.min_humidity_rh} onChange={(e) => handleChange('min_humidity_rh', e.target.value)} className="input-control" />
            </div>
            <div>
              <label className="label-text">Max Humidity (%)</label>
              <input type="number" step="0.1" value={sensorValues.max_humidity_rh} onChange={(e) => handleChange('max_humidity_rh', e.target.value)} className="input-control" />
            </div>
            <div>
              <label className="label-text">Hum Std Dev (%)</label>
              <input type="number" step="0.1" value={sensorValues.humidity_std_rh} onChange={(e) => handleChange('humidity_std_rh', e.target.value)} className="input-control" />
            </div>
          </div>
        </div>

        {/* Light Intensity & Date Box */}
        <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0 }}>
              <Sun size={16} /> Light & Calendar Features
            </h4>
            <button
              type="button"
              onClick={syncWithCurrentDate}
              title="Sync with today's date"
              style={{
                background: 'rgba(16,185,129,0.15)',
                color: '#34d399',
                border: '1px solid rgba(16,185,129,0.3)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.2rem 0.5rem',
                fontSize: '0.7rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}
            >
              <RefreshCw size={10} /> Auto-Sync Date
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label className="label-text">Avg Light (Lux)</label>
              <input type="number" step="100" value={sensorValues.avg_light_lux} onChange={(e) => handleChange('avg_light_lux', e.target.value)} className="input-control" />
            </div>
            <div>
              <label className="label-text">Min Light (Lux)</label>
              <input type="number" step="100" value={sensorValues.min_light_lux} onChange={(e) => handleChange('min_light_lux', e.target.value)} className="input-control" />
            </div>
            <div>
              <label className="label-text">Max Light (Lux)</label>
              <input type="number" step="100" value={sensorValues.max_light_lux} onChange={(e) => handleChange('max_light_lux', e.target.value)} className="input-control" />
            </div>
            <div>
              <label className="label-text">Light Std Dev</label>
              <input type="number" step="100" value={sensorValues.light_std_lux} onChange={(e) => handleChange('light_std_lux', e.target.value)} className="input-control" />
            </div>
            <div>
              <label className="label-text" style={{ color: '#38bdf8' }}>Month (1-12) 🔒</label>
              <input 
                type="number" 
                value={sensorValues.month} 
                readOnly 
                disabled 
                className="input-control" 
                style={{ 
                  background: 'rgba(15, 23, 42, 0.9)', 
                  borderColor: 'rgba(56,189,248,0.3)', 
                  color: '#38bdf8', 
                  cursor: 'not-allowed', 
                  fontWeight: 700 
                }} 
                title="Automatically set to current system date (Fixed)"
              />
            </div>
            <div>
              <label className="label-text" style={{ color: '#38bdf8' }}>Day of Year (1-366) 🔒</label>
              <input 
                type="number" 
                value={sensorValues.day_of_year} 
                readOnly 
                disabled 
                className="input-control" 
                style={{ 
                  background: 'rgba(15, 23, 42, 0.9)', 
                  borderColor: 'rgba(56,189,248,0.3)', 
                  color: '#38bdf8', 
                  cursor: 'not-allowed', 
                  fontWeight: 700 
                }} 
                title="Automatically set to current system date (Fixed)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
