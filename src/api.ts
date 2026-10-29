
import { readFile } from "node:fs/promises";
import path from "node:path";

interface ChatResponse {
    answer: string;
}

interface UploadResponse {
    savedAs: string;
}

interface KnowledgeAddResponse {
    success: boolean;
    fileName: string;
    chunkCount: number;
    message: string;
}

const API_URL = "http://127.0.0.1:8000";

/** 统一处理后端错误信息 */
async function checkResponse(response: Response): Promise<void> {
    if (!response.ok) {
        let detail = `HTTP ${response.status}`;

        try {
            const data = await response.json() as {
                detail?: string;
            };
            detail = data.detail ?? detail;
        } catch {
            // 响应不是 JSON 时保留默认错误信息
        }

        throw new Error(detail);
    }
}

export async function fetchAiAnswer(
    query: string,
    ctx: any
): Promise<string> {
    try {
        const response = await fetch(`${API_URL}/chat`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                query: query,
                fileName: ctx?.fileName ?? null,
                code: ctx?.code ?? null
            })
        });

        await checkResponse(response);

        const data = await response.json() as ChatResponse;
        return data.answer;

    } catch (error) {
        console.error("AI 后端请求失败：", error);

        const detail = error instanceof Error
            ? error.message
            : String(error);

        return `连接 AI 后端失败。

请检查：
1. 后端是否正在运行。
2. 后端地址是否为 ${API_URL}。
3. /chat 接口是否可以正常访问。

错误信息：${detail}`;
    }
}

/**
 * 上传本地 PDF / Markdown 文件。
 * filePath 是 VS Code 扩展通过文件选择器取得的本地路径。
 */
export async function uploadDocument(
    filePath: string
): Promise<UploadResponse> {
    const extension = path.extname(filePath).toLowerCase();

    if (![".md", ".pdf"].includes(extension)) {
        throw new Error("目前仅支持 PDF 和 Markdown 文件。");
    }

    const buffer = await readFile(filePath);

    const bytes = new Uint8Array(buffer.length);
    bytes.set(buffer);

    const formData = new FormData();

    formData.append(
        "file",
        new Blob([bytes.buffer]),
        path.basename(filePath)
    );

    const response = await fetch(
        `${API_URL}/documents/upload`,
        {
            method: "POST",
            body: formData
        }
    );

    await checkResponse(response);

    const data = await response.json() as UploadResponse;

    if (!data.savedAs) {
        throw new Error(
            "文件上传成功响应中缺少 savedAs 字段，请检查后端返回格式。"
        );
    }

    return data;
}

/**
 * 将已上传的文件加入本地知识库。
 */
export async function addDocumentToKnowledgeBase(
    savedAs: string
): Promise<KnowledgeAddResponse> {
    const response = await fetch(
        `${API_URL}/knowledge/add`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                savedAs: savedAs
            })
        }
    );

    await checkResponse(response);

    return await response.json() as KnowledgeAddResponse;
}

/**
 * 一次完成上传和入库。
 */
export async function uploadAndIndexDocument(
    filePath: string
): Promise<KnowledgeAddResponse> {
    const uploaded = await uploadDocument(filePath);

    return await addDocumentToKnowledgeBase(
        uploaded.savedAs
    );
}
