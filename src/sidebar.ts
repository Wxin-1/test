import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// 定义 SidebarProvider 类，用于提供侧边栏的 Webview 视图
export class SidebarProvider implements vscode.WebviewViewProvider {
  _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;

    // 配置 webview，允许运行 JavaScript 脚本
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    // 1. 读取你写的 webview.html 文件
    // 注意：确保你的 webview.html 也放在 src 文件夹下
    const htmlPath = path.join(this._extensionUri.fsPath, 'src', 'webview.html');
    let htmlContent = fs.readFileSync(htmlPath, 'utf-8');
    
    // 把读取到的 HTML 渲染到侧边栏面板上
    webviewView.webview.html = htmlContent;

    // 2. 【中转站】监听来自 HTML 界面的消息
    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.command) {
        case 'chat': {
          // 这里是你和同学 B 交接的地方！
          // data.text 就是用户在网页输入框里打的字。
          
          // 右下角弹个窗测试一下，看看有没有成功收到网页发来的消息
          vscode.window.showInformationMessage(`接收到用户消息: ${data.text}`); 
          
          // 假设同学 B 写了调用 AI 的方法，原本应该是：
          // const aiResponse = await 同学B的AI函数(data.text); 
          
          // 现在我们先用一段假数据测试一下整个链路通不通
          const aiResponse = "这是AI的模拟回复：你刚才说的是 " + data.text; 

          // 3. 把 AI 的回复发回给你的 HTML 界面
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