export interface AssignmentRow {
  classSessionId: string;
  className: string;
  classCode: string;
  sessionDate: string;
  weekday: string;
  startTime: string;
  endTime: string;
  sessionIndex: number;
  studentId: string;
  studentName: string;
  itemType: "BTVN" | "Bài kiểm tra";
  homeworkId: string | null;
  homeworkTitle: string;
  homeworkDescription?: string;
  homeworkAttachments?: { name: string; url: string }[];
  isPersonalized: boolean;
  submissionStatus: "submitted" | "pending" | "graded";
  submissionContent?: string;
  submissionAttachments?: Array<string | { name: string; url: string }>;
  studentSessionContentId: string | null;
  score?: string | null;
  comment?: string | null;
  examId?: string | null;
}

let current: AssignmentRow | null = null;

export function setCurrentAssignment(row: AssignmentRow) {
  current = row;
}

export function getCurrentAssignment(): AssignmentRow | null {
  return current;
}

export function updateCurrentAssignment(patch: Partial<AssignmentRow>) {
  if (current) current = { ...current, ...patch };
}
