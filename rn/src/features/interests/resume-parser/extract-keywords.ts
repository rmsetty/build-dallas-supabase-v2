// On-device resume keyword extraction. Pure TypeScript: no React, no network.
// Only the short keyword lists returned here ever leave the parser; raw resume text never does.

export type ResumeTextItem = {
  text: string; x: number; y: number; width: number; height: number;
  fontName: string; hasEOL: boolean; page: number;
};
export type ResumeKeywords = { skills: string[]; titles: string[]; degrees: string[]; topics: string[] };

// Stated interests and hobbies are the strongest event signals, so they lead the topics.
type Buckets = ResumeKeywords & { interests: string[] };
type Line = { page: number; x: number; y: number; segments: string[]; text: string; bold: boolean };
type Section = 'experience' | 'education' | 'projects' | 'skills' | 'coursework' | 'interests' | 'certifications' | 'summary' | 'other';

const BOLD_FONT = /bold|black|heavy|semibold|demi|cmbx/i;
const BULLET = /^(?:[\u2022\u2023\u2043\u2219\u00B7\u25AA\u25AB\u25A0\u25A1\u25CB\u25CF\u25E6\u25B6\u25BA\u27A2\u27A4\u2713\u2714\uF000-\uF0FF*>\u2013\u2014-]|o(?=\s))\s*/;
// Checked in order: "Technical Projects" is projects, "Leadership Experience" is experience.
const SECTION_KINDS: [Section, RegExp][] = [
  ['coursework', /\bcourse(?:work|s)?\b/i],
  ['projects', /\b(?:projects?|open source|hackathons?)\b/i],
  ['experience', /\b(?:experience|employment|work|internships?|career|research|teaching|leadership|activities|involvement|extracurriculars?|volunteer(?:ing)?|organizations)\b/i],
  ['education', /\b(?:education|academics?)\b/i],
  ['skills', /\b(?:skills?|technical|technologies|tools|tech stack|competencies|proficiencies|expertise|languages)\b/i],
  ['interests', /\b(?:interests|hobbies)\b/i],
  ['certifications', /\b(?:certifications?|certificates?|licenses?)\b/i],
  ['summary', /\b(?:summary|objective|profile|about)\b/i],
  ['other', /\b(?:awards?|honors?|achievements?|publications?|references?|patents?|contact)\b/i],
];
// Title-case headings must end in one of these nouns so entries like "Volunteer Tutor" are not headings.
const HEADING_NOUNS = new Set(['experience', 'experiences', 'employment', 'education', 'project', 'projects', 'skills', 'skill', 'technologies',
  'tools', 'leadership', 'activities', 'involvement', 'summary', 'interests', 'certifications', 'certificates', 'coursework', 'courses',
  'awards', 'honors', 'publications', 'languages', 'objective', 'profile', 'history', 'organizations', 'extracurriculars',
  'volunteering', 'achievements', 'internships', 'competencies', 'proficiencies', 'expertise', 'references', 'hobbies', 'hackathons', 'contact']);
const ROLE = new RegExp('\\b(?:' + [
  'engineer', 'developer', 'programmer', 'designer', 'intern', 'founder', 'co-founder', 'cofounder', 'manager', 'analyst',
  'scientist', 'researcher', 'assistant', 'associate', 'consultant', 'architect', 'lead', 'director', 'officer', 'president',
  'chair', 'chairperson', 'coordinator', 'organizer', 'specialist', 'administrator', 'technician', 'fellow', 'strategist',
  'writer', 'editor', 'tutor', 'teacher', 'instructor', 'mentor', 'ambassador', 'advisor', 'adviser', 'recruiter', 'trader',
  'accountant', 'economist', 'entrepreneur', 'captain', 'treasurer', 'secretary', 'representative', 'marketer', 'producer',
  'illustrator', 'photographer', 'statistician', 'mathematician', 'physicist', 'chemist', 'biologist', 'product owner',
  'cto', 'ceo', 'cfo', 'coo', 'cpo', 'vp', 'sde', 'swe',
].join('|') + ')\\b', 'i');
const DEGREE = /(?:^|[\s,(|])(bachelor(?:['\u2019]?s)?|master(?:['\u2019]?s)?|doctor(?:ate)?|associate(?:['\u2019]?s)?|b\.?\s?sc?\.?|b\.?\s?a\.?|m\.?\s?sc?\.?|m\.?\s?a\.?|b\.?\s?eng\.?|m\.?\s?eng\.?|b\.?\s?e\.?|b\.?\s?tech\.?|m\.?\s?tech\.?|b\.?b\.?a\.?|m\.?b\.?a\.?|ph\.?\s?d\.?|j\.?d\.?|m\.?p\.?h\.?|m\.?f\.?a\.?|b\.?f\.?a\.?)(?=[\s,:(|]|$)/i;
const DEGREE_OF = /^\s*of\s+(science|arts|engineering|applied science|fine arts|business administration|education|technology|public health|laws?)\b/i;
const FIELD_STOP = /\s*(?:[,|(;:\u00B7\u2013\u2014]|\s-\s|\bwith\b|\bminor\b|\bmajor\b|\bconcentration\b|\bgpa\b|\bat\b|\bfrom\b|\bexpected\b|\bcum laude\b|\d).*$/i;
const MINOR_MAJOR = /\b(?:minor|major|concentration|specialization|emphasis|focus)(?:s)?\s*(?:in|:)\s*([^,|;()\d]+)/gi;
const SCHOOL = /\b(?:university|college|institute|school|academy|polytechnic)\b/i;
const GENERIC_FIELD = /^(?:science|arts)$/i;
const LABEL = /^([A-Za-z][A-Za-z &/+().-]{1,30}):\s*(.+)$/;
const SKILL_LABEL = /skill|tech|stack|tool|language|framework|librar|platform|software|database|cloud|devops|design|method|proficien|competenc/i;
const TOPIC_LABEL = /course|interest|hobb|certif/i;
const FILLER = /^(?:proficient|familiar|basic|intermediate|advanced|fluent|native|bilingual|native or bilingual|conversational|beginner|expert|experienced|knowledge|working knowledge|etc|others?|and more|misc|various|(?:full |limited )?(?:professional )?working(?: proficiency)?|(?:full )?professional(?: proficiency)?|elementary(?: proficiency)?)$/i;

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const WEB = /\b(?:https?:\/\/|www\.)\S+|\S*(?:linkedin|github|gitlab|behance|dribbble)\.\S*|\b[\w-]+(?:\.[\w-]+)*\.(?:com|org|net|edu|me|dev|co|us|info|site|page|xyz|app)\b\S*|\b[\w-]+\.io\/\S*/g;
const HANDLE = /(^|\s)@[\w.]+/g;
const PHONE = /\+?\d[\d\s().-]{6,}\d/g;
const YEAR = /\b(?:19|20)\d{2}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+'?\d{2}\b/i;
const GPA = /\bgpa\b|\d\.\d+\s*\/\s*\d/i;
const STREET = /\b\d+\s+(?:[A-Za-z]+\s+){0,3}(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|ct|court|way|pkwy|parkway|hwy|apt|suite)\b/i;

export function extractKeywords(items: ResumeTextItem[]): ResumeKeywords {
  const lines = buildLines(items);
  const out: Buckets = { skills: [], titles: [], degrees: [], topics: [], interests: [] };
  let section: Section | null = null;
  let sawHeading = false;
  let previous: Line | null = null;
  lines.forEach((line, index) => {
    // Jumping back up the page into another column (LinkedIn's sidebar to its main column) starts a new header block.
    if (previous && previous.page === line.page && line.y - previous.y > 30 && Math.abs(line.x - previous.x) > 50) section = null;
    previous = line;
    // Line 0 is always the name; later lines before the first heading are the contact block.
    const heading = index > 0 ? headingKind(line) : null;
    if (heading) { section = heading; sawHeading = true; return; }
    if (section) readLine(line, section, out);
  });
  // Headings styled in ways we can't see: fall back to labelled lists and degree lines only.
  if (!sawHeading) lines.slice(2).forEach(line => { readLabel(line, 'other', out); readDegrees(line, out); });
  return finalize(out);
}

export function toChips(result: ResumeKeywords, limit = 30): string[] {
  // Skills lead, but a few slots stay open so titles and fields of study always make it in.
  const others = [...result.titles, ...result.degrees, ...result.topics];
  const skillSlots = Math.max(limit - Math.min(others.length, 10), 0);
  const ordered = [...result.skills.slice(0, skillSlots), ...others, ...result.skills.slice(skillSlots)];
  return dedupe(ordered).slice(0, limit);
}

function buildLines(items: ResumeTextItem[]): Line[] {
  const sized = items.filter(item => item.text.trim() && item.width > 0);
  const charWidth = sized.reduce((sum, item) => sum + item.width, 0) / Math.max(1, sized.reduce((sum, item) => sum + item.text.length, 0)) || 5;
  const lines: Line[] = [];
  type Draft = { page: number; x: number; y: number; height: number; end: number; segments: string[]; space: boolean; boldChars: number; chars: number };
  let draft: Draft | null = null;
  let breakNext = false;
  const flush = () => {
    if (!draft) return;
    const segments = draft.segments.map(tidySegment).filter(Boolean);
    if (segments.length) lines.push({ page: draft.page, x: draft.x, y: draft.y, segments, text: segments.join('  '), bold: draft.boldChars >= draft.chars * 0.6 });
    draft = null;
  };
  for (const item of items) {
    const text = item.text.replace(/\s+/g, ' ');
    const trimmed = text.trim();
    const current: Draft | null = draft;
    const sameLine = !!current && !breakNext && current.page === item.page
      && Math.abs(current.y - item.y) <= Math.max(2, Math.min(current.height, item.height || current.height) * 0.5);
    breakNext = item.hasEOL;
    if (!trimmed) { if (current && sameLine) current.space = true; continue; }
    const bold = BOLD_FONT.test(item.fontName) ? trimmed.length : 0;
    if (!current || !sameLine) {
      flush();
      draft = { page: item.page, x: item.x, y: item.y, height: item.height || 10, end: item.x + item.width, segments: [trimmed], space: text.endsWith(' '), boldChars: bold, chars: trimmed.length };
      continue;
    }
    const gap = item.x - current.end;
    if (gap > charWidth * 3 || gap < -charWidth * 2) current.segments.push(trimmed);
    else {
      const joiner = current.space || text.startsWith(' ') || gap > charWidth * 0.2 ? ' ' : '';
      current.segments[current.segments.length - 1] += joiner + trimmed;
    }
    current.end = Math.max(current.end, item.x + item.width);
    current.space = text.endsWith(' ');
    current.boldChars += bold; current.chars += trimmed.length;
  }
  flush();
  return lines;
}

function tidySegment(segment: string) {
  const text = segment.replace(/\s+/g, ' ').trim();
  // Letter-spaced headings ("E X P E R I E N C E") collapse into one word.
  return /^(?:\S ){3,}\S$/.test(text) ? text.replace(/ /g, '') : text;
}

function headingKind(line: Line): Section | null {
  const text = line.text.replace(/[:\s]+$/, '');
  const words = text.split(/\s+/).filter(word => !/^(?:&|and|of|the|in|\/)$/i.test(word));
  if (line.segments.length > 1 || text.length > 40 || !words.length || words.length > 4 || /[\d:,@]/.test(text) || !/[a-z]/i.test(text)) return null;
  const kind = SECTION_KINDS.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
  if (text === text.toUpperCase()) return kind ?? (line.bold ? 'other' : null);
  const last = words[words.length - 1].toLowerCase().split(/[-/]/).pop() ?? '';
  if (words.length <= 3 && words.every(word => /^[A-Z]/.test(word)) && HEADING_NOUNS.has(last)) return kind;
  return null;
}

function readLine(line: Line, section: Section, out: Buckets) {
  if (section === 'summary' || section === 'other') return;
  if (readLabel(line, section, out)) return;
  // "Languages    Python, Go": a leading label column is not itself a keyword.
  const segments = line.segments.length > 1 && (SKILL_LABEL.test(line.segments[0]) || TOPIC_LABEL.test(line.segments[0])) && line.segments[0].split(/\s+/).length <= 3 ? line.segments.slice(1) : line.segments;
  if (section === 'skills') return segments.forEach(segment => out.skills.push(...splitList(segment)));
  if (section === 'interests') return segments.forEach(segment => out.interests.push(...splitList(segment)));
  if (section === 'coursework' || section === 'certifications') return segments.forEach(segment => out.topics.push(...splitList(segment)));
  if (section === 'education') return readDegrees(line, out);
  if (isBullet(line)) return;
  if (section === 'experience') return readTitle(line, out);
  if (section === 'projects') return readProject(line, out);
}

// "Languages: Python, Go" style lines, in any section.
function readLabel(line: Line, section: Section, out: Buckets) {
  let found = false;
  // "GPA: 3.9 | Relevant Coursework: Algorithms, Databases" holds several labelled parts.
  for (const part of line.text.replace(BULLET, '').split(/\s+\|\s+/)) {
    const match = LABEL.exec(part);
    if (!match) continue;
    const list = match[2].split(/\s{2,}/).flatMap(splitList);
    if (/interest|hobb/i.test(match[1])) out.interests.push(...list);
    else if (TOPIC_LABEL.test(match[1])) out.topics.push(...list);
    else if (SKILL_LABEL.test(match[1]) || section === 'skills') out.skills.push(...list);
    else continue;
    found = true;
  }
  return found;
}

function readTitle(line: Line, out: ResumeKeywords) {
  for (const segment of line.segments) {
    for (const raw of segment.split(/\s+[|\u2013\u2014-]\s+|\s*[,|\u2022\u00B7]\s*|\s*:\s+|\s+at\s+|\s+@\s+/)) {
      const piece = raw.replace(/\([^)]*\)/g, '').trim();
      const words = piece.split(/\s+/);
      if (!piece || /\d/.test(piece) || words.length > 6 || !/^[A-Z]/.test(piece) || /^[A-Z][a-z]+ed$/.test(words[0]) || /\.$/.test(piece)) continue;
      if (ROLE.test(piece)) { out.titles.push(piece); return; }
    }
  }
}

function readDegrees(line: Line, out: ResumeKeywords) {
  for (const segment of line.segments) {
    const match = DEGREE.exec(segment);
    if (match) {
      const degree = match[1];
      let rest = segment.slice(match.index + match[0].length);
      const of = DEGREE_OF.exec(rest);
      if (of) rest = rest.slice(of[0].length);
      // LinkedIn writes "Bachelor of Business Administration - BBA, Finance".
      rest = rest.replace(/^\s*[-\u2013]\s*[A-Z][A-Za-z.]{1,6}(?=[\s,]|$)/, '');
      let field = rest.replace(/^\s*(?:in|,|:|-|\u2013)?\s*/i, '').replace(FIELD_STOP, '').trim();
      if (!field && of && !GENERIC_FIELD.test(of[1])) field = of[1];
      // "Computer Science, B.S." puts the field first; a bare MA/MS after a comma is usually a state.
      if (!field && !/^M[AS]$/.test(degree)) field = segment.slice(0, match.index).split(/\s*[,|\u2013\u2014]\s*|\s+-\s+/).pop()?.trim() ?? '';
      if (isField(field)) out.degrees.push(field);
      else if (/^m\.?b\.?a\.?$/i.test(degree)) out.degrees.push('MBA');
    }
    for (const minor of segment.matchAll(MINOR_MAJOR)) if (isField(minor[1].trim())) out.degrees.push(minor[1].trim());
  }
}

function isField(field: string) {
  return !!field && field.split(/\s+/).length <= 5 && /^[A-Z]/.test(field) && !SCHOOL.test(field) && !/\d/.test(field);
}

function readProject(line: Line, out: ResumeKeywords) {
  const pieces = line.segments.flatMap(segment => segment.split(/\s+[|\u2013\u2014]\s+|\s+-\s+|:\s+/)).map(piece => piece.trim()).filter(Boolean);
  const [name, ...rest] = pieces;
  if (!name) return;
  const header = line.bold || pieces.length > 1 || (name.split(/\s+/).length <= 5 && /^[A-Z]/.test(name) && !/\.$/.test(name));
  if (!header) return;
  if (name.split(/\s+/).length <= 4 && !/\d/.test(name)) out.topics.push(name.replace(/\([^)]*\)/g, ''));
  for (const piece of rest) if (/,/.test(piece)) out.skills.push(...splitList(piece));
}

function isBullet(line: Line) {
  return BULLET.test(line.text);
}

function splitList(text: string): string[] {
  return text.replace(BULLET, '').replace(/[()[\]{}]/g, ',')
    .split(/\s*[,;|\u2022\u00B7\u25AA\u25CF\u25E6\u2023\u2219]\s*|\s+\/\s+|\s+[\u2013\u2014-]\s+/)
    .map(piece => piece.replace(/^(?:and|or|&)\s+/i, '').replace(/^(?:proficient|familiar|experienced|skilled|fluent)\s+(?:in|with)\s+/i, '').trim())
    .filter(piece => piece && piece.split(/\s+/).length <= 4 && !FILLER.test(piece));
}

function scrub(value: string) {
  return value.replace(EMAIL, ' ').replace(WEB, ' ').replace(HANDLE, '$1').replace(PHONE, ' ');
}

function clean(raw: string): string | null {
  let value = scrub(raw).replace(/\s+/g, ' ')
    .replace(/^[\s\u2022\u2023\u00B7\u25AA\u25CF\u25E6*\u2013\u2014:;,|/-]+/, '')
    .replace(/[\s.,;:!?|/\\*\u00B7\u2013\u2014-]+$/, '')
    .replace(/^(?:and|or|&)\s+/i, '').trim();
  if ((value.match(/\(/g)?.length ?? 0) !== (value.match(/\)/g)?.length ?? 0)) value = value.replace(/[()]/g, '').trim();
  if (value.length < 2 || value.length > 40 || !/[a-z]/i.test(value)) return null;
  if (YEAR.test(value) || GPA.test(value) || /\d{3,}/.test(value) || STREET.test(value)) return null;
  // Sentence fragments, often left behind once a URL or email is scrubbed out.
  if (/\b(?:me|my|we|our|you|your|My|We|Our|You|Your)\b|\bI\s+[a-z]/.test(value) || /\s(?:at|with|in|for|to|and|of|on|by|from)$/i.test(value)) return null;
  return value;
}

function dedupe(values: string[]) {
  const seen = new Set<string>();
  return values.filter(value => { const key = value.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; });
}

function finalize(out: Buckets): ResumeKeywords {
  const seen = new Set<string>();
  const pick = (values: string[]) => values.map(clean).filter((value): value is string => {
    if (!value) return false;
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const skills = pick(out.skills), titles = pick(out.titles), degrees = pick(out.degrees), topics = pick([...out.interests, ...out.topics]);
  return { skills: skills.slice(0, 60), titles: titles.slice(0, 10), degrees: degrees.slice(0, 6), topics: topics.slice(0, 20) };
}
