from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

class ImagePrediction(BaseModel):
    image_index: int
    filename: str
    stage: str
    confidence: float
    raw_class_name: str
    is_valid: bool = True
    error_message: Optional[str] = None

class Model01DetectionResponse(BaseModel):
    image_predictions: List[ImagePrediction]
    final_stage: str
    decision_method: str = "Confidence-Weighted Majority Voting"
    summary_message: str
    all_valid: bool = True

class Model02SensorInput(BaseModel):
    current_stage: str = Field(..., description="Current blooming stage state")
    month: int = Field(default=8, ge=1, le=12, description="Month of the year (1-12)")
    day_of_year: int = Field(default=231, ge=1, le=366, description="Day of the year (1-366)")
    avg_temp_c: float = Field(default=27.5, description="Average temperature (°C)")
    min_temp_c: float = Field(default=22.0, description="Minimum temperature (°C)")
    max_temp_c: float = Field(default=32.0, description="Maximum temperature (°C)")
    temp_std_c: float = Field(default=3.1, description="Temperature standard deviation (°C)")
    avg_humidity_rh: float = Field(default=70.0, description="Average relative humidity (%)")
    min_humidity_rh: float = Field(default=55.0, description="Minimum relative humidity (%)")
    max_humidity_rh: float = Field(default=85.0, description="Maximum relative humidity (%)")
    humidity_std_rh: float = Field(default=7.5, description="Humidity standard deviation (%)")
    avg_light_lux: float = Field(default=14000.0, description="Average light intensity (Lux)")
    min_light_lux: float = Field(default=3000.0, description="Minimum light intensity (Lux)")
    max_light_lux: float = Field(default=30000.0, description="Maximum light intensity (Lux)")
    light_std_lux: float = Field(default=7000.0, description="Light intensity standard deviation (Lux)")

class TransitionPredictionResponse(BaseModel):
    current_stage: str
    next_stage: Optional[str]
    predicted_transition_days: float
    display_days: int
    start_date: str
    estimated_next_stage_date: Optional[str]
    message: str

class TimelineStep(BaseModel):
    from_stage: str
    to_stage: str
    predicted_days: float
    display_days: int
    step_start_date: str
    estimated_stage_date: str
    min_range_date: Optional[str] = Field(None, description="Estimated date minus 5 days")
    max_range_date: Optional[str] = Field(None, description="Estimated date plus 5 days")
    date_range_display: Optional[str] = Field(None, description="Formatted +-5 days date range string")

class PredictBloomResponse(BaseModel):
    model01_result: Model01DetectionResponse
    current_stage: str
    is_flowering: bool = False
    flowering_message: Optional[str] = None
    timeline: List[TimelineStep] = []
    total_days_to_flowering: float = 0.0
    display_total_days: int = 0
    current_date: str
    estimated_flowering_date: Optional[str] = None
    min_flowering_date: Optional[str] = Field(None, description="Flowering date minus 5 days")
    max_flowering_date: Optional[str] = Field(None, description="Flowering date plus 5 days")
    flowering_date_range_display: Optional[str] = Field(None, description="Formatted +-5 days date range string")

class SupabaseFetchRequest(BaseModel):
    supabase_url: str = Field(..., description="Supabase project URL")
    supabase_key: str = Field(..., description="Supabase Anon/Service Key")
    plant_id: Optional[str] = Field("029282a6-ecbe-441f-84c0-ce107f6470d9", description="Optional plant_id filter")
    module_id: Optional[str] = Field("8f4c51d4-81df-491c-8c14-744fd4ae7f14", description="Optional module_id filter")
    days: int = Field(default=7, ge=1, le=90, description="Timeframe in days to fetch readings (default: 7)")
    limit: int = Field(default=168, ge=1, le=5000, description="Number of hourly records to fetch (default: 168)")

class SupabaseParseRawRequest(BaseModel):
    readings: List[Dict[str, Any]] = Field(..., description="List of raw reading objects from Supabase JSON")

class SupabasePlantsRequest(BaseModel):
    supabase_url: str = Field(..., description="Supabase project URL")
    supabase_key: str = Field(..., description="Supabase Anon/Service Key")
    user_id: Optional[str] = Field(None, description="Optional user_id filter")

class SupabaseModulesRequest(BaseModel):
    supabase_url: str = Field(..., description="Supabase project URL")
    supabase_key: str = Field(..., description="Supabase Anon/Service Key")
    user_id: Optional[str] = Field(None, description="Optional user_id filter")
