import React, { useState } from "react";
import { ArrowLeft, Camera, Loader2, AlertCircle, CheckCircle2, HelpCircle, Layers, FileQuestion } from "lucide-react";

import speciesLeafRosette from "../assets/species-leaf-rosette.png";
import speciesTallSegmentedCanes from "../assets/species-tall-segmented-canes.png";
import speciesOvalPseudobulb from "../assets/species-oval-pseudobulb.png";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const CONFIDENCE_THRESHOLD = 0.6;

const QUESTION_MAP = {
  Phalaenopsis: "q1",
  Dendrobium: "q2",
  Oncidium: "q3",
};

const QUESTIONS = [
  {
    id: "q1",
    species: "Phalaenopsis",
    title: "1. Leaf Rosette & Central Crown",
    description: "Does the plant grow upright from a single short central stem with broad, fleshy, leathery leaves (no swollen bulbs or canes)?",
    image: speciesLeafRosette,
  },
  {
    id: "q2",
    species: "Dendrobium",
    title: "2. Tall Segmented Canes",
    description: "Does the plant have tall, jointed cane like stems with leaves growing directly along the side nodes of the canes?",
    image: speciesTallSegmentedCanes,
  },
  {
    id: "q3",
    species: "Oncidium",
    title: "3. Oval Pseudobulb",
    description: "Does the plant have distinct oval or flattened green bulbs at the base with slender strap-like leaves rising from the top of the bulb?",
    image: speciesOvalPseudobulb,
  },
];

export default function IdentifySpecies({ onBack }) {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [error, setError] = useState("");
  const [answers, setAnswers] = useState({
    q1: "not_sure",
    q2: "not_sure",
    q3: "not_sure",
  });

  const handleAnswerChange = (questionId, value) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: value,
    }));
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 5) {
      setError("Please select up to 5 images (1 or 2 images recommended).");
      return;
    }
    setError("");
    setSelectedFiles(files);
    setAnalysisResult(null);

    const filePreviews = files.map((file) => URL.createObjectURL(file));
    setPreviews(filePreviews);
  };

  const handleIdentify = async () => {
    if (selectedFiles.length === 0) return;

    setLoading(true);
    setError("");
    setAnalysisResult(null);

    const formData = new FormData();
    selectedFiles.forEach((file) => {
      formData.append("files", file);
    });

    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch(`${API_BASE_URL}/species/identify`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Identification failed.");
      }

      const data = await res.json();
      setAnalysisResult(data);
    } catch (err) {
      setError(err.message || "Could not connect to the identification server.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSelectedFiles([]);
    setPreviews([]);
    setAnalysisResult(null);
    setError("");
    setAnswers({
      q1: "not_sure",
      q2: "not_sure",
      q3: "not_sure",
    });
  };

  const parseConfidence = (conf) => {
    if (typeof conf === "number") {
      return conf <= 1 ? conf : conf / 100;
    }
    if (typeof conf === "string") {
      const clean = parseFloat(conf.replace("%", "").trim());
      return clean > 1 ? clean / 100 : clean;
    }
    return 0;
  };

  const formatSpeciesName = (str = "") => {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  };

  const getProcessedResults = () => {
    if (!analysisResult || !analysisResult.results) return null;

    let totalValidDetections = 0;
    const detectedSpeciesScores = { Dendrobium: 0, Phalaenopsis: 0, Oncidium: 0 };
    const detectedSpeciesCounts = { Dendrobium: 0, Phalaenopsis: 0, Oncidium: 0 };

    // Process detections per photo
    const processedPhotos = analysisResult.results.map((res, index) => {
      const validDetections = (res.detections || []).filter((det) => {
        const score = parseConfidence(det.confidence ?? det.confidence_percentage);
        return score >= CONFIDENCE_THRESHOLD;
      });

      totalValidDetections += validDetections.length;
      validDetections.forEach((det) => {
        const name = formatSpeciesName(det.species);
        if (detectedSpeciesScores[name] !== undefined) {
          const score = parseConfidence(det.confidence ?? det.confidence_percentage);
          detectedSpeciesScores[name] += score;
          detectedSpeciesCounts[name] += 1;
        }
      });

      return {
        ...res,
        validDetections,
        displayImage: validDetections.length > 0 ? res.annotated_image : previews[index],
      };
    });

    const isImageDetected = totalValidDetections > 0;

    // AI image confidence (0 to 1) per species
    const aiConfidence = {
      Dendrobium: detectedSpeciesCounts.Dendrobium > 0 ? detectedSpeciesScores.Dendrobium / detectedSpeciesCounts.Dendrobium : 0,
      Phalaenopsis: detectedSpeciesCounts.Phalaenopsis > 0 ? detectedSpeciesScores.Phalaenopsis / detectedSpeciesCounts.Phalaenopsis : 0,
      Oncidium: detectedSpeciesCounts.Oncidium > 0 ? detectedSpeciesScores.Oncidium / detectedSpeciesCounts.Oncidium : 0,
    };

    // Find the primary candidate predicted by the visual AI model
    const sortedAiPredictions = Object.entries(aiConfidence)
      .filter(([_, score]) => score > 0)
      .sort((a, b) => b[1] - a[1]);

    if (!isImageDetected || sortedAiPredictions.length === 0) {
      return {
        isIdentified: false,
        statusType: "unidentified",
        verdictTitle: "No Dendrobium, Phalaenopsis or Oncidium species identified.",
        topSpecies: null,
        topScorePct: 0,
        isImageDetected: false,
        photos: processedPhotos,
      };
    }

    const topSpecies = sortedAiPredictions[0][0];
    const baseAiScore = sortedAiPredictions[0][1];
    const targetQuestionId = QUESTION_MAP[topSpecies];
    const userAnswer = answers[targetQuestionId];

    const yesCount = Object.values(answers).filter((val) => val === "yes").length;
    const hasContradictoryYes = yesCount > 1;

    let finalScore = baseAiScore;
    let verdictSubtitle = "";
    let statusType = "single";

    // AI-First Validation & Morphology Confirmation Logic
    if (hasContradictoryYes) {

      // Multiple "Yes" answers
      finalScore = baseAiScore;
      verdictSubtitle = `Multiple conflicting answers selected, used only image identifier detection of ${topSpecies} as ${Math.round(baseAiScore * 100)}%`;
    } else if (userAnswer === "yes") {

      // User confirms
      finalScore = Math.min(baseAiScore + 0.15, 0.98);
      verdictSubtitle = `Image identifier detected ${topSpecies} as ${Math.round(baseAiScore * 100)}% and selected answers match with identified species`;
    } else if (userAnswer === "no") {

      // User denies
      finalScore = Math.max(baseAiScore - 0.15, 0.0);
      verdictSubtitle = `Image identifier detected ${topSpecies} as ${Math.round(baseAiScore * 100)}%, but selected answers do not match with identified species.`;
    } else {
      
      // All "Not Sure" 
      finalScore = baseAiScore;
      verdictSubtitle = `Identified solely by image identifier ${topSpecies} as (${Math.round(baseAiScore * 100)}%).`;
    }

    const isIdentified = finalScore >= 0.60;
    const topScorePct = Math.round(finalScore * 100);

    let verdictTitle = "";
    if (!isIdentified) {
      statusType = "unidentified";
      verdictTitle = "No Orchid Species Identified";
      verdictSubtitle = "Morphological feature contradiction or low image confidence prevented reliable identification.";
    } else if (sortedAiPredictions.length > 1 && (sortedAiPredictions[0][1] - sortedAiPredictions[1][1]) < 0.10 && userAnswer === "not_sure") {
      statusType = "multiple";
      verdictTitle = `Multiple Possible Species (${sortedAiPredictions.map(([s]) => s).join(", ")})`;
    } else {
      statusType = "single";
      verdictTitle = `Identified as ${topSpecies} orchid`;
    }

    return {
      isIdentified,
      statusType,
      verdictTitle,
      verdictSubtitle,
      topSpecies,
      topScorePct,
      isImageDetected,
      photos: processedPhotos,
    };
  };

  const processedData = getProcessedResults();

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
      {/* Header */}
      <div className="border-b pb-4 flex justify-between items-center">
        <div>
          <button
            onClick={onBack}
            className="group inline-flex items-center gap-2 text-xs font-semibold text-gray-600 hover:text-emerald-700 bg-gray-50 hover:bg-emerald-50/80 border border-gray-200 hover:border-emerald-200 px-3 py-1.5 rounded-lg transition-all mb-3 shadow-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
            Back to Dashboard
          </button>
          <h2 className="text-[#1f2937] text-2xl font-extrabold flex items-center gap-2">
            Orchid Species Identification
          </h2>
          <p className="text-gray-500 text-sm">
            Upload multiple photos in different angles of the same plant to identify Dendrobium, Phalaenopsis and Oncidium species.
          </p>
        </div>
      </div>

      {/* Upload Zone */}
      {selectedFiles.length === 0 && !analysisResult && (
        <div className="border-2 border-dashed border-gray-300 rounded-2xl p-8 text-center bg-gray-50 hover:bg-emerald-50/40 transition">
          <input
            type="file"
            id="orchid-images"
            multiple
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
          <label htmlFor="orchid-images" className="cursor-pointer space-y-2 block">
            <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-xl">
              <Camera className="w-5 h-5" />
            </div>
            <p className="text-sm font-bold text-gray-700">
              Click to upload orchid photos
            </p>
            <p className="text-xs text-gray-500">
              You can select 1 or 2 images of the same plant for higher accuracy
            </p>
          </label>
        </div>
      )}

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Input Previews & Controls */}
      {previews.length > 0 && !analysisResult && (
        <div className="space-y-6">
          <div>
            <h4 className="text-xs font-bold uppercase text-gray-600 mb-3">
              Selected Images ({previews.length})
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {previews.map((src, i) => (
                <div
                  key={i}
                  className="relative rounded-lg overflow-hidden border border-gray-200 aspect-square bg-black/5"
                >
                  <img src={src} alt="preview" className="w-full h-full object-cover" />
                  <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                    Image #{i + 1}
                  </span>
                  {loading && (
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px] flex flex-col items-center justify-center text-white gap-1">
                      <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
                      <span className="text-[10px] font-semibold tracking-wide">Analyzing...</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Morphological Questionnaire Section */}
          <div className="border border-emerald-200 bg-emerald-50/20 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-emerald-100">
              <FileQuestion className="w-5 h-5 text-emerald-700 shrink-0" />
              <div>
                <h3 className="text-sm font-bold text-gray-900">
                   Select Matching Characteristics of Your Orchid Plant
                </h3>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
              {QUESTIONS.map((q) => (
                <div key={q.id} className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col justify-between shadow-2xs space-y-3">
                  <div className="space-y-3">
                    <div className="w-24 h-24 mx-auto rounded-lg bg-gray-50 border border-gray-100 p-1 flex items-center justify-center">
                      <img src={q.image} alt={q.title} className="w-full h-full object-contain" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-gray-800">{q.title}</h4>
                      <p className="text-[11px] text-gray-500 leading-relaxed mt-1">{q.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 pt-1">
                    {[
                      { label: "Yes", val: "yes" },
                      { label: "No", val: "no" },
                      { label: "Not Sure", val: "not_sure" },
                    ].map((btn) => (
                      <button
                        key={btn.val}
                        type="button"
                        onClick={() => handleAnswerChange(q.id, btn.val)}
                        className={`flex-1 py-1 text-[11px] font-bold rounded-lg border transition ${
                          answers[q.id] === btn.val
                            ? btn.val === "yes"
                              ? "bg-emerald-600 text-white border-emerald-600"
                              : btn.val === "no"
                              ? "bg-rose-600 text-white border-rose-600"
                              : "bg-gray-700 text-white border-gray-700"
                            : "bg-white text-gray-600 border-gray-300 hover:bg-gray-100"
                        }`}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleIdentify}
              disabled={loading || selectedFiles.length === 0}
              className="flex-1 bg-[#059669] hover:bg-[#047857] text-white font-bold py-2.5 rounded-lg shadow-sm transition disabled:opacity-50 text-sm flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing {selectedFiles.length} Image(s)...
                </>
              ) : (
                `Run Detection on ${selectedFiles.length} Image(s)`
              )}
            </button>
            <button
              onClick={handleReset}
              disabled={loading}
              className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 font-semibold text-gray-700 text-sm rounded-lg transition disabled:opacity-50"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Results View */}
      {processedData && (
        <div className="space-y-6 pt-1">
          {/* Main Verdict Card */}
          <div
            className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
              processedData.statusType === "single"
                ? "bg-emerald-50/70 border-emerald-200"
                : processedData.statusType === "multiple"
                ? "bg-indigo-50/70 border-indigo-200"
                : "bg-amber-50/70 border-amber-200"
            }`}
          >
            <div className="flex items-start sm:items-center gap-3">
              <div className="mt-0.5 sm:mt-0">
                {processedData.statusType === "single" && (
                  <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                )}
                {processedData.statusType === "multiple" && (
                  <Layers className="w-6 h-6 text-indigo-600" />
                )}
                {processedData.statusType === "unidentified" && (
                  <HelpCircle className="w-6 h-6 text-amber-600" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded tracking-wide ${
                      processedData.statusType === "single"
                        ? "bg-emerald-200/60 text-emerald-800"
                        : processedData.statusType === "multiple"
                        ? "bg-indigo-200/60 text-indigo-800"
                        : "bg-amber-200/60 text-amber-800"
                    }`}
                  >
                    {processedData.statusType === "single" && "Species Match"}
                    {processedData.statusType === "multiple" && "Multi-Species Detected"}
                    {processedData.statusType === "unidentified" && "Not Identified"}
                  </span>
                  <h3 className="text-base font-bold text-gray-900">
                    {processedData.verdictTitle}
                  </h3>
                </div>
                <p className="text-xs text-gray-600 mt-0.5">
                  {processedData.verdictSubtitle}
                </p>
              </div>
            </div>

            <button
              onClick={handleReset}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs"
            >
              Analyze Another Plant
            </button>
          </div>

          {/* Unidentified Guidance Tip */}
          {!processedData.isIdentified && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-600 space-y-2">
              <p className="font-bold text-gray-800 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-amber-500" /> Tips for better identification:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-gray-500">
                <li>Capture a clear, well-lit shot of the orchid plant.</li>
                <li>Avoid blurry shots or extreme close-ups of single leaves.</li>
              </ul>
            </div>
          )}

          {/* Individual Image Result Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {processedData.photos.map((res, idx) => (
              <div
                key={idx}
                className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-2xs space-y-3 p-3.5 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs font-semibold text-gray-700">
                    <span className="truncate max-w-50">Photo #{idx + 1}: {res.filename}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        res.validDetections.length > 0
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-gray-100 text-gray-500 border border-gray-200"
                      }`}
                    >
                      {res.validDetections.length > 0
                        ? `${res.validDetections.length} ${res.validDetections.length === 1 ? "Plant" : "Plants"} Found`
                        : "No Match"}
                    </span>
                  </div>

                  <div className="rounded-lg overflow-hidden border border-gray-100 aspect-video bg-gray-900 flex items-center justify-center">
                    <img
                      src={res.displayImage}
                      alt="Orchid frame"
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>

                <div className="space-y-1.5 pt-1">
                  {res.validDetections.length > 0 ? (
                    res.validDetections.map((det, dIdx) => (
                      <div
                        key={dIdx}
                        className="flex justify-between items-center p-2 bg-gray-50 rounded-lg text-xs border border-gray-100"
                      >
                        <span className="font-bold text-gray-800 uppercase tracking-wide">
                          🌱 {det.species}
                        </span>
                        <span className="font-extrabold text-emerald-700">
                          {det.confidence_percentage || `${(parseConfidence(det.confidence) * 100).toFixed(1)}%`}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-amber-700 bg-amber-50/80 border border-amber-200 rounded-lg text-center py-2.5 font-medium">
                      Species could not be reliably identified.
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}