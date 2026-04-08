"""题库生成脚本 —— 包含预置的 C 语言基础题目"""

import json
import os

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")

# 预置题库：每个知识点 2-5 道选择题
C_LANGUAGE_EXERCISES = [
    # ── 数据类型 ──
    {
        "knowledge_point_id": "data_type",
        "question_text": "在C语言中，int类型在32位系统上通常占用多少字节？",
        "options": {"A": "1字节", "B": "2字节", "C": "4字节", "D": "8字节"},
        "correct_answer": "C",
        "difficulty": 1,
        "explanation": "在32位系统上，int通常占4字节（32位）。"
    },
    {
        "knowledge_point_id": "data_type",
        "question_text": "以下哪个不是C语言的基本数据类型？",
        "options": {"A": "int", "B": "float", "C": "string", "D": "char"},
        "correct_answer": "C",
        "difficulty": 1,
        "explanation": "C语言没有string基本类型，字符串通过字符数组或字符指针实现。"
    },
    {
        "knowledge_point_id": "data_type",
        "question_text": "char类型变量可以存储的值的范围是？（有符号）",
        "options": {"A": "0~255", "B": "-128~127", "C": "-256~255", "D": "0~127"},
        "correct_answer": "B",
        "difficulty": 2,
        "explanation": "有符号char用8位存储，范围为-128到127。"
    },
    # ── 变量与常量 ──
    {
        "knowledge_point_id": "var",
        "question_text": "以下哪个是合法的C语言变量名？",
        "options": {"A": "2name", "B": "_count", "C": "my-var", "D": "int"},
        "correct_answer": "B",
        "difficulty": 1,
        "explanation": "变量名可以以字母或下划线开头。2name以数字开头不合法，my-var含连字符不合法，int是关键字。"
    },
    {
        "knowledge_point_id": "var",
        "question_text": "const int N = 10; 和 #define N 10 的主要区别是？",
        "options": {"A": "没有区别", "B": "const有类型检查，#define没有", "C": "#define更安全", "D": "const不能用于数组大小"},
        "correct_answer": "B",
        "difficulty": 2,
        "explanation": "const定义的常量有类型信息，编译器会做类型检查；#define是预处理器的文本替换，没有类型概念。"
    },
    # ── 输入输出 ──
    {
        "knowledge_point_id": "io",
        "question_text": "printf(\"%d\", 3.14); 的输出结果是？",
        "options": {"A": "3.14", "B": "3", "C": "未定义行为", "D": "编译错误"},
        "correct_answer": "C",
        "difficulty": 2,
        "explanation": "%d期望int类型参数，传入double类型是未定义行为。应使用%f或%lf。"
    },
    {
        "knowledge_point_id": "io",
        "question_text": "scanf(\"%d\", x); 有什么问题？",
        "options": {"A": "没有问题", "B": "x应该加&取地址", "C": "应该用%f", "D": "应该用gets"},
        "correct_answer": "B",
        "difficulty": 1,
        "explanation": "scanf需要变量的地址，正确写法是scanf(\"%d\", &x);"
    },
    # ── 运算符 ──
    {
        "knowledge_point_id": "operator",
        "question_text": "表达式 5 / 2 的结果是？（整数除法）",
        "options": {"A": "2.5", "B": "2", "C": "3", "D": "2.0"},
        "correct_answer": "B",
        "difficulty": 1,
        "explanation": "两个整数相除，结果仍为整数，直接截断小数部分，5/2=2。"
    },
    {
        "knowledge_point_id": "operator",
        "question_text": "表达式 a++ 和 ++a 的区别是？",
        "options": {"A": "没有区别", "B": "a++先使用后自增，++a先自增后使用", "C": "a++增加2", "D": "++a只能用于循环"},
        "correct_answer": "B",
        "difficulty": 2,
        "explanation": "a++是后置自增，在表达式中先返回原值再加1；++a是前置自增，先加1再返回新值。"
    },
    # ── 条件语句 ──
    {
        "knowledge_point_id": "if_else",
        "question_text": "if(a = 5) 和 if(a == 5) 的区别是？",
        "options": {"A": "完全一样", "B": "前者是赋值（永远为真），后者是比较", "C": "前者会编译错误", "D": "后者是赋值"},
        "correct_answer": "B",
        "difficulty": 2,
        "explanation": "=是赋值运算符，a=5将5赋给a并返回5（非零为真）；==是比较运算符，判断a是否等于5。"
    },
    {
        "knowledge_point_id": "if_else",
        "question_text": "以下代码输出什么？\nint x = 3;\nif(x > 5)\n  printf(\"A\");\nelse if(x > 2)\n  printf(\"B\");\nelse\n  printf(\"C\");",
        "options": {"A": "A", "B": "B", "C": "C", "D": "AB"},
        "correct_answer": "B",
        "difficulty": 1,
        "explanation": "x=3，x>5为假，x>2为真，输出B。else if是互斥的，只执行第一个为真的分支。"
    },
    # ── for循环 ──
    {
        "knowledge_point_id": "for_loop",
        "question_text": "for(int i=0; i<5; i++) 循环执行几次？",
        "options": {"A": "4次", "B": "5次", "C": "6次", "D": "无限次"},
        "correct_answer": "B",
        "difficulty": 1,
        "explanation": "i从0开始，每次加1，直到i=5时不满足i<5退出。i取值0,1,2,3,4共5次。"
    },
    {
        "knowledge_point_id": "for_loop",
        "question_text": "以下哪个是死循环？",
        "options": {"A": "for(;;)", "B": "for(int i=0; i<10; i++)", "C": "for(int i=10; i>0; i--)", "D": "for(int i=0; i!=5; i++)"},
        "correct_answer": "A",
        "difficulty": 2,
        "explanation": "for(;;)省略了所有三个表达式，条件默认为真，是典型的死循环写法。"
    },
    # ── while循环 ──
    {
        "knowledge_point_id": "while_loop",
        "question_text": "while循环和do-while循环的主要区别是？",
        "options": {"A": "没有区别", "B": "do-while至少执行一次循环体", "C": "while更快", "D": "do-while不能用break"},
        "correct_answer": "B",
        "difficulty": 1,
        "explanation": "do-while先执行循环体再判断条件，所以至少执行一次；while先判断条件再执行。"
    },
    # ── 一维数组 ──
    {
        "knowledge_point_id": "array_1d",
        "question_text": "int arr[5] = {1, 2}; 数组中arr[3]的值是？",
        "options": {"A": "未定义", "B": "0", "C": "随机值", "D": "2"},
        "correct_answer": "B",
        "difficulty": 2,
        "explanation": "部分初始化时，未显式初始化的元素自动初始化为0。arr[3]=0。"
    },
    {
        "knowledge_point_id": "array_1d",
        "question_text": "数组下标从几开始？",
        "options": {"A": "0", "B": "1", "C": "取决于声明", "D": "-1"},
        "correct_answer": "A",
        "difficulty": 1,
        "explanation": "C语言数组下标从0开始，arr[0]是第一个元素。"
    },
    # ── 函数 ──
    {
        "knowledge_point_id": "func_def",
        "question_text": "C语言中函数默认的返回类型是？",
        "options": {"A": "void", "B": "int", "C": "float", "D": "没有默认"},
        "correct_answer": "B",
        "difficulty": 2,
        "explanation": "在旧版C标准中，未声明返回类型的函数默认返回int（C99后建议显式声明）。"
    },
    {
        "knowledge_point_id": "func_param",
        "question_text": "C语言函数参数传递默认是？",
        "options": {"A": "值传递", "B": "引用传递", "C": "指针传递", "D": "取决于类型"},
        "correct_answer": "A",
        "difficulty": 2,
        "explanation": "C语言函数参数默认是值传递，形参是实参的副本。要修改实参需传指针。"
    },
    # ── 指针基础 ──
    {
        "knowledge_point_id": "ptr_basic",
        "question_text": "int a = 10; int *p = &a; 则 *p 的值是？",
        "options": {"A": "a的地址", "B": "10", "C": "p的地址", "D": "未定义"},
        "correct_answer": "B",
        "difficulty": 2,
        "explanation": "p存储a的地址，*p是解引用操作，获取p指向的值，即a的值10。"
    },
    {
        "knowledge_point_id": "ptr_basic",
        "question_text": "以下哪个操作是危险的？",
        "options": {"A": "int *p = &a;", "B": "int *p = NULL; *p = 5;", "C": "int *p = malloc(sizeof(int));", "D": "free(p);"},
        "correct_answer": "B",
        "difficulty": 3,
        "explanation": "对NULL指针解引用（*p = 5）会导致段错误(Segmentation Fault)，是典型的空指针异常。"
    },
    # ── 结构体 ──
    {
        "knowledge_point_id": "struct_basic",
        "question_text": "访问结构体变量的成员使用什么运算符？",
        "options": {"A": "::", "B": "->", "C": ".", "D": "#"},
        "correct_answer": "C",
        "difficulty": 1,
        "explanation": "结构体变量用.访问成员，结构体指针用->访问成员。"
    }
]


def generate_exercises():
    """生成题库 JSON 文件"""
    output_path = os.path.join(OUTPUT_DIR, "c_language_exercises.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(C_LANGUAGE_EXERCISES, f, ensure_ascii=False, indent=2)

    print(f"✅ 生成 {len(C_LANGUAGE_EXERCISES)} 道题目 → {output_path}")

    # 按知识点统计
    kp_count = {}
    for ex in C_LANGUAGE_EXERCISES:
        kp = ex["knowledge_point_id"]
        kp_count[kp] = kp_count.get(kp, 0) + 1

    print("\n📊 题目分布:")
    for kp, count in sorted(kp_count.items()):
        print(f"   {kp}: {count} 题")


if __name__ == "__main__":
    generate_exercises()
