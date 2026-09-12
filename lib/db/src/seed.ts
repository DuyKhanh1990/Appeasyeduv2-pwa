import bcrypt from "bcryptjs";
import { db } from "./index.js";
import {
  usersTable,
  classesTable,
  classSessionsTable,
  studentEnrollmentsTable,
  homeworksTable,
  homeworkSubmissionsTable,
  examsTable,
} from "./schema/index.js";

async function seed() {
  console.log("🌱 Bắt đầu seed dữ liệu mẫu...");

  const passwordHash = await bcrypt.hash("123456", 10);

  const [student] = await db
    .insert(usersTable)
    .values({ username: "hocvien01", passwordHash, name: "Nguyễn Văn An", role: "student" })
    .onConflictDoNothing()
    .returning();

  const [teacher] = await db
    .insert(usersTable)
    .values({ username: "giaovien01", passwordHash, name: "Trần Thị Bình", role: "teacher" })
    .onConflictDoNothing()
    .returning();

  await db
    .insert(usersTable)
    .values({ username: "gv1", passwordHash, name: "Giáo viên 1", role: "teacher" })
    .onConflictDoNothing();

  await db
    .insert(usersTable)
    .values({ username: "staff1", passwordHash, name: "Nhân viên 1", role: "staff" })
    .onConflictDoNothing();

  console.log("✅ Đã tạo user:", student?.username ?? "(đã tồn tại)", teacher?.username ?? "(đã tồn tại)");

  const [cls] = await db
    .insert(classesTable)
    .values({ name: "Toán 10A - Cơ bản", code: "TOAN-10A" })
    .onConflictDoNothing()
    .returning();

  console.log("✅ Đã tạo lớp:", cls?.name ?? "(đã tồn tại)");

  const [existingStudent] = student
    ? [student]
    : await db.select().from(usersTable).limit(1);

  const [existingClass] = cls
    ? [cls]
    : await db.select().from(classesTable).limit(1);

  if (!existingStudent || !existingClass) {
    console.error("❌ Không tìm thấy student hoặc class");
    process.exit(1);
  }

  await db
    .insert(studentEnrollmentsTable)
    .values({ studentId: existingStudent.id, classId: existingClass.id })
    .onConflictDoNothing();

  const today = new Date();
  const thisMonth = today.toISOString().slice(0, 7);

  const sessionDates: { date: string; idx: number }[] = [];
  for (let i = 0; i < 4; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), 3 + i * 7);
    sessionDates.push({ date: d.toISOString().split("T")[0], idx: i + 1 });
  }

  const createdSessions = await db
    .insert(classSessionsTable)
    .values(
      sessionDates.map((s) => ({
        classId: existingClass.id,
        sessionDate: s.date,
        sessionIndex: s.idx,
        startTime: "18:00",
        endTime: "20:00",
        status: "completed",
      }))
    )
    .onConflictDoNothing()
    .returning();

  console.log(`✅ Đã tạo ${createdSessions.length} buổi học`);

  const hwTitles = [
    "Giải phương trình bậc 2",
    "Bài tập hàm số bậc nhất",
    "Luyện tập bất phương trình",
    "Ôn tập chương 1",
  ];

  const createdHomeworks = await db
    .insert(homeworksTable)
    .values(
      createdSessions.map((s, i) => ({
        classSessionId: s.id,
        title: hwTitles[i] ?? `Bài tập buổi ${i + 1}`,
        description: `Làm các bài tập trong sách giáo khoa trang ${20 + i * 5}. Nộp bài trước buổi học tiếp theo.`,
        attachments: [],
        isPersonalized: false,
      }))
    )
    .returning();

  console.log(`✅ Đã tạo ${createdHomeworks.length} bài tập về nhà`);

  if (createdHomeworks.length > 0) {
    await db
      .insert(homeworkSubmissionsTable)
      .values({
        homeworkId: createdHomeworks[0].id,
        studentId: existingStudent.id,
        submissionContent: "Em đã hoàn thành bài tập theo yêu cầu. Phương trình có 2 nghiệm phân biệt.",
        submissionAttachments: [],
        status: "graded",
        score: 9,
        comment: "Bài làm tốt, trình bày rõ ràng!",
      })
      .onConflictDoNothing();

    if (createdHomeworks.length > 1) {
      await db
        .insert(homeworkSubmissionsTable)
        .values({
          homeworkId: createdHomeworks[1].id,
          studentId: existingStudent.id,
          submissionContent: "Em đã làm xong bài về hàm số bậc nhất.",
          submissionAttachments: [],
          status: "submitted",
        })
        .onConflictDoNothing();
    }
  }

  if (createdSessions.length > 2) {
    await db
      .insert(examsTable)
      .values({
        classSessionId: createdSessions[2].id,
        title: "Kiểm tra 15 phút chương 1",
        description: "Kiểm tra lý thuyết và bài tập chương 1.",
      })
      .onConflictDoNothing();
  }

  console.log(`
🎉 Seed hoàn tất!
📱 Đăng nhập app bằng:
   - Tài khoản: hocvien01
   - Mật khẩu:  123456
   - Tháng BTVN: ${thisMonth}
  `);
  process.exit(0);
}

seed().catch((e) => {
  console.error("❌ Lỗi seed:", e);
  process.exit(1);
});
