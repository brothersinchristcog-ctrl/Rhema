/**
 * Rhema Church Management System
 * Kids Ministry AI Assistant Service (Fast Claude Haiku 4.5 + Groq Failover)
 */

import {
  KidsQuiz,
  KidsBibleStory,
  KidsClassTier,
} from '../types/KidsMinistryTypes';

function getApiKey(): string {
  return (process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY || '').trim();
}

function getGroqApiKey(): string {
  return (process.env.EXPO_PUBLIC_GROQ_API_KEY || '').trim();
}

const CLAUDE_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

// Prioritize fast Claude Haiku 4.5 first; only use Sonnet if Haiku rejects the model ID
const CLAUDE_MODELS = [
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-5-20250929',
];
const GROQ_FALLBACK_MODEL = 'qwen/qwen3.8-27b';
const CLAUDE_TIMEOUT_MS = 14000;
const GROQ_TIMEOUT_MS = 12000;

export interface AIGeneratedLessonPlan {
  title: string;
  titleTelugu: string;
  scriptureRef: string;
  scriptureRefTelugu: string;
  bigIdea: string;
  bigIdeaTelugu: string;
  memoryVerse: {
    reference: string;
    referenceTelugu: string;
    verseEnglish: string;
    verseTelugu: string;
  };
  teacherPrayer: {
    english: string;
    telugu: string;
  };
  suppliesNeeded: string[];
  schedule: Array<{
    timeMinutes: number;
    segment: string;
    description: string;
  }>;
  tierGuides?: {
    nursery: { objective: string; objectiveTelugu: string; activity: string; activityTelugu: string };
    beginners: { objective: string; objectiveTelugu: string; activity: string; activityTelugu: string };
    primary: { objective: string; objectiveTelugu: string; activity: string; activityTelugu: string };
    junior: { objective: string; objectiveTelugu: string; activity: string; activityTelugu: string };
    teens: { objective: string; objectiveTelugu: string; activity: string; activityTelugu: string };
  };
}

class KidsAIService {
  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number,
    externalSignal?: AbortSignal
  ): Promise<Response> {
    if (externalSignal?.aborted) {
      throw new DOMException('Request cancelled by user.', 'AbortError');
    }

    const controller = new AbortController();
    let timedOut = false;

    const onExternalAbort = () => controller.abort();
    externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (err: any) {
      if (externalSignal?.aborted) {
        const cancelErr = new Error('Generation cancelled.');
        (cancelErr as any).isUserCancelled = true;
        throw cancelErr;
      }
      if (timedOut || err?.name === 'AbortError') {
        throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    }
  }

  private async callGroq(
    systemPrompt: string,
    userPrompt: string,
    maxTokens: number,
    externalSignal?: AbortSignal
  ): Promise<string> {
    const groqKey = getGroqApiKey();
    if (!groqKey) {
      throw new Error('Groq fallback key is not configured.');
    }

    const response = await this.fetchWithTimeout(
      GROQ_ENDPOINT,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: GROQ_FALLBACK_MODEL,
          max_tokens: maxTokens,
          temperature: 0.3,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      },
      GROQ_TIMEOUT_MS,
      externalSignal
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Groq Fallback Error (${response.status}): ${errText}`);
    }

    const json = await response.json();
    return json?.choices?.[0]?.message?.content || '';
  }

  /**
   * Universal AI message sender: tries fast Claude Haiku first with strict timeout,
   * automatically failing over to Groq if Claude is slow, overloaded, or unavailable.
   */
  private async callClaude(
    systemPrompt: string,
    userPrompt: string,
    maxTokens: number = 1500,
    externalSignal?: AbortSignal
  ): Promise<string> {
    const apiKey = getApiKey();
    let lastErrorMessage = 'Claude AI request failed.';

    if (apiKey) {
      // Try primary fast Claude model first with strict timeout
      for (const model of CLAUDE_MODELS) {
        if (externalSignal?.aborted) {
          const cancelErr = new Error('Generation cancelled.');
          (cancelErr as any).isUserCancelled = true;
          throw cancelErr;
        }

        try {
          const response = await this.fetchWithTimeout(
            CLAUDE_ENDPOINT,
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
                max_tokens: maxTokens,
                temperature: 0.3,
                system: systemPrompt,
                messages: [{ role: 'user', content: userPrompt }],
              }),
            },
            CLAUDE_TIMEOUT_MS,
            externalSignal
          );

          if (response.ok) {
            const json = await response.json();
            const textBlock = json.content?.find((c: any) => c.type === 'text');
            if (textBlock?.text) {
              return textBlock.text;
            }
          } else {
            const errText = await response.text();
            lastErrorMessage = `Claude API Error (${response.status}): ${errText}`;
            // Only fall through to next Claude model on model ID 404/400; otherwise fail fast to Groq
            if (response.status === 404 || response.status === 400) {
              continue;
            }
          }
        } catch (err: any) {
          if (err?.isUserCancelled) throw err;
          lastErrorMessage = err?.message || lastErrorMessage;
        }

        // Break out to fast Groq failover rather than waiting sequentially on slow Sonnet
        break;
      }
    } else {
      lastErrorMessage = 'Anthropic API Key is not configured.';
    }

    // Fast resilient failover to Groq when Claude times out, fails, or is overloaded
    if (getGroqApiKey()) {
      try {
        return await this.callGroq(systemPrompt, userPrompt, maxTokens, externalSignal);
      } catch (groqErr: any) {
        if (groqErr?.isUserCancelled) throw groqErr;
        throw new Error(`${lastErrorMessage} | Fallback failed: ${groqErr?.message || 'Unknown error'}`);
      }
    }

    throw new Error(lastErrorMessage);
  }

  /**
   * Cleans <think> tags and JSON markdown fences from AI output
   */
  private parseJSON<T>(raw: string): T {
    try {
      const cleaned = raw
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      const jsonSlice =
        firstBrace !== -1 && lastBrace > firstBrace
          ? cleaned.slice(firstBrace, lastBrace + 1)
          : cleaned;
      return JSON.parse(jsonSlice) as T;
    } catch (e: any) {
      console.warn('Raw AI output failed JSON parse:', raw);
      throw new Error(`AI generated invalid JSON. Please tap Create again. (${e.message})`);
    }
  }

  /**
   * Generates a crisp bilingual Sunday School lesson plan quickly
   */
  async generateLessonPlan(
    topicOrPassage: string,
    targetTier?: KidsClassTier,
    durationMinutes: number = 45,
    signal?: AbortSignal
  ): Promise<AIGeneratedLessonPlan> {
    const systemPrompt = `You are a bilingual Sunday School curriculum writer for Rhema Church (English & Telugu తెలుగు). Return ONLY pure valid JSON with no markdown. Keep every field concise (1-2 short sentences max).`;

    const userPrompt = `Create a ${durationMinutes}-minute Sunday School lesson plan for: "${topicOrPassage}".
Target Age Tier: "${targetTier || 'General Kids'}".

Return ONLY valid JSON:
{
  "title": "Short English title",
  "titleTelugu": "సంక్షిప్త తెలుగు శీర్షిక",
  "scriptureRef": "e.g. 1 Samuel 17:1-50",
  "scriptureRefTelugu": "e.g. 1 సమూయేలు 17:1-50",
  "bigIdea": "One clear main truth sentence in English",
  "bigIdeaTelugu": "ఒక వాక్యంలో ప్రధాన సత్యం తెలుగులో",
  "memoryVerse": {
    "reference": "Verse ref",
    "referenceTelugu": "తెలుగు రిఫరెన్స్",
    "verseEnglish": "Short key verse in English",
    "verseTelugu": "కీలక తెలుగు వాక్యము"
  },
  "teacherPrayer": {
    "english": "2-sentence teacher prayer in English",
    "telugu": "2 వాక్యాల టీచర్ ప్రార్థన తెలుగులో"
  },
  "suppliesNeeded": ["Supply 1", "Supply 2", "Supply 3", "Supply 4"],
  "schedule": [
    { "timeMinutes": 5, "segment": "Welcome & Prayer", "description": "1 short sentence instruction" },
    { "timeMinutes": 10, "segment": "Action Songs", "description": "1 short sentence themed song idea" },
    { "timeMinutes": 15, "segment": "Bible Story", "description": "1-2 short sentences interactive telling" },
    { "timeMinutes": 10, "segment": "Craft & Activity", "description": "1 short sentence hands-on craft" },
    { "timeMinutes": 5, "segment": "Memory Verse & Blessing", "description": "1 short sentence wrap-up" }
  ]
}`;

    const raw = await this.callClaude(systemPrompt, userPrompt, 1400, signal);
    return this.parseJSON<AIGeneratedLessonPlan>(raw);
  }

  /**
   * Generates a 4-choice interactive Bible Quiz
   */
  async generateQuiz(
    topicOrPassage: string,
    numQuestions: number = 4,
    difficulty: 'easy' | 'medium' | 'hard' = 'medium',
    signal?: AbortSignal
  ): Promise<Partial<KidsQuiz>> {
    const systemPrompt = `You are a children's ministry quiz creator. Generate bilingual (English & Telugu) 4-choice Bible trivia questions for kids. Return ONLY pure valid JSON with concise text.`;

    const userPrompt = `Create a ${numQuestions}-question Bible quiz on: "${topicOrPassage}" (Difficulty: ${difficulty}).

Return ONLY valid JSON:
{
  "title": "Short Quiz Title in English",
  "titleTelugu": "క్విజ్ శీర్షిక తెలుగులో",
  "scriptureRef": "Book and Chapter reference",
  "pointsReward": 50,
  "badgeReward": "Master of ${topicOrPassage.slice(0, 15)}",
  "coverEmoji": "🏆",
  "questions": [
    {
      "id": "q1",
      "questionEnglish": "Concise question in English?",
      "questionTelugu": "ప్రశ్న తెలుగులో?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "optionsTelugu": ["ఆప్షన్ A", "ఆప్షన్ B", "ఆప్షన్ C", "ఆప్షన్ D"],
      "correctIndex": 0,
      "explanation": "1 short sentence with Scripture citation."
    }
  ]
}`;

    const raw = await this.callClaude(systemPrompt, userPrompt, 1400, signal);
    return this.parseJSON<Partial<KidsQuiz>>(raw);
  }

  /**
   * Generates an illustrated 3-page story outline
   */
  async generateStory(
    characterOrTopic: string,
    signal?: AbortSignal
  ): Promise<Partial<KidsBibleStory>> {
    const systemPrompt = `You are a Christian children's storybook author (English & Telugu). Write warm, vivid 3-page kids Bible stories. Return ONLY pure valid JSON with concise 2-sentence paragraphs.`;

    const userPrompt = `Write a 3-page children's Bible story about: "${characterOrTopic}".

Return ONLY valid JSON:
{
  "title": "Story Title in English",
  "titleTelugu": "కథ శీర్షిక తెలుగులో",
  "scriptureRef": "Scripture passage",
  "theme": "Core theme (e.g. Courage, Faith)",
  "coverEmoji": "⭐",
  "readTime": "3 min read",
  "summary": "Short 1-2 sentence summary in English",
  "summaryTelugu": "సంక్షిప్త సారాంశం తెలుగులో",
  "pages": [
    {
      "pageNumber": 1,
      "emoji": "🐑",
      "headerEnglish": "Page 1 heading",
      "headerTelugu": "పేజీ 1 శీర్షిక",
      "textEnglish": "Short 2-sentence engaging opening for kids.",
      "textTelugu": "పిల్లలకు ఆసక్తికరమైన కథ ప్రారంభం తెలుగులో."
    },
    {
      "pageNumber": 2,
      "emoji": "🛡️",
      "headerEnglish": "Page 2 heading",
      "headerTelugu": "పేజీ 2 శీర్షిక",
      "textEnglish": "Short 2-sentence climax paragraph.",
      "textTelugu": "ముఖ్య ఘట్టం తెలుగులో."
    },
    {
      "pageNumber": 3,
      "emoji": "🎉",
      "headerEnglish": "Celebration & Lesson",
      "headerTelugu": "విజయము మరియు నీతి",
      "textEnglish": "Short 2-sentence resolution and takeaway.",
      "textTelugu": "ముగింపు మరియు ఆత్మీయ సత్యం."
    }
  ],
  "reflectionQuestions": [
    {
      "questionEnglish": "Discussion question for kids?",
      "questionTelugu": "పిల్లలతో చర్చించవలసిన ప్రశ్న?"
    },
    {
      "questionEnglish": "How can you show this in your life this week?",
      "questionTelugu": "ఈ వారంలో మీరు ఈ సత్యమును ఎలా జీవించగలరు?"
    }
  ]
}`;

    const raw = await this.callClaude(systemPrompt, userPrompt, 1500, signal);
    return this.parseJSON<Partial<KidsBibleStory>>(raw);
  }

  /**
   * Generates quick action gestures & mnemonic helper for Memory Verses
   */
  async generateMemoryVerseAids(
    verseText: string,
    verseRef: string,
    signal?: AbortSignal
  ): Promise<{
    handActions: Array<{ word: string; gesture: string; gestureTelugu: string }>;
    mnemonicRhyme: string;
    mnemonicRhymeTelugu: string;
    familyTalkPrompt: string;
    familyTalkPromptTelugu: string;
  }> {
    const systemPrompt = `You invent fun Sunday School hand motions, action rhymes, and family prompts for Bible verses (English & Telugu). Return ONLY pure valid JSON.`;

    const userPrompt = `Create concise memory verse aids (4 hand motions) for: "${verseText}" (${verseRef})

Return ONLY valid JSON:
{
  "handActions": [
    { "word": "Word or Phrase", "gesture": "Short hand motion", "gestureTelugu": "చేతి కదలిక తెలుగులో" }
  ],
  "mnemonicRhyme": "2-line catchy rhyme in English",
  "mnemonicRhymeTelugu": "2 పంక్తుల తెలుగు ప్రాస",
  "familyTalkPrompt": "1 fun bedtime question for parents",
  "familyTalkPromptTelugu": "తల్లిదండ్రుల కోసం 1 ప్రశ్న"
}`;

    const raw = await this.callClaude(systemPrompt, userPrompt, 1000, signal);
    return this.parseJSON(raw);
  }
}

export default new KidsAIService();
