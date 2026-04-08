"""RAG 管道 —— PDF 文档 → 向量化 → 检索增强"""

import os
from typing import List, Optional

from langchain_community.document_loaders import PyPDFDirectoryLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import FAISS


# 向量库存储路径
VECTORSTORE_DIR = os.path.join(os.path.dirname(__file__), "vectorstore")
FAISS_INDEX = os.path.join(VECTORSTORE_DIR, "faiss_index")


class RAGPipeline:
    """检索增强生成管道"""

    def __init__(self, api_base: str = None, api_key: str = None):
        self.embeddings = OpenAIEmbeddings(
            openai_api_base=api_base or os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1"),
            openai_api_key=api_key or os.getenv("OPENAI_API_KEY", ""),
        )
        self.vectorstore: Optional[FAISS] = None
        self._try_load()

    def _try_load(self):
        """尝试从磁盘加载已有向量库"""
        if os.path.exists(FAISS_INDEX):
            try:
                self.vectorstore = FAISS.load_local(
                    FAISS_INDEX,
                    self.embeddings,
                    allow_dangerous_deserialization=True,
                )
            except Exception:
                self.vectorstore = None

    def load_and_build(self, pdf_dir: str):
        """
        从 PDF 目录构建向量库

        Args:
            pdf_dir: 包含 PDF 文件的目录路径
        """
        # 加载 PDF
        loader = PyPDFDirectoryLoader(pdf_dir)
        documents = loader.load()

        if not documents:
            print(f"⚠️ 未在 {pdf_dir} 找到 PDF 文件")
            return

        # 分块
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=500,
            chunk_overlap=50,
            separators=["\n\n", "\n", "。", "；", " ", ""],
        )
        chunks = splitter.split_documents(documents)
        print(f"📚 加载 {len(documents)} 个文档，分成 {len(chunks)} 个块")

        # 向量化并存储
        self.vectorstore = FAISS.from_documents(chunks, self.embeddings)

        # 保存到磁盘
        os.makedirs(VECTORSTORE_DIR, exist_ok=True)
        self.vectorstore.save_local(FAISS_INDEX)
        print(f"✅ 向量库已保存到 {FAISS_INDEX}")

    def query(self, question: str, k: int = 3) -> List[str]:
        """
        检索与问题最相关的文档块

        Args:
            question: 用户问题
            k: 返回的文档块数量

        Returns:
            相关文档内容列表
        """
        if self.vectorstore is None:
            return []

        docs = self.vectorstore.similarity_search(question, k=k)
        return [doc.page_content for doc in docs]

    @property
    def ready(self) -> bool:
        return self.vectorstore is not None


# ─── 命令行入口 ─────────────────────────────────────

if __name__ == "__main__":
    import sys

    pdf_dir = sys.argv[1] if len(sys.argv) > 1 else "./docs"
    print(f"📖 从 {pdf_dir} 构建向量库...")

    pipeline = RAGPipeline()
    pipeline.load_and_build(pdf_dir)
