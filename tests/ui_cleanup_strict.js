// Cleanup of TEST_ data created in iteration 67 (by exact ids / timestamps only)
const ids = ["31b75718a5ca", "d03ece66945e", "da1d30557fb1"];
const mine = db.exams.find({title: /^TEST_/, created_at: {$in: ["2026-11-20T07:45:58.328235+00:00", "2026-11-20T07:45:59.469791+00:00", "2026-11-20T07:46:20.159375+00:00", "2026-11-20T07:46:21.492220+00:00"]}}, {id: 1, _id: 0}).toArray().map(e => e.id);
const all = ids.concat(mine);
print("exams", all.length);
print("attempts", db.exam_attempts.deleteMany({exam_id: {$in: all}}).deletedCount);
print("enroll", db.exam_enrollments.deleteMany({exam_id: {$in: all}}).deletedCount);
print("certs", db.academy_certs.deleteMany({course_id: {$in: all.map(i => "exam:" + i)}}).deletedCount);
print("reviews", db.exam_reviews.deleteMany({exam_id: {$in: all}}).deletedCount);
print("bundles", db.academy_bundles.deleteMany({id: "5924b35b8ae4"}).deletedCount);
print("exams del", db.exams.deleteMany({id: {$in: all}, title: /^TEST_/}).deletedCount);
print("left TEST_ bundles", db.academy_bundles.countDocuments({title: /^TEST_/}), "TEST_ exams", db.exams.countDocuments({title: /^TEST_/}));
