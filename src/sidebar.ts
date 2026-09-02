import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
// 👇 新增：导入我们自己的模块
import { getCurrentEditorContext } from './context';
import { fetchAiAnswer } from './api';

export class SidebarProvider implements vscode.WebviewViewProvider {
  _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    const htmlPath = path.join(this._extensionUri.fsPath, 'src', 'webview.html');
    let htmlContent = fs.readFileSync(htmlPath, 'utf-8');
    
    webviewView.webview.html = htmlContent;

    // 【中转站】监听前端发来的消息
    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.command) {
        case 'chat': {
          // 1. 【读心术】获取用户当前 VS Code 里正在看的代码
          const ctx = getCurrentEditorContext();

          // 2. 【打电话】把用户的问题和当前代码，发给大模型接口，并等待返回
          // 注意这里加了 await，因为请求网络是需要时间的
          const aiResponse = await fetchAiAnswer(data.text, ctx);

          // 3. 【发回前端】把真实的答案按照你定好的接头暗号发回给 webview.html
          if (this._view) {
             this._view.webview.postMessage({ 
                 command: 'receiveMessage', 
                 text: aiResponse 
             });
          }
          break;
        }
      }
    });
  }
}