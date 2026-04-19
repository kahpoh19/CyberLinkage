"""调用 AI 生成题库 JSON。"""

import argparse
import asyncio
import json
import os
import sys
from collections import Counter

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))

if PROJECT_ROOT not in sys.path:
    sys.path.append(PROJECT_ROOT)

from ai.question_bank_generator import (  # noqa: E402
    QuestionBankGenerator,
    QuestionBankGeneratorError,
)
from backend.config import settings  # noqa: E402


def build_parser():
    parser = argparse.ArgumentParser(description="使用 AI 生成题库 JSON 文件")
    parser.add_argument(
        "--subject",
        default="c_language",
        help="科目标识，对应 knowledge/data 下的 JSON 文件名",
    )
    parser.add_argument(
        "--knowledge-point",
        dest="knowledge_point_ids",
        action="append",
        default=[],
        help="指定知识点 ID，可重复传入多次",
    )
    parser.add_argument(
        "--questions-per-point",
        type=int,
        default=3,
        help="每个知识点生成多少道题，默认 3",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="只处理前 N 个知识点，便于小批量试跑",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="输出 JSON 路径，默认写入 knowledge/scripts/<subject>_exercises_ai.json",
    )
    return parser


async def main():
    parser = build_parser()
    args = parser.parse_args()

    output_path = os.path.abspath(
        args.output or os.path.join(SCRIPT_DIR, f"{args.subject}_exercises_ai.json")
    )
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    try:
        generator = QuestionBankGenerator(
            api_base=settings.LLM_API_BASE,
            api_key=settings.LLM_API_KEY,
            model=settings.LLM_MODEL,
            knowledge_data_dir=settings.KNOWLEDGE_DATA_DIR,
        )
        result = await generator.generate_for_subject(
            subject_id=args.subject,
            knowledge_point_ids=args.knowledge_point_ids,
            questions_per_point=args.questions_per_point,
            max_points=args.limit,
        )
    except (QuestionBankGeneratorError, ValueError) as exc:
        print(f"❌ 生成失败：{exc}")
        sys.exit(1)

    questions = result["questions"]
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(questions, f, ensure_ascii=False, indent=2)

    print(f"✅ 已生成 {len(questions)} 道题目")
    print(f"📘 科目：{result['subject_name']} ({result['subject_id']})")
    print(f"📄 输出：{output_path}")

    kp_counter = Counter(item["knowledge_point_id"] for item in questions)
    print("\n📊 题目分布：")
    for kp_id, count in sorted(kp_counter.items()):
        print(f"   {kp_id:<24} {count}")


if __name__ == "__main__":
    asyncio.run(main())
