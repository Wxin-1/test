
import os
import uuid
from io import BytesIO

from pypdf import PdfReader
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, UploadFile, File
from openai import OpenAI
from pydantic import BaseModel
from knowledge_base import LocalKnowledgeBase

# 读取当前目录下的 .env 配置文件
load_dotenv(Path(__file__).with_name(".env"))

API_KEY = os.getenv("LLM_API_KEY", "").strip()
BASE_URL = os.getenv(
    "LLM_BASE_URL",
    "https://api.deepseek.com"
).strip()
MODEL = os.getenv("LLM_MODEL", "").strip()


app = FastAPI(title="领域智能代码助手")
kb = LocalKnowledgeBase()


class ChatRequest(BaseModel):
    query: str
    fileName: str | None = None
    code: str | None = None


class ChatResponse(BaseModel):
    answer: str


def get_client():
    if not API_KEY:
        raise HTTPException(
            status_code=500,
            detail="缺少 LLM_API_KEY，请检查 .env 文件"
        )

    if not MODEL:
        raise HTTPException(
            status_code=500,
            detail="缺少 LLM_MODEL，请检查 .env 文件"
        )

    return OpenAI(
        api_key=API_KEY,
        base_url=BASE_URL,
        timeout=60.0,
        max_retries=1,
    )


@app.get("/")
def home():
    return {
        "status": "running",
        "message": "领域智能代码助手后端已启动"
    }


@app.get("/health")
def health():
    return {"status": "ok"}



@app.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest):
    if not request.query.strip():
        raise HTTPException(
            status_code=400,
            detail="问题内容不能为空"
        )

    client = get_client()

    # 第一步：从本地知识库检索相关片段
    try:
        retrieved_docs = kb.search(request.query, top_k=3)
    except Exception as exc:
        print(f"本地知识检索失败：{type(exc).__name__}")
        raise HTTPException(
            status_code=500,
            detail="本地知识检索失败，请检查知识库索引"
        ) from exc

    # 第二步：整理检索结果，保留来源信息
    if retrieved_docs:
        knowledge_context = "\n\n".join(
            (
                f"[参考资料 {i}]\n"
                f"来源文件：{doc['filename']}\n"
                f"相关度分数：{doc['score']:.3f}\n"
                f"内容：\n{doc['text']}"
            )
            for i, doc in enumerate(retrieved_docs, start=1)
        )
    else:
        knowledge_context = "本地知识库中没有检索到相关内容。"

    # 第三步：构建增强提示词
    user_content = (
        f"用户问题：\n{request.query}\n\n"
        f"当前文件名：{request.fileName or '未提供'}\n\n"
        f"当前文件代码：\n{request.code or '未提供'}\n\n"
        f"本地知识库检索结果：\n{knowledge_context}\n\n"
        "请优先利用相关参考资料回答问题。"
        "如果资料不足以支持结论，请明确说明。"
        "不要把参考资料中没有的信息说成资料原文。"
    )

    # 第四步：调用 DeepSeek 生成回答
    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "你是一个专业的领域智能代码助手。"
                        "请使用中文回答。"
                        "当本地参考资料与问题相关时，"
                        "优先依据资料解释领域规则、API 用法和代码约束。"
                        "如果资料与常识或用户代码存在冲突，"
                        "请指出冲突，不要盲目采用。"
                        "资料不足时请明确说明。"
                        "不要编造不存在的 API 或专业知识。"
                        "需要生成代码时，请给出可运行的代码，"
                        "并简要解释关键逻辑。"
                    ),
                },
                {
                    "role": "user",
                    "content": user_content,
                },
            ],
            stream=False,
        )

        answer = response.choices[0].message.content

        if not answer or not answer.strip():
            raise HTTPException(
                status_code=502,
                detail="模型返回了空回答"
            )

        return ChatResponse(answer=answer.strip())

    except HTTPException:
        raise
    except Exception as exc:
        print(f"DeepSeek API 调用失败：{type(exc).__name__}")
        raise HTTPException(
            status_code=502,
            detail=(
                "DeepSeek 模型调用失败，请检查 API 配置、"
                "模型名称、账户额度及网络连接。"
            ),
        ) from exc




# 文档保存目录：src/backend/data/uploads
UPLOAD_DIR = Path(__file__).parent / "data" / "uploads"
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


@app.post("/documents/upload")
async def upload_document(file: UploadFile = File(...)):
    """上传 PDF 或 Markdown 文件，并在本地提取文本。"""

    if not file.filename:
        raise HTTPException(status_code=400, detail="未提供文件名")

    suffix = Path(file.filename).suffix.lower()

    if suffix not in {".pdf", ".md"}:
        raise HTTPException(
            status_code=400,
            detail="仅支持 PDF 和 Markdown 文件"
        )

    # 限制文件大小，避免一次读取过大的文件
    content = await file.read(MAX_FILE_SIZE + 1)

    if not content:
        raise HTTPException(status_code=400, detail="文件为空")

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="文件超过 10 MB，请缩小文件后重试"
        )

    # 使用随机文件名保存，避免重名覆盖和路径注入
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    saved_name = f"{uuid.uuid4().hex}{suffix}"
    saved_path = UPLOAD_DIR / saved_name

    try:
        if suffix == ".md":
            text = content.decode("utf-8-sig", errors="replace")
        else:
            reader = PdfReader(BytesIO(content))

            if reader.is_encrypted:
                raise HTTPException(
                    status_code=400,
                    detail="PDF 已加密，请先解除加密"
                )

            text = "\n".join(
                page.extract_text() or ""
                for page in reader.pages
            )

    except HTTPException:
        raise
    except Exception as exc:
        print(f"文档解析失败：{type(exc).__name__}")
        raise HTTPException(
            status_code=400,
            detail="文档解析失败，请检查文件是否损坏"
        ) from exc

    # 只有解析成功后才保存原始文件
    saved_path.write_bytes(content)

    return {
        "success": True,
        "fileName": Path(file.filename).name,
        "savedAs": saved_name,
        "fileType": suffix[1:],
        "textLength": len(text),
        "preview": text[:500],
        "message": "文档已保存到本地并完成文本提取"
    }




class KnowledgeAddRequest(BaseModel):
    savedAs: str


class KnowledgeSearchRequest(BaseModel):
    query: str
    topK: int = 3


@app.post("/knowledge/add")
def add_to_knowledge(request: KnowledgeAddRequest):
    """将已上传的文档加入本地知识库。"""

    # 只允许使用上传目录中的文件名
    filename = Path(request.savedAs).name

    if filename != request.savedAs:
        raise HTTPException(status_code=400, detail="文件名不合法")

    suffix = Path(filename).suffix.lower()

    if suffix not in {".md", ".pdf"}:
        raise HTTPException(
            status_code=400,
            detail="仅支持 PDF 和 Markdown 文件"
        )

    file_path = UPLOAD_DIR / filename

    if not file_path.is_file():
        raise HTTPException(
            status_code=404,
            detail="找不到已上传的文件，请先上传文档"
        )

    try:
        if suffix == ".md":
            text = file_path.read_text(encoding="utf-8-sig")
        else:
            reader = PdfReader(str(file_path))

            if reader.is_encrypted:
                raise HTTPException(
                    status_code=400,
                    detail="PDF 已加密，无法读取"
                )

            text = "\n".join(
                page.extract_text() or ""
                for page in reader.pages
            )

        if not text.strip():
            raise HTTPException(
                status_code=400,
                detail="文档没有可提取的文本"
            )

        count = kb.add_document(filename, text)

        return {
            "success": True,
            "fileName": filename,
            "chunkCount": count,
            "message": "文档已加入本地知识库"
        }

    except HTTPException:
        raise
    except Exception as exc:
        print(f"知识库入库失败：{type(exc).__name__}")
        raise HTTPException(
            status_code=500,
            detail="文档入库失败，请检查后端日志"
        ) from exc


@app.post("/knowledge/search")
def search_knowledge(request: KnowledgeSearchRequest):
    """检索本地知识库中的相关片段。"""

    if not request.query.strip():
        raise HTTPException(status_code=400, detail="问题不能为空")

    if not 1 <= request.topK <= 10:
        raise HTTPException(
            status_code=400,
            detail="topK 必须在 1 到 10 之间"
        )

    try:
        results = kb.search(request.query, request.topK)

        return {
            "success": True,
            "query": request.query,
            "resultCount": len(results),
            "results": results
        }

    except Exception as exc:
        print(f"知识检索失败：{type(exc).__name__}")
        raise HTTPException(
            status_code=500,
            detail="本地知识检索失败"
        ) from exc
