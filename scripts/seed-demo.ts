import bcrypt from "bcryptjs";
import {
  db,
  usersTable,
  classesTable,
  classSessionsTable,
  studentEnrollmentsTable,
  homeworksTable,
  homeworkSubmissionsTable,
  examsTable,
} from "@workspace/db";

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

  console.log("✅ Đã tạo user:", student?.username, teacher?.username);

  const [cls] = await db
    .insert(classesTable)
    .values({ name: "Toán 10A - Cơ bản", code: "TOAN-10A" })
    .onConflictDoNothing()
    .returning();

  console.log("✅ Đã tạo lớp:", cls?.name);

  if (!student || !cls) {
    console.log("ℹ️  User hoặc lớp đã tồn tại, dừng seed.");
    process.exit(0);
  }

  await db
    .insert(studentEnrollmentsTable)
    .values({ studentId: student.id, classId: cls.id })
    .onConflictDoNothing();

  const today = new Date();
  const thisMonth = today.toISOString().slice(0, 7);

  const sessions: { date: string; idx: number }[] = [];
  for (let i = 0; i < 4; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), 3 + i * 7);
    sessions.push({ date: d.toISOString().split("T")[0], idx: i + 1 });
  }

  const createdSessions = await db
    .insert(classSessionsTable)
    .values(
      sessions.map((s) => ({
        classId: cls.id,
        sessionDate: s.date,
        sessionIndex: s.idx,
        startTime: "18:00",
        endTime: "20:00",
        status: "completed",
      }))
    )
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

  console.log(`✅ Đã tạo ${createdHomeworks.length} bài tập`);

  if (createdHomeworks.length > 0) {
    await db
      .insert(homeworkSubmissionsTable)
      .values({
        homeworkId: createdHomeworks[0].id,
        studentId: student.id,
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
          studentId: student.id,
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
        description: "Kiểm tra lý thuyết và bài tập chương 1: Phương trình và bất phương trình.",
      })
      .onConflictDoNothing();
  }

  console.log("✅ Đã tạo dữ liệu nộp bài và kiểm tra");
  console.log(`
🎉 Seed hoàn tất!
📱 Đăng nhập app bằng:
   - Tài khoản: hocvien01
   - Mật khẩu: 123456
   - Tháng BTVN: ${thisMonth}
`);
  process.exit(0);
}

seed().catch((e) => {
  console.error("❌ Lỗi seed:", e);
  process.exit(1);
});
