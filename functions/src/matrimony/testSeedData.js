import { Timestamp } from 'firebase-admin/firestore';
import { CONSENT_VERSION, DEFAULT_CHURCH_ID } from './constants.js';
export const TEST_MALE_AVATAR_URL = 'https://firebasestorage.googleapis.com/v0/b/rhema-global-ministries-matrimony/o/seed_avatars%2Fmale_default.jpg?alt=media&token=022d3de8-75b2-4f04-960d-12ba0491e64a';
export const TEST_FEMALE_AVATAR_URL = 'https://firebasestorage.googleapis.com/v0/b/rhema-global-ministries-matrimony/o/seed_avatars%2Ffemale_default.jpg?alt=media&token=326f2260-74fd-43b4-b054-24a25f40bd20';
const LOCATION_CLUSTERS_50 = [
    {
        state: 'Telangana',
        primaryCity: 'Hyderabad',
        otherCities: ['Warangal', 'Karimnagar', 'Nizamabad', 'Khammam', 'Nalgonda'],
        districtMap: {
            Hyderabad: 'Hyderabad',
            Warangal: 'Hanumakonda',
            Karimnagar: 'Karimnagar',
            Nizamabad: 'Nizamabad',
            Khammam: 'Khammam',
            Nalgonda: 'Nalgonda',
        },
        mandalMap: {
            Hyderabad: 'Secunderabad',
            Warangal: 'Kazipet',
            Karimnagar: 'Karimnagar Urban',
            Nizamabad: 'Nizamabad North',
            Khammam: 'Khammam Urban',
            Nalgonda: 'Nalgonda Urban',
        },
        pincodePrefix: '500',
        motherTongue: 'Telugu',
        localLanguages: ['Telugu', 'English', 'Hindi'],
    },
    {
        state: 'Andhra Pradesh',
        primaryCity: 'Vijayawada',
        otherCities: ['Visakhapatnam', 'Guntur', 'Tirupati', 'Rajahmundry', 'Kakinada'],
        districtMap: {
            Vijayawada: 'NTR',
            Visakhapatnam: 'Visakhapatnam',
            Guntur: 'Guntur',
            Tirupati: 'Tirupati',
            Rajahmundry: 'East Godavari',
            Kakinada: 'Kakinada',
        },
        mandalMap: {
            Vijayawada: 'Vijayawada Central',
            Visakhapatnam: 'MVP Colony',
            Guntur: 'Guntur East',
            Tirupati: 'Tirupati Urban',
            Rajahmundry: 'Rajahmundry Urban',
            Kakinada: 'Kakinada Urban',
        },
        pincodePrefix: '520',
        motherTongue: 'Telugu',
        localLanguages: ['Telugu', 'English', 'Hindi'],
    },
    {
        state: 'Karnataka',
        primaryCity: 'Bengaluru',
        otherCities: ['Mysuru', 'Mangaluru', 'Hubballi', 'Belagavi', 'Udupi'],
        districtMap: {
            Bengaluru: 'Bengaluru Urban',
            Mysuru: 'Mysuru',
            Mangaluru: 'Dakshina Kannada',
            Hubballi: 'Dharwad',
            Belagavi: 'Belagavi',
            Udupi: 'Udupi',
        },
        mandalMap: {
            Bengaluru: 'Bengaluru East',
            Mysuru: 'Mysuru North',
            Mangaluru: 'Mangaluru North',
            Hubballi: 'Hubballi Urban',
            Belagavi: 'Belagavi Urban',
            Udupi: 'Udupi Taluk',
        },
        pincodePrefix: '560',
        motherTongue: 'Kannada',
        localLanguages: ['Kannada', 'English', 'Hindi'],
    },
    {
        state: 'Tamil Nadu',
        primaryCity: 'Chennai',
        otherCities: ['Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem', 'Vellore'],
        districtMap: {
            Chennai: 'Chennai',
            Coimbatore: 'Coimbatore',
            Madurai: 'Madurai',
            Tiruchirappalli: 'Tiruchirappalli',
            Salem: 'Salem',
            Vellore: 'Vellore',
        },
        mandalMap: {
            Chennai: 'Anna Nagar',
            Coimbatore: 'RS Puram',
            Madurai: 'Madurai North',
            Tiruchirappalli: 'Srirangam',
            Salem: 'Salem West',
            Vellore: 'Katpadi',
        },
        pincodePrefix: '600',
        motherTongue: 'Tamil',
        localLanguages: ['Tamil', 'English'],
    },
    {
        state: 'Maharashtra',
        primaryCity: 'Mumbai',
        otherCities: ['Pune', 'Nagpur', 'Nashik', 'Thane', 'Aurangabad'],
        districtMap: {
            Mumbai: 'Mumbai Suburban',
            Pune: 'Pune',
            Nagpur: 'Nagpur',
            Nashik: 'Nashik',
            Thane: 'Thane',
            Aurangabad: 'Chhatrapati Sambhajinagar',
        },
        mandalMap: {
            Mumbai: 'Andheri West',
            Pune: 'Kothrud',
            Nagpur: 'Dharampeth',
            Nashik: 'Nashik Road',
            Thane: 'Thane West',
            Aurangabad: 'CIDCO',
        },
        pincodePrefix: '400',
        motherTongue: 'Marathi',
        localLanguages: ['Marathi', 'Hindi', 'English'],
    },
];
const LOCATION_CLUSTERS_30 = [
    {
        state: 'Kerala',
        primaryCity: 'Kochi',
        otherCities: ['Thiruvananthapuram', 'Thrissur', 'Kottayam', 'Kozhikode', 'Alappuzha'],
        districtMap: {
            Kochi: 'Ernakulam',
            Thiruvananthapuram: 'Thiruvananthapuram',
            Thrissur: 'Thrissur',
            Kottayam: 'Kottayam',
            Kozhikode: 'Kozhikode',
            Alappuzha: 'Alappuzha',
        },
        mandalMap: {
            Kochi: 'Edappally',
            Thiruvananthapuram: 'Kazhakkoottam',
            Thrissur: 'Thrissur East',
            Kottayam: 'Kottayam Town',
            Kozhikode: 'Nadakkavu',
            Alappuzha: 'Ambalappuzha',
        },
        pincodePrefix: '682',
        motherTongue: 'Malayalam',
        localLanguages: ['Malayalam', 'English', 'Hindi'],
    },
    {
        state: 'Gujarat',
        primaryCity: 'Ahmedabad',
        otherCities: ['Surat', 'Vadodara', 'Rajkot', 'Gandhinagar', 'Anand'],
        districtMap: {
            Ahmedabad: 'Ahmedabad',
            Surat: 'Surat',
            Vadodara: 'Vadodara',
            Rajkot: 'Rajkot',
            Gandhinagar: 'Gandhinagar',
            Anand: 'Anand',
        },
        mandalMap: {
            Ahmedabad: 'Navrangpura',
            Surat: 'Adajan',
            Vadodara: 'Alkapuri',
            Rajkot: 'Kalawad Road',
            Gandhinagar: 'Sector 21',
            Anand: 'Vidyanagar',
        },
        pincodePrefix: '380',
        motherTongue: 'Gujarati',
        localLanguages: ['Gujarati', 'Hindi', 'English'],
    },
    LOCATION_CLUSTERS_50[0],
];
const MALE_FIRST_NAMES = [
    'Samuel', 'Daniel', 'Joshua', 'Caleb', 'Nathan',
    'Joel', 'Aaron', 'David', 'Jonathan', 'Benjamin',
    'Ethan', 'Isaac', 'Noah', 'Elijah', 'Matthew',
    'Timothy', 'Andrew', 'Stephen', 'Philip', 'Luke',
    'Gideon', 'Micah', 'Asher', 'Simon', 'Peter',
    'Emmanuel', 'Abraham', 'Joseph', 'Thomas', 'Paul',
    'Mark', 'Jacob', 'Ezra', 'Levi', 'Reuben',
    'Zachariah', 'Jeremiah', 'Solomon', 'Titus', 'Silas',
];
const FEMALE_FIRST_NAMES = [
    'Hannah', 'Grace', 'Sarah', 'Rebecca', 'Esther',
    'Rachel', 'Ruth', 'Miriam', 'Naomi', 'Lydia',
    'Deborah', 'Abigail', 'Elizabeth', 'Mary', 'Martha',
    'Phoebe', 'Priscilla', 'Sharon', 'Joanna', 'Leah',
    'Chloe', 'Faith', 'Hope', 'Joy', 'Mercy',
    'Tabitha', 'Susanna', 'Bethany', 'Evangeline', 'Gloria',
    'Angel', 'Blessy', 'Steffi', 'Christina', 'Sophia',
    'Nadia', 'Rachelle', 'Beulah', 'Shalom', 'Hephzibah',
];
const LAST_NAMES = [
    'Kolluri', 'Reddy', 'Mathew', 'Varghese', 'Rao',
    'Prasad', 'Thomas', 'George', 'Chacko', 'DSouza',
    'Fernandes', 'Paul', 'Sundar', 'Nadar', 'Samuel',
    'Joseph', 'John', 'Abraham', 'Kulkarni', 'Deshmukh',
    'Nair', 'Menon', 'Patel', 'Sharma', 'Pillai',
];
const EDUCATION_PROFILES = [
    {
        qualification: 'B.Tech. - Bachelor of Technology',
        specialization: 'Computer Science & Engineering',
        college: 'JNTU / NIT Campus',
        employmentType: 'Private',
        occupationCategory: 'IT & Software',
        profession: 'Software Professional',
        organization: 'Infosys Technologies',
        incomeRange: '₹ 12 Lakhs to 14 Lakhs',
    },
    {
        qualification: 'M.Tech. - Master of Technology',
        specialization: 'Data Science & AI',
        college: 'IIIT Hyderabad',
        employmentType: 'Private',
        occupationCategory: 'IT & Software',
        profession: 'Data Scientist',
        organization: 'Microsoft India',
        incomeRange: '₹ 20 Lakhs to 25 Lakhs',
    },
    {
        qualification: 'MBBS - Bachelor of Medicine and Bachelor of Surgery',
        specialization: 'General Medicine',
        college: 'Christian Medical College (CMC)',
        employmentType: 'Private',
        occupationCategory: 'Medical & Healthcare',
        profession: 'Doctor',
        organization: 'Apollo Hospitals',
        incomeRange: '₹ 16 Lakhs to 18 Lakhs',
    },
    {
        qualification: 'MBA - Master of Business Administration',
        specialization: 'Finance & Strategy',
        college: 'Symbiosis Institute of Business Management',
        employmentType: 'Private',
        occupationCategory: 'Banking & Finance',
        profession: 'Financial Analyst / Planning',
        organization: 'Deloitte Consulting',
        incomeRange: '₹ 14 Lakhs to 16 Lakhs',
    },
    {
        qualification: 'B.Sc. Nursing',
        specialization: 'Critical Care Nursing',
        college: 'St. John’s College of Nursing',
        employmentType: 'Private',
        occupationCategory: 'Medical & Healthcare',
        profession: 'Nurse',
        organization: 'Manipal Hospital',
        incomeRange: '₹ 5 Lakhs to 6 Lakhs',
    },
    {
        qualification: 'B.E. - Bachelor of Engineering',
        specialization: 'Electronics & Communication',
        college: 'PSG College of Technology',
        employmentType: 'Private',
        occupationCategory: 'Engineering',
        profession: 'Electronics / Telecom Engineer',
        organization: 'Qualcomm India',
        incomeRange: '₹ 10 Lakhs to 12 Lakhs',
    },
    {
        qualification: 'CA - Chartered Accountant',
        specialization: 'Audit & Taxation',
        college: 'ICAI',
        employmentType: 'Self employed',
        occupationCategory: 'Banking & Finance',
        profession: 'Chartered Accountant',
        organization: 'Independent Practice',
        incomeRange: '₹ 18 Lakhs to 20 Lakhs',
    },
    {
        qualification: 'M.Sc. - Master of Science',
        specialization: 'Biotechnology',
        college: 'University of Hyderabad',
        employmentType: 'Government / PSU',
        occupationCategory: 'Education & Training',
        profession: 'Research Scholar',
        organization: 'CCMB / Life Sciences Lab',
        incomeRange: '₹ 7 Lakhs to 8 Lakhs',
    },
    {
        qualification: 'B.Ed. - Bachelor of Education',
        specialization: 'English & Social Studies',
        college: 'Loyola College of Education',
        employmentType: 'Private',
        occupationCategory: 'Education & Training',
        profession: 'Teaching / Academician',
        organization: 'St. Mary’s Public School',
        incomeRange: '₹ 4 Lakhs to 5 Lakhs',
    },
    {
        qualification: 'MCA - Master of Computer Applications',
        specialization: 'Cloud & Full Stack',
        college: 'Christ University',
        employmentType: 'Private',
        occupationCategory: 'IT & Software',
        profession: 'UI / UX Designer',
        organization: 'TCS Digital',
        incomeRange: '₹ 9 Lakhs to 10 Lakhs',
    },
    {
        qualification: 'B.Arch. - Bachelor of Architecture',
        specialization: 'Sustainable Architecture',
        college: 'SPA / Manipal School of Architecture',
        employmentType: 'Business',
        occupationCategory: 'Architecture & Design',
        profession: 'Architect',
        organization: 'Grace Design Studio',
        incomeRange: '₹ 10 Lakhs to 12 Lakhs',
    },
    {
        qualification: 'B.Th. / M.Div. - Theology',
        specialization: 'Christian Ministry & Leadership',
        college: 'SAIACS Bengaluru',
        employmentType: 'Private',
        occupationCategory: 'Ministry & Non-Profit',
        profession: 'Pastor / Ministry Worker',
        organization: 'Rhema Global Ministries',
        incomeRange: '₹ 4 Lakhs to 5 Lakhs',
    },
];
const DENOMINATIONS = [
    'Rhema Global Ministries',
    'Pentecostal',
    'Evangelical',
    'Baptist',
    'Church of South India (CSI)',
    'Full Gospel',
    'Born Again',
    'Non-Denominational',
];
const DIVISIONS = [
    'Others',
    "Don't wish to specify",
    'Anglo Indian',
    'Nadar',
    'Kamma',
    'Reddy',
    'Mala',
    'Madiga',
];
const RELIGIOUS_VALUES = ['Very religious', 'Religious', 'Spiritual', 'Traditional', 'Moderate'];
const FAMILY_TYPES = ['Nuclear', 'Joint', 'Extended'];
const FAMILY_STATUSES = ['Middle Class', 'Upper Middle Class', 'Rich / Affluent'];
const FAMILY_VALUES = ['Traditional', 'Moderate', 'Orthodox', 'Liberal'];
const HOBBIES_POOL = [
    'Singing', 'Photography', 'Cooking', 'Travel', 'Volunteer Work',
    'Playing Musical Instruments', 'Gardening / Landscaping', 'Social Service',
    'Baking', 'Book Clubs', 'Technology', 'Painting / Sketching / Drawing',
];
const MUSIC_POOL = ['Christian / Gospel', 'Devotional', 'Classical - Carnatic', 'Melodies', 'Classical', 'Acoustic'];
const READING_POOL = ['Philosophy / Spiritual', 'Autobiographies / Biographies', 'Self-Help', 'History', 'Classics', 'Literature'];
const MOVIES_POOL = ['Documentaries', 'Classics', 'Drama', 'Comedy', 'Sci-Fi', 'Short Films'];
const SPORTS_POOL = ['Badminton', 'Cricket', 'Cycling', 'Jogging / Walking / Running', 'Table Tennis', 'Swimming / Water Sports'];
const FOOD_POOL = ['South Indian', 'North Indian', 'Continental', 'Chinese', 'Italian', 'Thai'];
const CHURCH_SKILLS = [
    'Worship Leader', 'Vocalist / Singer', 'Acoustic Guitar', 'Keyboard / Piano',
    'Sound Engineer (FOH)', 'Live Streaming / Broadcast', 'Media / Lyrics Projection',
    'Bible Study Teacher', 'Sunday School Teacher', 'Youth Ministry Leader',
    'Usher / Greeter', 'Food & Hospitality (FMH)', 'Event Coordinator / Planner',
    'Administration / Finance', 'Intercessory Prayer Leader', 'Outreach / Visitation Team',
];
const FATHER_OCCUPATIONS = [
    'Retired Government Officer', 'Business Owner', 'Pastor / Ministry Elder',
    'Senior Bank Manager', 'Civil Engineer', 'School Principal', 'Agricultural Landowner',
];
const MOTHER_OCCUPATIONS = [
    'Homemaker', 'School Teacher', 'Staff Nurse', 'Bank Officer',
    'Social Worker', 'College Lecturer', 'Boutique Owner',
];
const ABOUT_ME_TEMPLATES = [
    'Born-again believer actively serving at Rhema Global Ministries. Family-oriented, grounded in prayer, and passionate about balancing career growth with church fellowship.',
    'God-fearing, warm, and optimistic person who enjoys gospel music, community outreach, and meaningful conversations. Looking for a Christ-centered partnership built on grace and mutual respect.',
    'Professionally focused yet deeply committed to faith and family values. I love volunteering in church ministry, traveling with family, and living a simple, purposeful life.',
    'Joyful, compassionate, and hardworking individual raised in a loving Christian home. Seeking a life partner who shares strong biblical values and supports each other in every season.',
];
const EXPECTATIONS_TEMPLATES = [
    'Looking for a kind-hearted, God-fearing life partner who respects family values, enjoys church fellowship, and builds a peaceful, joyful Christian home together.',
    'Seeking a well-educated, grounded believer with a positive outlook on life, strong integrity, and commitment to growing together in faith and purpose.',
    'Prefer someone compassionate, honest, and family-oriented who values open communication, mutual support, and shared spiritual growth.',
];
const MEMBERSHIP_TIERS = [
    { tier: 'free', planName: 'Free', amountInr: 0, durationMonths: 0 },
    { tier: 'silver', planName: 'Silver', amountInr: 1, durationMonths: 3 },
    { tier: 'gold', planName: 'Gold', amountInr: 2, durationMonths: 6 },
    { tier: 'platinum', planName: 'Platinum', amountInr: 3, durationMonths: 12 },
];
function pick(arr, idx) {
    return arr[((idx % arr.length) + arr.length) % arr.length];
}
function pickSlice(arr, start, count) {
    const out = [];
    for (let i = 0; i < count; i++) {
        out.push(pick(arr, start + i));
    }
    return Array.from(new Set(out));
}
function pad3(n) {
    return String(n).padStart(3, '0');
}
function computeDobFromAge(age, seed) {
    const now = new Date();
    const birthYear = now.getUTCFullYear() - age;
    const month = ((seed * 3) % 12) + 1;
    const day = ((seed * 7) % 27) + 1;
    return `${birthYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
export function buildTestUserBatch(options) {
    const { count, startSequence, batchLabel } = options;
    const clusters = count === 50 ? LOCATION_CLUSTERS_50 : LOCATION_CLUSTERS_30;
    const users = [];
    let seqOffset = 0;
    let maleIdx = startSequence;
    let femaleIdx = startSequence;
    for (let cIdx = 0; cIdx < clusters.length; cIdx++) {
        const cluster = clusters[cIdx];
        const primaryMaleCount = cIdx % 2 === 0 ? 3 : 2;
        const primaryFemaleCount = 5 - primaryMaleCount;
        const otherMaleCount = 5 - primaryMaleCount;
        const otherFemaleCount = 5 - primaryFemaleCount;
        const slots = [];
        for (let i = 0; i < primaryMaleCount; i++)
            slots.push({ gender: 'Male', city: cluster.primaryCity });
        for (let i = 0; i < primaryFemaleCount; i++)
            slots.push({ gender: 'Female', city: cluster.primaryCity });
        for (let i = 0; i < otherMaleCount; i++) {
            slots.push({ gender: 'Male', city: pick(cluster.otherCities, i) });
        }
        for (let i = 0; i < otherFemaleCount; i++) {
            slots.push({ gender: 'Female', city: pick(cluster.otherCities, i + otherMaleCount) });
        }
        for (let sIdx = 0; sIdx < slots.length; sIdx++) {
            const slot = slots[sIdx];
            const seq = startSequence + seqOffset;
            seqOffset += 1;
            const isMale = slot.gender === 'Male';
            const genderCounter = isMale ? maleIdx++ : femaleIdx++;
            const uid = `test_rhema_${String(seq).padStart(4, '0')}`;
            const last10Phone = String(9000010000 + seq);
            const phone = `+91${last10Phone}`;
            const memberCode = `Rhema-T${pad3(seq)}`;
            const matrimonyId = `RMT${pad3(seq)}`;
            const firstName = isMale
                ? pick(MALE_FIRST_NAMES, genderCounter - 1)
                : pick(FEMALE_FIRST_NAMES, genderCounter - 1);
            const lastName = pick(LAST_NAMES, seq + cIdx);
            const fullName = `${firstName} ${lastName}`;
            const email = `test.rhema.${pad3(seq)}@rhema-test.local`;
            const age = isMale ? 24 + (seq % 12) : 22 + (seq % 12);
            const dob = computeDobFromAge(age, seq);
            const heightCm = isMale ? 168 + (seq % 18) : 154 + (seq % 15);
            let maritalStatus = 'Never Married';
            let anniversaryDate = '';
            let numberOfChildren = 'None';
            if (seq % 17 === 0) {
                maritalStatus = 'Divorced';
                anniversaryDate = `${new Date().getUTCFullYear() - 5}-05-14`;
                numberOfChildren = seq % 34 === 0 ? '1' : 'None';
            }
            else if (seq % 23 === 0) {
                maritalStatus = 'Widowed';
                anniversaryDate = `${new Date().getUTCFullYear() - 4}-11-20`;
                numberOfChildren = 'None';
            }
            const physicalStatus = seq % 29 === 0 ? 'Physically challenged' : 'Normal';
            const isBaptized = seq % 7 !== 0;
            const baptismDate = isBaptized ? `${new Date().getUTCFullYear() - 6}-04-12` : '';
            const baptismChurch = isBaptized ? `Rhema Global Ministries, ${slot.city}` : '';
            const edu = pick(EDUCATION_PROFILES, seq + cIdx);
            const denomination = seq % 3 === 0 ? 'Rhema Global Ministries' : pick(DENOMINATIONS, seq);
            const division = pick(DIVISIONS, seq + 2);
            const religiousValues = pick(RELIGIOUS_VALUES, seq);
            const familyType = pick(FAMILY_TYPES, seq);
            const familyStatus = pick(FAMILY_STATUSES, seq + 1);
            const familyValues = pick(FAMILY_VALUES, seq + 2);
            const eatingHabits = seq % 6 === 0 ? 'Vegetarian' : seq % 9 === 0 ? 'Eggetarian' : 'Non-Vegetarian';
            const smokingHabits = 'No';
            const drinkingHabits = seq % 10 === 0 ? 'Occasionally' : 'No';
            const brothersCount = seq % 3;
            const sistersCount = (seq + 1) % 3;
            const brothersStr = brothersCount === 0 ? 'None' : String(brothersCount);
            const sistersStr = sistersCount === 0 ? 'None' : String(sistersCount);
            const brothersMarriedStr = brothersCount === 0 ? 'None' : brothersCount === 2 && seq % 2 === 0 ? '1' : 'None';
            const sistersMarriedStr = sistersCount === 0 ? 'None' : sistersCount >= 1 && seq % 2 === 1 ? '1' : 'None';
            const fatherOccupation = pick(FATHER_OCCUPATIONS, seq);
            const motherOccupation = pick(MOTHER_OCCUPATIONS, seq + 1);
            const district = cluster.districtMap[slot.city] || slot.city;
            const mandal = cluster.mandalMap[slot.city] || slot.city;
            const street = `${10 + (seq % 89)} Grace Avenue, ${mandal}`;
            const pincode = `${cluster.pincodePrefix}${String(10 + (seq % 80)).padStart(3, '0')}`;
            const avatarUrl = isMale ? TEST_MALE_AVATAR_URL : TEST_FEMALE_AVATAR_URL;
            const primarySkill = pick(CHURCH_SKILLS, seq);
            const secondarySkill = pick(CHURCH_SKILLS, seq + 5);
            const interests = {
                hobbies: pickSlice(HOBBIES_POOL, seq, 3),
                music: pickSlice(MUSIC_POOL, seq, 2),
                reading: pickSlice(READING_POOL, seq, 2),
                movies: pickSlice(MOVIES_POOL, seq, 2),
                sports: pickSlice(SPORTS_POOL, seq, 2),
                food: pickSlice(FOOD_POOL, seq, 2),
                languages: cluster.localLanguages,
            };
            const ageDays = seqOffset % 20;
            const createdDate = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000);
            const createdTs = Timestamp.fromDate(createdDate);
            const createdIso = createdDate.toISOString();
            const tierCfg = pick(MEMBERSHIP_TIERS, seq);
            const membershipInfo = tierCfg.tier === 'free'
                ? { tier: 'free', planName: 'Free', status: 'active' }
                : {
                    tier: tierCfg.tier,
                    planName: tierCfg.planName,
                    status: 'active',
                    amountInr: tierCfg.amountInr,
                    durationMonths: tierCfg.durationMonths,
                    validUntilMs: Date.now() + tierCfg.durationMonths * 30 * 24 * 60 * 60 * 1000,
                };
            const managedBy = seq % 5 === 0 ? 'guardian' : 'self';
            // Logical Partner Preferences with deliberate "Any" / "Doesn't matter" subsets
            const useAnyPreferences = seq % 3 === 0;
            const useMixedAny = seq % 2 === 0;
            const prefAgeMin = isMale ? Math.max(18, age - 6) : Math.max(20, age - 1);
            const prefAgeMax = isMale ? Math.min(45, age + 2) : Math.min(48, age + 7);
            const prefHeightMin = isMale ? 148 : Math.max(160, heightCm);
            const prefHeightMax = isMale ? Math.min(180, heightCm + 2) : 196;
            const nextEducation = pick(EDUCATION_PROFILES, seq + 1);
            const prefEducationAcceptable = useAnyPreferences
                ? []
                : [edu.qualification, nextEducation.qualification];
            const prefMotherTongue = useAnyPreferences || useMixedAny ? 'Any' : cluster.motherTongue;
            const prefDenomination = useAnyPreferences ? 'Any' : denomination;
            const prefDivision = useAnyPreferences || useMixedAny ? 'Any' : "Don't wish to specify";
            const prefEmployedIn = useAnyPreferences ? 'Any' : edu.employmentType;
            const prefOccupation = useAnyPreferences || useMixedAny ? 'Any' : edu.profession;
            const prefAnnualIncome = useAnyPreferences || useMixedAny ? 'Any' : '₹ 5 Lakhs to 6 Lakhs';
            const prefCitizenship = useAnyPreferences ? 'Any' : 'Indian';
            const prefCountries = useAnyPreferences ? [] : ['India'];
            const prefStates = useAnyPreferences
                ? []
                : seq % 4 === 0
                    ? [cluster.state, pick(LOCATION_CLUSTERS_50, cIdx + 1).state]
                    : [cluster.state];
            const prefCities = useAnyPreferences || useMixedAny ? [] : [slot.city];
            const prefMaritalStatuses = maritalStatus !== 'Never Married'
                ? ['Never Married', maritalStatus]
                : useAnyPreferences
                    ? []
                    : ['Never Married'];
            const aboutMe = pick(ABOUT_ME_TEMPLATES, seq);
            const partnerExpectations = pick(EXPECTATIONS_TEMPLATES, seq);
            const familyIntro = `We are a close-knit ${familyType.toLowerCase()} Christian family from ${slot.city}, ${cluster.state}, rooted in faith, humility, and church service.`;
            const memberDoc = {
                id: uid,
                uid,
                firstName,
                lastName,
                name: fullName,
                displayName: fullName,
                fullName,
                phone,
                normalizedPhone10: last10Phone,
                email,
                gender: slot.gender,
                dob,
                maritalStatus,
                anniversaryDate,
                numberOfChildren,
                baptized: isBaptized ? 'Yes' : 'No',
                baptismDate,
                baptismChurch,
                churchName: 'Rhema Global Ministries',
                street,
                mailingStreet: street,
                mandal,
                city: slot.city,
                village: slot.city,
                mailingCity: slot.city,
                district,
                state: cluster.state,
                mailingState: cluster.state,
                zip: pincode,
                nationality: 'Indian',
                motherTongue: cluster.motherTongue,
                primarySkill,
                secondarySkill,
                primarySkills: [primarySkill],
                secondarySkills: [secondarySkill],
                userType: 'Member',
                role: 'Member',
                status: 'Active',
                isGuest: false,
                churchId: DEFAULT_CHURCH_ID,
                primaryChurchId: DEFAULT_CHURCH_ID,
                joinDate: createdIso,
                approvedAt: createdIso,
                approvedByUid: 'system_seed',
                approvedByName: 'Church Admin',
                memberCode,
                onboardingComplete: true,
                photoURL: avatarUrl,
                profilePhoto: avatarUrl,
                isTestUser: true,
                testBatch: batchLabel,
                testSequence: seq,
            };
            const phoneIndexDoc = {
                last10: last10Phone,
                canonicalPhone: phone,
                memberDocId: uid,
                churchId: DEFAULT_CHURCH_ID,
                userType: 'Member',
                isTestUser: true,
                testBatch: batchLabel,
                updatedAt: createdTs,
            };
            const registrationRequestDoc = {
                id: last10Phone,
                authUid: uid,
                firstName,
                lastName,
                fullName,
                phone,
                email,
                dob,
                gender: slot.gender,
                maritalStatus,
                anniversaryDate,
                numberOfChildren,
                baptized: isBaptized ? 'Yes' : 'No',
                baptismDate,
                baptismChurch,
                churchName: 'Rhema Global Ministries',
                street,
                mandal,
                village: slot.city,
                city: slot.city,
                district,
                state: cluster.state,
                zip: pincode,
                nationality: 'Indian',
                status: 'approved',
                createdAt: createdIso,
                updatedAt: createdIso,
                reviewedByUid: 'system_seed',
                reviewedByName: 'Church Admin',
                reviewedAt: createdIso,
                churchId: DEFAULT_CHURCH_ID,
                isTestUser: true,
                testBatch: batchLabel,
            };
            const globalUserDoc = {
                uid,
                name: fullName,
                firstName,
                lastName,
                email,
                phone,
                primaryChurchId: DEFAULT_CHURCH_ID,
                isTestUser: true,
                testBatch: batchLabel,
                createdAt: createdTs,
            };
            const matrimonyProfileDoc = {
                uid,
                churchId: DEFAULT_CHURCH_ID,
                matrimonyId,
                displayName: fullName,
                gender: slot.gender,
                age,
                heightCm,
                maritalStatus,
                numberOfChildren,
                physicalStatus,
                motherTongue: cluster.motherTongue,
                aboutMe,
                location: {
                    country: 'India',
                    state: cluster.state,
                    city: slot.city,
                    village: slot.city,
                    pincode,
                    citizenship: 'Indian',
                },
                education: {
                    qualification: edu.qualification,
                    specialization: edu.specialization,
                    college: edu.college,
                },
                career: {
                    occupationCategory: edu.occupationCategory,
                    employmentType: edu.employmentType,
                    profession: edu.profession,
                    organization: edu.organization,
                    workLocation: slot.city,
                },
                familySummary: {
                    familyType,
                    familyStatus,
                    familyValues,
                },
                faithSummary: {
                    religion: 'Christian',
                    denomination,
                    division,
                    openToAnyDivision: seq % 2 === 0,
                    religiousValues,
                    baptized: isBaptized,
                    baptismChurch: baptismChurch || null,
                    shareFaithDetails: true,
                },
                habits: {
                    eatingHabits,
                    smokingHabits,
                    drinkingHabits,
                },
                interests,
                profilePhoto: avatarUrl,
                gallery: [],
                photoVisibility: 'approved_members',
                profileStatus: 'approved',
                onboardingStage: 'completed',
                approvalType: 'manual_admin',
                verificationStatus: 'verified',
                visibility: 'discoverable',
                profileCompletion: 90,
                membership: membershipInfo,
                isTestUser: true,
                testBatch: batchLabel,
                testSequence: seq,
                createdAt: createdTs,
                submittedAt: createdTs,
                approvedAt: createdTs,
                updatedAt: createdTs,
            };
            const matrimonyPrivateDoc = {
                uid,
                fullLegalName: fullName,
                dob,
                personalEmail: email,
                phoneNumber: phone,
                address: {
                    street,
                    city: slot.city,
                    state: cluster.state,
                    country: 'India',
                    zip: pincode,
                },
                profileManager: {
                    type: managedBy,
                    guardianUid: null,
                },
                consent: {
                    profilePublication: true,
                    matchmaking: true,
                    communication: true,
                    consentVersion: CONSENT_VERSION,
                    updatedAt: createdTs,
                },
                incomeDetails: {
                    currency: 'INR - India',
                    annualIncomeRange: edu.incomeRange,
                    visibility: 'private',
                },
                familyDetails: {
                    familyIntro,
                    shareFamilyIntro: true,
                    fatherOccupation,
                    motherOccupation,
                    familyOrigin: `${slot.city}, ${cluster.state}`,
                    brothers: brothersStr,
                    sisters: sistersStr,
                    brothersMarried: brothersMarriedStr,
                    sistersMarried: sistersMarriedStr,
                },
                isTestUser: true,
                testBatch: batchLabel,
                updatedAt: createdTs,
            };
            const matrimonyPrefsDoc = {
                uid,
                age: {
                    min: prefAgeMin,
                    max: prefAgeMax,
                    importance: seq % 4 === 0 ? 'essential' : seq % 2 === 0 ? 'preferred' : 'flexible',
                },
                height: {
                    minCm: prefHeightMin,
                    maxCm: prefHeightMax,
                    importance: seq % 5 === 0 ? 'preferred' : 'flexible',
                },
                maritalStatuses: prefMaritalStatuses,
                haveChildren: maritalStatus === 'Never Married' ? 'No' : "Doesn't matter",
                physicalStatus: useAnyPreferences ? "Doesn't matter" : 'Normal',
                motherTongue: prefMotherTongue,
                denomination: prefDenomination,
                division: prefDivision,
                education: {
                    acceptable: prefEducationAcceptable,
                    importance: useAnyPreferences ? 'flexible' : seq % 3 === 1 ? 'preferred' : 'flexible',
                },
                employedIn: prefEmployedIn,
                occupation: prefOccupation,
                annualIncome: prefAnnualIncome,
                citizenship: prefCitizenship,
                locations: {
                    preferredCountries: prefCountries,
                    preferredStates: prefStates,
                    preferredCities: prefCities,
                    openToRelocation: useAnyPreferences || seq % 2 === 0,
                },
                eatingHabits: useAnyPreferences ? "Doesn't matter" : eatingHabits,
                drinkingHabits: useAnyPreferences ? "Doesn't matter" : 'No',
                smokingHabits: useAnyPreferences ? "Doesn't matter" : 'No',
                partnerExpectations,
                isTestUser: true,
                testBatch: batchLabel,
                updatedAt: createdTs,
            };
            const matrimonyVerificationDoc = {
                uid,
                churchId: DEFAULT_CHURCH_ID,
                membership: { status: 'verified', verifiedAt: createdTs },
                ageVerification: {
                    status: 'verified_from_member_record',
                    age,
                    verifiedAt: createdTs,
                },
                automatedChecks: {
                    duplicateCheck: 'passed',
                    accountCheck: 'passed',
                    riskStatus: 'low',
                },
                approval: {
                    status: 'approved',
                    type: 'manual_review',
                    reviewedBy: 'system_seed',
                    reviewedAt: createdTs,
                    rejectionReason: null,
                },
                isTestUser: true,
                testBatch: batchLabel,
                updatedAt: createdTs,
            };
            const matrimonyAdminProfileDoc = {
                ...matrimonyProfileDoc,
                privateInfo: matrimonyPrivateDoc,
                preferences: matrimonyPrefsDoc,
                verification: matrimonyVerificationDoc,
                syncedAt: createdTs,
            };
            users.push({
                uid,
                sequence: seq,
                last10Phone,
                memberDoc,
                phoneIndexDoc,
                registrationRequestDoc,
                globalUserDoc,
                matrimonyProfileDoc,
                matrimonyPrivateDoc,
                matrimonyPrefsDoc,
                matrimonyVerificationDoc,
                matrimonyAdminProfileDoc,
            });
        }
    }
    return users;
}
//# sourceMappingURL=testSeedData.js.map