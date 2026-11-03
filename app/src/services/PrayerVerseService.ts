import { Share, Linking, Alert, Platform } from 'react-native';

export interface PrayerVerse {
  reference: string;
  referenceTe?: string;
  verseEn: string;
  verseTe?: string;
  theme: string;
}

export interface SuggestedResponse {
  id: string;
  title: string;
  body: string;
}

// ─── Instant Curated Biblical Verse Bank ─────────────────────────────────────
// Always available offline with zero latency for instant display
const CURATED_PRAYER_VERSES: Record<string, PrayerVerse[]> = {
  healing: [
    {
      reference: 'Jeremiah 17:14',
      referenceTe: 'యిర్మియా 17:14',
      verseEn: 'Heal me, O LORD, and I shall be healed; save me, and I shall be saved, for you are my praise.',
      verseTe: 'యెహోవా, నన్ను స్వస్థపరచుము, నేను స్వస్థతనొందుదును; నన్ను రక్షించుము, నేను రక్షింపబడుదును.',
      theme: 'Divine Healing'
    },
    {
      reference: 'Isaiah 53:5',
      referenceTe: 'యెషయా 53:5',
      verseEn: 'By his wounds we are healed.',
      verseTe: 'ఆయన పొందిన దెబ్బలచేత మనకు స్వస్థత కలుగుచున్నది.',
      theme: 'Christ’s Healing'
    },
    {
      reference: 'Psalm 103:2-3',
      referenceTe: 'కీర్తనలు 103:2-3',
      verseEn: 'Bless the LORD, O my soul... who forgives all your iniquity, who heals all your diseases.',
      verseTe: 'నా ప్రాణమా, యెహోవాను సన్నుతించుము... ఆయన నీ రోగములన్నిటిని స్వస్థపరచుచున్నాడు.',
      theme: 'Health & Wholeness'
    },
    {
      reference: 'James 5:15',
      referenceTe: 'యాకోబు 5:15',
      verseEn: 'And the prayer of faith will save the one who is sick, and the Lord will raise him up.',
      verseTe: 'విశ్వాససహితమైన ప్రార్థన ఆ రోగిని స్వస్థపరచును, ప్రభువు అతనిని లేపును.',
      theme: 'Prayer of Faith'
    }
  ],
  peace: [
    {
      reference: 'Philippians 4:6-7',
      referenceTe: 'ఫిలిప్పీయులకు 4:6-7',
      verseEn: 'Do not be anxious about anything, but in every situation, by prayer and petition, with thanksgiving, present your requests to God. And the peace of God will guard your hearts.',
      verseTe: 'దేనినిగూర్చియు చింతపడకుడి గాని ప్రతి విషయములోను ప్రార్థన విజ్ఞాపనములచేత కృతజ్ఞతాపూర్వకముగా మీ విన్నపములను దేవునికి తెలియజేయుడి.',
      theme: 'Peace of God'
    },
    {
      reference: 'Isaiah 41:10',
      referenceTe: 'యెషయా 41:10',
      verseEn: 'Fear not, for I am with you; be not dismayed, for I am your God; I will strengthen you, I will help you.',
      verseTe: 'నీవు భయపడకుము నేను నీకు తోడైయున్నాను, దిగులుపడకుము నేను నీ దేవుడనై యున్నాను; నేను నిన్ను బలపరతును.',
      theme: 'Strength & Courage'
    },
    {
      reference: 'Matthew 11:28',
      referenceTe: 'మత్తయి 11:28',
      verseEn: 'Come to me, all who labor and are heavy laden, and I will give you rest.',
      verseTe: 'ప్రయాసపడి భారము మోసికొనుచున్న సమస్త జనులారా, నాయొద్దకు రండి; నేను మీకు విశ్రాంతి కలుగజేతును.',
      theme: 'Rest in Jesus'
    },
    {
      reference: 'Psalm 46:1',
      referenceTe: 'కీర్తనలు 46:1',
      verseEn: 'God is our refuge and strength, a very present help in trouble.',
      verseTe: 'దేవుడు మనకు ఆశ్రయమును దుర్గమునై యున్నాడు, ఆపత్కాలములో ఆయన నమ్ముకొనదగిన సహాయకుడు.',
      theme: 'Refuge & Shield'
    }
  ],
  family: [
    {
      reference: 'Joshua 24:15',
      referenceTe: 'యెహోషువ 24:15',
      verseEn: 'As for me and my house, we will serve the LORD.',
      verseTe: 'నేనును నా యింటివారును యెహోవాను సేవించెదము.',
      theme: 'Household Faith'
    },
    {
      reference: 'Psalm 128:1-2',
      referenceTe: 'కీర్తనలు 128:1-2',
      verseEn: 'Blessed is everyone who fears the LORD, who walks in his ways! You shall eat the fruit of the labor of your hands.',
      verseTe: 'యెహోవాయందు భయభక్తులు కలిగి ఆయన మార్గములయందు నడుచువారందరు ధన్యులు.',
      theme: 'Family Blessing'
    },
    {
      reference: 'Proverbs 3:5-6',
      referenceTe: 'సామెతలు 3:5-6',
      verseEn: 'Trust in the LORD with all your heart, and do not lean on your own understanding; in all your ways acknowledge him, and he will direct your paths.',
      verseTe: 'నీ స్వబుద్ధిని ఆధారము చేసికొనక నీ పూర్ణహృదయముతో యెహోవాయందు నమ్మకముంచుము; ఆయన నీ మార్గములను సరాళము చేయును.',
      theme: 'Guidance'
    },
    {
      reference: 'Colossians 3:14',
      referenceTe: 'కొలొస్సయులకు 3:14',
      verseEn: 'And over all these virtues put on love, which binds them all together in perfect unity.',
      verseTe: 'వీటన్నిటిపైని సంపూర్ణతకు అనుబంధమైన ప్రేమను ధరించుకొనుడి.',
      theme: 'Love & Unity'
    }
  ],
  provision: [
    {
      reference: 'Philippians 4:19',
      referenceTe: 'ఫిలిప్పీయులకు 4:19',
      verseEn: 'And my God will supply every need of yours according to his riches in glory in Christ Jesus.',
      verseTe: 'కాగా దేవుడు తన ఐశ్వర్యముచొప్పున క్రీస్తుయేసునందు మహిమలో మీ ప్రతి అవసరమును తీర్చును.',
      theme: 'God Supplies'
    },
    {
      reference: 'Psalm 23:1',
      referenceTe: 'కీర్తనలు 23:1',
      verseEn: 'The LORD is my shepherd; I shall not want.',
      verseTe: 'యెహోవా నా కాపరి, నాకు లేమి కలుగదు.',
      theme: 'Shepherd’s Care'
    },
    {
      reference: 'Jeremiah 29:11',
      referenceTe: 'యిర్మియా 29:11',
      verseEn: 'For I know the plans I have for you, declares the LORD, plans to prosper you and not to harm you, to give you a hope and a future.',
      verseTe: 'నేను మిమ్మునుగూర్చి తలంచుచున్న తలంపులను నేనెరుగుదును, అవి సమాధానకరమైన తలంపులేగాని హానికరమైనవి కావు.',
      theme: 'Hope & Future'
    },
    {
      reference: 'Psalm 37:4-5',
      referenceTe: 'కీర్తనలు 37:4-5',
      verseEn: 'Delight yourself in the LORD, and he will give you the desires of your heart. Commit your way to the LORD; trust in him, and he will act.',
      verseTe: 'యెహోవానుబట్టి సంతోషించుము, ఆయన నీ హృదయవాంఛలను తీర్చును.',
      theme: 'Heart’s Desire'
    }
  ],
  comfort: [
    {
      reference: 'Romans 8:28',
      referenceTe: 'రోమీయులకు 8:28',
      verseEn: 'And we know that in all things God works for the good of those who love him, who have been called according to his purpose.',
      verseTe: 'దేవుని ప్రేమించువారికి సమస్తమును సమకూడి మేలుకై జరుగుచున్నవని యెరుగుదుము.',
      theme: 'God Works for Good'
    },
    {
      reference: 'Psalm 34:17-18',
      referenceTe: 'కీర్తనలు 34:17-18',
      verseEn: 'The righteous cry out, and the LORD hears them; he delivers them from all their troubles. The LORD is close to the brokenhearted.',
      verseTe: 'నీతిమంతులు మొఱ్ఱపెట్టగా యెహోవా ఆలకించును... విరిగిన హృదయముగలవారికి యెహోవా ఆసన్నుడు.',
      theme: 'Near the Broken'
    },
    {
      reference: '2 Corinthians 1:3-4',
      referenceTe: '2 కొరింథీయులకు 1:3-4',
      verseEn: 'The Father of mercies and God of all comfort, who comforts us in all our affliction.',
      verseTe: 'ఆయన కనికరము చూపు తండ్రియు, సమస్తమైన ఆదరణను అనుగ్రహించు దేవుడునై యున్నాడు.',
      theme: 'Divine Comfort'
    },
    {
      reference: 'Revelation 21:4',
      referenceTe: 'ప్రకటన 21:4',
      verseEn: 'He will wipe away every tear from their eyes, and death shall be no more, neither shall there be mourning, nor crying, nor pain anymore.',
      verseTe: 'ఆయన వారి కన్నుల ప్రతి బాష్పబిందువును తుడిచివేయును, మరణము ఇక ఉండదు.',
      theme: 'Eternal Hope'
    }
  ]
};

// Map keywords to category keys
function detectCategoryKey(prayerText = '', category = ''): string {
  const combined = `${category} ${prayerText}`.toLowerCase();
  if (/heal|sick|ill|disease|hospital|doctor|pain|fever|surgery|health|medicine|swasth|roga/i.test(combined)) {
    return 'healing';
  }
  if (/peace|fear|worry|anxiety|trouble|storm|depress|stress|strength|bhayamu|shanti/i.test(combined)) {
    return 'peace';
  }
  if (/family|marriage|husband|wife|child|children|son|daughter|parent|mother|father|kutumb/i.test(combined)) {
    return 'family';
  }
  if (/job|money|finan|business|debt|loan|work|exam|career|rent|income|avasaram/i.test(combined)) {
    return 'provision';
  }
  if (/grief|loss|death|mourn|cry|tear|alone|broken|sad|kashtam/i.test(combined)) {
    return 'comfort';
  }
  return 'peace';
}

class PrayerVerseService {
  /**
   * 1. Instant Suggested Bible Verses (Zero latency, offline-ready)
   */
  getInstantSuggestedVerses(prayerText = '', category = ''): PrayerVerse[] {
    const key = detectCategoryKey(prayerText, category);
    return CURATED_PRAYER_VERSES[key] || CURATED_PRAYER_VERSES.peace;
  }

  /**
   * 2. AI Verse Suggestions (Gemini Flash + Groq fallback)
   * Analyzes the member's prayer request text contextually
   */
  async fetchAIVerseSuggestions(prayerText: string, category = '', language = 'English'): Promise<PrayerVerse[]> {
    const geminiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
    const groqKey = process.env.EXPO_PUBLIC_GROQ_API_KEY;

    const prompt = `You are a biblical counselor and pastor. A church member submitted this prayer request:
Category: "${category || 'General'}"
Request: "${prayerText}"

Select exactly 3 powerful, encouraging, and directly relevant Holy Bible verses for this need.
Return ONLY valid JSON (no markdown formatting, no code fences, no extra words) formatted as:
[
  {
    "reference": "Book Chapter:Verse",
    "referenceTe": "పుస్తకం అధ్యాయం:వచనం",
    "verseEn": "English verse text",
    "verseTe": "Telugu verse text",
    "theme": "Short 2-3 word theme"
  }
]`;

    // Try Gemini First
    if (geminiKey) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 600 }
          }),
          signal: controller.signal
        });
        clearTimeout(timer);
        if (res.ok) {
          const json = await res.json();
          const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(cleaned);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch (geminiErr) {
        console.warn('⚠️ Gemini verse suggestions failed, trying Groq fallback:', geminiErr);
      }
    }

    // Try Groq Fallback
    if (groqKey) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'qwen/qwen3.8-27b',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3
          }),
          signal: controller.signal
        });
        clearTimeout(timer);
        if (res.ok) {
          const json = await res.json();
          const raw = json?.choices?.[0]?.message?.content || '';
          const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(cleaned);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch (groqErr) {
        console.warn('⚠️ Groq verse suggestions fallback failed:', groqErr);
      }
    }

    // Fallback to instant curated list
    return this.getInstantSuggestedVerses(prayerText, category);
  }

  /**
   * 3. Instant Suggested Responses (Zero latency, ready-made templates)
   */
  getInstantSuggestedResponses(memberName = 'Beloved Member', category = '', selectedVerseRef = ''): SuggestedResponse[] {
    const key = detectCategoryKey('', category);
    const verseSuffix = selectedVerseRef ? ` As the scripture says in ${selectedVerseRef}, God's word is faithful.` : '';

    if (key === 'healing') {
      return [
        {
          id: 'h1',
          title: 'Healing & Strength',
          body: `Dear ${memberName}, our pastoral team is standing in faith with you. We rebuke every sickness and pray for Jehovah Rapha's healing virtue to touch you right now.${verseSuffix} Keep your trust in Jesus.`
        },
        {
          id: 'h2',
          title: 'Divine Recovery',
          body: `Dear ${memberName}, we have prayed over your health request. May the Lord grant complete recovery, renewed strength, and peace to your body and mind.`
        },
        {
          id: 'h3',
          title: 'Prayer of Faith',
          body: `Dear ${memberName}, by His stripes you are healed. Stand firm in faith, knowing our entire church family is lifting you up continuously before the throne of grace.`
        }
      ];
    }

    if (key === 'family') {
      return [
        {
          id: 'f1',
          title: 'Household Blessing',
          body: `Dear ${memberName}, we are joining hands with you in prayer for your beloved family. May God's peace, unity, and protection abide upon your household.${verseSuffix}`
        },
        {
          id: 'f2',
          title: 'Divine Guidance',
          body: `Dear ${memberName}, the Lord will direct the paths of you and your loved ones. We pray for harmony, joy, and the fullness of God's love to reign in your home.`
        }
      ];
    }

    if (key === 'provision') {
      return [
        {
          id: 'p1',
          title: 'Open Doors',
          body: `Dear ${memberName}, we are believing God for open doors and divine provision in your situation. May the Lord supply all your needs abundantly according to His riches in glory.${verseSuffix}`
        },
        {
          id: 'p2',
          title: 'Faith & Favor',
          body: `Dear ${memberName}, commit your way to the Lord; trust also in Him, and He will bring it to pass. Our pastors are praying for God's divine favor upon your endeavors.`
        }
      ];
    }

    // Default comfort & encouragement
    return [
      {
        id: 'g1',
        title: 'Assurance & Prayer',
        body: `Dear ${memberName}, our pastoral team has received your prayer request and we are upholding you in fervent prayer.${verseSuffix} The Lord is your shepherd and will never forsake you.`
      },
      {
        id: 'g2',
        title: 'Peace & Comfort',
        body: `Dear ${memberName}, may the peace of God which surpasses all understanding guard your heart and mind. Stand strong in the knowledge that God is working all things for your good.`
      },
      {
        id: 'g3',
        title: 'Breakthrough',
        body: `Dear ${memberName}, we agree with you in prayer today. What is impossible with man is possible with God. May you experience His miraculous grace and victory in your life.`
      }
    ];
  }

  /**
   * 4. AI Suggested Response Generator (Gemini + Groq fallback)
   */
  async fetchAIResponseSuggestions(
    prayerText: string,
    memberName = 'Beloved Member',
    category = '',
    selectedVerse?: PrayerVerse
  ): Promise<SuggestedResponse[]> {
    const geminiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
    const groqKey = process.env.EXPO_PUBLIC_GROQ_API_KEY;

    const verseNote = selectedVerse ? `Include/reference this encouraging Bible verse: ${selectedVerse.reference} ("${selectedVerse.verseEn}")` : '';

    const prompt = `You are a warm, compassionate church pastor writing a prayer response to a member.
Member Name: "${memberName}"
Category: "${category || 'General'}"
Member's Prayer Request: "${prayerText}"
${verseNote}

Generate 3 distinct, comforting, and faithful pastoral responses (2-3 sentences each).
Return ONLY valid JSON (no markdown formatting, no code fences, no extra words) formatted as:
[
  {
    "id": "resp1",
    "title": "Short Tone Title (e.g. Divine Peace & Assurance)",
    "body": "Pastoral response text addressing ${memberName} warmly..."
  },
  {
    "id": "resp2",
    "title": "Short Tone Title",
    "body": "Pastoral response text..."
  },
  {
    "id": "resp3",
    "title": "Short Tone Title",
    "body": "Pastoral response text..."
  }
]`;

    if (geminiKey) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 600 }
          }),
          signal: controller.signal
        });
        clearTimeout(timer);
        if (res.ok) {
          const json = await res.json();
          const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(cleaned);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch (geminiErr) {
        console.warn('⚠️ Gemini response suggestions failed, trying Groq fallback:', geminiErr);
      }
    }

    if (groqKey) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'qwen/qwen3.8-27b',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.4
          }),
          signal: controller.signal
        });
        clearTimeout(timer);
        if (res.ok) {
          const json = await res.json();
          const raw = json?.choices?.[0]?.message?.content || '';
          const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(cleaned);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch (groqErr) {
        console.warn('⚠️ Groq response suggestions fallback failed:', groqErr);
      }
    }

    return this.getInstantSuggestedResponses(memberName, category, selectedVerse?.reference);
  }

  /**
   * 5. Formats a Motivational Encouragement Message for Sharing
   */
  formatMotivationalMessage(
    memberName: string,
    prayerRequestText: string,
    verse: { reference: string; text?: string; textTe?: string },
    pastoralResponse?: string,
    churchName = 'Rhema Global Ministries'
  ): string {
    const cleanName = memberName || 'Beloved Member';
    const excerpt = prayerRequestText
      ? prayerRequestText.length > 80
        ? `${prayerRequestText.substring(0, 80)}...`
        : prayerRequestText
      : '';

    let msg = `🙏 *Greetings in Christ, ${cleanName}!* \n\n`;
    msg += `Our pastoral team at *${churchName}* has received and prayed over your request`;
    if (excerpt) {
      msg += `: _"${excerpt}"_`;
    }
    msg += `.\n\n`;

    if (verse && verse.reference) {
      msg += `📖 *Encouraging Scripture:*\n`;
      if (verse.text) {
        msg += `_"${verse.text.trim()}"_\n`;
      }
      if (verse.textTe && verse.textTe.trim() !== (verse.text || '').trim()) {
        msg += `_"${verse.textTe.trim()}"_\n`;
      }
      msg += `— *${verse.reference}*\n\n`;
    }

    if (pastoralResponse && pastoralResponse.trim()) {
      msg += `💬 *Pastoral Message:*\n${pastoralResponse.trim()}\n\n`;
    }

    msg += `_We continue to stand in agreement with you in prayer. May God's peace and grace surround you today!_\n`;
    msg += `— *Pastoral Care Team, ${churchName}*`;

    return msg;
  }

  /**
   * 6. Share Motivational Verse directly via WhatsApp
   */
  async shareViaWhatsApp(phone: string, message: string): Promise<boolean> {
    try {
      const cleanDigits = (phone || '').replace(/\D/g, '');
      let fullNumber = cleanDigits;
      if (cleanDigits.length === 10) {
        fullNumber = `91${cleanDigits}`;
      }

      const encoded = encodeURIComponent(message);
      const waUrl = fullNumber
        ? `whatsapp://send?phone=${fullNumber}&text=${encoded}`
        : `whatsapp://send?text=${encoded}`;

      const canOpen = await Linking.canOpenURL(waUrl);
      if (canOpen) {
        await Linking.openURL(waUrl);
        return true;
      } else {
        // Fallback to web link
        const webUrl = fullNumber
          ? `https://api.whatsapp.com/send?phone=${fullNumber}&text=${encoded}`
          : `https://api.whatsapp.com/send?text=${encoded}`;
        await Linking.openURL(webUrl);
        return true;
      }
    } catch (err) {
      console.warn('⚠️ WhatsApp share failed, falling back to native share sheet:', err);
      return this.shareNative('Encouraging Prayer Verse', message);
    }
  }

  /**
   * 7. Share Motivational Verse via Native System Share Sheet
   */
  async shareNative(title: string, message: string): Promise<boolean> {
    try {
      await Share.share({
        title: title || 'Encouraging Scripture & Prayer Response',
        message: message,
      });
      return true;
    } catch (err) {
      console.error('❌ Native share failed:', err);
      return false;
    }
  }
}

export default new PrayerVerseService();

