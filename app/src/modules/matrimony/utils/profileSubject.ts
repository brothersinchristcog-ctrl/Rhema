import { MatrimonyPendingRegistrationDraft, StartRegistrationResponse } from '../types/matrimony';

export interface ProfileSubjectCopy {
  isFamily: boolean;
  relationLabel: string;
  relationLower: string;
  possessive: string;
  possessiveCap: string;
  shortOwnerCap: string;
  subject: string;
  subjectCap: string;
  forBadgeText: string | null;
  baptizedQuestion: string;
  motherTongueLabel: string;
  motherTonguePlaceholder: string;
  basicCardTitle: string;
  basicSubtitle: string;
  fullNamePlaceholder: string;
  emailPlaceholder: string;
  phonePlaceholder: string;
  nameRequiredMsg: string;
  genderQuestion: string;
  genderRequiredMsg: string;
  dobQuestion: string;
  dobAgeRequiredMsg: string;
  agePrefix: string;
  heightQuestion: string;
  heightPlaceholder: string;
  heightRequiredMsg: string;
  physicalStatusQuestion: string;
  maritalStatusQuestion: string;
  religionQuestion: string;
  religionPlaceholder: string;
  religionRequiredMsg: string;
  denominationQuestion: string;
  denominationPlaceholder: string;
  denominationRequiredMsg: string;
  divisionQuestion: string;
  divisionPlaceholder: string;
  countryQuestion: string;
  countryRequiredMsg: string;
  stateQuestion: string;
  statePlaceholder: string;
  stateRequiredMsg: string;
  villageQuestion: string;
  villagePlaceholder: string;
  pincodeQuestion: string;
  educationLabel: string;
  educationPlaceholder: string;
  educationRequiredMsg: string;
  employmentLabel: string;
  employmentPlaceholder: string;
  employmentRequiredMsg: string;
  occupationLabel: string;
  occupationPlaceholder: string;
  occupationRequiredMsg: string;
  orgWorkPhrase: string;
  currencyLabel: string;
  incomeLabel: string;
  incomePlaceholder: string;
  familyStatusQuestion: string;
  familyStatusRequiredMsg: string;
  aboutTitle: string;
  aboutPlaceholder: string;
  consentSubtitle: string;
  consentPublishLabel: string;
  consentMatchLabel: string;
  consentCommLabel: string;
  successSubtitle: string;
  photoUploadTitle: string;
  photoMoreSubtitle: string;
  photoPrivacyNote: string;
  interestsTitle: string;
  interestsEmptyAlert: string;
}

export function getProfileSubjectFromContext(
  draftData?: MatrimonyPendingRegistrationDraft | null,
  initialData?: StartRegistrationResponse | null
): ProfileSubjectCopy {
  const manager = initialData?.profileManager;
  const managedBy =
    draftData?.welcome?.managedBy ||
    draftData?.consent?.managedBy ||
    (manager?.type === 'guardian' ? 'guardian' : 'self');
  const createdFor =
    draftData?.welcome?.createdFor ||
    draftData?.consent?.createdFor ||
    manager?.createdFor ||
    (managedBy === 'guardian' ? 'Relative' : 'Myself');

  return buildProfileSubjectCopy(managedBy, createdFor);
}

export function buildProfileSubjectCopy(
  managedBy: 'self' | 'guardian',
  createdFor?: string
): ProfileSubjectCopy {
  const isFamily = managedBy === 'guardian';
  if (!isFamily) {
    return {
      isFamily: false,
      relationLabel: 'Myself',
      relationLower: 'yourself',
      possessive: 'your',
      possessiveCap: 'Your',
      shortOwnerCap: 'Your',
      subject: 'you',
      subjectCap: 'You',
      forBadgeText: null,
      baptizedQuestion: 'Have you baptized?',
      motherTongueLabel: 'Your mother tongue',
      motherTonguePlaceholder: 'Select your mother tongue',
      basicCardTitle: 'Your Basic Details',
      basicSubtitle:
        'Pre-filled from your Rhema Global Ministries profile. Phone and email remain private by default.',
      fullNamePlaceholder: 'Enter your full name',
      emailPlaceholder: 'Enter your email address',
      phonePlaceholder: 'Enter your phone number',
      nameRequiredMsg: 'Please enter your full name.',
      genderQuestion: 'Gender',
      genderRequiredMsg: 'Please select your gender.',
      dobQuestion: 'Date of birth',
      dobAgeRequiredMsg: 'Please select a valid date of birth (18+ years).',
      agePrefix: 'You are',
      heightQuestion: 'Height',
      heightPlaceholder: 'Select your height',
      heightRequiredMsg: 'Please select your height.',
      physicalStatusQuestion: 'Your physical status',
      maritalStatusQuestion: 'Marital status',
      religionQuestion: 'Religion',
      religionPlaceholder: 'Select religion',
      religionRequiredMsg: 'Please select your religion.',
      denominationQuestion: 'Denomination',
      denominationPlaceholder: 'Select denomination',
      denominationRequiredMsg: 'Please select your denomination.',
      divisionQuestion: 'Division',
      divisionPlaceholder: 'Select division',
      countryQuestion: 'Country',
      countryRequiredMsg: 'Please select your country.',
      stateQuestion: 'Select your resident state',
      statePlaceholder: 'Select resident state',
      stateRequiredMsg: 'Please select your resident state.',
      villageQuestion: 'Village / City',
      villagePlaceholder: 'Enter village or city',
      pincodeQuestion: 'Pin Code',
      educationLabel: 'Your education details',
      educationPlaceholder: 'Select your education details',
      educationRequiredMsg: 'Please select your education details.',
      employmentLabel: 'Your employment type',
      employmentPlaceholder: 'Select your employment type',
      employmentRequiredMsg: 'Please select your employment type.',
      occupationLabel: 'Your occupation',
      occupationPlaceholder: 'Select your occupation',
      occupationRequiredMsg: 'Please select your occupation.',
      orgWorkPhrase: 'Organization where you work',
      currencyLabel: 'Your annual income currency',
      incomeLabel: 'Your annual income',
      incomePlaceholder: 'Select your annual income',
      familyStatusQuestion: 'Select family status',
      familyStatusRequiredMsg: 'Please select your family status.',
      aboutTitle: 'A few words about myself',
      aboutPlaceholder:
        'Write a few words about your faith, family values, hobbies, and expectations...',
      consentSubtitle:
        'Your existing Rhema profile (name, age, gender, city, baptism status) is reused automatically. Phone, email, and exact DOB stay private.',
      consentPublishLabel:
        'Publish my approved Matrimony profile to eligible Rhema members',
      consentMatchLabel: 'Use my preferences for reciprocal compatibility matching',
      consentCommLabel:
        'Allow interest requests and match chat after mutual acceptance',
      successSubtitle:
        "Your Rhema Matrimony profile is saved. Next, let's add your profile photo.",
      photoUploadTitle: 'Upload your profile photo',
      photoMoreSubtitle: 'More photos help matches know you better',
      photoPrivacyNote: 'Privacy and you control who can view your photo',
      interestsTitle: 'Select your interests',
      interestsEmptyAlert:
        'Please select at least one hobby or interest before submitting your profile for verification.',
    };
  }

  const rawRel = (createdFor || 'Relative').trim();
  const relKey = rawRel.toLowerCase();
  const isSpecific = ['son', 'daughter', 'brother', 'sister'].includes(relKey);
  const relationLabel = isSpecific ? rawRel : 'Family Member';
  const relationLower = isSpecific ? relKey : 'family member';
  const nounLower = isSpecific ? `your ${relationLower}` : 'your family member';
  const nounCap = isSpecific
    ? `Your ${relationLower.charAt(0).toUpperCase()}${relationLower.slice(1)}`
    : 'Your Family Member';
  const ownerPrefixCap = isSpecific
    ? `${relationLabel}'s`
    : "Family member's";
  const possessive = `${nounLower}'s`;
  const possessiveCap = isSpecific
    ? `Your ${relationLower}'s`
    : "Your family member's";

  return {
    isFamily: true,
    relationLabel,
    relationLower,
    possessive,
    possessiveCap,
    shortOwnerCap: ownerPrefixCap,
    subject: nounLower,
    subjectCap: nounCap,
    forBadgeText: `Creating profile for: ${relationLabel}`,
    baptizedQuestion: `Has ${nounLower} been baptized?`,
    motherTongueLabel: `${possessiveCap} mother tongue`,
    motherTonguePlaceholder: `Select ${possessive} mother tongue`,
    basicCardTitle: `${possessiveCap} Basic Details`,
    basicSubtitle: `Enter the full name and contact details for ${nounLower}. Phone and email remain private by default.`,
    fullNamePlaceholder: `Enter ${possessive} full name`,
    emailPlaceholder: `Enter ${possessive} contact email`,
    phonePlaceholder: `Enter ${possessive} contact phone number`,
    nameRequiredMsg: `Please enter ${possessive} full name.`,
    genderQuestion: `${ownerPrefixCap} gender`,
    genderRequiredMsg: `Please select ${possessive} gender.`,
    dobQuestion: `${ownerPrefixCap} date of birth`,
    dobAgeRequiredMsg: `Please select a valid date of birth for ${nounLower} (18+ years).`,
    agePrefix: `${isSpecific ? `Your ${relationLower}` : 'Your family member'} is`,
    heightQuestion: `${ownerPrefixCap} height`,
    heightPlaceholder: `Select ${possessive} height`,
    heightRequiredMsg: `Please select ${possessive} height.`,
    physicalStatusQuestion: `${possessiveCap} physical status`,
    maritalStatusQuestion: `${ownerPrefixCap} marital status`,
    religionQuestion: `${ownerPrefixCap} religion`,
    religionPlaceholder: `Select ${possessive} religion`,
    religionRequiredMsg: `Please select ${possessive} religion.`,
    denominationQuestion: `${ownerPrefixCap} denomination`,
    denominationPlaceholder: `Select ${possessive} denomination`,
    denominationRequiredMsg: `Please select ${possessive} denomination.`,
    divisionQuestion: `${ownerPrefixCap} division`,
    divisionPlaceholder: `Select ${possessive} division`,
    countryQuestion: `${ownerPrefixCap} country`,
    countryRequiredMsg: `Please select ${possessive} country.`,
    stateQuestion: `Select ${possessive} resident state`,
    statePlaceholder: 'Select resident state',
    stateRequiredMsg: `Please select ${possessive} resident state.`,
    villageQuestion: `${ownerPrefixCap} village / city`,
    villagePlaceholder: `Enter ${possessive} village or city`,
    pincodeQuestion: `${ownerPrefixCap} pin code`,
    educationLabel: `${possessiveCap} education details`,
    educationPlaceholder: `Select ${possessive} education details`,
    educationRequiredMsg: `Please select ${possessive} education details.`,
    employmentLabel: `${possessiveCap} employment type`,
    employmentPlaceholder: `Select ${possessive} employment type`,
    employmentRequiredMsg: `Please select ${possessive} employment type.`,
    occupationLabel: `${possessiveCap} occupation`,
    occupationPlaceholder: `Select ${possessive} occupation`,
    occupationRequiredMsg: `Please select ${possessive} occupation.`,
    orgWorkPhrase: `Organization where ${nounLower} works`,
    currencyLabel: `${possessiveCap} annual income currency`,
    incomeLabel: `${possessiveCap} annual income`,
    incomePlaceholder: `Select ${possessive} annual income`,
    familyStatusQuestion: `Select ${possessive} family status`,
    familyStatusRequiredMsg: `Please select ${possessive} family status.`,
    aboutTitle: `A few words about ${nounLower}`,
    aboutPlaceholder: `Write a few words about ${possessive} faith, values, hobbies, and expectations...`,
    consentSubtitle: `Review privacy & consent for ${nounLower}'s Matrimony profile. Contact phone, email, and exact DOB stay private by default.`,
    consentPublishLabel: `Publish ${possessive} approved Matrimony profile to eligible Rhema members`,
    consentMatchLabel: `Use preferences for reciprocal compatibility matching for ${nounLower}`,
    consentCommLabel:
      'Allow interest requests and match chat after mutual acceptance',
    successSubtitle: `${possessiveCap} Rhema Matrimony profile is saved. Next, let's add ${possessive} profile photo.`,
    photoUploadTitle: `Upload ${possessive} profile photo`,
    photoMoreSubtitle: `More photos help matches know ${nounLower} better`,
    photoPrivacyNote: `Privacy and you control who can view ${possessive} photo`,
    interestsTitle: `Select ${possessive} interests`,
    interestsEmptyAlert: `Please select at least one hobby or interest for ${nounLower} before submitting for verification.`,
  };
}
