const API_BASE_URL = '/api/v1';

export async function checkHealth() {
  try {
    const res = await fetch(`${API_BASE_URL}/health`);
    return await res.json();
  } catch (err) {
    console.error("Health check failed:", err);
    return { status: "offline", error: err.message };
  }
}

export async function detectStage(imageFiles) {
  if (!imageFiles || imageFiles.length !== 3) {
    throw new Error("Exactly 3 images are required for stage detection.");
  }

  const formData = new FormData();
  formData.append("image1", imageFiles[0]);
  formData.append("image2", imageFiles[1]);
  formData.append("image3", imageFiles[2]);

  const res = await fetch(`${API_BASE_URL}/detect-stage`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || errData.message || "Failed to detect blooming stage.");
  }

  return await res.json();
}

export async function predictTransition(sensorData) {
  const res = await fetch(`${API_BASE_URL}/predict-transition`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(sensorData),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || errData.message || "Failed to predict transition duration.");
  }

  return await res.json();
}

export async function predictBloom(imageFiles, sensorData = null) {
  if (!imageFiles || imageFiles.length !== 3) {
    throw new Error("Exactly 3 images are required for bloom prediction.");
  }

  const formData = new FormData();
  formData.append("image1", imageFiles[0]);
  formData.append("image2", imageFiles[1]);
  formData.append("image3", imageFiles[2]);

  if (sensorData) {
    formData.append("sensor_data", JSON.stringify(sensorData));
  }

  const res = await fetch(`${API_BASE_URL}/predict-bloom`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || errData.message || "Bloom prediction workflow failed.");
  }

  return await res.json();
}

export async function parseSensorFile(file) {
  const formData = new FormData();
  formData.append("sensor_file", file);

  const res = await fetch(`${API_BASE_URL}/parse-sensor-data`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || errData.message || "Failed to parse sensor file.");
  }

  return await res.json();
}

export async function parseSupabaseReadings(readings) {
  const res = await fetch(`${API_BASE_URL}/supabase/parse-readings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ readings }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || errData.message || "Failed to parse Supabase JSON readings.");
  }

  return await res.json();
}

export async function fetchSupabaseReadings(supabaseUrl, supabaseKey, plantId = null, moduleId = null, days = 7) {
  const res = await fetch(`${API_BASE_URL}/supabase/fetch-readings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      supabase_url: supabaseUrl,
      supabase_key: supabaseKey,
      plant_id: plantId || null,
      module_id: moduleId || null,
      days: parseInt(days) || 7
    }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || errData.message || "Failed to fetch readings from Supabase.");
  }

  return await res.json();
}

export async function fetchSupabasePlants(supabaseUrl, supabaseKey, userId) {
  const res = await fetch(`${API_BASE_URL}/supabase/plants`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      supabase_url: supabaseUrl,
      supabase_key: supabaseKey,
      user_id: userId,
    }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || errData.message || "Failed to fetch plants from Supabase.");
  }

  return await res.json();
}

export async function fetchSupabaseModules(supabaseUrl, supabaseKey, userId) {
  const res = await fetch(`${API_BASE_URL}/supabase/modules`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      supabase_url: supabaseUrl,
      supabase_key: supabaseKey,
      user_id: userId,
    }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || errData.message || "Failed to fetch modules from Supabase.");
  }

  return await res.json();
}

export async function savePredictionHistory(record) {
  try {
    const res = await fetch(`${API_BASE_URL}/supabase/save-history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });
    return await res.json();
  } catch (err) {
    console.error("Failed to save history to backend/Supabase", err);
    return null;
  }
}

export async function fetchPredictionHistory() {
  try {
    const res = await fetch(`${API_BASE_URL}/supabase/fetch-history`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.history || [];
  } catch (err) {
    console.error("Failed to fetch history from backend/Supabase", err);
    return [];
  }
}

export async function clearPredictionHistory() {
  try {
    const res = await fetch(`${API_BASE_URL}/supabase/clear-history`, {
      method: "POST",
    });
    return await res.json();
  } catch (err) {
    console.error("Failed to clear history in Supabase", err);
    return null;
  }
}

