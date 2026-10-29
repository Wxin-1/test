
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { getCurrentEditorContext } from './context';
import { fetchAiAnswer, uploadAndIndexDocument } from './api';

export class SidebarProvider implements vscode.WebviewViewProvider {
  _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    const htmlPath = path.join(
      this._extensionUri.fsPath,
      'src',
      'webview.html'
    );

    const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
    webviewView.webview.html = htmlContent;

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.command) {
        case 'chat': {
          try {
            const ctx = getCurrentEditorContext();
            const aiResponse = await fetchAiAnswer(data.text, ctx);

            webviewView.webview.postMessage({
              command: 'receiveMessage',
              text: aiResponse,
            });
          } catch (error) {
            const message = error instanceof Error
              ? error.message
              : String(error);

            webviewView.webview.postMessage({
              command: 'receiveMessage',
              text: `处理问题时发生错误：${message}`,
            });
          }
          break;
        }

        case 'uploadDocument': {
          try {
            // 1. 打开 VS Code 原生文件选择窗口
            const selectedFiles = await vscode.window.showOpenDialog({
              canSelectMany: false,
              canSelectFiles: true,
              canSelectFolders: false,
              openLabel: '上传并加入知识库',
              filters: {
                '支持的文档': ['md', 'pdf'],
                'Markdown 文件': ['md'],
                'PDF 文件': ['pdf'],
              },
            });

            // 用户取消选择
            if (!selectedFiles || selectedFiles.length === 0) {
              webviewView.webview.postMessage({
                command: 'uploadStatus',
                status: 'cancelled',
                text: '已取消文件选择。',
              });
              break;
            }

            const fileUri = selectedFiles[0];

            // 2. 通知前端开始处理
            webviewView.webview.postMessage({
              command: 'uploadStatus',
              status: 'uploading',
              text: `正在上传并建立索引：${path.basename(fileUri.fsPath)}`,
              fileName: path.basename(fileUri.fsPath),
            });

            // 3. 上传文件，并加入本地知识库
            const result = await uploadAndIndexDocument(fileUri.fsPath);

            // 4. 将结果发送给前端
            webviewView.webview.postMessage({
              command: 'uploadStatus',
              status: 'success',
              text: `文档已成功加入本地知识库，共生成 ${result.chunkCount} 个文本片段。`,
              fileName: result.fileName,
              chunkCount: result.chunkCount,
            });

            vscode.window.showInformationMessage(
              `文档已加入知识库：${result.fileName}`
            );
          } catch (error) {
            const message = error instanceof Error
              ? error.message
              : String(error);

            console.error('文档上传或入库失败：', error);

            webviewView.webview.postMessage({
              command: 'uploadStatus',
              status: 'error',
              text: `文档上传或入库失败：${message}`,
            });

            vscode.window.showErrorMessage(
              `文档上传或入库失败：${message}`
            );
          }
          break;
        }
      }
    });
  }
}
