import { pgTable, text, timestamp, boolean, integer, jsonb, uuid, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRoleEnum = pgEnum("user_role", ["student", "teacher", "staff", "admin", "parent"]);
export const submissionStatusEnum = pgEnum("submission_status", ["pending", "submitted", "graded"]);
export const itemTypeEnum = pgEnum("item_type", ["BTVN", "exam"]);

export const usersTable = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  role: userRoleEnum("role").notNull().default("student"),
  tinodeUid: text("tinode_uid"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const classesTable = pgTable("classes", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  evaluationCriteriaIds: jsonb("evaluation_criteria_ids").$type<string[]>().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const classSessionsTable = pgTable("class_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  classId: uuid("class_id").notNull().references(() => classesTable.id),
  sessionDate: text("session_date").notNull(),
  sessionIndex: integer("session_index").notNull().default(1),
  totalSessions: integer("total_sessions"),
  weekday: text("weekday"),
  startTime: text("start_time"),
  endTime: text("end_time"),
  locationName: text("location_name"),
  learningFormat: text("learning_format").notNull().default("offline"),
  status: text("status").notNull().default("scheduled"),
  teacherIds: jsonb("teacher_ids").$type<string[]>().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const evaluationCriteriaTable = pgTable("evaluation_criteria", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  subCriteria: jsonb("sub_criteria").$type<{ id: string; name: string }[]>().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const studentEnrollmentsTable = pgTable("student_enrollments", {
  id: uuid("id").primaryKey().defaultRandom(),
  studentId: uuid("student_id").notNull().references(() => usersTable.id),
  classId: uuid("class_id").notNull().references(() => classesTable.id),
  enrolledAt: timestamp("enrolled_at").notNull().defaultNow(),
});

export const homeworksTable = pgTable("homeworks", {
  id: uuid("id").primaryKey().defaultRandom(),
  classSessionId: uuid("class_session_id").notNull().references(() => classSessionsTable.id),
  title: text("title").notNull(),
  description: text("description"),
  attachments: jsonb("attachments").$type<{ name: string; url: string }[]>().default([]),
  isPersonalized: boolean("is_personalized").notNull().default(false),
  targetStudentId: uuid("target_student_id").references(() => usersTable.id),
  dueDate: timestamp("due_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export interface ExamQuestion {
  id: string;
  type: "single_choice" | "multi_choice" | "essay" | "matching";
  content: string;
  points: number;
  sectionLabel?: string;
  options?: string[];
  audioUrl?: string;
  matchingLeft?: string[];
  matchingOptions?: string[];
}

export interface ExamSection {
  id: string;
  name: string;
  readingMaterial?: { title: string; url: string };
  questions: ExamQuestion[];
}

export interface ExamContent {
  sections: ExamSection[];
}

export const examsTable = pgTable("exams", {
  id: uuid("id").primaryKey().defaultRandom(),
  classSessionId: uuid("class_session_id").notNull().references(() => classSessionsTable.id),
  title: text("title").notNull(),
  description: text("description"),
  duration: integer("duration"),
  maxAttempts: integer("max_attempts"),
  content: jsonb("content").$type<ExamContent>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const examSubmissionsTable = pgTable("exam_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  examId: uuid("exam_id").notNull().references(() => examsTable.id),
  classId: uuid("class_id").notNull().references(() => classesTable.id),
  studentId: uuid("student_id").notNull().references(() => usersTable.id),
  studentName: text("student_name").notNull().default(""),
  studentCode: text("student_code").notNull().default(""),
  score: text("score"),
  adjustedScore: text("adjusted_score"),
  partScores: jsonb("part_scores").$type<Record<string, number>>().default({}),
  answers: jsonb("answers").$type<Record<string, unknown>>().default({}),
  comment: text("comment"),
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const homeworkSubmissionsTable = pgTable("homework_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  homeworkId: uuid("homework_id").notNull().references(() => homeworksTable.id),
  studentId: uuid("student_id").notNull().references(() => usersTable.id),
  submissionContent: text("submission_content"),
  submissionAttachments: jsonb("submission_attachments").$type<{ name: string; url: string }[]>().default([]),
  status: submissionStatusEnum("status").notNull().default("submitted"),
  score: integer("score"),
  comment: text("comment"),
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const studentSessionsTable = pgTable("student_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  classSessionId: uuid("class_session_id").notNull().references(() => classSessionsTable.id),
  studentId: uuid("student_id").notNull().references(() => usersTable.id),
  sessionOrder: integer("session_order").notNull().default(1),
  attendanceStatus: text("attendance_status").notNull().default("pending"),
  attendanceNote: text("attendance_note").notNull().default(""),
  hasReview: boolean("has_review").notNull().default(false),
  reviewPublished: boolean("review_published").notNull().default(false),
  reviewData: jsonb("review_data").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const taskStatusesTable = pgTable("task_statuses", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#6b7280"),
  position: integer("position").notNull().default(0),
  isFixed: boolean("is_fixed").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const taskLevelsTable = pgTable("task_levels", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#6b7280"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const tasksTable = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description"),
  statusId: uuid("status_id").notNull().references(() => taskStatusesTable.id),
  levelId: uuid("level_id").references(() => taskLevelsTable.id),
  creatorId: uuid("creator_id").notNull().references(() => usersTable.id),
  managerId: uuid("manager_id").references(() => usersTable.id),
  assigneeIds: jsonb("assignee_ids").$type<string[]>().default([]),
  subjectIds: jsonb("subject_ids").$type<string[]>().default([]),
  attachments: jsonb("attachments").$type<{ name: string; url: string; size?: number; mimetype?: string }[]>().default([]),
  dueDate: timestamp("due_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const taskCommentsTable = pgTable("task_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id").notNull().references(() => tasksTable.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").notNull().references(() => usersTable.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const scoreCategoriesTable = pgTable("score_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  code: text("code").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const scoreSheetsTable = pgTable("score_sheets", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const scoreSheetItemsTable = pgTable("score_sheet_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  scoreSheetId: uuid("score_sheet_id").notNull().references(() => scoreSheetsTable.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").notNull().references(() => scoreCategoriesTable.id),
  formula: text("formula").notNull().default(""),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const gradeBooksTable = pgTable("grade_books", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  classId: uuid("class_id").notNull().references(() => classesTable.id),
  scoreSheetId: uuid("score_sheet_id").references(() => scoreSheetsTable.id),
  sessionId: uuid("session_id").references(() => classSessionsTable.id),
  published: boolean("published").notNull().default(false),
  studentComments: jsonb("student_comments").$type<Record<string, string>>().default({}),
  createdById: uuid("created_by_id").references(() => usersTable.id),
  updatedById: uuid("updated_by_id").references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const gradeBookScoresTable = pgTable("grade_book_scores", {
  id: uuid("id").primaryKey().defaultRandom(),
  gradeBookId: uuid("grade_book_id").notNull().references(() => gradeBooksTable.id, { onDelete: "cascade" }),
  studentId: uuid("student_id").notNull().references(() => usersTable.id),
  categoryId: uuid("category_id").notNull().references(() => scoreCategoriesTable.id),
  score: text("score").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const parentProfilesTable = pgTable("parent_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }).unique(),
  code: text("code"),
  phone: text("phone"),
  email: text("email"),
  dateOfBirth: text("date_of_birth"),
  gender: text("gender"),
  address: text("address"),
  relationship: text("relationship"),
  accountStatus: text("account_status").notNull().default("Hoạt động"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const parentStudentLinksTable = pgTable("parent_student_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  parentId: uuid("parent_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  studentId: uuid("student_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  relationship: text("relationship"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const notificationsTable = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  type: text("type").notNull().default("general"),
  category: text("category").notNull().default("announcement"),
  referenceId: text("reference_id"),
  referenceType: text("reference_type"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const pushSubscriptionsTable = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  expirationTime: integer("expiration_time"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const salaryTablesTable = pgTable("salary_tables", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  startDate: text("start_date"),
  endDate: text("end_date"),
  locationName: text("location_name"),
  published: boolean("published").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const salaryPaymentsTable = pgTable("salary_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  salaryTableId: uuid("salary_table_id").notNull().references(() => salaryTablesTable.id, { onDelete: "cascade" }),
  staffId: uuid("staff_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  label: text("label"),
  amount: text("amount").notNull().default("0"),
  status: text("status").notNull().default("unpaid"),
  paymentMethod: text("payment_method"),
  paidAt: timestamp("paid_at"),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const invoicesTable = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code"),
  settleCode: text("settle_code"),
  subjectName: text("subject_name").notNull(),
  subjectType: text("subject_type").notNull().default("student"),
  studentId: uuid("student_id").references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  label: text("label"),
  type: text("type").notNull().default("Thu"),
  category: text("category"),
  amount: text("amount").notNull().default("0"),
  paidAmount: text("paid_amount"),
  remainingAmount: text("remaining_amount"),
  status: text("status").notNull().default("unpaid"),
  dueDate: timestamp("due_date"),
  paidAt: timestamp("paid_at"),
  paymentMethod: text("payment_method"),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── News Feed ─────────────────────────────────────────────────────────────────

export const newsFeedPostsTable = pgTable("news_feed_posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  authorId: uuid("author_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  category: text("category").notNull().default("thong-bao"),
  content: text("content").notNull().default(""),
  imageUrl: text("image_url"),
  imageUrls: jsonb("image_urls").$type<string[]>().default([]),
  isPinned: boolean("is_pinned").notNull().default(false),
  postLocationIds: jsonb("post_location_ids").$type<string[]>().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const newsFeedReactionsTable = pgTable("news_feed_reactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  postId: uuid("post_id").notNull().references(() => newsFeedPostsTable.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  reaction: text("reaction").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type NewsFeedPost = typeof newsFeedPostsTable.$inferSelect;
export type NewsFeedReaction = typeof newsFeedReactionsTable.$inferSelect;

// ── Chat ──────────────────────────────────────────────────────────────────────

export const chatGroupsTable = pgTable("chat_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  tinodeTopicId: text("tinode_topic_id"),
  classId: uuid("class_id").references(() => classesTable.id, { onDelete: "set null" }),
  createdBy: uuid("created_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const chatGroupMembersTable = pgTable("chat_group_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id").notNull().references(() => chatGroupsTable.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  isCreator: boolean("is_creator").notNull().default(false),
  tinodeUid: text("tinode_uid"),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
});

export type ChatGroup = typeof chatGroupsTable.$inferSelect;
export type ChatGroupMember = typeof chatGroupMembersTable.$inferSelect;

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

export const insertHomeworkSchema = createInsertSchema(homeworksTable).omit({ id: true, createdAt: true });
export type InsertHomework = z.infer<typeof insertHomeworkSchema>;
export type Homework = typeof homeworksTable.$inferSelect;

export const insertSubmissionSchema = createInsertSchema(homeworkSubmissionsTable).omit({ id: true, submittedAt: true, updatedAt: true });
export type InsertSubmission = z.infer<typeof insertSubmissionSchema>;
export type HomeworkSubmission = typeof homeworkSubmissionsTable.$inferSelect;

export const insertExamSubmissionSchema = createInsertSchema(examSubmissionsTable).omit({ id: true, createdAt: true, submittedAt: true });
export type InsertExamSubmission = z.infer<typeof insertExamSubmissionSchema>;
export type ExamSubmission = typeof examSubmissionsTable.$inferSelect;
export type Exam = typeof examsTable.$inferSelect;

export type TaskStatus = typeof taskStatusesTable.$inferSelect;
export type TaskLevel = typeof taskLevelsTable.$inferSelect;
export type Task = typeof tasksTable.$inferSelect;
export type TaskComment = typeof taskCommentsTable.$inferSelect;
