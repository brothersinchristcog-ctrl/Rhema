/**
 * Rhema Church Management System
 * Kids Ministry AI Assistant Service powered by Claude 3.5 Sonnet
 */

import {
  KidsCurriculumLesson,
  KidsQuiz,
  KidsBibleStory,
  KidsClassTier,
} from '../types/KidsMinistryTypes';
import KidsMinistryService from './KidsMinistryService';

function getApiKey(): string {
  return process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY || '';
}

const CLAUDE_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const PRIMARY_MODEL = 'claude-3-5-sonnet-20241022';
const FALLBACK_MODEL = 'claude-3-5-haiku-20241022';

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
  tierGuides: {
    nursery: { objective: string; objectiveTelugu: string; activity: string; activityTelugu: string };
    beginners: { objective: string; objectiveTelugu: string; activity: string; activityTelugu: string };
    primary: { objective: string; objectiveTelugu: string; activity: string; activityTelugu: string };
    junior: { objective: string; objectiveTelugu: string; activity: string; activityTelugu: string };
    teens: { objective: string; objectiveTelugu: string; activity: string; activityTelugu: string };
  };
}

class KidsAIService {
  /**
   * Universal Anthropic Claude message sender
   */
  private async callClaude(systemPrompt: string, userPrompt: string, maxTokens: number = 3000): Promise<string> {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error('Anthropic API Key is not configured.');
    }

    const payload = {
      model: PRIMARY_MODEL,
      max_tokens: maxTokens,
      temperature: 0.3,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    };

    let response = await fetch(CLAUDE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerously-allow-browser': 'true',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      // Fallback model retry if primary model has rate-limit or model-access differences
      if (response.status === 404 || response.status === 400) {
        response = await fetch(CLAUDE_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerously-allow-browser': 'true',
          },
          body: JSON.stringify({ ...payload, model: FALLBACK_MODEL }),
        });
      }

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Claude API Error (${response.status}): ${errText}`);
      }
    }

    const json = await response.json();
    const textBlock = json.content?.find((c: any) => c.type === 'text');
    return textBlock ? textBlock.text : '';
  }

  /**
   * Cleans JSON markdown fences from Claude output
   */
  private parseJSON<T>(raw: string): T {
    try {
      const cleaned = raw
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();
      return JSON.parse(cleaned) as T;
    } catch (e: any) {
      console.warn('Raw AI output failed JSON parse:', raw);
      throw new Error(`AI generated non-JSON response. Please retry. (${e.message})`);
    }
  }

  /**
   * Generates a comprehensive bilingual Sunday School lesson plan
   */
  async generateLessonPlan(
    topicOrPassage: string,
    targetTier?: KidsClassTier,
    durationMinutes: number = 45
  ): Promise<AIGeneratedLessonPlan> {
    const systemPrompt = `You are an expert bilingual Sunday School curriculum specialist for Rhema Christian Church.
You write engaging, scripturally accurate, Christ-centered curriculum in both English and Telugu (తెలుగు).
Always return pure valid JSON with no markdown and no conversational preamble.`;

    const userPrompt = `Create an exceptional ${durationMinutes}-minute Sunday School lesson plan for topic/passage: "${topicOrPassage}".
Focus Tier (if any): "${targetTier || 'All 5 Tiers'}".

Return ONLY valid JSON matching this exact structure:
{
  "title": "Lesson title in English",
  "titleTelugu": "తెలుగులో పాఠం శీర్షిక",
  "scriptureRef": "Scripture reference (e.g. 1 Samuel 17:1-50)",
  "scriptureRefTelugu": "తెలుగులో రిఫరెన్స్ (e.g. 1 సమూయేలు 17:1-50)",
  "bigIdea": "One sentence main truth in English",
  "bigIdeaTelugu": "ప్రధాన సత్యం తెలుగులో",
  "memoryVerse": {
    "reference": "Verse reference",
    "referenceTelugu": "తెలుగు రిఫరెన్స్",
    "verseEnglish": "Full verse text in English",
    "verseTelugu": "సంపూర్ణ తెలుగు వాక్యము"
  },
  "teacherPrayer": {
    "english": "Teacher prayer before class in English",
    "telugu": "టీచర్ ప్రార్థన తెలుగులో"
  },
  "suppliesNeeded": ["Supply 1", "Supply 2", "Supply 3", "Supply 4"],
  "schedule": [
    { "timeMinutes": 5, "segment": "Welcome & Opening Prayer", "description": "Step by step description" },
    { "timeMinutes": 10, "segment": "Praise & Action Songs", "description": "Themed songs with actions" },
    { "timeMinutes": 15, "segment": "Bilingual Scripture Story", "description": "Interactive storytelling" },
    { "timeMinutes": 10, "segment": "Hands-On Craft", "description": "Craft activity instructions" },
    { "timeMinutes": 5, "segment": "Memory Verse Recitation & Blessing", "description": "Dismissal ritual" }
  ],
  "tierGuides": {
    "nursery": { "objective": "Obj English", "objectiveTelugu": "Obj Telugu", "activity": "Act English", "activityTelugu": "Act Telugu" },
    "beginners": { "objective": "Obj English", "objectiveTelugu": "Obj Telugu", "activity": "Act English", "activityTelugu": "Act Telugu" },
    "primary": { "objective": "Obj English", "objectiveTelugu": "Obj Telugu", "activity": "Act English", "activityTelugu": "Act Telugu" },
    "junior": { "objective": "Obj English", "objectiveTelugu": "Obj Telugu", "activity": "Act English", "activityTelugu": "Act Telugu" },
    "teens": { "objective": "Obj English", "objectiveTelugu": "Obj Telugu", "activity": "Act English", "activityTelugu": "Act Telugu" }
  }
}`;

    const raw = await this.callClaude(systemPrompt, userPrompt, 3500);
    return this.parseJSON<AIGeneratedLessonPlan>(raw);
  }

  /**
   * Generates a 4-choice interactive Bible Quiz
   */
  async generateQuiz(
    topicOrPassage: string,
    numQuestions: number = 4,
    difficulty: 'easy' | 'medium' | 'hard' = 'medium'
  ): Promise<Partial<KidsQuiz>> {
    const systemPrompt = `You are a creative children's ministry quiz creator.
Generate fun, engaging, bilingual (English & Telugu) 4-choice Bible trivia questions for Sunday School.
Always return pure valid JSON with no markdown.`;

    const userPrompt = `Create a ${numQuestions}-question Bible quiz on: "${topicOrPassage}".
Difficulty level: ${difficulty}.

Return ONLY valid JSON matching this exact structure:
{
  "title": "Catchy Quiz Title in English",
  "titleTelugu": "ఆకర్షణీయమైన క్విజ్ శీర్షిక తెలుగులో",
  "scriptureRef": "Book and Chapter reference",
  "pointsReward": 50,
  "badgeReward": "Master of ${topicOrPassage.slice(0, 15)}",
  "coverEmoji": "🏆",
  "questions": [
    {
      "id": "q1",
      "questionEnglish": "Question in English?",
      "questionTelugu": "ప్రశ్న తెలుగులో?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "optionsTelugu": ["ఆప్షన్ A", "ఆప్షన్ B", "ఆప్షన్ C", "ఆప్షన్ D"],
      "correctIndex": 0,
      "explanation": "Why this is correct with Scripture citation."
    }
  ]
}`;

    const raw = await this.callClaude(systemPrompt, userPrompt, 2500);
    return this.parseJSON<Partial<KidsQuiz>>(raw);
  }

  /**
   * Generates an illustrated 3-4 page story outline
   */
  async generateStory(
    characterOrTopic: string
  ): Promise<Partial<KidsBibleStory>> {
    const systemPrompt = `You are a talented Christian children's storybook author for Rhema Church.
Write heartwarming, vibrant, page-by-page illustrated children's Bible stories in English & Telugu.
Always return pure valid JSON with no markdown.`;

    const userPrompt = `Write a 3-page children's Bible story about: "${characterOrTopic}".

Return ONLY valid JSON matching this exact structure:
{
  "title": "Story Title in English",
  "titleTelugu": "కథ శీర్షిక తెలుగులో",
  "scriptureRef": "Scripture passage",
  "theme": "Core theme (e.g. Courage, Faith, Love)",
  "coverEmoji": "⭐",
  "readTime": "3 min read",
  "summary": "Short 2-sentence summary in English",
  "summaryTelugu": "రెండు వాక్యాల సారాంశం తెలుగులో",
  "pages": [
    {
      "pageNumber": 1,
      "emoji": "🐑",
      "headerEnglish": "Page heading",
      "headerTelugu": "పేజీ శీర్షిక",
      "textEnglish": "Engaging storytelling paragraph for kids.",
      "textTelugu": "పిల్లలకు ఆసక్తికరమైన కథనం తెలుగులో."
    },
    {
      "pageNumber": 2,
      "emoji": "🛡️",
      "headerEnglish": "Page heading 2",
      "headerTelugu": "పేజీ శీర్షిక 2",
      "textEnglish": "Climax paragraph.",
      "textTelugu": "ముఖ్య ఘట్టం తెలుగులో."
    },
    {
      "pageNumber": 3,
      "emoji": "🎉",
      "headerEnglish": "Celebration & Lesson",
      "headerTelugu": "విజయము మరియు నీతి",
      "textEnglish": "Resolution and spiritual takeaway.",
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

    const raw = await this.callClaude(systemPrompt, userPrompt, 2500);
    return this.parseJSON<Partial<KidsBibleStory>>(raw);
  }

  /**
   * Generates quick action gestures & mnemonic helper for Memory Verses
   */
  async generateMemoryVerseAids(
    verseText: string,
    verseRef: string
  ): Promise<{
    handActions: Array<{ word: string; gesture: string; gestureTelugu: string }>;
    mnemonicRhyme: string;
    mnemonicRhymeTelugu: string;
    familyTalkPrompt: string;
    familyTalkPromptTelugu: string;
  }> {
    const systemPrompt = `You are a master Sunday School teacher who invents fun hand motions, action rhymes, and family discussion prompts for Bible memory verses. Return pure JSON.`;

    const userPrompt = `Create interactive memory verse aids for:
Verse: "${verseText}" (${verseRef})

Return JSON:
{
  "handActions": [
    { "word": "Word or Phrase", "gesture": "Hand motion in English", "gestureTelugu": "చేతి కదలిక తెలుగులో" }
  ],
  "mnemonicRhyme": "2-line catchy rhyme in English to remember it",
  "mnemonicRhymeTelugu": "గుర్తుంచుకోవడానికి 2 పంక్తుల తెలుగు ప్రాస",
  "familyTalkPrompt": "One fun bedtime question for parents to ask",
  "familyTalkPromptTelugu": "తల్లిదండ్రులు పిల్లలను అడగవలసిన ప్రశ్న"
}`;

    const raw = await this.callClaude(systemPrompt, userPrompt, 1500);
    return this.parseJSON(raw);
  }
}

export default new KidsAIService();
