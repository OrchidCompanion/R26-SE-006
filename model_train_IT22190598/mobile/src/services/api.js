let currentBaseUrl = 'http://10.0.2.2:8000/api/v1';

export function getBaseUrl() {
  return currentBaseUrl;
}

export function setBaseUrl(newHost) {
  let cleaned = newHost.trim().rstrip('/');
  if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
    cleaned = `http://${cleaned}`;
  }
  if (!cleaned.endsWith('/api/v1')) {
    cleaned = `${cleaned}/api/v1`;
  }
  currentBaseUrl = cleaned;
  return currentBaseUrl;
}

export async function checkHealth() {
  try {
    const res = await fetch(`${currentBaseUrl}/health`);
    return await res.json();
  } catch (err) {
    console.error("Mobile Health Check Failed:", err);
    return { status: "offline", error: err.message };
  }
}

export async function predictBloom(imageUris, sensorData = null) {
  if (!imageUris || imageUris.length !== 3) {
    throw new Error("Exactly 3 images are required for stage detection.");
  }

  const formData = new FormData();

  imageUris.forEach((uri, idx) => {
    const filename = uri.split('/').pop() || `image_${idx + 1}.jpg`;
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : `image/jpeg`;

    formData.append(`image${idx + 1}`, {
      uri: uri,
      name: filename,
      type: type,
    });
  });

  if (sensorData) {
    formData.append("sensor_data", JSON.stringify(sensorData));
  }

  const res = await fetch(`${currentBaseUrl}/predict-bloom`, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "multipart/form-data",
    },
    body: formData,
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || errData.message || "Bloom prediction workflow failed.");
  }

  return await res.json();
}

export async function fetchSupabaseReadings(supabaseUrl, supabaseKey, plantId = null, moduleId = null, days = 7) {
  const res = await fetch(`${currentBaseUrl}/supabase/fetch-readings`, {
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
  const res = await fetch(`${currentBaseUrl}/supabase/plants`, {
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
  const res = await fetch(`${currentBaseUrl}/supabase/modules`, {
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

export async function fetchPredictionHistory() {
  try {
    const res = await fetch(`${currentBaseUrl}/supabase/fetch-history`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.history || [];
  } catch (err) {
    console.error("Failed to fetch history from Supabase", err);
    return [];
  }
}

export async function clearPredictionHistory() {
  try {
    const res = await fetch(`${currentBaseUrl}/supabase/clear-history`, {
      method: "POST",
    });
    return await res.json();
  } catch (err) {
    console.error("Failed to clear history in Supabase", err);
    return null;
  }
}
