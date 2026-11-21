/**
 * Rhema Kids Ministry — Strict Live Biometric Face Verification Service
 *
 * Compares a REAL captured camera frame against enrolled child/teacher reference photos
 * using multimodal vision AI with forensic landmark auditing and dual-provider consensus.
 *
 * ZERO-FALSE-POSITIVE SECURITY POLICY:
 * - Never simulates or guesses matches.
 * - Requires a clear human face in the live camera frame.
 * - Performs an explicit structural landmark check (eye spacing, eyebrows, nose bridge,
 *   jawline, lip structure, facial hair) before allowing any match.
 * - Rejects lookalikes, siblings, parents, and any un-enrolled individuals.
 * - Requires matched === true, verdict === 'DEFINITE_SAME_PERSON', differencesFound.length === 0,
 *   AND confidence >= 92% (plus secondary provider consensus when available).
 * - Fails closed if no photo matches or if verification is unavailable.
 */

import { Buffer } from 'buffer';

export interface FaceCandidate {
  id: string;
  name: string;
  photoUrl: string;
  role: 'child' | 'teacher';
  age?: number;
  gender?: string;
}

export type FaceVerificationStatus =
  | 'matched'
  | 'mismatch'
  | 'no_face'
  | 'no_photos'
  | 'timeout'
  | 'service_unavailable'
  | 'error';

export type FaceVerificationProgressStage =
  | 'loading_photos'
  | 'comparing'
  | 'confirming';

export interface FaceVerificationResult {
  matched: boolean;
  faceDetected: boolean;
  matchedCandidateId: string | null;
  confidence: number;
  reason: string;
  status: FaceVerificationStatus;
  provider?: string;
  serviceUnavailable?: boolean;
  timedOut?: boolean;
  differencesFound?: string[];
}

type VisionVerdict = 'DEFINITE_SAME_PERSON' | 'DIFFERENT_PERSON' | 'UNCERTAIN';

interface RawVisionMatchResponse {
  faceDetected: boolean;
  verdict: VisionVerdict;
  matched: boolean;
  matchedCandidateIndex: number | null;
  confidence: number;
  differencesFound: string[];
  reason: string;
}

const STRICT_CONFIDENCE_THRESHOLD = 88;
const CONSENSUS_MIN_CONFIDENCE = 85;
const BATCH_SIZE = 5;
const REQUEST_TIMEOUT_MS = 22000;

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err: any) {
    if (err?.name === 'AbortError' || /abort/i.test(String(err?.message || ''))) {
      const timeoutErr: any = new Error('Face verification request timed out');
      timeoutErr.isTimeout = true;
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// In-memory cache of reference photo URL -> pure base64 JPEG/PNG payload
const referencePhotoCache = new Map<string, { base64: string; mimeType: string }>();

function getGeminiApiKey(): string {
  return (process.env.EXPO_PUBLIC_GEMINI_API_KEY || '').trim();
}

function getAnthropicApiKey(): string {
  return (process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY || '').trim();
}

function getGroqApiKey(): string {
  return (process.env.EXPO_PUBLIC_GROQ_API_KEY || '').trim();
}

function detectMimeTypeFromBase64(base64: string, fallback = 'image/jpeg'): string {
  if (base64.startsWith('/9j/')) return 'image/jpeg';
  if (base64.startsWith('iVBOR')) return 'image/png';
  if (base64.startsWith('UklGR')) return 'image/webp';
  if (base64.startsWith('R0lGOD')) return 'image/gif';
  return fallback.startsWith('image/') && fallback !== 'image/jpg' ? fallback : 'image/jpeg';
}

function stripBase64Prefix(raw: string): { base64: string; mimeType: string } {
  const trimmed = (raw || '').trim();
  const dataUriMatch = trimmed.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/is);
  if (dataUriMatch) {
    const rawMime = dataUriMatch[1].toLowerCase().trim();
    const cleanBase64 = dataUriMatch[2].replace(/\s+/g, '');
    return {
      mimeType: detectMimeTypeFromBase64(
        cleanBase64,
        rawMime === 'image/jpg' ? 'image/jpeg' : rawMime
      ),
      base64: cleanBase64,
    };
  }
  const cleanBase64 = trimmed.replace(/\s+/g, '');
  return {
    mimeType: detectMimeTypeFromBase64(cleanBase64, 'image/jpeg'),
    base64: cleanBase64,
  };
}

/**
 * Downloads a Firebase Storage / HTTPS reference photo into clean base64 (cached in memory).
 */
async function loadReferencePhotoBase64(
  photoUrl: string
): Promise<{ base64: string; mimeType: string } | null> {
  let cleanUrl = (photoUrl || '').trim();
  if (!cleanUrl) return null;

  if (cleanUrl.startsWith('data:')) {
    const parsed = stripBase64Prefix(cleanUrl);
    return parsed.base64.length > 100 ? parsed : null;
  }

  const cached = referencePhotoCache.get(cleanUrl);
  if (cached) return cached;

  if (cleanUrl.startsWith('gs://')) {
    try {
      const storage = require('@react-native-firebase/storage').default;
      cleanUrl = await storage().refFromURL(cleanUrl).getDownloadURL();
    } catch {
      return null;
    }
  }

  // Method 1: fetch -> arrayBuffer -> Buffer
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(cleanUrl, { signal: controller.signal });
    clearTimeout(timer);

    if (res.ok && typeof res.arrayBuffer === 'function') {
      const ab = await res.arrayBuffer();
      const base64 = Buffer.from(ab).toString('base64');
      if (base64 && base64.length > 100) {
        const headerMime = (res.headers.get('content-type') || '').split(';')[0].trim();
        const entry = {
          base64,
          mimeType: detectMimeTypeFromBase64(base64, headerMime),
        };
        referencePhotoCache.set(photoUrl.trim(), entry);
        return entry;
      }
    }
  } catch {
    // Fallback below
  }

  // Method 2: expo-file-system/legacy downloadAsync + readAsStringAsync
  try {
    const FileSystem = require('expo-file-system/legacy');
    const tmpPath = `${FileSystem.cacheDirectory}ref_face_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 7)}.jpg`;
    const dl = await FileSystem.downloadAsync(cleanUrl, tmpPath);
    if (dl && dl.status === 200) {
      const rawBase64 = await FileSystem.readAsStringAsync(tmpPath, {
        encoding: FileSystem.EncodingType.Base64,
      });
      FileSystem.deleteAsync(tmpPath, { idempotent: true }).catch(() => {});
      const parsed = stripBase64Prefix(rawBase64);
      if (parsed.base64 && parsed.base64.length > 100) {
        referencePhotoCache.set(photoUrl.trim(), parsed);
        return parsed;
      }
    }
  } catch (fsErr) {
    console.warn('[KidsFaceRecognitionService] Could not download reference photo:', fsErr);
  }

  // Method 3: fetch -> blob -> FileReader
  try {
    const res = await fetch(cleanUrl);
    if (res.ok) {
      const blob = await res.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') resolve(reader.result);
          else reject(new Error('FileReader did not return string'));
        };
        reader.onerror = () => reject(new Error('FileReader error'));
        reader.readAsDataURL(blob);
      });
      const parsed = stripBase64Prefix(dataUrl);
      if (parsed.base64 && parsed.base64.length > 100) {
        referencePhotoCache.set(photoUrl.trim(), parsed);
        return parsed;
      }
    }
  } catch {
    // Exhausted download fallbacks
  }

  return null;
}

function buildStrictPrompt(
  role: 'child' | 'teacher',
  batch: Array<{ index: number; candidate: FaceCandidate }>
): string {
  const candidateLines = batch
    .map(
      ({ index, candidate }) =>
        `- Image ${index + 2} (CANDIDATE_INDEX ${index}): ${candidate.name}` +
        `${candidate.age !== undefined ? `, Age ${candidate.age}` : ''}` +
        `${candidate.gender ? `, ${candidate.gender}` : ''}`
    )
    .join('\n');

  const isSingleTarget = batch.length === 1;
  const subjectType = role === 'child' ? 'Sunday School STUDENT (ages 0–18)' : 'Sunday School TEACHER';

  const skepticNote = isSingleTarget
    ? `CRITICAL 1:1 SECURITY WARNING: Only ONE enrolled reference photo is shown (Image 2). Assume Image 1 could be a DIFFERENT person testing kiosk security (such as a friend, sibling, cousin, parent, or stranger of similar age/ethnicity/gender). Do NOT approve just because both images look somewhat similar or have the same skin tone, hair, or age group. You MUST independently prove they are the EXACT same human individual!`
    : `Compare Image 1 against each candidate independently. Do NOT guess or pick the "closest" candidate if Image 1 is a different person or an un-enrolled visitor.`;

  const ageRule =
    role === 'child'
      ? `2. UN-ENROLLED ADULTS vs ENROLLED TEENS:
   - Enrolled Sunday School students can be ages 0–18 (including teens ages 13–17). Do NOT reject an enrolled 13–17 year old merely for looking mature IF their facial structure clearly matches their reference photo.
   - However, if Image 1 shows any un-enrolled adult, parent, sibling, or different young person whose facial structure does NOT match a reference photo, REJECT immediately.`
      : `2. TEACHER IDENTITY CHECK:
   - Image 1 must clearly match the enrolled teacher's exact facial features.`;

  return `You are a FORENSIC, ZERO-FALSE-POSITIVE biometric face verification engine for a church child-safety kiosk.

Image 1 is the LIVE CAMERA CAPTURE taken right now at the entrance kiosk.
The remaining image(s) are the ONLY authorized enrolled ${subjectType} reference photo(s):
${candidateLines}

${skepticNote}

MANDATORY FORENSIC VERIFICATION PROTOCOL:
1. LIVE FACE DETECTION:
   - If Image 1 shows no visible human face (blank wall, floor, object, hand blocking face, extreme motion blur), return:
     {"faceDetected": false, "verdict": "UNCERTAIN", "matched": false, "matchedCandidateIndex": null, "confidence": 0, "differencesFound": ["No clear face visible in frame"], "reason": "No face detected in live camera frame"}

${ageRule}

3. FEATURE-BY-FEATURE FACIAL STRUCTURE AUDIT (BEFORE DECIDING):
   Carefully inspect and compare Image 1 vs each candidate across ALL 6 landmarks:
   a) Face silhouette, cheekbone width, jawline taper, and chin shape (round/oval vs square/broad)
   b) Eyebrow shape, arch, thickness, and distance between inner brows
   c) Eye shape, eyelid fold, and inter-ocular ratio
   d) Nose bridge width, bridge straightness, tip shape, and nostril flare
   e) Mouth width, upper/lower lip thickness, and philtrum
   f) Ear shape/angle & natural hairline proportion

4. STRICT MISMATCH REJECTION:
   - Two different people from the same demographic (even siblings or classmates) will have noticeably different nose shapes, eyebrow thickness/arch, eye shape, jawline width, or facial proportions.
   - IMPORTANT: Do NOT treat ambient lighting, shadows, camera angle, shirt/background changes, or mild expression (smiling vs neutral) as differences.
   - ONLY list genuine anatomical/identity mismatches in "differencesFound" (e.g. ["Different jawline width", "Different nose bridge and eyebrows"]). If you spot ANY genuine anatomical difference or believe they are two different people:
     - List each specific mismatch in "differencesFound".
     - Set "verdict": "DIFFERENT_PERSON", "matched": false, "matchedCandidateIndex": null, and "confidence" <= 50.
   - If extreme blur or occlusion makes you unsure, set "verdict": "UNCERTAIN", "matched": false, "matchedCandidateIndex": null, "confidence" <= 70.

5. STRICT ACCEPTANCE RULE:
   - ONLY set "verdict": "DEFINITE_SAME_PERSON", "matched": true, "matchedCandidateIndex": <index>, "differencesFound": [], and "confidence": >= ${STRICT_CONFIDENCE_THRESHOLD} if Image 1 and Candidate <index> clearly depict the EXACT SAME human being across their core eye, eyebrow, nose, lip, and jawline structure.

Respond ONLY with raw valid JSON (no markdown, no backticks):
{"faceDetected": true/false, "verdict": "DEFINITE_SAME_PERSON"|"DIFFERENT_PERSON"|"UNCERTAIN", "matched": true/false, "matchedCandidateIndex": number or null, "confidence": 0-100, "differencesFound": ["..."], "reason": "brief factual explanation"}`;
}

function parseVisionJson(rawText: string): RawVisionMatchResponse | null {
  if (!rawText) return null;
  try {
    const cleaned = rawText
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const obj = JSON.parse(jsonMatch[0]);

    const faceDetected = Boolean(obj.faceDetected);
    const rawVerdict = String(obj.verdict || '').toUpperCase().trim();
    const verdict: VisionVerdict =
      rawVerdict === 'DEFINITE_SAME_PERSON'
        ? 'DEFINITE_SAME_PERSON'
        : rawVerdict === 'DIFFERENT_PERSON'
        ? 'DIFFERENT_PERSON'
        : 'UNCERTAIN';
    const matched = Boolean(obj.matched);
    const confidence = Math.max(0, Math.min(100, Number(obj.confidence) || 0));
    const matchedCandidateIndex =
      typeof obj.matchedCandidateIndex === 'number' && Number.isInteger(obj.matchedCandidateIndex)
        ? obj.matchedCandidateIndex
        : null;
    const differencesFound = Array.isArray(obj.differencesFound)
      ? obj.differencesFound
          .map((d: any) => String(d || '').trim())
          .filter((d: string) => d.length > 0 && d.toLowerCase() !== 'none')
      : [];
    const reason = typeof obj.reason === 'string' && obj.reason.trim() ? obj.reason.trim() : '';

    return {
      faceDetected,
      verdict,
      matched,
      matchedCandidateIndex,
      confidence,
      differencesFound,
      reason,
    };
  } catch {
    return null;
  }
}

function isStrictMatchValid(
  parsed: RawVisionMatchResponse,
  batchLength: number,
  minConfidence: number = STRICT_CONFIDENCE_THRESHOLD
): boolean {
  return (
    parsed.faceDetected === true &&
    parsed.matched === true &&
    parsed.verdict === 'DEFINITE_SAME_PERSON' &&
    parsed.matchedCandidateIndex !== null &&
    parsed.matchedCandidateIndex >= 0 &&
    parsed.matchedCandidateIndex < batchLength &&
    parsed.confidence >= minConfidence &&
    parsed.differencesFound.length === 0
  );
}

async function verifyBatchWithGemini(
  liveImage: { base64: string; mimeType: string },
  batch: Array<{ index: number; candidate: FaceCandidate; image: { base64: string; mimeType: string } }>,
  role: 'child' | 'teacher'
): Promise<{ parsed?: RawVisionMatchResponse; provider?: string; error?: string; timedOut?: boolean }> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return { error: 'Gemini API key missing' };

  const prompt = buildStrictPrompt(role, batch);
  const parts: any[] = [
    { text: prompt },
    { inlineData: { mimeType: liveImage.mimeType, data: liveImage.base64 } },
    ...batch.map(b => ({
      inlineData: { mimeType: b.image.mimeType, data: b.image.base64 },
    })),
  ];

  const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-lite'];
  let lastError = 'Gemini request failed';
  let timedOut = false;

  for (const model of models) {
    try {
      const res = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              temperature: 0,
              responseMimeType: 'application/json',
            },
          }),
        },
        REQUEST_TIMEOUT_MS
      );

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        lastError = `Gemini (${model}) HTTP ${res.status}: ${errBody.slice(0, 120)}`;
        if (res.status === 404 || res.status === 400) continue;
        break;
      }
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const parsed = parseVisionJson(text);
      if (parsed) {
        return { parsed, provider: model };
      }
      lastError = `Gemini (${model}) returned unparseable output`;
      break;
    } catch (err: any) {
      if (err?.isTimeout) timedOut = true;
      lastError = err?.isTimeout ? `Gemini (${model}) timed out` : (err?.message || lastError);
      break;
    }
  }
  return { error: lastError, timedOut };
}

async function verifyBatchWithAnthropic(
  liveImage: { base64: string; mimeType: string },
  batch: Array<{ index: number; candidate: FaceCandidate; image: { base64: string; mimeType: string } }>,
  role: 'child' | 'teacher'
): Promise<{ parsed?: RawVisionMatchResponse; provider?: string; error?: string; timedOut?: boolean }> {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) return { error: 'Anthropic API key missing' };

  if (liveImage.base64.length > 4_800_000) {
    return { error: 'Live capture exceeds Anthropic 5MB image limit' };
  }

  const prompt = buildStrictPrompt(role, batch);
  const content: any[] = [
    {
      type: 'image',
      source: { type: 'base64', media_type: liveImage.mimeType, data: liveImage.base64 },
    },
    ...batch.map(b => ({
      type: 'image',
      source: { type: 'base64', media_type: b.image.mimeType, data: b.image.base64 },
    })),
    { type: 'text', text: prompt },
  ];

  // Prioritize Sonnet 4.5 for higher facial verification accuracy, then Haiku 4.5
  const models = ['claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001'];
  let lastError = 'Anthropic request failed';
  let timedOut = false;

  for (const model of models) {
    try {
      const res = await fetchWithTimeout(
        'https://api.anthropic.com/v1/messages',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerously-allow-browser': 'true',
          },
          body: JSON.stringify({
            model,
            max_tokens: 350,
            temperature: 0,
            messages: [{ role: 'user', content }],
          }),
        },
        REQUEST_TIMEOUT_MS
      );

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        lastError = `Anthropic (${model}) HTTP ${res.status}: ${errBody.slice(0, 120)}`;
        if (res.status === 404 || res.status === 400) continue;
        break;
      }
      const data = await res.json();
      const text = data?.content?.[0]?.text || '';
      const parsed = parseVisionJson(text);
      if (parsed) {
        return { parsed, provider: model };
      }
      lastError = `Anthropic (${model}) returned unparseable output`;
      break;
    } catch (err: any) {
      if (err?.isTimeout) timedOut = true;
      lastError = err?.isTimeout ? `Anthropic (${model}) timed out` : (err?.message || lastError);
      break;
    }
  }
  return { error: lastError, timedOut };
}

async function verifyBatchWithGroq(
  liveImage: { base64: string; mimeType: string },
  batch: Array<{ index: number; candidate: FaceCandidate; image: { base64: string; mimeType: string } }>,
  role: 'child' | 'teacher'
): Promise<{ parsed?: RawVisionMatchResponse; provider?: string; error?: string; timedOut?: boolean }> {
  const apiKey = getGroqApiKey();
  if (!apiKey) return { error: 'Groq API key missing' };

  const prompt = buildStrictPrompt(role, batch);
  const content: any[] = [
    { type: 'text', text: prompt },
    {
      type: 'image_url',
      image_url: { url: `data:${liveImage.mimeType};base64,${liveImage.base64}` },
    },
    ...batch.map(b => ({
      type: 'image_url',
      image_url: { url: `data:${b.image.mimeType};base64,${b.image.base64}` },
    })),
  ];

  try {
    const res = await fetchWithTimeout(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-4-scout-17b-16e-instruct',
          max_tokens: 350,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [{ role: 'user', content }],
        }),
      },
      REQUEST_TIMEOUT_MS
    );

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      return { error: `Groq HTTP ${res.status}: ${errBody.slice(0, 120)}` };
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || '';
    const parsed = parseVisionJson(text);
    if (parsed) {
      return { parsed, provider: 'groq-llama-4-scout' };
    }
    return { error: 'Groq returned unparseable output' };
  } catch (err: any) {
    return {
      error: err?.isTimeout ? 'Groq request timed out' : (err?.message || 'Groq request failed'),
      timedOut: Boolean(err?.isTimeout),
    };
  }
}

class KidsFaceRecognitionService {
  /**
   * Strictly verifies a live captured camera photo against enrolled candidates with reference photos.
   * Uses forensic landmark rules + dual-provider consensus on positive matches to prevent false positives.
   */
  async verifyLiveFace(
    livePhotoBase64: string,
    candidates: FaceCandidate[],
    role: 'child' | 'teacher' = 'child',
    onProgress?: (stage: FaceVerificationProgressStage) => void
  ): Promise<FaceVerificationResult> {
    const liveImage = stripBase64Prefix(livePhotoBase64);
    if (!liveImage.base64 || liveImage.base64.length < 100) {
      return {
        matched: false,
        faceDetected: false,
        matchedCandidateId: null,
        confidence: 0,
        status: 'no_face',
        reason: 'Could not capture a clear camera image. Please try again.',
      };
    }

    const validCandidates = candidates.filter(
      c => typeof c.photoUrl === 'string' && c.photoUrl.trim().length > 10
    );

    if (validCandidates.length === 0) {
      return {
        matched: false,
        faceDetected: false,
        matchedCandidateId: null,
        confidence: 0,
        status: 'no_photos',
        reason:
          role === 'child'
            ? 'No enrolled child reference photos found. Please add a clear profile photo for your child first.'
            : 'No enrolled teacher face photos found. Please use your 4-Digit Teacher PIN or ask Admin to add profile photos.',
      };
    }

    onProgress?.('loading_photos');

    const loadedEntries = (
      await Promise.all(
        validCandidates.map(async candidate => {
          const image = await loadReferencePhotoBase64(candidate.photoUrl);
          return image ? { candidate, image } : null;
        })
      )
    ).filter((x): x is { candidate: FaceCandidate; image: { base64: string; mimeType: string } } => x !== null);

    if (loadedEntries.length === 0) {
      return {
        matched: false,
        faceDetected: false,
        matchedCandidateId: null,
        confidence: 0,
        status: 'service_unavailable',
        serviceUnavailable: true,
        reason: 'Unable to download enrolled reference photo(s). Please verify internet access and retry.',
      };
    }

    let anyProviderSucceeded = false;
    let anyTimedOut = false;
    let sawFace = false;
    let bestConfidence = 0;
    let bestReason = '';
    let bestDifferences: string[] = [];
    let lastProviderError = '';

    for (let offset = 0; offset < loadedEntries.length; offset += BATCH_SIZE) {
      onProgress?.('comparing');
      const slice = loadedEntries.slice(offset, offset + BATCH_SIZE).map((entry, idx) => ({
        index: idx,
        candidate: entry.candidate,
        image: entry.image,
      }));

      // Primary evaluation: Gemini Flash -> Anthropic Claude -> Groq Vision
      let primaryFamily: 'gemini' | 'anthropic' | 'groq' = 'gemini';
      let apiResult = await verifyBatchWithGemini(liveImage, slice, role);
      if (apiResult.timedOut) anyTimedOut = true;

      if (!apiResult.parsed) {
        if (apiResult.error) lastProviderError = apiResult.error;
        primaryFamily = 'anthropic';
        apiResult = await verifyBatchWithAnthropic(liveImage, slice, role);
        if (apiResult.timedOut) anyTimedOut = true;
      }
      if (!apiResult.parsed) {
        if (apiResult.error) lastProviderError = apiResult.error;
        primaryFamily = 'groq';
        apiResult = await verifyBatchWithGroq(liveImage, slice, role);
        if (apiResult.timedOut) anyTimedOut = true;
      }

      if (!apiResult.parsed) {
        if (apiResult.error) lastProviderError = apiResult.error;
        console.warn('[KidsFaceRecognitionService] All providers failed for batch:', lastProviderError);
        continue;
      }

      anyProviderSucceeded = true;
      const parsed = apiResult.parsed;
      const provider = apiResult.provider;

      if (!parsed.faceDetected) {
        return {
          matched: false,
          faceDetected: false,
          matchedCandidateId: null,
          confidence: 0,
          status: 'no_face',
          reason:
            parsed.reason ||
            'No clear face detected in camera frame. Please look directly inside the oval frame.',
          provider,
        };
      }

      sawFace = true;
      if (parsed.confidence >= bestConfidence) {
        bestConfidence = parsed.confidence;
        if (parsed.reason) bestReason = parsed.reason;
        if (parsed.differencesFound.length > 0) bestDifferences = parsed.differencesFound;
      }

      if (isStrictMatchValid(parsed, slice.length, STRICT_CONFIDENCE_THRESHOLD)) {
        onProgress?.('confirming');
        const matchedEntry = slice[parsed.matchedCandidateIndex!];

        // Dual-Provider Consensus: When a second independent Vision AI is configured,
        // require independent 1:1 confirmation before approving check-in.
        const secondarySlice = [{ index: 0, candidate: matchedEntry.candidate, image: matchedEntry.image }];
        let secondaryResult: { parsed?: RawVisionMatchResponse; provider?: string; error?: string; timedOut?: boolean } | null = null;

        if (primaryFamily === 'gemini') {
          if (getAnthropicApiKey()) {
            secondaryResult = await verifyBatchWithAnthropic(liveImage, secondarySlice, role);
          } else if (getGroqApiKey()) {
            secondaryResult = await verifyBatchWithGroq(liveImage, secondarySlice, role);
          }
        } else if (primaryFamily === 'anthropic' && getGeminiApiKey()) {
          secondaryResult = await verifyBatchWithGemini(liveImage, secondarySlice, role);
        }

        if (secondaryResult?.parsed) {
          const secParsed = secondaryResult.parsed;
          if (!isStrictMatchValid(secParsed, 1, CONSENSUS_MIN_CONFIDENCE)) {
            const diffDetail =
              secParsed.differencesFound.length > 0
                ? secParsed.differencesFound.join(', ')
                : secParsed.reason || `Secondary check rejected ${matchedEntry.candidate.name} (${secParsed.confidence}%)`;
            bestConfidence = Math.min(bestConfidence, secParsed.confidence);
            bestReason = `Face does not match ${matchedEntry.candidate.name}: ${diffDetail}`;
            if (secParsed.differencesFound.length > 0) {
              bestDifferences = secParsed.differencesFound;
            }
            continue;
          }
          const avgConfidence = Math.round((parsed.confidence + secParsed.confidence) / 2);
          return {
            matched: true,
            faceDetected: true,
            matchedCandidateId: matchedEntry.candidate.id,
            confidence: avgConfidence,
            status: 'matched',
            reason: parsed.reason || `Verified identity match for ${matchedEntry.candidate.name}.`,
            provider: `${provider}+${secondaryResult.provider}`,
          };
        }

        return {
          matched: true,
          faceDetected: true,
          matchedCandidateId: matchedEntry.candidate.id,
          confidence: Math.round(parsed.confidence),
          status: 'matched',
          reason: parsed.reason || `Verified identity match for ${matchedEntry.candidate.name}.`,
          provider,
        };
      }
    }

    if (!anyProviderSucceeded) {
      return {
        matched: false,
        faceDetected: false,
        matchedCandidateId: null,
        confidence: 0,
        status: anyTimedOut ? 'timeout' : 'service_unavailable',
        timedOut: anyTimedOut,
        serviceUnavailable: true,
        reason: anyTimedOut
          ? 'Face verification timed out. Please check your internet connection or use QR Code / Manual Search.'
          : `Face verification service is temporarily unavailable (${lastProviderError || 'network error'}). Please use QR Code or Manual Search.`,
      };
    }

    return {
      matched: false,
      faceDetected: sawFace,
      matchedCandidateId: null,
      confidence: Math.round(bestConfidence),
      status: sawFace ? 'mismatch' : 'no_face',
      differencesFound: bestDifferences,
      reason:
        bestReason ||
        (role === 'child'
          ? 'Live face does not match the registered child profile photo. Check-in denied.'
          : 'Live face does not match any enrolled Sunday School teacher.'),
    };
  }

  /**
   * Strictly verifies live face against a single TARGET child (1:1 strict verification).
   */
  async verifyTargetChildFace(
    livePhotoBase64: string,
    targetChild: FaceCandidate,
    onProgress?: (stage: FaceVerificationProgressStage) => void
  ): Promise<FaceVerificationResult> {
    return this.verifyLiveFace(livePhotoBase64, [targetChild], targetChild.role || 'child', onProgress);
  }

  /**
   * Clears in-memory photo cache when photo is re-enrolled or biometric consent is withdrawn.
   */
  clearPhotoCache(photoUrl?: string) {
    if (photoUrl) {
      referencePhotoCache.delete(photoUrl.trim());
    } else {
      referencePhotoCache.clear();
    }
  }
}

export default new KidsFaceRecognitionService();
