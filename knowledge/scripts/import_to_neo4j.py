"""将知识图谱 JSON 数据导入 Neo4j"""

import argparse
import json
import os
import sys

from neo4j import GraphDatabase


DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")


def import_course(driver, course: str):
    """导入一门课程的知识图谱到 Neo4j"""
    filepath = os.path.join(DATA_DIR, f"{course}.json")
    if not os.path.exists(filepath):
        print(f"❌ 找不到文件: {filepath}")
        sys.exit(1)

    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    nodes = data.get("nodes", [])
    edges = data.get("edges", [])

    print(f"📖 课程: {data.get('name', course)}")
    print(f"   节点: {len(nodes)} 个")
    print(f"   边:   {len(edges)} 条")

    with driver.session() as session:
        # 清除该课程的旧数据
        session.run(
            "MATCH (n:KnowledgePoint {course: $course}) DETACH DELETE n",
            course=course,
        )
        print("🗑️  已清除旧数据")

        # 创建节点
        for node in nodes:
            session.run(
                """
                CREATE (n:KnowledgePoint {
                    id: $id,
                    name: $name,
                    course: $course,
                    category: $category,
                    difficulty: $difficulty,
                    chapter: $chapter,
                    description: $description,
                    estimated_minutes: $estimated_minutes
                })
                """,
                id=node["id"],
                name=node["name"],
                course=course,
                category=node.get("category", ""),
                difficulty=node.get("difficulty", 3),
                chapter=node.get("chapter", 0),
                description=node.get("description", ""),
                estimated_minutes=node.get("estimated_minutes", 30),
            )

        # 创建关系
        for edge in edges:
            session.run(
                """
                MATCH (a:KnowledgePoint {id: $from_id, course: $course})
                MATCH (b:KnowledgePoint {id: $to_id, course: $course})
                CREATE (a)-[:PREREQUISITE]->(b)
                """,
                from_id=edge["from"],
                to_id=edge["to"],
                course=course,
            )

        # 创建索引
        session.run(
            "CREATE INDEX IF NOT EXISTS FOR (n:KnowledgePoint) ON (n.id, n.course)"
        )

    print(f"✅ 导入完成！")


def main():
    parser = argparse.ArgumentParser(description="导入知识图谱到 Neo4j")
    parser.add_argument(
        "--course",
        default="c_language",
        help="课程标识 (对应 data/ 下的 JSON 文件名，默认: c_language)",
    )
    parser.add_argument("--uri", default="bolt://localhost:7687", help="Neo4j URI")
    parser.add_argument("--user", default="neo4j", help="Neo4j 用户名")
    parser.add_argument("--password", default="zhipath2026", help="Neo4j 密码")
    parser.add_argument("--all", action="store_true", help="导入所有课程")

    args = parser.parse_args()

    driver = GraphDatabase.driver(args.uri, auth=(args.user, args.password))

    try:
        driver.verify_connectivity()
        print(f"🔗 已连接 Neo4j: {args.uri}")
    except Exception as e:
        print(f"❌ 无法连接 Neo4j: {e}")
        sys.exit(1)

    if args.all:
        for filename in os.listdir(DATA_DIR):
            if filename.endswith(".json"):
                course = filename[:-5]
                print(f"\n{'='*40}")
                import_course(driver, course)
    else:
        import_course(driver, args.course)

    driver.close()


if __name__ == "__main__":
    main()
