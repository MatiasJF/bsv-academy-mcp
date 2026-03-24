export interface Section {
  title: string;
  url: string;
  bodyText: string;
  concepts: string[];
  keyTerms: string[];
  codeExamples: string[];
}

export interface Chapter {
  name: string;
  sections: Section[];
}

export interface Course {
  slug: string;
  name: string;
  description: string;
  chapters: Chapter[];
}

export interface KnowledgeBase {
  courses: Course[];
  generatedAt: string;
  totalTopics: number;
  totalSections: number;
  totalConcepts: number;
}
