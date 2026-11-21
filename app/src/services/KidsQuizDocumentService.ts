import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { Buffer } from 'buffer';
import { KidsQuiz, KidsQuizQuestion } from '../types/KidsMinistryTypes';
import { QuizAIService } from './QuizAIService';

// Pure-JS browser build of fflate (zero Node worker_threads/zlib dependencies)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { unzipSync, unzlibSync, inflateSync, strFromU8 } = require('fflate/lib/browser.cjs');

export const MAX_KIDS_QUIZ_QUESTIONS = 10;

export interface ExtractedQuizDraft {
  title: string;
  titleTelugu: string;
  scriptureRef: string;
  estimatedMinutes: number;
  sourceDocumentName: string;
  questions: KidsQuizQuestion[];
}

function getGeminiKey(): string {
  return (process.env.EXPO_PUBLIC_GEMINI_API_KEY || '').trim();
}

function getAnthropicKey(): string {
  return (process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY || '').trim();
}

function getGroqKey(): string {
  return (process.env.EXPO_PUBLIC_GROQ_API_KEY || '').trim();
}

function hasTeluguScript(text?: string): boolean {
  return /[\u0C00-\u0C7F]/.test(text || '');
}

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
      throw new Error('Request timed out while contacting the AI extraction service.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function decodeXmlEntities(xmlText: string): string {
  return xmlText
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Unzips a .docx archive completely in JS and extracts clean paragraph text
 * from word/document.xml, preserving numbering and line breaks.
 */
function extractTextFromDocxBase64(base64Data: string): string {
  const bytes = new Uint8Array(Buffer.from(base64Data, 'base64'));
  const files: Record<string, Uint8Array> = unzipSync(bytes);
  const docXmlBytes = files['word/document.xml'];
  if (!docXmlBytes) {
    throw new Error('Could not find word/document.xml inside this DOCX file.');
  }
  const xml = strFromU8(docXmlBytes);
  const withStructure = xml
    .replace(/<w:tab\b[^>]*\/>/g, ' ')
    .replace(/<w:(br|cr)\b[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<\/w:tr>/g, '\n')
    .replace(/<[^>]+>/g, '');

  const decoded = decodeXmlEntities(withStructure);
  return decoded
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function decodeAscii85(str: string): Uint8Array {
  const clean = str.replace(/<~|~>|\s/g, '');
  const bytes: number[] = [];
  let i = 0;
  while (i < clean.length) {
    const chunk = clean.slice(i, i + 5);
    if (chunk === 'z') {
      bytes.push(0, 0, 0, 0);
      i += 1;
      continue;
    }
    const padding = 5 - chunk.length;
    let paddedChunk = chunk;
    if (padding > 0) {
      paddedChunk += 'u'.repeat(padding);
    }
    let val = 0;
    for (let c = 0; c < paddedChunk.length; c++) {
      val = val * 85 + (paddedChunk.charCodeAt(c) - 33);
    }
    const b = [
      (val >>> 24) & 255,
      (val >>> 16) & 255,
      (val >>> 8) & 255,
      val & 255,
    ];
    if (padding > 0) {
      bytes.push(...b.slice(0, 4 - padding));
    } else {
      bytes.push(...b);
    }
    i += (5 - padding);
  }
  return new Uint8Array(bytes);
}

function parseCMap(cmapText: string): Map<number, string> {
  const map = new Map<number, string>();
  const bfcharRegex = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g;
  let m: RegExpExecArray | null;
  while ((m = bfcharRegex.exec(cmapText)) !== null) {
    const src = parseInt(m[1], 16);
    const destHex = m[2];
    let destStr = '';
    for (let k = 0; k < destHex.length; k += 4) {
      destStr += String.fromCharCode(parseInt(destHex.slice(k, k + 4), 16));
    }
    map.set(src, destStr);
  }
  const bfrangeRegex = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g;
  while ((m = bfrangeRegex.exec(cmapText)) !== null) {
    const start = parseInt(m[1], 16);
    const end = parseInt(m[2], 16);
    let dest = parseInt(m[3], 16);
    for (let code = start; code <= end; code++) {
      map.set(code, String.fromCharCode(dest++));
    }
  }
  return map;
}

function unescapePdfLiteral(raw: string, cmap?: Map<number, string>): string {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '\\' && i + 1 < raw.length) {
      const next = raw[i + 1];
      if (next === 'n') { out += '\n'; i++; }
      else if (next === 'r') { out += '\r'; i++; }
      else if (next === 't') { out += '\t'; i++; }
      else if (next === 'b') { out += '\b'; i++; }
      else if (next === 'f') { out += '\f'; i++; }
      else if (next === '(' || next === ')' || next === '\\') { out += next; i++; }
      else if (next === '\r' || next === '\n') { i++; }
      else if (/[0-7]/.test(next)) {
        const oct = raw.slice(i + 1, i + 4).match(/^[0-7]{1,3}/)?.[0] || next;
        const code = parseInt(oct, 8);
        out += (cmap && cmap.get(code)) || String.fromCharCode(code);
        i += oct.length;
      } else {
        out += next;
        i++;
      }
    } else {
      const code = ch.charCodeAt(0);
      out += (cmap && cmap.get(code)) || ch;
    }
  }
  return out;
}

function decodePdfHexString(hex: string): string {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  if (clean.length < 2) return '';
  if (clean.toUpperCase().startsWith('FEFF')) {
    let out = '';
    for (let i = 4; i + 3 < clean.length; i += 4) {
      const code = parseInt(clean.slice(i, i + 4), 16);
      if (code === 10 || code === 13 || code >= 32) {
        out += String.fromCharCode(code);
      }
    }
    return out;
  }
  if (clean.length % 4 === 0 && clean.slice(0, 2) === '00') {
    let out = '';
    for (let i = 0; i + 3 < clean.length; i += 4) {
      const code = parseInt(clean.slice(i, i + 4), 16);
      if (code >= 32 && code <= 126) out += String.fromCharCode(code);
    }
    if (out.length >= 2) return out;
  }
  let out = '';
  for (let i = 0; i + 1 < clean.length; i += 2) {
    const code = parseInt(clean.slice(i, i + 2), 16);
    if (code >= 32 && code <= 126) out += String.fromCharCode(code);
  }
  return out;
}

function extractReadableTextFromPdfStream(
  streamStr: string,
  cmap?: Map<number, string>
): string[] {
  if (!streamStr.includes('Tj') && !streamStr.includes('TJ')) return [];
  const lines: string[] = [];
  let currentLine = '';

  const flushLine = () => {
    const trimmed = currentLine.replace(/\s+/g, ' ').trim();
    if (trimmed) lines.push(trimmed);
    currentLine = '';
  };

  let i = 0;
  const len = streamStr.length;
  while (i < len) {
    const ch = streamStr[i];
    if (ch === '(') {
      let depth = 1;
      let j = i + 1;
      let lit = '';
      while (j < len && depth > 0) {
        if (streamStr.charCodeAt(j) === 92) {
          // Backslash escape
          const next = streamStr[j + 1];
          if (next === '(' || next === ')' || next === '\\') {
            lit += next;
            j += 2;
            continue;
          }
          if (next === 'n') {
            lit += '\n';
            j += 2;
            continue;
          }
          if (next === 'r') {
            lit += '\r';
            j += 2;
            continue;
          }
          if (next === 't') {
            lit += '\t';
            j += 2;
            continue;
          }
          if (/[0-7]/.test(next)) {
            const oct = streamStr.slice(j + 1, j + 4).match(/^[0-7]{1,3}/)?.[0] || next;
            const octVal = parseInt(oct, 8);
            lit += (cmap && cmap.get(octVal)) || String.fromCharCode(octVal);
            j += 1 + oct.length;
            continue;
          }
          lit += next;
          j += 2;
          continue;
        }
        if (streamStr.charCodeAt(j) === 40) depth++;
        else if (streamStr.charCodeAt(j) === 41) {
          depth--;
          if (depth === 0) {
            j++;
            break;
          }
        }
        const code = streamStr.charCodeAt(j);
        lit += (cmap && cmap.get(code)) || streamStr[j];
        j++;
      }
      currentLine += lit;
      i = j;
      continue;
    }

    if (ch === '<' && streamStr[i + 1] !== '<') {
      const end = streamStr.indexOf('>', i + 1);
      if (end > i + 1 && end - i < 512) {
        const hexContent = streamStr.slice(i + 1, end);
        if (/^[0-9a-fA-F\s]+$/.test(hexContent)) {
          const decoded = decodePdfHexString(hexContent);
          if (decoded) currentLine += decoded;
        }
        i = end + 1;
        continue;
      }
    }

    if (
      (ch === 'T' &&
        (streamStr[i + 1] === 'd' ||
          streamStr[i + 1] === 'D' ||
          streamStr[i + 1] === '*' ||
          streamStr[i + 1] === 'm')) ||
      (ch === 'E' && streamStr[i + 1] === 'T') ||
      ch === "'" ||
      ch === '"'
    ) {
      flushLine();
    }
    i++;
  }
  flushLine();
  return lines;
}

/**
 * Pure-JS PDF text extraction using fflate unzlibSync/inflateSync on text streams,
 * with full ASCII85Decode and embedded CMap font resolution.
 */
function extractTextFromPdfBase64(base64Data: string): string {
  try {
    const buf = Buffer.from(base64Data, 'base64');
    const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    const latin = buf.toString('latin1');
    const allLines: string[] = [];

    // Pass 1: Parse any font CMaps (e.g. Lohit-Telugu, ToUnicode)
    const globalCMap = new Map<number, string>();
    let pos = 0;
    while (pos < latin.length) {
      const streamIdx = latin.indexOf('stream', pos);
      if (streamIdx === -1) break;
      let start = streamIdx + 6;
      if (latin[start] === '\r' && latin[start + 1] === '\n') start += 2;
      else if (latin[start] === '\n' || latin[start] === '\r') start += 1;
      const endIdx = latin.indexOf('endstream', start);
      if (endIdx === -1) break;
      pos = endIdx + 9;

      const header = latin.slice(Math.max(0, streamIdx - 260), streamIdx);
      const streamBytes: Uint8Array = header.includes('ASCII85Decode')
        ? decodeAscii85(latin.slice(start, endIdx))
        : new Uint8Array(bytes.buffer, bytes.byteOffset + start, endIdx - start);

      try {
        const decomp = unzlibSync(streamBytes as any);
        const text = Buffer.from(decomp).toString('latin1');
        if (text.includes('beginbfchar') || text.includes('begincmap')) {
          const parsed = parseCMap(text);
          for (const [k, v] of parsed.entries()) {
            globalCMap.set(k, v);
          }
        }
      } catch {}
    }

    // Pass 2: Decompress page content streams & extract text
    pos = 0;
    while (pos < latin.length) {
      const streamIdx = latin.indexOf('stream', pos);
      if (streamIdx === -1) break;

      const header = latin.slice(Math.max(0, streamIdx - 260), streamIdx);
      let start = streamIdx + 6;
      if (latin[start] === '\r' && latin[start + 1] === '\n') start += 2;
      else if (latin[start] === '\n' || latin[start] === '\r') start += 1;

      const endIdx = latin.indexOf('endstream', start);
      if (endIdx === -1) break;
      pos = endIdx + 9;

      if (/\/Subtype\s*\/Image/i.test(header) || header.includes('/Image')) continue;
      const chunkLen = endIdx - start;
      if (chunkLen <= 0 || chunkLen > 3_000_000) continue;

      const streamBytes: Uint8Array = header.includes('ASCII85Decode')
        ? decodeAscii85(latin.slice(start, endIdx))
        : new Uint8Array(bytes.buffer, bytes.byteOffset + start, endIdx - start);

      let decodedStr = '';
      if (/\/FlateDecode/i.test(header)) {
        try {
          decodedStr = Buffer.from(unzlibSync(streamBytes as any)).toString('latin1');
        } catch {
          try {
            decodedStr = Buffer.from(inflateSync(streamBytes as any)).toString('latin1');
          } catch {
            decodedStr = '';
          }
        }
      } else {
        decodedStr = Buffer.from(streamBytes).toString('latin1');
      }

      if (decodedStr) {
        const extracted = extractReadableTextFromPdfStream(decodedStr, globalCMap);
        if (extracted.length > 0) {
          allLines.push(...extracted);
        }
      }
    }

    return allLines.join('\n').trim();
  } catch {
    return '';
  }
}

function isReadableQuizText(text: string): boolean {
  if (!text || text.length < 40) return false;
  const asciiWords = (text.match(/[a-zA-Z]{2,}/g) || []).length;
  const questionMarkers = (text.match(/(?:^|\n)\s*(?:Q?\s*\d+[\.\):]|Question\s+\d+)/gim) || []).length;
  const optionMarkers = (text.match(/(?:^|\n)\s*(?:[\u2713\u2714✓✔*•\-\s]*)\(?[A-Da-d][\.\)]/gm) || []).length;
  return asciiWords >= 12 && (questionMarkers >= 2 || optionMarkers >= 4);
}

/**
 * Deterministic fallback parser for structured English / Bilingual quizzes
 * (e.g. numbered questions, A/B/C/D options with optional checkmarks, and Correct Answer lines).
 */
function parseStructuredQuizText(text: string, fileName: string): any | null {
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  if (lines.length < 4) return null;

  const cleanFileTitle = fileName
    .replace(/\.(pdf|docx|doc)$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();

  let title = cleanFileTitle || 'Bible Quiz';
  for (const line of lines.slice(0, 4)) {
    if (!/^(?:Q?\s*\d+[\.\):]|page\s+\d+|10 bible quiz)/i.test(line) && /[a-zA-Z]{3,}/.test(line)) {
      if (line.length <= 80 && !/^(?:rhema kids)$/i.test(line)) {
        title = line;
        break;
      }
    }
  }

  interface TempQuestion {
    questionEnglish: string;
    questionTelugu: string;
    options: string[];
    correctIndex: number;
    explicitAnswerText: string;
    markedCorrectIdx: number;
  }

  const parsedQuestions: TempQuestion[] = [];
  let current: TempQuestion | null = null;

  const questionRe = /^(?:Q(?:uestion)?\s*)?(\d{1,2})[\.\):]\s+(.+)$/i;
  const optionRe = /^([\u2713\u2714✓✔*\[\]xX3\s]*)?\(?([A-Da-d])[\.\)]\s*(.+)$/;
  const answerRe = /^(?:Correct\s+Answer|Answer|Ans|సరైన\s+సమాధానం)\s*[:\-]\s*(.+)$/i;

  for (const rawLine of lines) {
    if (/^(?:rhema kids\s*[•·\x7F\s]*page\s*\d+)/i.test(rawLine)) {
      continue;
    }

    const qMatch = rawLine.match(questionRe);
    if (qMatch && parseInt(qMatch[1], 10) <= 20) {
      if (current && current.options.length >= 2) {
        parsedQuestions.push(current);
      }
      current = {
        questionEnglish: qMatch[2].trim(),
        questionTelugu: '',
        options: [],
        correctIndex: 0,
        explicitAnswerText: '',
        markedCorrectIdx: -1,
      };
      continue;
    }

    if (!current) continue;

    const ansMatch = rawLine.match(answerRe);
    if (ansMatch) {
      if (!current.explicitAnswerText) {
        current.explicitAnswerText = ansMatch[1].trim();
      }
      continue;
    }

    const optMatch = rawLine.match(optionRe);
    if (optMatch && current.options.length < 4) {
      const prefix = (optMatch[1] || '').trim();
      const optText = optMatch[3].replace(/[✓✔\u2713\u2714]/g, '').trim();
      const optIdx = current.options.length;
      if (/[\u2713\u2714✓✔*3]|\[x\]/i.test(prefix) || /[\u2713\u2714✓✔]$/.test(optMatch[3])) {
        current.markedCorrectIdx = optIdx;
      }
      current.options.push(optText);
      continue;
    }

    if (current.options.length === 0 && hasTeluguScript(rawLine) && !current.questionTelugu) {
      current.questionTelugu = rawLine;
    }
  }

  if (current && current.options.length >= 2) {
    parsedQuestions.push(current);
  }

  if (parsedQuestions.length === 0) return null;

  const finalQuestions = parsedQuestions.slice(0, MAX_KIDS_QUIZ_QUESTIONS).map(item => {
    let correctIndex = item.markedCorrectIdx >= 0 ? item.markedCorrectIdx : 0;

    if (item.explicitAnswerText) {
      const letterOnly = item.explicitAnswerText.match(/^\(?([A-Da-d])[\.\)]?$/);
      const letterWithText = item.explicitAnswerText.match(/^\(?([A-Da-d])[\.\)]\s*(.+)$/);
      if (letterOnly) {
        const idx = letterOnly[1].toUpperCase().charCodeAt(0) - 65;
        if (idx >= 0 && idx < item.options.length) correctIndex = idx;
      } else if (letterWithText) {
        const idx = letterWithText[1].toUpperCase().charCodeAt(0) - 65;
        if (idx >= 0 && idx < item.options.length) correctIndex = idx;
      } else {
        const normAns = item.explicitAnswerText.toLowerCase().replace(/people/g, '').trim();
        const foundIdx = item.options.findIndex(
          o => o.toLowerCase() === normAns || normAns.includes(o.toLowerCase()) || o.toLowerCase().includes(normAns)
        );
        if (foundIdx >= 0) correctIndex = foundIdx;
      }
    }

    return {
      questionEnglish: item.questionEnglish,
      questionTelugu: item.questionTelugu,
      options: item.options,
      optionsTelugu: [],
      correctIndex,
      explanation: '',
    };
  });

  return {
    title,
    titleTelugu: '',
    scriptureRef: 'Bible Quiz',
    questions: finalQuestions,
  };
}

async function readPickedAssetAsBase64(uri: string): Promise<string> {
  if (Platform.OS === 'web') {
    const resp = await fetch(uri);
    const blob = await resp.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const res = String(reader.result || '');
        resolve(res.includes(',') ? res.split(',')[1] : res);
      };
      reader.onerror = () => reject(new Error('Could not read uploaded file.'));
      reader.readAsDataURL(blob);
    });
  }

  try {
    return await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch {
    const resp = await fetch(uri);
    const blob = await resp.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const res = String(reader.result || '');
        resolve(res.includes(',') ? res.split(',')[1] : res);
      };
      reader.onerror = () => reject(new Error('Could not read file from storage.'));
      reader.readAsDataURL(blob);
    });
  }
}

function parseAIJson<T>(raw: string): T {
  const cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  const slice = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(slice) as T;
}

// Lean extraction prompt keeps AI output compact & fast (avoiding mobile timeouts);
// missing Telugu translations are generated fast in a lightweight text pass or GTX.
const EXTRACTION_FAST_PROMPT = `You are an expert Bible Quiz parser.
Extract up to ${MAX_KIDS_QUIZ_QUESTIONS} multiple-choice questions from the provided document.
CRITICAL RULES:
1. Preserve exact question numbering order, English wording, options, and exact 0-based "correctIndex" (0=A, 1=B, 2=C, 3=D). Pay close attention to checkmarks (✓), highlighted answers, or "Correct Answer:" lines.
2. If Telugu text is already written in the document, include it verbatim in "questionTelugu" and "optionsTelugu" aligned 1-to-1 with "options". Otherwise keep "questionTelugu": "" and "optionsTelugu": [] so translation can run cleanly next.
3. Keep output strictly valid JSON (no markdown code fences):
{
  "title": "Quiz Title in English",
  "titleTelugu": "",
  "scriptureRef": "Main Bible passage or topic (e.g. Bible Trivia)",
  "questions": [
    {
      "questionEnglish": "Extracted English question?",
      "questionTelugu": "",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "optionsTelugu": [],
      "correctIndex": 0,
      "explanation": ""
    }
  ]
}`;

class KidsQuizDocumentService {
  /**
   * Translates a single question and its options from English into Telugu
   * while strictly preserving option indices so correctIndex remains identical.
   */
  async translateQuestionToTelugu(q: KidsQuizQuestion): Promise<KidsQuizQuestion> {
    const cleanOptions = (q.options || []).map(o => (o || '').trim());
    const [qTe, expTe, ...optsTe] = await Promise.all([
      QuizAIService.translateTextWithGTX(q.questionEnglish || '', 'te'),
      q.explanation
        ? QuizAIService.translateTextWithGTX(q.explanation, 'te')
        : Promise.resolve(''),
      ...cleanOptions.map(opt =>
        opt ? QuizAIService.translateTextWithGTX(opt, 'te') : Promise.resolve('')
      ),
    ]);

    return {
      ...q,
      questionTelugu: qTe || q.questionTelugu || q.questionEnglish,
      optionsTelugu: cleanOptions.map((opt, idx) => optsTe[idx] || q.optionsTelugu?.[idx] || opt),
      explanationTelugu: expTe || q.explanationTelugu || '',
    };
  }

  /**
   * Normalizes AI or deterministic output, caps at MAX_KIDS_QUIZ_QUESTIONS (10),
   * verifies correctIndex, and ensures aligned Telugu translations exist for every field.
   */
  private async normalizeAndVerifyDraft(
    rawObj: any,
    fileName: string
  ): Promise<ExtractedQuizDraft> {
    const rawQuestions: any[] = Array.isArray(rawObj?.questions)
      ? rawObj.questions.slice(0, MAX_KIDS_QUIZ_QUESTIONS)
      : [];

    if (rawQuestions.length === 0) {
      throw new Error(
        'No quiz questions could be extracted from this document. Please check that it contains clear multiple-choice questions and answers.'
      );
    }

    const baseTitle =
      String(rawObj?.title || '').trim() ||
      fileName.replace(/\.(pdf|docx|doc)$/i, '').replace(/[_-]+/g, ' ').trim() ||
      'Bible Quiz';

    const titleTelugu = hasTeluguScript(rawObj?.titleTelugu)
      ? String(rawObj.titleTelugu).trim()
      : await QuizAIService.translateTextWithGTX(baseTitle, 'te');

    const normalizedQuestions: KidsQuizQuestion[] = await Promise.all(
      rawQuestions.map(async (item, idx) => {
        const rawOpts: string[] = Array.isArray(item?.options)
          ? item.options.map((o: any) => String(o || '').trim()).filter(Boolean)
          : [];
        const options = rawOpts.length >= 2 ? rawOpts.slice(0, 4) : ['True', 'False'];

        const rawOptsTe: string[] = Array.isArray(item?.optionsTelugu)
          ? item.optionsTelugu.map((o: any) => String(o || '').trim())
          : [];

        let correctIndex = Number(item?.correctIndex);
        if (
          Number.isNaN(correctIndex) ||
          correctIndex < 0 ||
          correctIndex >= options.length
        ) {
          const answerStr = String(item?.correctAnswer || '').trim().toLowerCase();
          const matchIdx = options.findIndex(o => o.toLowerCase() === answerStr);
          correctIndex = matchIdx >= 0 ? matchIdx : 0;
        }

        const qEn = String(item?.questionEnglish || item?.question || '').trim() || `Question ${idx + 1}`;
        let qTe = String(item?.questionTelugu || '').trim();
        if (!hasTeluguScript(qTe)) {
          qTe = await QuizAIService.translateTextWithGTX(qEn, 'te');
        }

        const alignedOptsTe = await Promise.all(
          options.map(async (optEn, oIdx) => {
            const candidateTe = rawOptsTe[oIdx] || '';
            if (hasTeluguScript(candidateTe)) return candidateTe;
            return (await QuizAIService.translateTextWithGTX(optEn, 'te')) || optEn;
          })
        );

        const expEn = String(item?.explanation || '').trim();
        let expTe = String(item?.explanationTelugu || '').trim();
        if (expEn && !hasTeluguScript(expTe)) {
          expTe = await QuizAIService.translateTextWithGTX(expEn, 'te');
        }

        return {
          id: `q${idx + 1}_${Date.now().toString().slice(-4)}`,
          questionEnglish: qEn,
          questionTelugu: qTe || qEn,
          options,
          optionsTelugu: alignedOptsTe,
          correctIndex,
          explanation: expEn,
          explanationTelugu: expTe,
        };
      })
    );

    const estimatedMinutes = Math.max(2, Math.ceil(normalizedQuestions.length * 0.5));

    return {
      title: baseTitle,
      titleTelugu: titleTelugu || baseTitle,
      scriptureRef: String(rawObj?.scriptureRef || '').trim(),
      estimatedMinutes,
      sourceDocumentName: fileName,
      questions: normalizedQuestions,
    };
  }

  private async runTextExtractionWithAI(
    fileName: string,
    extractedText: string
  ): Promise<any | null> {
    const prompt = `Source Document: "${fileName}".\n\nDOCUMENT TEXT:\n${extractedText.slice(0, 18000)}\n\nExtract up to ${MAX_KIDS_QUIZ_QUESTIONS} quiz questions with exact options and correctIndex.`;

    // 1. Try Groq first for plain text (fastest ~1-2s)
    const groqKey = getGroqKey();
    if (groqKey) {
      for (const model of ['openai/gpt-oss-20b', 'qwen/qwen3.8-27b']) {
        try {
          const res = await fetchWithTimeout(
            'https://api.groq.com/openai/v1/chat/completions',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${groqKey}`,
              },
              body: JSON.stringify({
                model,
                temperature: 0.1,
                max_tokens: 3500,
                response_format: { type: 'json_object' },
                messages: [
                  { role: 'system', content: EXTRACTION_FAST_PROMPT },
                  { role: 'user', content: prompt },
                ],
              }),
            },
            20000
          );
          if (res.ok) {
            const data = await res.json();
            const rawText = data?.choices?.[0]?.message?.content || '';
            if (rawText) {
              const parsed = parseAIJson<any>(rawText);
              if (Array.isArray(parsed?.questions) && parsed.questions.length > 0) {
                return parsed;
              }
            }
          }
        } catch {
          // Try next model
        }
      }
    }

    // 2. Try Gemini text mode
    const geminiKey = getGeminiKey();
    if (geminiKey) {
      for (const model of ['gemini-2.5-flash', 'gemini-2.0-flash']) {
        try {
          const res = await fetchWithTimeout(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: EXTRACTION_FAST_PROMPT }] },
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                  temperature: 0.1,
                  maxOutputTokens: 3500,
                  responseMimeType: 'application/json',
                },
              }),
            },
            25000
          );
          if (res.ok) {
            const data = await res.json();
            const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (rawText) {
              const parsed = parseAIJson<any>(rawText);
              if (Array.isArray(parsed?.questions) && parsed.questions.length > 0) {
                return parsed;
              }
            }
          }
        } catch {
          // Try next model
        }
      }
    }

    // 3. Try Claude Haiku text mode
    const anthropicKey = getAnthropicKey();
    if (anthropicKey) {
      try {
        const res = await fetchWithTimeout(
          'https://api.anthropic.com/v1/messages',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': anthropicKey,
              'anthropic-version': '2023-06-01',
              'anthropic-dangerously-allow-browser': 'true',
            },
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 3500,
              temperature: 0.1,
              system: EXTRACTION_FAST_PROMPT,
              messages: [{ role: 'user', content: prompt }],
            }),
          },
          25000
        );
        if (res.ok) {
          const data = await res.json();
          const textBlock = data?.content?.find((c: any) => c.type === 'text');
          if (textBlock?.text) {
            const parsed = parseAIJson<any>(textBlock.text);
            if (Array.isArray(parsed?.questions) && parsed.questions.length > 0) {
              return parsed;
            }
          }
        }
      } catch {
        // Ignore and fall back to deterministic parser
      }
    }

    return null;
  }

  /**
   * Extracts questions from an uploaded English/Bilingual PDF or DOCX file and returns
   * an aligned English + Telugu draft ready for Admin review before saving.
   */
  async extractAndTranslateQuizDocument(asset: {
    uri: string;
    name: string;
    mimeType?: string;
  }): Promise<ExtractedQuizDraft> {
    const fileName = asset.name || 'quiz_document';
    const lowerName = fileName.toLowerCase();
    const isPdf = lowerName.endsWith('.pdf') || asset.mimeType === 'application/pdf';
    const isDocx =
      lowerName.endsWith('.docx') ||
      (asset.mimeType || '').includes('wordprocessingml');

    if (!isPdf && !isDocx) {
      throw new Error('Please upload a PDF (.pdf) or Word (.docx) document.');
    }

    const base64Data = await readPickedAssetAsBase64(asset.uri);
    if (!base64Data) {
      throw new Error('Could not read the selected document.');
    }

    // Path 1: DOCX or Text-Readable PDF -> Fast Text AI + Deterministic Fallback
    let extractedText = '';
    if (isDocx) {
      extractedText = extractTextFromDocxBase64(base64Data);
      if (!extractedText || extractedText.length < 15) {
        throw new Error('This DOCX file appears empty or has no readable text.');
      }
    } else if (isPdf) {
      const candidatePdfText = extractTextFromPdfBase64(base64Data);
      if (isReadableQuizText(candidatePdfText)) {
        extractedText = candidatePdfText;
      }
    }

    if (extractedText) {
      // 1. Try deterministic fast parser first (instant ~10ms & zero network dependency)
      const regexParsed = parseStructuredQuizText(extractedText, fileName);
      if (regexParsed && regexParsed.questions.length >= 2) {
        return await this.normalizeAndVerifyDraft(regexParsed, fileName);
      }

      // 2. Try fast AI text extraction
      const aiParsed = await this.runTextExtractionWithAI(fileName, extractedText);
      if (aiParsed) {
        return await this.normalizeAndVerifyDraft(aiParsed, fileName);
      }

      if (regexParsed) {
        return await this.normalizeAndVerifyDraft(regexParsed, fileName);
      }

      if (isDocx) {
        throw new Error('Could not recognize quiz questions in this DOCX file. Please format questions cleanly (1., A), B), C), D)).');
      }
    }

    // Path 2: Binary/Image/CID-encoded PDF -> Multimodal Gemini & Claude PDF Extraction
    const pdfPrompt = `Source PDF Document: "${fileName}".
Extract up to ${MAX_KIDS_QUIZ_QUESTIONS} multiple-choice Bible quiz questions from this PDF, preserve exact options and correct answers (checkmarks/highlights/"Correct Answer"), and preserve Telugu text if present.`;

    let lastError = 'AI extraction service could not read this PDF.';

    const geminiKey = getGeminiKey();
    if (geminiKey) {
      for (const model of ['gemini-2.5-flash', 'gemini-2.0-flash']) {
        try {
          const res = await fetchWithTimeout(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: EXTRACTION_FAST_PROMPT }] },
                contents: [
                  {
                    parts: [
                      {
                        inlineData: {
                          mimeType: 'application/pdf',
                          data: base64Data,
                        },
                      },
                      { text: pdfPrompt },
                    ],
                  },
                ],
                generationConfig: {
                  temperature: 0.1,
                  maxOutputTokens: 4096,
                  responseMimeType: 'application/json',
                },
              }),
            },
            50000
          );

          if (res.ok) {
            const data = await res.json();
            const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (rawText) {
              const parsed = parseAIJson<any>(rawText);
              return await this.normalizeAndVerifyDraft(parsed, fileName);
            }
          } else {
            lastError = await res.text();
          }
        } catch (err: any) {
          lastError = err?.message || lastError;
        }
      }
    }

    const anthropicKey = getAnthropicKey();
    if (anthropicKey) {
      for (const model of ['claude-haiku-4-5-20251001', 'claude-sonnet-4-5-20250929']) {
        try {
          const res = await fetchWithTimeout(
            'https://api.anthropic.com/v1/messages',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': anthropicKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerously-allow-browser': 'true',
              },
              body: JSON.stringify({
                model,
                max_tokens: 4096,
                temperature: 0.1,
                system: EXTRACTION_FAST_PROMPT,
                messages: [
                  {
                    role: 'user',
                    content: [
                      {
                        type: 'document',
                        source: {
                          type: 'base64',
                          media_type: 'application/pdf',
                          data: base64Data,
                        },
                      },
                      { type: 'text', text: pdfPrompt },
                    ],
                  },
                ],
              }),
            },
            60000
          );

          if (res.ok) {
            const data = await res.json();
            const textBlock = data?.content?.find((c: any) => c.type === 'text');
            if (textBlock?.text) {
              const parsed = parseAIJson<any>(textBlock.text);
              return await this.normalizeAndVerifyDraft(parsed, fileName);
            }
          } else {
            lastError = await res.text();
          }
        } catch (err: any) {
          lastError = err?.message || lastError;
        }
      }
    }

    throw new Error(`Could not extract quiz from "${fileName}": ${lastError.slice(0, 180)}`);
  }
}

export function estimateQuizMinutes(quiz: Partial<KidsQuiz>): number {
  if (quiz.estimatedMinutes && quiz.estimatedMinutes > 0) {
    return quiz.estimatedMinutes;
  }
  const qCount = quiz.questions?.length || 1;
  return Math.max(2, Math.ceil(qCount * 0.5));
}

export default new KidsQuizDocumentService();
