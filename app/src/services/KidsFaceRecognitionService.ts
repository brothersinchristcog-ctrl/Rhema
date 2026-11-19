/**
 * Rhema Kids Ministry — Strict Live Biometric Face Verification Service
 *
 * Compares a REAL captured camera frame against enrolled child/teacher reference photos
 * using multimodal vision AI (Gemini Vision primary + Claude Vision automatic fallback).
 *
 * ZERO-FALSE-POSITIVE SECURITY POLICY:
 * - Never simulates or guesses matches.
 * - Strictly requires a clear human face in the live camera frame.
 * - Rejects adult faces when verifying enrolled children (and rejects strangers / wrong kids).
 * - Requires matched === true AND confidence >= 85% against an enrolled reference photo.
 * - Fails closed (rejects check-in) if no photo matches or if verification is unavailable.
 */

export interface FaceCandidate {
  id: string;
  name: string;
  photoUrl: string;
  role: 'child' | 'teacher';
  age?: number;
  gender?: string;
}

export interface FaceVerificationResult {
  matched: boolean;
  faceDetected: boolean;
  matchedCandidateId: string | null;
  confidence: number;
  reason: string;
  provider?: string;
}

interface RawVisionMatchResponse {
  faceDetected: boolean;
  matched: boolean;
  matchedCandidateIndex: number | null;
  confidence: number;
  reason: string;
}

const STRICT_CONFIDENCE_THRESHOLD = 85;
const BATCH_SIZE = 5;

// In-memory cache of reference photo URL -> pure base64 JPEG/PNG payload
const referencePhotoCache = new Map<string, { base64: string; mimeType: string }>();

function getGeminiApiKey(): string {
  return (process.env.EXPO_PUBLIC_GEMINI_API_KEY || '').trim();
}

function getAnthropicApiKey(): string {
  return (process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY || '').trim();
}

function stripBase64Prefix(raw: string): { base64: string; mimeType: string } {
  const trimmed = (raw || '').trim();
  const dataUriMatch = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
  if (dataUriMatch) {
    return {
      mimeType: dataUriMatch[1] === 'image/jpg' ? 'image/jpeg' : dataUriMatch[1],
      base64: dataUriMatch[2].replace(/\s+/g, ''),
    };
  }
  return {
    mimeType: 'image/jpeg',
    base64: trimmed.replace(/\s+/g, ''),
  };
}

/**
 * Downloads a Firebase Storage / HTTPS reference photo into base64 (cached in memory).
 */
async function loadReferencePhotoBase64(
  photoUrl: string
): Promise<{ base64: string; mimeType: string } | null> {
  const cleanUrl = (photoUrl || '').trim();
  if (!cleanUrl) return null;

  if (cleanUrl.startsWith('data:image/')) {
    return stripBase64Prefix(cleanUrl);
  }

  const cached = referencePhotoCache.get(cleanUrl);
  if (cached) return cached;

  // Method 1: fetch -> blob -> FileReader (native Hermes/RN compatible)
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
        referencePhotoCache.set(cleanUrl, parsed);
        return parsed;
      }
    }
  } catch {
    // Fallback to expo-file-system/legacy below
  }

  // Method 2: expo-file-system/legacy downloadAsync + readAsStringAsync
  try {
    const FileSystem = require('expo-file-system/legacy');
    const tmpPath = `${FileSystem.cacheDirectory}ref_face_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 7)}.jpg`;
    const dl = await FileSystem.downloadAsync(cleanUrl, tmpPath);
    if (dl && dl.status === 200) {
      const base64 = await FileSystem.readAsStringAsync(tmpPath, {
        encoding: FileSystem.EncodingType.Base64,
      });
      FileSystem.deleteAsync(tmpPath, { idempotent: true }).catch(() => {});
      if (base64 && base64.length > 100) {
        const entry = { base64: base64.replace(/\s+/g, ''), mimeType: 'image/jpeg' };
        referencePhotoCache.set(cleanUrl, entry);
        return entry;
      }
    }
  } catch (fsErr) {
    console.warn('[KidsFaceRecognitionService] Could not download reference photo:', fsErr);
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

  const subjectType = role === 'child' ? 'Sunday School CHILD' : 'Sunday School TEACHER';

  return `You are a STRICT, ZERO-FALSE-POSITIVE biometric face verification engine for a church ${subjectType} security kiosk.

Image 1 is the LIVE CAMERA CAPTURE taken right now at the entrance kiosk.
The remaining images are the ONLY authorized enrolled ${subjectType} reference photos:
${candidateLines}

MANDATORY CHILD SAFETY & IDENTITY RULES — FOLLOW STRICTLY:
1. LIVE FACE DETECTION: Inspect Image 1 first. If Image 1 has NO clear human face (e.g. empty room, wall, ceiling, hand, obscured/blurry face, back of head, or looking away), you MUST return:
   {"faceDetected": false, "matched": false, "matchedCandidateIndex": null, "confidence": 0, "reason": "No face detected in live camera frame"}

2. ADULT REJECTION:
   If Image 1 shows an ADULT face (parent, pastor, volunteer, staff), you MUST NEVER match any child reference photo. Return:
   {"faceDetected": true, "matched": false, "matchedCandidateIndex": null, "confidence": 0, "reason": "Adult face detected. Only registered children can be checked in via face scan."}

3. ZERO SIBLING / CROSS-CHILD MISMATCH (CRITICAL):
   - Each child is an individual. If Image 1 is child A (e.g. Vihaan), it MUST NOT match child B (e.g. Shahasra / Sahasra) or any other sibling/child.
   - Even if they are siblings or have similar features, if Image 1 does NOT depict the exact same specific child as the enrolled reference image, you MUST return matched=false.
   - Do NOT guess or pick the closest child.

4. 1:1 IDENTITY VERIFICATION:
   - Compare permanent facial structure: eye spacing and shape, nose bridge and nostril shape, mouth and lip structure, ear placement, jawline, and age-consistent facial contours.
   - Ignore temporary variations: hairstyle, lighting changes, slight head tilts, expressions (smiling/neutral).

5. THRESHOLD:
   - ONLY set "matched": true and "matchedCandidateIndex": <index> if you are 100% confident (confidence >= 85) that Image 1 and Candidate <index> are the EXACT SAME individual.
   - Otherwise, return matched=false, matchedCandidateIndex=null, and an informative reason explaining why it did not match.

Respond ONLY with raw valid JSON (no markdown, no backticks):
{"faceDetected": true/false, "matched": true/false, "matchedCandidateIndex": number or null, "confidence": 0-100, "reason": "brief factual reason"}`;
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
    const matched = Boolean(obj.matched);
    const confidence = Math.max(0, Math.min(100, Number(obj.confidence) || 0));
    const matchedCandidateIndex =
      typeof obj.matchedCandidateIndex === 'number' && Number.isInteger(obj.matchedCandidateIndex)
        ? obj.matchedCandidateIndex
        : null;
    const reason = typeof obj.reason === 'string' && obj.reason.trim() ? obj.reason.trim() : '';

    return { faceDetected, matched, matchedCandidateIndex, confidence, reason };
  } catch {
    return null;
  }
}

async function verifyBatchWithGemini(
  liveImage: { base64: string; mimeType: string },
  batch: Array<{ index: number; candidate: FaceCandidate; image: { base64: string; mimeType: string } }>,
  role: 'child' | 'teacher'
): Promise<{ parsed: RawVisionMatchResponse; provider: string } | null> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return null;

  const prompt = buildStrictPrompt(role, batch);
  const parts: any[] = [
    { text: prompt },
    { inline_data: { mime_type: liveImage.mimeType, data: liveImage.base64 } },
    ...batch.map(b => ({
      inline_data: { mime_type: b.image.mimeType, data: b.image.base64 },
    })),
  ];

  const models = ['gemini-3-flash-preview', 'gemini-3.1-flash-lite'];
  for (const model of models) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 14000);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              temperature: 0,
              responseMimeType: 'application/json',
            },
          }),
        }
      );
      clearTimeout(timeout);

      if (!res.ok) continue;
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const parsed = parseVisionJson(text);
      if (parsed) {
        return { parsed, provider: model };
      }
    } catch {
      // Try next model or fallback provider
    }
  }
  return null;
}

async function verifyBatchWithAnthropic(
  liveImage: { base64: string; mimeType: string },
  batch: Array<{ index: number; candidate: FaceCandidate; image: { base64: string; mimeType: string } }>,
  role: 'child' | 'teacher'
): Promise<{ parsed: RawVisionMatchResponse; provider: string } | null> {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) return null;

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

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 14000);
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerously-allow-browser': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 250,
        temperature: 0,
        messages: [{ role: 'user', content }],
      }),
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.content?.[0]?.text || '';
    const parsed = parseVisionJson(text);
    if (parsed) {
      return { parsed, provider: 'claude-haiku-4-5' };
    }
  } catch {
    // Non-fatal
  }
  return null;
}

class KidsFaceRecognitionService {
  /**
   * Strictly verifies a live captured camera photo against enrolled candidates with reference photos.
   * NEVER falls back to guessing or matching an arbitrary person.
   */
  async verifyLiveFace(
    livePhotoBase64: string,
    candidates: FaceCandidate[],
    role: 'child' | 'teacher' = 'child'
  ): Promise<FaceVerificationResult> {
    const liveImage = stripBase64Prefix(livePhotoBase64);
    if (!liveImage.base64 || liveImage.base64.length < 100) {
      return {
        matched: false,
        faceDetected: false,
        matchedCandidateId: null,
        confidence: 0,
        reason: 'Could not capture a clear camera image. Please try again.',
      };
    }

    // Filter to ONLY candidates with valid enrolled reference photos
    const validCandidates = candidates.filter(
      c => typeof c.photoUrl === 'string' && c.photoUrl.trim().length > 10
    );

    if (validCandidates.length === 0) {
      return {
        matched: false,
        faceDetected: false,
        matchedCandidateId: null,
        confidence: 0,
        reason:
          role === 'child'
            ? 'No enrolled child reference photos found. Please add a clear profile photo for your child first.'
            : 'No enrolled teacher face photos found. Please use your 4-Digit Teacher PIN or ask Admin to add profile photos.',
      };
    }

    // Download & cache reference photos in parallel
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
        reason: 'Unable to load enrolled reference photos. Please check your internet connection.',
      };
    }

    let anyProviderSucceeded = false;
    let sawFace = false;
    let bestConfidence = 0;
    let bestReason = '';

    // Evaluate in batches of up to 5 reference photos per request
    for (let offset = 0; offset < loadedEntries.length; offset += BATCH_SIZE) {
      const slice = loadedEntries.slice(offset, offset + BATCH_SIZE).map((entry, idx) => ({
        index: idx,
        candidate: entry.candidate,
        image: entry.image,
      }));

      // Primary: Anthropic Claude Haiku (~1.4s fast!) or Gemini Flash (fallback to the other if one fails)
      let apiResult = await verifyBatchWithAnthropic(liveImage, slice, role);
      if (!apiResult) {
        apiResult = await verifyBatchWithGemini(liveImage, slice, role);
      }

      if (!apiResult) {
        continue;
      }

      anyProviderSucceeded = true;
      const { parsed, provider } = apiResult;

      if (!parsed.faceDetected) {
        return {
          matched: false,
          faceDetected: false,
          matchedCandidateId: null,
          confidence: 0,
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
      }

      // STRICT GATE: Must be explicitly matched, valid index in batch, and confidence >= 85%
      if (
        parsed.matched &&
        parsed.matchedCandidateIndex !== null &&
        parsed.matchedCandidateIndex >= 0 &&
        parsed.matchedCandidateIndex < slice.length &&
        parsed.confidence >= STRICT_CONFIDENCE_THRESHOLD
      ) {
        const matchedCandidate = slice[parsed.matchedCandidateIndex].candidate;
        return {
          matched: true,
          faceDetected: true,
          matchedCandidateId: matchedCandidate.id,
          confidence: Math.round(parsed.confidence),
          reason: parsed.reason || `Verified identity match for ${matchedCandidate.name}.`,
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
        reason:
          'Face verification service is temporarily unreachable. Please check internet connection or use QR / Manual check-in.',
      };
    }

    return {
      matched: false,
      faceDetected: sawFace,
      matchedCandidateId: null,
      confidence: Math.round(bestConfidence),
      reason:
        bestReason ||
        (role === 'child'
          ? 'Face did not match any enrolled Sunday School child. Only registered children can check in by face.'
          : 'Face did not match any enrolled Sunday School teacher.'),
    };
  }

  /**
   * Strictly verifies live face against a single TARGET child (1:1 strict verification).
   * Ideal when parent selects child or verifies Vihaan/Shahasra specifically.
   */
  async verifyTargetChildFace(
    livePhotoBase64: string,
    targetChild: FaceCandidate
  ): Promise<FaceVerificationResult> {
    return this.verifyLiveFace(livePhotoBase64, [targetChild], targetChild.role || 'child');
  }

  /**
   * Clears in-memory photo cache when photo is re-enrolled or biometric consent is withdrawn.
   */
  clearPhotoCache(photoUrl?: string) {
    if (photoUrl) {
      referencePhotoCache.delete(photoUrl);
    } else {
      referencePhotoCache.clear();
    }
  }
}

export default new KidsFaceRecognitionService();
