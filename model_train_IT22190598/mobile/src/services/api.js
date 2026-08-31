import Constants from 'expo-constants';

const DEFAULT_SUPABASE_URL = "https://kelrhjmhusezqztlgtil.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_kIoXiQwU6phX7JD3z9Y0Dw_rtSrt1by";

function getDefaultBaseUrl() {
  try {
    const hostUri = Constants.expoConfig?.hostUri || Constants.manifest2?.extra?.expoGo?.debuggerHost;
    if (hostUri) {
      const ip = hostUri.split(':')[0];
      if (ip && ip !== 'localhost' && ip !== '127.0.0.1') {
        return `http://${ip}:8000/api/v1`;
      }
    }
  } catch (e) {
    console.warn("Could not auto-detect host IP");
  }
  return 'http://10.235.32.132:8000/api/v1';
}

let currentBaseUrl = getDefaultBaseUrl();

export function getBaseUrl() {
  return currentBaseUrl;
}

export function setBaseUrl(newHost) {
  if (!newHost) return currentBaseUrl;
  let cleaned = newHost.trim().replace(/\/+$/, '');
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${currentBaseUrl}/health`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return { status: "offline" };
    return await res.json();
  } catch (err) {
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

  const resultData = await res.json();

  // Dual-Layer Backup: Ensure history record is saved directly to Supabase REST API
  try {
    const dbRecord = {
      plant_id: sensorData?.plant_id || "029282a6-ecbe-441f-84c0-ce107f6470d9",
      module_id: sensorData?.module_id || "8f4c51d4-81df-491c-8c14-744fd4ae7f14",
      current_stage: resultData.current_stage,
      estimated_flowering_date: resultData.estimated_flowering_date,
      flowering_date_range_display: resultData.flowering_date_range_display,
      total_days_to_flowering: resultData.total_days_to_flowering,
      display_total_days: resultData.display_total_days,
      confidence: resultData.model01_result?.overall_confidence || 0.95,
      timeline: resultData.timeline || [],
      sensor_summary: resultData.sensor_summary || {},
      created_at: new Date().toISOString()
    };
    await fetch(`${DEFAULT_SUPABASE_URL}/rest/v1/prediction_history`, {
      method: "POST",
      headers: {
        "apikey": DEFAULT_SUPABASE_KEY,
        "Authorization": `Bearer ${DEFAULT_SUPABASE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify(dbRecord)
    });
  } catch (dbErr) {
    console.warn("Client dual-layer Supabase save notice:", dbErr);
  }

  return resultData;
}

export async function fetchSupabaseReadings(supabaseUrl, supabaseKey, plantId = null, moduleId = null, days = 7) {
  const res = await fetch(`${currentBaseUrl}/supabase/fetch-readings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      supabase_url: supabaseUrl || DEFAULT_SUPABASE_URL,
      supabase_key: supabaseKey || DEFAULT_SUPABASE_KEY,
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
      supabase_url: supabaseUrl || DEFAULT_SUPABASE_URL,
      supabase_key: supabaseKey || DEFAULT_SUPABASE_KEY,
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
      supabase_url: supabaseUrl || DEFAULT_SUPABASE_URL,
      supabase_key: supabaseKey || DEFAULT_SUPABASE_KEY,
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
  // Try 1: FastAPI Backend Proxy
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${currentBaseUrl}/supabase/fetch-history`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      if (data.history && data.history.length > 0) {
        return data.history;
      }
    }
  } catch (err) {
    console.log("[Info] Backend proxy history fetch failed, trying direct Supabase REST query...");
  }

  // Try 2: Direct Supabase REST API
  try {
    const directRes = await fetch(`${DEFAULT_SUPABASE_URL}/rest/v1/prediction_history?order=created_at.desc&limit=50&select=*`, {
      method: "GET",
      headers: {
        "apikey": DEFAULT_SUPABASE_KEY,
        "Authorization": `Bearer ${DEFAULT_SUPABASE_KEY}`,
        "Content-Type": "application/json"
      }
    });
    if (directRes.ok) {
      const records = await directRes.json();
      return Array.isArray(records) ? records : [];
    }
  } catch (directErr) {
    console.error("Direct Supabase fetch failed:", directErr);
  }

  return [];
}

export async function clearPredictionHistory() {
  try {
    const res = await fetch(`${currentBaseUrl}/supabase/clear-history`, { method: "POST" });
    if (res.ok) return await res.json();
  } catch (err) {
    console.log("[Info] Backend proxy clear history failed, trying direct Supabase DELETE...");
  }

  try {
    const directRes = await fetch(`${DEFAULT_SUPABASE_URL}/rest/v1/prediction_history?id=neq.00000000-0000-0000-0000-000000000000`, {
      method: "DELETE",
      headers: {
        "apikey": DEFAULT_SUPABASE_KEY,
        "Authorization": `Bearer ${DEFAULT_SUPABASE_KEY}`,
        "Content-Type": "application/json"
      }
    });
    return directRes.ok;
  } catch (directErr) {
    console.error("Direct Supabase DELETE failed:", directErr);
    return false;
  }
}
