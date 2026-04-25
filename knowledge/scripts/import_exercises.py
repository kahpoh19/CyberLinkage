"""
题库导入脚本 v2 - 路径修正版
用法(在backend目录下运行):
  python ../knowledge/scripts/import_exercises.py
或指定路径:
  python ../knowledge/scripts/import_exercises.py ./cyberlinkage.db ../knowledge/scripts/c_language_exercises_full.json
"""

import json
import os
import sqlite3
import sys


def detect_course_from_filename(json_path: str) -> str:
    filename = os.path.basename(json_path).lower()

    if "c_language" in filename:
        return "c_language"
    if "data_structure" in filename:
        return "data_structure"
    if "mechanics" in filename:
        return "mechanics"
    if "calculus" in filename:
        return "calculus"
    if "aerospace" in filename:
        return "aerospace"
    if "thermo" in filename:
        return "thermo"
    if "physics" in filename:
        return "physics"
    if "circuits" in filename:
        return "circuits"

    print(f"❌ 无法从文件名推断 course：{filename}")
    sys.exit(1)


def import_exercises(db_path=None, json_path=None):
    script_dir = os.path.dirname(os.path.abspath(__file__))

    if db_path is None:
        db_path = os.path.join(script_dir, "..", "..", "backend", "cyberlinkage.db")
        if not os.path.exists(db_path):
            db_path = os.path.join(os.getcwd(), "cyberlinkage.db")

    if json_path is None:
        json_path = os.path.join(script_dir, "c_language_exercises_full.json")

    db_path = os.path.abspath(db_path)
    json_path = os.path.abspath(json_path)

    print(f"📂 数据库路径: {db_path}")
    print(f"📄 题库路径:   {json_path}")

    if not os.path.exists(json_path):
        print(f"❌ 找不到题库文件: {json_path}")
        sys.exit(1)

    course = detect_course_from_filename(json_path)
    print(f"📚 识别到学科:   {course}")

    with open(json_path, encoding="utf-8") as f:
        exercises = json.load(f)

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS exercises (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course TEXT NOT NULL,
            knowledge_point_id TEXT NOT NULL,
            question_type TEXT DEFAULT 'single_choice',
            question_text TEXT NOT NULL,
            options TEXT NOT NULL,
            correct_answer TEXT NOT NULL,
            difficulty INTEGER DEFAULT 3,
            explanation TEXT
        )
    """)

    cursor.execute("PRAGMA table_info(exercises)")
    existing_columns = {row[1] for row in cursor.fetchall()}
    if "course" not in existing_columns:
        cursor.execute("ALTER TABLE exercises ADD COLUMN course TEXT")
        cursor.execute("UPDATE exercises SET course = 'c_language' WHERE course IS NULL")
    if "question_type" not in existing_columns:
        cursor.execute("ALTER TABLE exercises ADD COLUMN question_type TEXT DEFAULT 'single_choice'")
        cursor.execute("UPDATE exercises SET question_type = 'single_choice' WHERE question_type IS NULL")

    cursor.execute("SELECT COUNT(*) FROM exercises WHERE course = ?", (course,))
    existing = cursor.fetchone()[0]
    print(f"\n⚠️  学科 {course} 当前已有 {existing} 道题目")

    if existing > 0:
        ans = input(f"是否清空学科 {course} 的旧题后重新导入？(y/N): ").strip().lower()
        if ans == "y":
            cursor.execute("DELETE FROM exercises WHERE course = ?", (course,))
            print(f"🗑️  已清空学科 {course} 的旧题目")
        else:
            print("❎ 取消导入")
            conn.close()
            return

    imported = 0
    for ex in exercises:
        cursor.execute("""
            INSERT INTO exercises (course, knowledge_point_id, question_type, question_text, options, correct_answer, difficulty, explanation)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            course,
            ex["knowledge_point_id"],
            ex.get("question_type", "single_choice"),
            ex["question_text"],
            json.dumps(ex["options"], ensure_ascii=False),
            ex["correct_answer"],
            ex.get("difficulty", 3),
            ex.get("explanation", ""),
        ))
        imported += 1

    conn.commit()
    conn.close()
    print(f"\n✅ 成功导入 {imported} 道题目！")

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT course, knowledge_point_id, COUNT(*)
        FROM exercises
        GROUP BY course, knowledge_point_id
        ORDER BY course, knowledge_point_id
    """)
    rows = cursor.fetchall()
    conn.close()

    print("\n📊 各学科知识点题目数量:")
    for course_name, kp, cnt in rows:
        bar = "█" * cnt
        print(f"   [{course_name}] {kp:<20} {bar} ({cnt})")


if __name__ == "__main__":
    db = sys.argv[1] if len(sys.argv) > 1 else None
    json_f = sys.argv[2] if len(sys.argv) > 2 else None
    import_exercises(db, json_f)
