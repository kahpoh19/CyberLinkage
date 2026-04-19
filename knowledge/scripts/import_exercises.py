"""
题库导入脚本 v3

推荐用法（在项目根目录运行）：
  python knowledge/scripts/import_exercises.py --json knowledge/scripts/data_structure_exercises_full.json

默认行为：
1. 自动找到 backend/cyberlinkage.db
2. 只替换当前 JSON 中涉及到的知识点题目
3. 不会清空整张 exercises 表，适合团队协作增量导入

如需全量清空后重建：
  python knowledge/scripts/import_exercises.py --json knowledge/scripts/c_language_exercises_full.json --truncate
"""

import argparse
import json
import os
import sqlite3
import sys


def resolve_default_db_path(script_dir):
    db_path = os.path.join(script_dir, "..", "..", "backend", "cyberlinkage.db")
    if os.path.exists(db_path):
        return db_path
    return os.path.join(os.getcwd(), "cyberlinkage.db")


def build_parser():
    parser = argparse.ArgumentParser(description="导入题库到 SQLite exercises 表")
    parser.add_argument("db_path", nargs="?", help="数据库路径，默认 backend/cyberlinkage.db")
    parser.add_argument("json_path", nargs="?", help="题库 JSON 路径")
    parser.add_argument("--db", dest="db_override", help="数据库路径（优先于位置参数）")
    parser.add_argument("--json", dest="json_override", help="题库 JSON 路径（优先于位置参数）")
    parser.add_argument(
        "--truncate",
        action="store_true",
        help="清空整个 exercises 表后再导入",
    )
    parser.add_argument(
        "--append",
        action="store_true",
        help="直接追加，不删除当前 JSON 中已有知识点的旧题目",
    )
    return parser


def import_exercises(db_path=None, json_path=None, truncate=False, append=False):
    script_dir = os.path.dirname(os.path.abspath(__file__))

    if db_path is None:
        db_path = resolve_default_db_path(script_dir)

    if json_path is None:
        json_path = os.path.join(script_dir, "c_language_exercises_full.json")

    db_path = os.path.abspath(db_path)
    json_path = os.path.abspath(json_path)

    print(f"📂 数据库路径: {db_path}")
    print(f"📄 题库路径:   {json_path}")

    if not os.path.exists(json_path):
        print(f"❌ 找不到题库文件: {json_path}")
        sys.exit(1)

    with open(json_path, encoding="utf-8") as f:
        exercises = json.load(f)

    if not isinstance(exercises, list) or not exercises:
        print("❌ 题库 JSON 为空或格式不正确，应为题目对象数组")
        sys.exit(1)

    target_kps = sorted({ex["knowledge_point_id"] for ex in exercises})

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS exercises (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            knowledge_point_id TEXT NOT NULL,
            question_text TEXT NOT NULL,
            options TEXT NOT NULL,
            correct_answer TEXT NOT NULL,
            difficulty INTEGER DEFAULT 3,
            explanation TEXT
        )
    """)

    existing_total = cursor.execute("SELECT COUNT(*) FROM exercises").fetchone()[0]
    print(f"\n📚 当前数据库共有 {existing_total} 道题目")

    deleted = 0
    if truncate:
        deleted = cursor.execute("DELETE FROM exercises").rowcount
        print(f"🗑️  已清空 exercises 表，删除 {deleted} 道旧题")
    elif not append:
        placeholders = ",".join("?" for _ in target_kps)
        deleted = cursor.execute(
            f"DELETE FROM exercises WHERE knowledge_point_id IN ({placeholders})",
            target_kps,
        ).rowcount
        print(f"♻️  已替换当前 JSON 覆盖的知识点，共删除 {deleted} 道旧题")
    else:
        print("➕ 追加模式：保留现有题目，直接写入新题")

    imported = 0
    for ex in exercises:
        cursor.execute(
            """
            INSERT INTO exercises (knowledge_point_id, question_text, options, correct_answer, difficulty, explanation)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                ex["knowledge_point_id"],
                ex["question_text"],
                json.dumps(ex["options"], ensure_ascii=False),
                ex["correct_answer"],
                ex.get("difficulty", 3),
                ex.get("explanation", ""),
            ),
        )
        imported += 1

    conn.commit()

    print(f"\n✅ 成功导入 {imported} 道题目")
    print(f"🎯 本次涉及知识点: {', '.join(target_kps)}")

    rows = cursor.execute(
        "SELECT knowledge_point_id, COUNT(*) FROM exercises GROUP BY knowledge_point_id ORDER BY knowledge_point_id"
    ).fetchall()
    conn.close()

    print("\n📊 当前题库分布:")
    for kp, cnt in rows:
        bar = "█" * min(cnt, 20)
        print(f"   {kp:<24} {bar} ({cnt})")


if __name__ == "__main__":
    parser = build_parser()
    args = parser.parse_args()

    db = args.db_override or args.db_path
    json_f = args.json_override or args.json_path
    import_exercises(db, json_f, truncate=args.truncate, append=args.append)
