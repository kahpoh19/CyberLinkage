"""
题库导入脚本 v2 - 路径修正版
用法(在backend目录下运行):
  python ../knowledge/scripts/import_exercises.py
或指定路径:
  python ../knowledge/scripts/import_exercises.py ./cyberlinkage.db ../knowledge/scripts/c_language_exercises_full.json
"""

import json
import sqlite3
import sys
import os

def import_exercises(db_path=None, json_path=None):
    # 自动推断路径：脚本在 knowledge/scripts/，数据库在 backend/
    script_dir = os.path.dirname(os.path.abspath(__file__))

    if db_path is None:
        # 默认数据库在 backend/ 目录（脚本上两级）
        db_path = os.path.join(script_dir, "..", "..", "backend", "cyberlinkage.db")
        # 如果找不到，尝试当前目录
        if not os.path.exists(db_path):
            db_path = os.path.join(os.getcwd(), "cyberlinkage.db")

    if json_path is None:
        # 默认JSON和脚本在同目录
        json_path = os.path.join(script_dir, "c_language_exercises_full.json")

    db_path = os.path.abspath(db_path)
    json_path = os.path.abspath(json_path)

    print(f"📂 数据库路径: {db_path}")
    print(f"📄 题库路径:   {json_path}")

    if not os.path.exists(json_path):
        print(f"❌ 找不到题库文件: {json_path}")
        print("   请确认 c_language_exercises_full.json 在 knowledge/scripts/ 目录下")
        sys.exit(1)

    with open(json_path, encoding='utf-8') as f:
        exercises = json.load(f)

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # 建表（如果不存在）
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS exercises (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            knowledge_point_id TEXT NOT NULL,
            question_text TEXT NOT NULL,
            options TEXT NOT NULL,
            correct_answer TEXT NOT NULL,
            difficulty INTEGER DEFAULT 3,
            explanation TEXT
        )
    ''')

    cursor.execute("SELECT COUNT(*) FROM exercises")
    existing = cursor.fetchone()[0]
    print(f"\n⚠️  数据库中已有 {existing} 道题目")

    if existing > 0:
        ans = input("是否清空后重新导入？(y/N): ").strip().lower()
        if ans == 'y':
            cursor.execute("DELETE FROM exercises")
            print("🗑️  已清空旧题目")
        else:
            print("❎ 取消导入")
            conn.close()
            return

    imported = 0
    for ex in exercises:
        cursor.execute('''
            INSERT INTO exercises (knowledge_point_id, question_text, options, correct_answer, difficulty, explanation)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (
            ex['knowledge_point_id'],
            ex['question_text'],
            json.dumps(ex['options'], ensure_ascii=False),
            ex['correct_answer'],
            ex.get('difficulty', 3),
            ex.get('explanation', '')
        ))
        imported += 1

    conn.commit()
    conn.close()
    print(f"\n✅ 成功导入 {imported} 道题目！")

    # 打印统计
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT knowledge_point_id, COUNT(*) FROM exercises GROUP BY knowledge_point_id ORDER BY knowledge_point_id")
    rows = cursor.fetchall()
    conn.close()

    print("\n📊 各知识点题目数量:")
    for kp, cnt in rows:
        bar = "█" * cnt
        print(f"   {kp:<20} {bar} ({cnt})")

if __name__ == "__main__":
    db   = sys.argv[1] if len(sys.argv) > 1 else None
    json_f = sys.argv[2] if len(sys.argv) > 2 else None
    import_exercises(db, json_f)