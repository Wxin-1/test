
import json
import re
from pathlib import Path

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


BASE_DIR = Path(__file__).parent
INDEX_DIR = BASE_DIR / "data" / "knowledge_index"
INDEX_FILE = INDEX_DIR / "index.json"


def split_text(text: str, chunk_size: int = 500, overlap: int = 80):
    """将文档切分为有重叠的文本片段。"""
    text = re.sub(r"\r\n?", "\n", text).strip()

    if not text:
        return []

    chunks = []
    start = 0

    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunk = text[start:end].strip()

        if chunk:
            chunks.append(chunk)

        if end == len(text):
            break

        start = end - overlap

    return chunks


class LocalKnowledgeBase:
    def __init__(self):
        self.documents = []
        self.vectorizer = None
        self.matrix = None
        self.load()

    def load(self):
        """从本地 JSON 文件恢复知识片段并重建索引。"""
        if not INDEX_FILE.exists():
            return

        try:
            self.documents = json.loads(
                INDEX_FILE.read_text(encoding="utf-8")
            )
            self._rebuild_index()
        except (OSError, ValueError, json.JSONDecodeError):
            self.documents = []
            self.vectorizer = None
            self.matrix = None
            raise ValueError("知识库索引损坏，请检查 index.json")

    def _rebuild_index(self):
        """使用本地字符 n-gram TF-IDF 建立向量索引。"""
        if not self.documents:
            self.vectorizer = None
            self.matrix = None
            return

        texts = [item["chunk"] for item in self.documents]

        self.vectorizer = TfidfVectorizer(
            analyzer="char",
            ngram_range=(2, 4),
            lowercase=False,
            sublinear_tf=True,
        )
        self.matrix = self.vectorizer.fit_transform(texts)

    def add_document(self, filename: str, text: str):
        """切分文档、建立索引并保存到本地。"""
        chunks = split_text(text)

        if not chunks:
            return 0

        # 避免重复导入同一文件名时不断追加旧片段
        self.documents = [
            item for item in self.documents
            if item["filename"] != filename
        ]

        for chunk in chunks:
            self.documents.append({
                "filename": filename,
                "chunk": chunk,
            })

        self._rebuild_index()

        INDEX_DIR.mkdir(parents=True, exist_ok=True)
        INDEX_FILE.write_text(
            json.dumps(self.documents, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        return len(chunks)

    def search(self, query: str, top_k: int = 3):
        """按 TF-IDF 余弦相似度返回相关片段。"""
        if (
            not query.strip()
            or self.vectorizer is None
            or self.matrix is None
        ):
            return []

        query_vector = self.vectorizer.transform([query])
        scores = cosine_similarity(query_vector, self.matrix).ravel()

        count = min(max(top_k, 1), len(self.documents))
        indices = scores.argsort()[::-1][:count]

        return [
            {
                "filename": self.documents[int(i)]["filename"],
                "text": self.documents[int(i)]["chunk"],
                "score": float(scores[int(i)]),
            }
            for i in indices
            if scores[int(i)] > 0
        ]


if __name__ == "__main__":
    kb = LocalKnowledgeBase()
    print("本地 TF-IDF 知识库初始化成功。")
    print(f"当前知识片段数量：{len(kb.documents)}")